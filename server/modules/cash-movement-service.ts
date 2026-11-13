import { createHash } from "node:crypto";
import { and, desc, eq, lt, lte, sql } from "drizzle-orm";
import {
  businessCashMovementAudits,
  businessCashClosings,
  businessCashMovements,
  businessCashOpenings,
  businessCashRegisters,
} from "../../drizzle/schema";
import {
  CashMovementDomainError,
  cashMovementPayloadCanonical,
  projectCashMovementSummary,
  validateCashMovementDraft,
  validateCashMovementInput,
  type CashMovement,
  type CashMovementDraft,
  type CashMovementHistoryPage,
  type CashMovementInput,
  type CashMovementResult,
  type CashMovementSummary,
  type CashTurnSnapshot,
} from "../../lib/business/cash-movement-domain";
import {
  cashClockAt,
  type CashOpening,
  type CashPosition,
} from "../../lib/business/cash-domain";
import type { MovementSummary } from "../../lib/shift-movements";
import { getScheduleForDate } from "../../lib/station-calendar";
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

export type CashMovementServiceErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SERVICE_UNAVAILABLE";

export class CashMovementServiceError extends Error {
  constructor(
    readonly code: CashMovementServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CashMovementServiceError";
  }
}

export type CashMovementRegister = { id: number; revision: number };
export type CashMovementOpening = CashOpening & {
  organizationId: number;
  locationId: number;
  activeSlot: string | null;
};
export type CashStoredMovement = CashMovement & {
  organizationId: number;
  locationId: number;
  intentId: string;
  payloadDigest: string;
  resultRevision: number;
  referenceDigest: string | null;
};
export type CashMovementInsert = Omit<
  CashStoredMovement,
  "id" | "recordedAt" | "amount"
> & { amount: bigint; recordedAt: Date };
export type CashMovementAuditInsert = {
  organizationId: number;
  locationId: number;
  registerId: number;
  openingId: number;
  movementId: number;
  actorId: number;
  event: "cash.movement.recorded";
  revision: number;
  payloadDigest: string;
  metadata: string;
  createdAt: Date;
};

export interface CashMovementTransaction {
  lockLocation(scope: CashScope): Promise<boolean>;
  lockIdentity(scope: CashScope): Promise<CashIdentitySnapshot | null>;
  findMovementByIntent(
    scope: CashScope,
    intentId: string,
  ): Promise<CashStoredMovement | null>;
  findRegister(scope: CashScope): Promise<CashMovementRegister | null>;
  findActiveOpening(
    scope: CashScope,
    registerId: number,
    openingId: number,
  ): Promise<CashMovementOpening | null>;
  aggregateOpening(
    scope: CashScope,
    opening: CashMovementOpening,
  ): Promise<CashMovementSummary>;
  latestRecordedAt(scope: CashScope, openingId: number): Promise<Date | null>;
  findReference(
    scope: CashScope,
    openingId: number,
    method: CashMovementInput["paymentMethod"],
    digest: string,
  ): Promise<boolean>;
  incrementRevision(
    scope: CashScope,
    registerId: number,
    expectedRevision: number,
  ): Promise<boolean>;
  insertMovement(input: CashMovementInsert): Promise<CashStoredMovement>;
  insertAudit(input: CashMovementAuditInsert): Promise<void>;
}
export interface CashMovementRepository {
  readTurnSnapshot(scope: CashScope): Promise<CashTurnSnapshot>;
  readHistory(
    scope: CashScope,
    openingId: number,
    limit: number,
    cursor?: number,
  ): Promise<CashMovementHistoryPage>;
  transaction<T>(
    operation: (tx: CashMovementTransaction) => Promise<T>,
  ): Promise<T>;
}

const MAX_MYSQL_INT = 2_147_483_647;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const UNAVAILABLE = "O serviço de caixa está temporariamente indisponível.";
const CONFLICT =
  "O caixa mudou. Atualize o turno e revise novamente antes de registrar.";
