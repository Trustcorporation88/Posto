import { createHash } from "node:crypto";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import {
  businessCashClosingAudits,
  businessCashClosings,
  businessCashOpenings,
  businessCashRegisters,
} from "../../drizzle/schema";
import {
  CashClosingDomainError,
  cashClosingPayloadCanonical,
  compareCashClosing,
  validateCashClosingInput,
  type CashCloseInput,
  type CashCloseResult,
  type CashClosing,
  type CashClosingCounts,
  type CashClosingHistoryPage,
  type CashClosingState,
} from "../../lib/business/cash-closing-domain";
import { cashClockAt, type CashOpening } from "../../lib/business/cash-domain";
import type { CashMovementSummary } from "../../lib/business/cash-movement-domain";
import type { ShiftClosureTotals } from "../../lib/station-register";
import {
  aggregateCashOpening,
  cashOpeningFromRow,
  cashMovementLedgerCutoff,
  type CashMovementLedgerCutoff,
  type CashMovementOpening,
} from "./cash-movement-service";
import {
  assertCashIdentity,
  lockCashIdentity,
  lockCashLocation,
  type CashIdentitySnapshot,
  type CashScope,
  type CashTx,
} from "./cash-service";
import { getDb } from "../db";
import { CASH_WRITE_TRANSACTION_CONFIG } from "./cash-transactions";

export { CashScope };

export type CashClosingServiceErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SERVICE_UNAVAILABLE";

export class CashClosingServiceError extends Error {
  constructor(
    readonly code: CashClosingServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CashClosingServiceError";
  }
}

export type CashClosingRegister = { id: number; revision: number };
export type CashStoredClosing = CashClosing & {
  organizationId: number;
  locationId: number;
  intentId: string;
  payloadDigest: string;
};
export type CashClosingInsert = {
  organizationId: number;
  locationId: number;
  registerId: number;
  openingId: number;
  closedById: number;
  closedBy: string;
  closedAt: Date;
  opening: CashOpening;
  summary: CashMovementSummary;
  totals: ShiftClosureTotals;
  varianceReason: string;
  status: CashClosing["status"];
  lastMovementId: number | null;
  movementCount: bigint;
  revision: number;
  intentId: string;
  payloadDigest: string;
};
export type CashClosingAuditInsert = {
  organizationId: number;
  locationId: number;
  registerId: number;
  openingId: number;
  closingId: number;
  actorId: number;
  event: "cash.closed";
  revision: number;
  payloadDigest: string;
  metadata: string;
  createdAt: Date;
};

/** Transaction adapter boundary. Tests use an isolated memory adapter; production uses MySQL. */
export interface CashClosingTransaction {
  lockLocation(scope: CashScope): Promise<boolean>;
  lockIdentity(scope: CashScope): Promise<CashIdentitySnapshot | null>;
  findRegister(scope: CashScope): Promise<CashClosingRegister | null>;
  findOpening(
    scope: CashScope,
    registerId: number,
    openingId: number,
  ): Promise<CashMovementOpening | null>;
  findClosingByIntent(
    scope: CashScope,
    intentId: string,
  ): Promise<CashStoredClosing | null>;
  findClosingByOpening(
    scope: CashScope,
    registerId: number,
    openingId: number,
  ): Promise<CashStoredClosing | null>;
  aggregateOpening(
    scope: CashScope,
    opening: CashMovementOpening,
  ): Promise<CashMovementSummary>;
  movementCutoff(
    scope: CashScope,
    openingId: number,
  ): Promise<CashMovementLedgerCutoff>;
  incrementRevision(
    scope: CashScope,
    registerId: number,
    expectedRevision: number,
  ): Promise<boolean>;
  insertClosing(input: CashClosingInsert): Promise<CashStoredClosing>;
  releaseOpening(
    scope: CashScope,
    registerId: number,
    openingId: number,
  ): Promise<boolean>;
  insertAudit(input: CashClosingAuditInsert): Promise<void>;
}