function unavailable(): never {
  throw new CashMovementServiceError("SERVICE_UNAVAILABLE", UNAVAILABLE);
}
function conflict(message = CONFLICT): never {
  throw new CashMovementServiceError("CONFLICT", message);
}
function duplicateKey(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const item = error as { code?: unknown; errno?: unknown };
  return item.code === "ER_DUP_ENTRY" || item.errno === 1062;
}
function toExactBigInt(value: unknown, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value))
    return BigInt(value);
  if (typeof value === "string" && /^-?\d+$/u.test(value)) return BigInt(value);
  return unavailableWithMessage(
    `O total ${label} retornou um formato impreciso.`,
  );
}
function unavailableWithMessage(message: string): never {
  throw new CashMovementServiceError("SERVICE_UNAVAILABLE", message);
}
function checkedNumber(value: bigint, label: string): number {
  if (value < 0n || value > MAX_SAFE)
    return unavailableWithMessage(
      `O total ${label} excede a precisão segura em centavos.`,
    );
  return Number(value);
}
function parseReferenceDigest(reference: string): string | null {
  const normalized = reference.trim().toLowerCase();
  if (!normalized) return null;
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
function digestPayload(actorId: number, input: CashMovementInput): string {
  return createHash("sha256")
    .update(cashMovementPayloadCanonical(actorId, input), "utf8")
    .digest("hex");
}
function movementFromStored(stored: CashStoredMovement): CashMovement {
  return {
    id: stored.id,
    registerId: stored.registerId,
    openingId: stored.openingId,
    responsibleId: stored.responsibleId,
    responsible: stored.responsible,
    type: stored.type,
    paymentMethod: stored.paymentMethod,
    receiptNature: stored.receiptNature,
    amount: checkedNumber(BigInt(stored.amount), "da movimentação"),
    description: stored.description,
    reference: stored.reference,
    counterparty: stored.counterparty,
    recordedAt: stored.recordedAt,
  };
}
function replay(stored: CashStoredMovement): CashMovementResult {
  return {
    movement: movementFromStored(stored),
    revision: stored.resultRevision,
    replayed: true,
  };
}
function toDraft(input: CashMovementInput): CashMovementDraft {
  return validateCashMovementDraft({
    type: input.type,
    paymentMethod: input.paymentMethod,
    receiptNature: input.receiptNature,
    amount: input.amount,
    description: input.description,
    reference: input.reference,
    counterparty: input.counterparty,
  });
}
function exactWindow(
  opening: CashMovementOpening,
  input: CashMovementInput,
  now: Date,
): void {
  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    now.getTime() < Date.parse(opening.openedAt)
  ) {
    conflict("O relógio do servidor é inválido ou anterior à abertura.");
  }
  const clock = cashClockAt(now);
  if (
    clock.operationDate !== input.operationDate ||
    clock.operationDate !== opening.operationDate ||
    !clock.scheduledShift ||
    clock.scheduledShift.id !== input.shiftId ||
    clock.scheduledShift.id !== opening.shift.id
  ) {
    conflict(
      "O turno mudou ou terminou. Atualize o caixa e faça uma nova revisão.",
    );
  }
  const requestedShift = getScheduleForDate(input.operationDate).shifts.find(
    (shift) => shift.id === input.shiftId,
  );
  if (
    !requestedShift ||
    requestedShift.start !== opening.shift.start ||
    requestedShift.end !== opening.shift.end
  ) {
    conflict("A data e o turno informados não correspondem à abertura ativa.");
  }
}

export function createCashMovementService(
  repository: CashMovementRepository,
  nowProvider: () => Date = () => new Date(),
) {
  return {
    async turnSnapshot(scope: CashScope): Promise<CashTurnSnapshot> {
      return repository.readTurnSnapshot(scope);
    },
    async history(
      scope: CashScope,
      input: { openingId: number; limit: number; cursor?: number },
    ): Promise<CashMovementHistoryPage> {
      return repository.readHistory(
        scope,
        input.openingId,
        input.limit,
        input.cursor,
      );
    },
    async record(
      scope: CashScope,
      inputValue: CashMovementInput,
    ): Promise<CashMovementResult> {
      let input: CashMovementInput;
      try {
        input = validateCashMovementInput(inputValue);
      } catch (error) {
        if (error instanceof CashMovementDomainError)
          throw new CashMovementServiceError("BAD_REQUEST", error.message);
        throw error;
      }
      const draft = toDraft(input);
      const digest = digestPayload(scope.actorId, input);
      const referenceDigest =
        draft.type === "recebimento"
          ? parseReferenceDigest(draft.reference)
          : null;
      try {
        return await repository.transaction(async (tx) => {
          if (!(await tx.lockLocation(scope))) {
            throw new CashMovementServiceError(
              "FORBIDDEN",
              "A unidade da sessão não está disponível.",
            );
          }
          const identity = await tx.lockIdentity(scope);
          const identityTime = new Date(nowProvider().getTime());
          const actor = assertCashIdentity(
            identity,
            scope,
            identityTime,
            "write",
            "movement",
          );
          if (input.expectedActorId !== scope.actorId) {
            conflict(
              "A conta autenticada mudou depois da conferência. Volte à conta original para recuperar uma tentativa incerta ou atualize e faça uma nova revisão antes de registrar.",
            );
          }

          // Preserve the common lock order: location -> identity -> register -> opening.
          // These lookups acquire locks only; no current-turn precondition is evaluated yet.
          const register = await tx.findRegister(scope);
          const opening = register
            ? await tx.findActiveOpening(scope, register.id, input.openingId)
            : null;

          // Idempotent retry is resolved after auth but before mutable turn/revision/time preconditions.
          const stored = await tx.findMovementByIntent(scope, input.intentId);
          if (stored) {
            if (
              stored.responsibleId !== scope.actorId ||
              stored.payloadDigest !== digest
            ) {
              conflict(
                "Este ID de intenção já foi usado com outros dados ou por outra conta. Gere uma nova confirmação.",
              );
            }
            return replay(stored);
          }

          if (!register)
            throw new CashMovementServiceError(
              "NOT_FOUND",
              "Não há caixa principal configurado para esta unidade.",
            );
          if (!opening)
            throw new CashMovementServiceError(
              "CONFLICT",
              "A abertura ativa não corresponde ao turno revisado.",
            );
          const summary = await tx.aggregateOpening(scope, opening);
          const latestAt = await tx.latestRecordedAt(scope, opening.id);
          if (
            referenceDigest &&
            (await tx.findReference(
              scope,
              opening.id,
              draft.paymentMethod,
              referenceDigest,
            ))
          ) {
            conflict(
              "Esta referência já foi registrada neste turno e meio de pagamento.",
            );
          }

          // The authoritative wall clock is sampled only after every lock, read and aggregate.
          const committedNow = new Date(nowProvider().getTime());
          assertCashIdentity(
            identity,
            scope,
            committedNow,
            "write",
            "movement",
          );
          exactWindow(opening, input, committedNow);
          if (
            input.openingId !== opening.id ||
            input.operationDate !== opening.operationDate ||
            input.shiftId !== opening.shift.id
          ) {
            conflict("A revisão não corresponde à abertura ativa.");
          }
          if (
            !Number.isSafeInteger(register.revision) ||
            register.revision < 0 ||
            register.revision >= MAX_MYSQL_INT
          )
            unavailableWithMessage(
              "A revisão do caixa excedeu o limite suportado.",
            );
          if (register.revision !== input.expectedRevision) conflict();
          if (latestAt && committedNow.getTime() < latestAt.getTime())
            conflict(
              "O relógio do servidor não pode retroceder em relação à última movimentação.",
            );
          try {
            projectCashMovementSummary(summary, draft);
          } catch (error) {
            if (error instanceof CashMovementDomainError)
              throw new CashMovementServiceError("BAD_REQUEST", error.message);
            throw error;
          }

          const revision = register.revision + 1;
          if (
            !(await tx.incrementRevision(scope, register.id, register.revision))
          )
            conflict();
          const movement = await tx.insertMovement({
            organizationId: scope.organizationId,
            locationId: scope.locationId,
            registerId: register.id,
            openingId: opening.id,
            responsibleId: scope.actorId,
            responsible: actor.operator,
            type: draft.type,
            paymentMethod: draft.paymentMethod,
            receiptNature: draft.receiptNature,
            amount: BigInt(draft.amount),
            description: draft.description,
            reference: draft.reference,
            referenceDigest,
            counterparty: draft.counterparty,
            intentId: input.intentId,
            payloadDigest: digest,
            resultRevision: revision,
            recordedAt: committedNow,
          });
          await tx.insertAudit({
            organizationId: scope.organizationId,
            locationId: scope.locationId,
            registerId: register.id,
            openingId: opening.id,
            movementId: movement.id,
            actorId: scope.actorId,
            event: "cash.movement.recorded",
            revision,
            payloadDigest: digest,
            metadata: JSON.stringify({
              intentId: input.intentId,
              type: draft.type,
              paymentMethod: draft.paymentMethod,
              receiptNature: draft.receiptNature,
              amountCents: draft.amount,
              openingId: opening.id,
            }),
            createdAt: committedNow,
          });
          return {
            movement: movementFromStored(movement),
            revision,
            replayed: false,
          };
        });
      } catch (error) {
        if (error instanceof CashMovementServiceError) throw error;
        if (duplicateKey(error))
          conflict(
            "Outra operação usou este ID ou referência em paralelo. Atualize e revise o caixa.",
          );
        throw error;
      }
    },
  };
}