export interface CashClosingRepository {
  readState(scope: CashScope): Promise<CashClosingState>;
  readHistory(
    scope: CashScope,
    input: { limit: number; cursor?: number },
  ): Promise<CashClosingHistoryPage>;
  transaction<T>(
    operation: (tx: CashClosingTransaction) => Promise<T>,
  ): Promise<T>;
}

const MAX_MYSQL_INT = 2_147_483_647;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const UNAVAILABLE = "O serviço de caixa está temporariamente indisponível.";
const DEFAULT_CONFLICT =
  "O caixa mudou. Atualize a conferência e revise novamente antes de fechar.";

function unavailable(message = UNAVAILABLE): never {
  throw new CashClosingServiceError("SERVICE_UNAVAILABLE", message);
}
function conflict(message = DEFAULT_CONFLICT): never {
  throw new CashClosingServiceError("CONFLICT", message);
}
function duplicateKey(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const item = error as { code?: unknown; errno?: unknown };
  return item.code === "ER_DUP_ENTRY" || item.errno === 1062;
}
function safeRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    return unavailable("A revisão do caixa armazenada é inválida.");
  return value;
}
function exactBigInt(value: unknown, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value))
    return BigInt(value);
  if (typeof value === "string" && /^-?\d+$/u.test(value)) return BigInt(value);
  return unavailable(`O campo ${label} retornou um formato impreciso.`);
}
function checkedSafeCount(value: bigint, label: string): number {
  if (value < 0n || value > MAX_SAFE)
    return unavailable(`O campo ${label} excede a precisão segura.`);
  return Number(value);
}
function digestPayload(input: CashCloseInput): string {
  return createHash("sha256")
    .update(cashClosingPayloadCanonical(input), "utf8")
    .digest("hex");
}
function publicOpening(opening: CashMovementOpening): CashOpening {
  const {
    organizationId: _organizationId,
    locationId: _locationId,
    activeSlot: _activeSlot,
    ...value
  } = opening;
  return value;
}
function parseSnapshot<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return unavailable(`O snapshot ${label} armazenado está inválido.`);
  }
}
function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function closingFromRow(
  row: typeof businessCashClosings.$inferSelect,
): CashStoredClosing {
  if (
    !Number.isSafeInteger(row.id) ||
    row.id <= 0 ||
    !Number.isSafeInteger(row.openingId) ||
    row.openingId <= 0 ||
    !Number.isSafeInteger(row.registerId) ||
    row.registerId <= 0 ||
    !Number.isSafeInteger(row.closedById) ||
    row.closedById <= 0 ||
    !Number.isSafeInteger(row.revision) ||
    row.revision <= 0 ||
    !(row.closedAt instanceof Date) ||
    !Number.isFinite(row.closedAt.getTime()) ||
    (row.lastMovementId !== null &&
      (!Number.isSafeInteger(row.lastMovementId) || row.lastMovementId <= 0))
  ) {
    return unavailable("O registro de fechamento armazenado está inválido.");
  }
  const opening = parseSnapshot<CashOpening>(
    row.openingSnapshot,
    "da abertura",
  );
  const summary = parseSnapshot<CashMovementSummary>(
    row.summarySnapshot,
    "do resumo integral",
  );
  const totals = parseSnapshot<ShiftClosureTotals>(
    row.totalsSnapshot,
    "dos totais",
  );
  if (
    !opening ||
    opening.id !== row.openingId ||
    opening.registerId !== row.registerId ||
    typeof opening.operator !== "string" ||
    typeof summary !== "object" ||
    summary === null ||
    typeof totals !== "object" ||
    totals === null ||
    typeof row.closedBy !== "string" ||
    row.closedBy.trim().length < 1 ||
    row.closedBy.length > 120
  ) {
    return unavailable("Os vínculos do fechamento armazenado estão inválidos.");
  }
  const movementCount = checkedSafeCount(
    exactBigInt(
      row.movementCount as unknown,
      "quantidade congelada de movimentos",
    ),
    "quantidade congelada de movimentos",
  );
  let compared: ReturnType<typeof compareCashClosing>;
  try {
    compared = compareCashClosing(
      summary,
      totals.countedByMethod as CashClosingCounts,
      row.varianceReason,
    );
  } catch {
    return unavailable(
      "Os totais do fechamento armazenado estão inconsistentes.",
    );
  }
  if (
    !sameJson(compared.totals, totals) ||
    compared.status !== row.status ||
    movementCount !== summary.count ||
    totals.movementCount !== movementCount ||
    (row.lastMovementId === null) !== (movementCount === 0)
  ) {
    return unavailable("O snapshot do fechamento armazenado não confere.");
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    locationId: row.locationId,
    openingId: row.openingId,
    registerId: row.registerId,
    opening,
    closedById: row.closedById,
    closedBy: row.closedBy,
    closedAt: row.closedAt.toISOString(),
    totals,
    summary,
    varianceReason: row.varianceReason,
    status: row.status,
    lastMovementId: row.lastMovementId,
    revision: row.revision,
    intentId: row.intentId,
    payloadDigest: row.payloadDigest,
  };
}
function publicClosing(stored: CashStoredClosing): CashClosing {
  const {
    organizationId: _organizationId,
    locationId: _locationId,
    intentId: _intentId,
    payloadDigest: _payloadDigest,
    ...closing
  } = stored;
  return closing;
}
function closeReplay(stored: CashStoredClosing): CashCloseResult {
  return {
    closing: publicClosing(stored),
    revision: stored.revision,
    replayed: true,
  };
}
function validateClosingInput(value: CashCloseInput): CashCloseInput {
  try {
    return validateCashClosingInput(value);
  } catch (error) {
    if (error instanceof CashClosingDomainError)
      throw new CashClosingServiceError("BAD_REQUEST", error.message);
    throw error;
  }
}