export function cashOpeningFromRow(
  row: typeof businessCashOpenings.$inferSelect,
): CashMovementOpening {
  const openingFloat = checkedNumber(
    toExactBigInt(row.openingFloatCents as unknown, "fundo de abertura"),
    "fundo de abertura",
  );
  if (
    !Number.isSafeInteger(row.id) ||
    !Number.isSafeInteger(row.registerId) ||
    !(row.openedAt instanceof Date) ||
    !Number.isFinite(row.openedAt.getTime())
  )
    unavailableWithMessage("A abertura armazenada está inválida.");
  return {
    id: row.id,
    registerId: row.registerId,
    operatorId: row.operatorId,
    operator: row.operator,
    openingFloat,
    operationDate: row.operationDate,
    shift: {
      id: row.shiftId,
      label: row.shiftLabel,
      start: row.shiftStart,
      end: row.shiftEnd,
    },
    openedAt: row.openedAt.toISOString(),
    organizationId: row.organizationId,
    locationId: row.locationId,
    activeSlot: row.activeSlot,
  };
}
const openingFromRow = cashOpeningFromRow;
function movementFromRow(
  row: typeof businessCashMovements.$inferSelect,
): CashStoredMovement {
  const amount = checkedNumber(
    toExactBigInt(row.amountCents as unknown, "movimentação"),
    "movimentação",
  );
  if (
    !Number.isSafeInteger(row.id) ||
    !Number.isSafeInteger(row.registerId) ||
    !Number.isSafeInteger(row.openingId) ||
    !Number.isSafeInteger(row.responsibleId) ||
    !(row.recordedAt instanceof Date) ||
    !Number.isFinite(row.recordedAt.getTime())
  )
    unavailableWithMessage("Uma movimentação armazenada está inválida.");
  return {
    id: row.id,
    organizationId: row.organizationId,
    locationId: row.locationId,
    registerId: row.registerId,
    openingId: row.openingId,
    responsibleId: row.responsibleId,
    responsible: row.responsible,
    type: row.type,
    paymentMethod: row.paymentMethod,
    receiptNature: row.receiptNature,
    amount,
    description: row.description,
    reference: row.reference,
    referenceDigest: row.referenceDigest,
    counterparty: row.counterparty,
    intentId: row.intentId,
    payloadDigest: row.payloadDigest,
    resultRevision: row.resultRevision,
    recordedAt: row.recordedAt.toISOString(),
  };
}
function mapMovementRow(
  row: typeof businessCashMovements.$inferSelect,
): CashMovement {
  const stored = movementFromRow(row);
  return movementFromStored(stored);
}
function safeDbRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    return unavailableWithMessage("A revisão do caixa armazenada é inválida.");
  return value;
}
export function cashMovementSummaryFromAggregate(
  row: Record<string, unknown>,
  openingFloatCents: bigint,
): CashMovementSummary {
  const amount = (key: string) => toExactBigInt(row[key], key);
  const receiptsByMethod = {
    dinheiro: amount("receiptsCash"),
    pix: amount("receiptsPix"),
    debito: amount("receiptsDebit"),
    credito: amount("receiptsCredit"),
  };
  for (const [method, total] of Object.entries(receiptsByMethod))
    checkedNumber(total, `recebimentos ${method}`);
  const allReceipts = Object.values(receiptsByMethod).reduce(
    (sum, value) => sum + value,
    0n,
  );
  checkedNumber(allReceipts, "recebimentos totais");
  const openingFloat = checkedNumber(openingFloatCents, "fundo de abertura");
  const supplies = amount("supplies");
  const withdrawals = amount("withdrawals");
  const cashExpected =
    openingFloatCents + receiptsByMethod.dinheiro + supplies - withdrawals;
  if (cashExpected < 0n)
    unavailableWithMessage(
      "O histórico armazenado produz dinheiro esperado negativo.",
    );
  return {
    cashExpected: checkedNumber(cashExpected, "dinheiro esperado"),
    openingFloat,
    receiptsByMethod: Object.fromEntries(
      Object.entries(receiptsByMethod).map(([method, value]) => [
        method,
        checkedNumber(value, `recebimentos ${method}`),
      ]),
    ) as MovementSummary["receiptsByMethod"],
    sales: checkedNumber(amount("sales"), "vendas"),
    previousReceipts: checkedNumber(
      amount("previousReceipts"),
      "recebimentos anteriores",
    ),
    supplies: checkedNumber(supplies, "suprimentos"),
    withdrawals: checkedNumber(withdrawals, "sangrias"),
    count: checkedNumber(
      toExactBigInt(row.movementCount, "quantidade de movimentos"),
      "quantidade de movimentos",
    ),
  };
}
function aggregateQuery(tx: CashTx, scope: CashScope, openingId: number) {
  const table = businessCashMovements;
  const sum = (condition: ReturnType<typeof sql>) =>
    sql<string>`CAST(COALESCE(SUM(CASE WHEN ${condition} THEN ${table.amountCents} ELSE 0 END), 0) AS CHAR)`;
  return tx
    .select({
      receiptsCash: sum(
        sql`${table.type} = 'recebimento' AND ${table.paymentMethod} = 'dinheiro'`,
      ),
      receiptsPix: sum(
        sql`${table.type} = 'recebimento' AND ${table.paymentMethod} = 'pix'`,
      ),
      receiptsDebit: sum(
        sql`${table.type} = 'recebimento' AND ${table.paymentMethod} = 'debito'`,
      ),
      receiptsCredit: sum(
        sql`${table.type} = 'recebimento' AND ${table.paymentMethod} = 'credito'`,
      ),
      sales: sum(
        sql`${table.type} = 'recebimento' AND ${table.receiptNature} = 'venda'`,
      ),
      previousReceipts: sum(
        sql`${table.type} = 'recebimento' AND ${table.receiptNature} = 'conta-anterior'`,
      ),
      supplies: sum(sql`${table.type} = 'suprimento'`),
      withdrawals: sum(sql`${table.type} = 'sangria'`),
      movementCount: sql<string>`CAST(COUNT(*) AS CHAR)`,
    })
    .from(table)
    .where(
      and(
        eq(table.organizationId, scope.organizationId),
        eq(table.locationId, scope.locationId),
        eq(table.openingId, openingId),
      ),
    );
}