export function createCashClosingService(
  repository: CashClosingRepository,
  nowProvider: () => Date = () => new Date(),
) {
  return {
    async closingState(scope: CashScope): Promise<CashClosingState> {
      return repository.readState(scope);
    },
    async history(
      scope: CashScope,
      input: { limit: number; cursor?: number },
    ): Promise<CashClosingHistoryPage> {
      if (
        !Number.isSafeInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > 100 ||
        (input.cursor !== undefined &&
          (!Number.isSafeInteger(input.cursor) || input.cursor <= 0))
      ) {
        throw new CashClosingServiceError(
          "BAD_REQUEST",
          "A página do histórico de fechamentos é inválida.",
        );
      }
      return repository.readHistory(scope, input);
    },
    async close(
      scope: CashScope,
      inputValue: CashCloseInput,
    ): Promise<CashCloseResult> {
      const input = validateClosingInput(inputValue);
      const digest = digestPayload(input);
      try {
        return await repository.transaction(async (tx) => {
          if (!(await tx.lockLocation(scope))) {
            throw new CashClosingServiceError(
              "FORBIDDEN",
              "A unidade da sessão não está disponível para esta operação.",
            );
          }
          const identity = await tx.lockIdentity(scope);
          const identityNow = new Date(nowProvider().getTime());
          const actor = assertCashIdentity(
            identity,
            scope,
            identityNow,
            "write",
            "close",
          );
          if (input.expectedActorId !== scope.actorId) {
            conflict(
              "A conta autenticada mudou depois da conferência. Volte à conta original para recuperar uma tentativa incerta ou atualize e revise antes de fechar.",
            );
          }

          // Lock order matches opening and movement writers: location -> identity -> register -> opening.
          const register = await tx.findRegister(scope);
          const opening = register
            ? await tx.findOpening(scope, register.id, input.openingId)
            : null;
          const stored = await tx.findClosingByIntent(scope, input.intentId);
          if (stored) {
            if (
              stored.closedById !== scope.actorId ||
              stored.payloadDigest !== digest
            ) {
              conflict(
                "Este ID de intenção já foi usado com outros dados ou por outra conta. Gere uma nova confirmação.",
              );
            }
            // Identity/session expiry is rechecked after all replay reads before disclosing the result.
            const replayNow = new Date(nowProvider().getTime());
            assertCashIdentity(identity, scope, replayNow, "write", "close");
            return closeReplay(stored);
          }
          if (!register) {
            throw new CashClosingServiceError(
              "NOT_FOUND",
              "Não há caixa principal configurado para esta unidade.",
            );
          }
          if (!opening) {
            throw new CashClosingServiceError(
              "CONFLICT",
              "A abertura revisada não pertence a este caixa.",
            );
          }
          if (opening.activeSlot !== "active") {
            conflict(
              "Esta abertura já foi encerrada e não pode ser fechada novamente.",
            );
          }
          if (
            input.openingId !== opening.id ||
            input.operationDate !== opening.operationDate ||
            input.shiftId !== opening.shift.id
          ) {
            conflict(
              "A data, o turno ou a abertura não correspondem à revisão.",
            );
          }
          const alreadyClosed = await tx.findClosingByOpening(
            scope,
            register.id,
            opening.id,
          );
          if (alreadyClosed) {
            conflict("Esta abertura já possui um fechamento confirmado.");
          }
          if (
            !Number.isSafeInteger(register.revision) ||
            register.revision < 0 ||
            register.revision >= MAX_MYSQL_INT
          ) {
            conflict("A revisão do caixa atingiu o limite suportado.");
          }
          if (input.expectedRevision !== register.revision) conflict();

          const summary = await tx.aggregateOpening(scope, opening);
          const cutoff = await tx.movementCutoff(scope, opening.id);
          if (
            !Number.isSafeInteger(summary.count) ||
            summary.count < 0 ||
            (summary.count === 0 && cutoff.lastMovementId !== null) ||
            (summary.count > 0 && cutoff.lastMovementId === null)
          ) {
            unavailable(
              "O corte do ledger não corresponde ao resumo integral.",
            );
          }

          // The authoritative server instant is sampled only after every lock, read and aggregate.
          const committedNow = new Date(nowProvider().getTime());
          assertCashIdentity(identity, scope, committedNow, "write", "close");
          if (
            !Number.isFinite(committedNow.getTime()) ||
            committedNow.getTime() < Date.parse(opening.openedAt)
          ) {
            conflict(
              "O relógio do servidor é inválido ou anterior à abertura.",
            );
          }
          if (
            cutoff.lastMovementAt &&
            committedNow.getTime() < cutoff.lastMovementAt.getTime()
          ) {
            conflict(
              "O relógio do servidor não pode anteceder a última movimentação.",
            );
          }
          let compared: ReturnType<typeof compareCashClosing>;
          try {
            compared = compareCashClosing(
              summary,
              input.countedByMethod,
              input.varianceReason,
            );
          } catch (error) {
            if (error instanceof CashClosingDomainError)
              throw new CashClosingServiceError("BAD_REQUEST", error.message);
            throw error;
          }

          const revision = register.revision + 1;
          if (
            !(await tx.incrementRevision(scope, register.id, register.revision))
          )
            conflict();
          const storedClosing = await tx.insertClosing({
            organizationId: scope.organizationId,
            locationId: scope.locationId,
            registerId: register.id,
            openingId: opening.id,
            closedById: scope.actorId,
            closedBy: actor.operator,
            closedAt: committedNow,
            opening: publicOpening(opening),
            summary,
            totals: compared.totals,
            varianceReason: input.varianceReason,
            status: compared.status,
            lastMovementId: cutoff.lastMovementId,
            movementCount: BigInt(summary.count),
            revision,
            intentId: input.intentId,
            payloadDigest: digest,
          });
          if (!(await tx.releaseOpening(scope, register.id, opening.id)))
            conflict("A abertura mudou antes da liberação do caixa.");
          await tx.insertAudit({
            organizationId: scope.organizationId,
            locationId: scope.locationId,
            registerId: register.id,
            openingId: opening.id,
            closingId: storedClosing.id,
            actorId: scope.actorId,
            event: "cash.closed",
            revision,
            payloadDigest: digest,
            metadata: JSON.stringify({
              intentId: input.intentId,
              openingId: opening.id,
              status: compared.status,
              lastMovementId: cutoff.lastMovementId,
              movementCount: summary.count,
              totals: compared.totals,
            }),
            createdAt: committedNow,
          });
          return {
            closing: publicClosing(storedClosing),
            revision,
            replayed: false,
          };
        });
      } catch (error) {
        if (error instanceof CashClosingServiceError) throw error;
        if (duplicateKey(error)) {
          conflict(
            "Outra confirmação fechou esta abertura ou usou a intenção em paralelo. Atualize o caixa e consulte o histórico.",
          );
        }
        throw error;
      }
    },
  };
}