/** Shared exact aggregate used by snapshots and the closing transaction. */
export async function aggregateCashOpening(
  tx: CashTx,
  scope: CashScope,
  opening: CashMovementOpening,
): Promise<CashMovementSummary> {
  const rows = await aggregateQuery(tx, scope, opening.id);
  if (!rows[0]) unavailable();
  return cashMovementSummaryFromAggregate(
    rows[0] as Record<string, unknown>,
    BigInt(opening.openingFloat),
  );
}

export type CashMovementLedgerCutoff = {
  lastMovementId: number | null;
  lastMovementAt: Date | null;
};

/** Capture the immutable-ID boundary and latest timestamp without materializing the ledger. */
export async function cashMovementLedgerCutoff(
  tx: CashTx,
  scope: CashScope,
  openingId: number,
): Promise<CashMovementLedgerCutoff> {
  const scoped = and(
    eq(businessCashMovements.organizationId, scope.organizationId),
    eq(businessCashMovements.locationId, scope.locationId),
    eq(businessCashMovements.openingId, openingId),
  );
  const [idRows, timeRows] = await Promise.all([
    tx
      .select({ id: businessCashMovements.id })
      .from(businessCashMovements)
      .where(scoped)
      .orderBy(desc(businessCashMovements.id))
      .limit(1),
    tx
      .select({ recordedAt: businessCashMovements.recordedAt })
      .from(businessCashMovements)
      .where(scoped)
      .orderBy(
        desc(businessCashMovements.recordedAt),
        desc(businessCashMovements.id),
      )
      .limit(1),
  ]);
  const id = idRows[0]?.id ?? null;
  const recordedAt = timeRows[0]?.recordedAt ?? null;
  if (
    (id !== null && (!Number.isSafeInteger(id) || id <= 0)) ||
    (recordedAt !== null &&
      (!(recordedAt instanceof Date) || !Number.isFinite(recordedAt.getTime())))
  ) {
    unavailableWithMessage("O corte do histórico de movimentos está inválido.");
  }
  return { lastMovementId: id, lastMovementAt: recordedAt };
}