type CashDb = Exclude<Awaited<ReturnType<typeof getDb>>, null>;
type CashDbTransaction = Parameters<Parameters<CashDb["transaction"]>[0]>[0];
type CashClosingRow = typeof businessCashClosings.$inferSelect;

function closingFromStoredRow(row: CashClosingRow): CashStoredClosing {
  return closingFromRow(row);
}
function readRegisterRow(row: {
  id: number;
  revision: number;
}): CashClosingRegister {
  return { id: row.id, revision: safeRevision(row.revision) };
}

async function readRegister(tx: CashDbTransaction, scope: CashScope) {
  const rows = await tx
    .select({
      id: businessCashRegisters.id,
      revision: businessCashRegisters.revision,
    })
    .from(businessCashRegisters)
    .where(
      and(
        eq(businessCashRegisters.organizationId, scope.organizationId),
        eq(businessCashRegisters.locationId, scope.locationId),
      ),
    )
    .limit(1);
  return rows[0] ? readRegisterRow(rows[0]) : null;
}
async function readActiveOpening(
  tx: CashDbTransaction,
  scope: CashScope,
  registerId: number,
) {
  const rows = await tx
    .select()
    .from(businessCashOpenings)
    .where(
      and(
        eq(businessCashOpenings.organizationId, scope.organizationId),
        eq(businessCashOpenings.locationId, scope.locationId),
        eq(businessCashOpenings.registerId, registerId),
        eq(businessCashOpenings.activeSlot, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
function drizzleRepository(db: CashDb): CashClosingRepository {
  return {
    async readState(scope) {
      return db.transaction(async (rawTx) => {
        const tx = rawTx as CashTx;
        const register = await readRegister(rawTx as CashDbTransaction, scope);
        const openingRow = register
          ? await readActiveOpening(
              rawTx as CashDbTransaction,
              scope,
              register.id,
            )
          : null;
        const opening = openingRow ? cashOpeningFromRow(openingRow) : null;
        const summary = opening
          ? await aggregateCashOpening(tx, scope, opening)
          : null;
        const latestRows = register
          ? await tx
              .select()
              .from(businessCashClosings)
              .where(
                and(
                  eq(businessCashClosings.organizationId, scope.organizationId),
                  eq(businessCashClosings.locationId, scope.locationId),
                  eq(businessCashClosings.registerId, register.id),
                ),
              )
              .orderBy(desc(businessCashClosings.id))
              .limit(1)
          : [];
        const now = new Date();
        let clock;
        try {
          clock = cashClockAt(now);
        } catch {
          return unavailable(
            "O calendário operacional não consegue validar o horário atual.",
          );
        }
        return {
          revision: register?.revision ?? 0,
          serverNow: clock.serverNow,
          operationDate: clock.operationDate,
          scheduledShift: clock.scheduledShift,
          activeOpening: opening ? publicOpening(opening) : null,
          summary,
          latestClosing: latestRows[0]
            ? publicClosing(closingFromStoredRow(latestRows[0]))
            : null,
        };
      });
    },
    async readHistory(scope, input) {
      return db.transaction(async (rawTx) => {
        const tx = rawTx as CashDbTransaction;
        const register = await readRegister(tx, scope);
        if (!register) {
          return {
            items: [],
            nextCursor: null,
            totalCount: 0,
            revision: 0,
          };
        }
        const where = and(
          eq(businessCashClosings.organizationId, scope.organizationId),
          eq(businessCashClosings.locationId, scope.locationId),
          eq(businessCashClosings.registerId, register.id),
          input.cursor === undefined
            ? undefined
            : lt(businessCashClosings.id, input.cursor),
        );
        const [rows, countRows] = await Promise.all([
          tx
            .select()
            .from(businessCashClosings)
            .where(where)
            .orderBy(desc(businessCashClosings.id))
            .limit(input.limit + 1),
          tx
            .select({ total: sql<string>`CAST(COUNT(*) AS CHAR)` })
            .from(businessCashClosings)
            .where(
              and(
                eq(businessCashClosings.organizationId, scope.organizationId),
                eq(businessCashClosings.locationId, scope.locationId),
                eq(businessCashClosings.registerId, register.id),
              ),
            ),
        ]);
        const hasMore = rows.length > input.limit;
        const selected = rows.slice(0, input.limit).map(closingFromStoredRow);
        const totalCount = checkedSafeCount(
          exactBigInt(countRows[0]?.total, "quantidade de fechamentos"),
          "quantidade de fechamentos",
        );
        return {
          items: selected.map(publicClosing),
          nextCursor: hasMore
            ? (selected[selected.length - 1]?.id ?? null)
            : null,
          totalCount,
          revision: register.revision,
        };
      });
    },
    transaction<T>(operation: (tx: CashClosingTransaction) => Promise<T>) {
      return db.transaction((rawTx) => {
        const tx = rawTx as CashTx;
        const adapter: CashClosingTransaction = {
          lockLocation: (scope) => lockCashLocation(tx, scope),
          lockIdentity: (scope) => lockCashIdentity(tx, scope),
          async findRegister(scope) {
            const rows = await tx
              .select({
                id: businessCashRegisters.id,
                revision: businessCashRegisters.revision,
              })
              .from(businessCashRegisters)
              .where(
                and(
                  eq(
                    businessCashRegisters.organizationId,
                    scope.organizationId,
                  ),
                  eq(businessCashRegisters.locationId, scope.locationId),
                ),
              )
              .limit(1)
              .for("update");
            return rows[0] ? readRegisterRow(rows[0]) : null;
          },
          async findOpening(scope, registerId, openingId) {
            const rows = await tx
              .select()
              .from(businessCashOpenings)
              .where(
                and(
                  eq(businessCashOpenings.organizationId, scope.organizationId),
                  eq(businessCashOpenings.locationId, scope.locationId),
                  eq(businessCashOpenings.registerId, registerId),
                  eq(businessCashOpenings.id, openingId),
                ),
              )
              .limit(1)
              .for("update");
            return rows[0] ? cashOpeningFromRow(rows[0]) : null;
          },
          async findClosingByIntent(scope, intentId) {
            const rows = await tx
              .select()
              .from(businessCashClosings)
              .where(
                and(
                  eq(businessCashClosings.organizationId, scope.organizationId),
                  eq(businessCashClosings.locationId, scope.locationId),
                  eq(businessCashClosings.intentId, intentId),
                ),
              )
              .limit(1)
              .for("update");
            return rows[0] ? closingFromStoredRow(rows[0]) : null;
          },
          async findClosingByOpening(scope, registerId, openingId) {
            const rows = await tx
              .select()
              .from(businessCashClosings)
              .where(
                and(
                  eq(businessCashClosings.organizationId, scope.organizationId),
                  eq(businessCashClosings.locationId, scope.locationId),
                  eq(businessCashClosings.registerId, registerId),
                  eq(businessCashClosings.openingId, openingId),
                ),
              )
              .limit(1)
              .for("update");
            return rows[0] ? closingFromStoredRow(rows[0]) : null;
          },
          aggregateOpening: (scope, opening) =>
            aggregateCashOpening(tx, scope, opening),
          movementCutoff: (scope, openingId) =>
            cashMovementLedgerCutoff(tx, scope, openingId),
          async incrementRevision(scope, registerId, expectedRevision) {
            await tx
              .update(businessCashRegisters)
              .set({ revision: sql`${businessCashRegisters.revision} + 1` })
              .where(
                and(
                  eq(businessCashRegisters.id, registerId),
                  eq(
                    businessCashRegisters.organizationId,
                    scope.organizationId,
                  ),
                  eq(businessCashRegisters.locationId, scope.locationId),
                  eq(businessCashRegisters.revision, expectedRevision),
                ),
              );
            const rows = await tx
              .select({ revision: businessCashRegisters.revision })
              .from(businessCashRegisters)
              .where(
                and(
                  eq(businessCashRegisters.id, registerId),
                  eq(
                    businessCashRegisters.organizationId,
                    scope.organizationId,
                  ),
                  eq(businessCashRegisters.locationId, scope.locationId),
                ),
              )
              .limit(1);
            return rows[0]?.revision === expectedRevision + 1;
          },
          async insertClosing(input) {
            const [created] = await tx
              .insert(businessCashClosings)
              .values({
                organizationId: input.organizationId,
                locationId: input.locationId,
                registerId: input.registerId,
                openingId: input.openingId,
                closedById: input.closedById,
                closedBy: input.closedBy,
                closedAt: input.closedAt,
                openingSnapshot: JSON.stringify(input.opening),
                summarySnapshot: JSON.stringify(input.summary),
                totalsSnapshot: JSON.stringify(input.totals),
                varianceReason: input.varianceReason,
                status: input.status,
                lastMovementId: input.lastMovementId,
                movementCount: input.movementCount,
                revision: input.revision,
                intentId: input.intentId,
                payloadDigest: input.payloadDigest,
              })
              .$returningId();
            if (!created?.id) unavailable();
            const rows = await tx
              .select()
              .from(businessCashClosings)
              .where(
                and(
                  eq(businessCashClosings.organizationId, input.organizationId),
                  eq(businessCashClosings.locationId, input.locationId),
                  eq(businessCashClosings.id, created.id),
                ),
              )
              .limit(1);
            if (!rows[0]) unavailable();
            return closingFromStoredRow(rows[0]);
          },
          async releaseOpening(scope, registerId, openingId) {
            await tx
              .update(businessCashOpenings)
              .set({ activeSlot: null })
              .where(
                and(
                  eq(businessCashOpenings.organizationId, scope.organizationId),
                  eq(businessCashOpenings.locationId, scope.locationId),
                  eq(businessCashOpenings.registerId, registerId),
                  eq(businessCashOpenings.id, openingId),
                  eq(businessCashOpenings.activeSlot, "active"),
                ),
              );
            const rows = await tx
              .select({ activeSlot: businessCashOpenings.activeSlot })
              .from(businessCashOpenings)
              .where(
                and(
                  eq(businessCashOpenings.organizationId, scope.organizationId),
                  eq(businessCashOpenings.locationId, scope.locationId),
                  eq(businessCashOpenings.registerId, registerId),
                  eq(businessCashOpenings.id, openingId),
                ),
              )
              .limit(1);
            return rows[0]?.activeSlot === null;
          },
          async insertAudit(input) {
            await tx.insert(businessCashClosingAudits).values(input);
          },
        };
        return operation(adapter);
      }, CASH_WRITE_TRANSACTION_CONFIG);
    },
  };
}

/** Database-backed service. The clock is injectable only for the demo seed and tests. */
export async function serviceWithDatabase(nowProvider?: () => Date) {
  const db = await getDb();
  if (!db)
    throw new CashClosingServiceError("SERVICE_UNAVAILABLE", UNAVAILABLE);
  return createCashClosingService(drizzleRepository(db), nowProvider);
}
export async function getCashClosingState(
  scope: CashScope,
): Promise<CashClosingState> {
  return (await serviceWithDatabase()).closingState(scope);
}
export async function getCashClosingHistory(
  scope: CashScope,
  input: { limit: number; cursor?: number },
): Promise<CashClosingHistoryPage> {
  return (await serviceWithDatabase()).history(scope, input);
}
export async function closeCash(
  scope: CashScope,
  input: CashCloseInput,
): Promise<CashCloseResult> {
  return (await serviceWithDatabase()).close(scope, input);
}