type CashDb = Exclude<Awaited<ReturnType<typeof getDb>>, null>;
type CashDbTransaction = Parameters<Parameters<CashDb["transaction"]>[0]>[0];

function drizzleMovementTransaction(tx: CashTx): CashMovementTransaction {
  return {
    lockLocation: (scope) => lockCashLocation(tx, scope),
    lockIdentity: (scope) => lockCashIdentity(tx, scope),
    async findMovementByIntent(scope, intentId) {
      const rows = await tx
        .select()
        .from(businessCashMovements)
        .where(
          and(
            eq(businessCashMovements.organizationId, scope.organizationId),
            eq(businessCashMovements.locationId, scope.locationId),
            eq(businessCashMovements.intentId, intentId),
          ),
        )
        .limit(1)
        .for("update");
      return rows[0] ? movementFromRow(rows[0]) : null;
    },
    async findRegister(scope) {
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
        .limit(1)
        .for("update");
      return rows[0]
        ? { id: rows[0].id, revision: safeDbRevision(rows[0].revision) }
        : null;
    },
    async findActiveOpening(scope, registerId, openingId) {
      const rows = await tx
        .select()
        .from(businessCashOpenings)
        .where(
          and(
            eq(businessCashOpenings.organizationId, scope.organizationId),
            eq(businessCashOpenings.locationId, scope.locationId),
            eq(businessCashOpenings.registerId, registerId),
            eq(businessCashOpenings.id, openingId),
            eq(businessCashOpenings.activeSlot, "active"),
          ),
        )
        .limit(1)
        .for("update");
      return rows[0] ? openingFromRow(rows[0]) : null;
    },
    async aggregateOpening(scope, opening) {
      const rows = await aggregateQuery(tx, scope, opening.id);
      if (!rows[0]) unavailable();
      return cashMovementSummaryFromAggregate(
        rows[0] as Record<string, unknown>,
        BigInt(opening.openingFloat),
      );
    },
    async latestRecordedAt(scope, openingId) {
      const rows = await tx
        .select({ recordedAt: businessCashMovements.recordedAt })
        .from(businessCashMovements)
        .where(
          and(
            eq(businessCashMovements.organizationId, scope.organizationId),
            eq(businessCashMovements.locationId, scope.locationId),
            eq(businessCashMovements.openingId, openingId),
          ),
        )
        .orderBy(
          desc(businessCashMovements.recordedAt),
          desc(businessCashMovements.id),
        )
        .limit(1);
      return rows[0]?.recordedAt ?? null;
    },
    async findReference(scope, openingId, method, referenceDigest) {
      const rows = await tx
        .select({ id: businessCashMovements.id })
        .from(businessCashMovements)
        .where(
          and(
            eq(businessCashMovements.organizationId, scope.organizationId),
            eq(businessCashMovements.locationId, scope.locationId),
            eq(businessCashMovements.openingId, openingId),
            eq(businessCashMovements.paymentMethod, method),
            eq(businessCashMovements.referenceDigest, referenceDigest),
          ),
        )
        .limit(1)
        .for("update");
      return Boolean(rows[0]);
    },
    async incrementRevision(scope, registerId, expectedRevision) {
      await tx
        .update(businessCashRegisters)
        .set({ revision: sql`${businessCashRegisters.revision} + 1` })
        .where(
          and(
            eq(businessCashRegisters.id, registerId),
            eq(businessCashRegisters.organizationId, scope.organizationId),
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
            eq(businessCashRegisters.organizationId, scope.organizationId),
            eq(businessCashRegisters.locationId, scope.locationId),
          ),
        )
        .limit(1);
      return rows[0]?.revision === expectedRevision + 1;
    },
    async insertMovement(input) {
      const [created] = await tx
        .insert(businessCashMovements)
        .values({
          organizationId: input.organizationId,
          locationId: input.locationId,
          registerId: input.registerId,
          openingId: input.openingId,
          responsibleId: input.responsibleId,
          responsible: input.responsible,
          type: input.type,
          paymentMethod: input.paymentMethod,
          receiptNature: input.receiptNature,
          amountCents: input.amount,
          description: input.description,
          reference: input.reference,
          referenceDigest: input.referenceDigest,
          counterparty: input.counterparty,
          intentId: input.intentId,
          payloadDigest: input.payloadDigest,
          resultRevision: input.resultRevision,
          recordedAt: input.recordedAt,
        })
        .$returningId();
      if (!created?.id) unavailable();
      const rows = await tx
        .select()
        .from(businessCashMovements)
        .where(
          and(
            eq(businessCashMovements.id, created.id),
            eq(businessCashMovements.organizationId, input.organizationId),
            eq(businessCashMovements.locationId, input.locationId),
          ),
        )
        .limit(1);
      if (!rows[0]) unavailable();
      return movementFromRow(rows[0]);
    },
    async insertAudit(input) {
      await tx.insert(businessCashMovementAudits).values(input);
    },
  };
}

function publicOpening(
  row: typeof businessCashOpenings.$inferSelect,
): CashOpening {
  const opening = openingFromRow(row);
  const {
    organizationId: _org,
    locationId: _loc,
    activeSlot: _slot,
    ...publicValue
  } = opening;
  return publicValue;
}

async function readRegister(tx: CashDbTransaction, scope: CashScope) {
  const rows = await tx
    .select()
    .from(businessCashRegisters)
    .where(
      and(
        eq(businessCashRegisters.organizationId, scope.organizationId),
        eq(businessCashRegisters.locationId, scope.locationId),
      ),
    )
    .limit(1);
  if (!rows[0]) return null;
  return { id: rows[0].id, revision: safeDbRevision(rows[0].revision) };
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
function drizzleRepository(db: CashDb): CashMovementRepository {
  return {
    async readTurnSnapshot(scope) {
      return db.transaction(async (tx) => {
        const register = await readRegister(tx as CashDbTransaction, scope);
        const openingRow = register
          ? await readActiveOpening(tx as CashDbTransaction, scope, register.id)
          : null;
        const opening = openingRow ? openingFromRow(openingRow) : null;
        let summary: CashMovementSummary | null = null;
        if (opening) {
          const aggregate = await aggregateQuery(
            tx as CashTx,
            scope,
            opening.id,
          );
          if (!aggregate[0]) unavailable();
          summary = cashMovementSummaryFromAggregate(
            aggregate[0] as Record<string, unknown>,
            BigInt(opening.openingFloat),
          );
        }
        const now = new Date();
        const clock = cashClockAt(now);
        const position: CashPosition = {
          revision: register?.revision ?? 0,
          serverNow: clock.serverNow,
          operationDate: clock.operationDate,
          scheduledShift: clock.scheduledShift,
          activeOpening: openingRow ? publicOpening(openingRow) : null,
        };
        return { ...position, summary };
      });
    },
    async readHistory(scope, openingId, limit, cursor) {
      return db.transaction(async (tx) => {
        const register = await readRegister(tx as CashDbTransaction, scope);
        if (!register)
          throw new CashMovementServiceError(
            "NOT_FOUND",
            "O caixa não existe nesta unidade.",
          );
        const openingRows = await tx
          .select({ id: businessCashOpenings.id })
          .from(businessCashOpenings)
          .where(
            and(
              eq(businessCashOpenings.organizationId, scope.organizationId),
              eq(businessCashOpenings.locationId, scope.locationId),
              eq(businessCashOpenings.registerId, register.id),
              eq(businessCashOpenings.id, openingId),
            ),
          )
          .limit(1);
        if (!openingRows[0])
          throw new CashMovementServiceError(
            "NOT_FOUND",
            "A abertura solicitada não pertence a este caixa.",
          );
        const closingRows = await tx
          .select({
            lastMovementId: businessCashClosings.lastMovementId,
            movementCount: businessCashClosings.movementCount,
          })
          .from(businessCashClosings)
          .where(
            and(
              eq(businessCashClosings.organizationId, scope.organizationId),
              eq(businessCashClosings.locationId, scope.locationId),
              eq(businessCashClosings.registerId, register.id),
              eq(businessCashClosings.openingId, openingId),
            ),
          )
          .limit(1);
        const frozenCutoff = closingRows[0] ?? null;
        const where = and(
          eq(businessCashMovements.organizationId, scope.organizationId),
          eq(businessCashMovements.locationId, scope.locationId),
          eq(businessCashMovements.openingId, openingId),
          frozenCutoff
            ? frozenCutoff.lastMovementId === null
              ? eq(businessCashMovements.id, 0)
              : lte(businessCashMovements.id, frozenCutoff.lastMovementId)
            : undefined,
          cursor === undefined
            ? undefined
            : lt(businessCashMovements.id, cursor),
        );
        const [pageRows, countRows] = await Promise.all([
          tx
            .select()
            .from(businessCashMovements)
            .where(where)
            .orderBy(desc(businessCashMovements.id))
            .limit(limit + 1),
          frozenCutoff
            ? Promise.resolve([])
            : tx
                .select({ total: sql<string>`CAST(COUNT(*) AS CHAR)` })
                .from(businessCashMovements)
                .where(
                  and(
                    eq(businessCashMovements.organizationId, scope.organizationId),
                    eq(businessCashMovements.locationId, scope.locationId),
                    eq(businessCashMovements.openingId, openingId),
                  ),
                ),
        ]);
        const hasMore = pageRows.length > limit;
        const selected = pageRows.slice(0, limit).map(mapMovementRow);
        const totalCount = frozenCutoff
          ? checkedNumber(
              toExactBigInt(
                frozenCutoff.movementCount as unknown,
                "quantidade congelada de movimentos",
              ),
              "quantidade congelada de movimentos",
            )
          : checkedNumber(
              toExactBigInt(countRows[0]?.total, "quantidade de movimentos"),
              "quantidade de movimentos",
            );
        return {
          openingId,
          items: selected,
          nextCursor: hasMore
            ? (selected[selected.length - 1]?.id ?? null)
            : null,
          totalCount,
          revision: register.revision,
        };
      });
    },
    transaction<T>(operation: (tx: CashMovementTransaction) => Promise<T>) {
      return db.transaction(
        (tx) => operation(drizzleMovementTransaction(tx as CashTx)),
        CASH_WRITE_TRANSACTION_CONFIG,
      );
    },
  };
}

async function serviceWithDatabase() {
  const db = await getDb();
  if (!db)
    throw new CashMovementServiceError("SERVICE_UNAVAILABLE", UNAVAILABLE);
  return createCashMovementService(drizzleRepository(db));
}
export async function getCashTurnSnapshot(
  scope: CashScope,
): Promise<CashTurnSnapshot> {
  return (await serviceWithDatabase()).turnSnapshot(scope);
}
export async function getCashMovementHistory(
  scope: CashScope,
  input: { openingId: number; limit: number; cursor?: number },
): Promise<CashMovementHistoryPage> {
  return (await serviceWithDatabase()).history(scope, input);
}
export async function recordCashMovement(
  scope: CashScope,
  input: CashMovementInput,
): Promise<CashMovementResult> {
  return (await serviceWithDatabase()).record(scope, input);
}
