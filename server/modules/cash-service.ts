import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  businessCashOpeningAudits,
  businessCashOpenings,
  businessCashRegisters,
  businessLocations,
  businessMemberships,
  businessSessions,
  businessUsers,
} from "../../drizzle/schema";
import {
  canOpenCash,
  canReadCash,
  cashClockAt,
  cashOpenPayloadCanonical,
  CashDomainError,
  getCashShiftForDate,
  validateCashOpenInput,
  type CashOpening,
  type CashOpenInput,
  type CashOpenResult,
  type CashPosition,
} from "../../lib/business/cash-domain";
import { getDb } from "../db";

export type CashScope = {
  organizationId: number;
  locationId: number;
  actorId: number;
  sessionId: number;
};

export type CashServiceErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SERVICE_UNAVAILABLE";

export class CashServiceError extends Error {
  constructor(
    readonly code: CashServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CashServiceError";
  }
}

export type CashIdentitySnapshot = {
  sessionId: number;
  sessionUserId: number;
  sessionExpiresAt: Date;
  sessionRevokedAt: Date | null;
  userId: number;
  userName: string;
  userDisabledAt: Date | null;
  membershipUserId: number;
  organizationId: number;
  locationId: number;
  membershipActive: boolean;
  role: string;
};

export type CashRegisterSnapshot = {
  id: number;
  revision: number;
};

export type CashStoredOpening = CashOpening & {
  organizationId: number;
  locationId: number;
  intentId: string;
  activeSlot: string | null;
  payloadDigest: string;
  resultRevision: number;
};

export type CashCurrentSnapshot = {
  register: CashRegisterSnapshot | null;
  activeOpening: CashOpening | null;
};

export type CashOpeningInsert = {
  organizationId: number;
  locationId: number;
  registerId: number;
  operatorId: number;
  operator: string;
  openingFloatCents: bigint;
  operationDate: string;
  timeZone: "America/Sao_Paulo";
  shiftId: "turno-1" | "turno-2";
  shiftLabel: string;
  shiftStart: string;
  shiftEnd: string;
  openedAt: Date;
  activeSlot: "active";
  intentId: string;
  payloadDigest: string;
  resultRevision: number;
};

export type CashAuditInsert = {
  organizationId: number;
  locationId: number;
  registerId: number;
  openingId: number;
  actorId: number;
  event: "cash.opened";
  revision: number;
  payloadDigest: string;
  metadata: string;
  createdAt: Date;
};

/**
 * Transaction adapter boundary: production uses Drizzle/MySQL; tests use an
 * isolated in-memory transaction adapter and never touch the shared database.
 */
export interface CashTransaction {
  lockLocation(scope: CashScope): Promise<boolean>;
  lockIdentity(scope: CashScope): Promise<CashIdentitySnapshot | null>;
  findOpeningByIntent(
    scope: CashScope,
    intentId: string,
  ): Promise<CashStoredOpening | null>;
  findRegister(scope: CashScope): Promise<CashRegisterSnapshot | null>;
  findActiveOpening(
    scope: CashScope,
    registerId: number,
  ): Promise<CashOpening | null>;
  createRegister(
    scope: CashScope,
    name: string,
  ): Promise<CashRegisterSnapshot>;
  incrementRevision(
    scope: CashScope,
    registerId: number,
    expectedRevision: number,
  ): Promise<boolean>;
  insertOpening(input: CashOpeningInsert): Promise<CashStoredOpening>;
  insertAudit(input: CashAuditInsert): Promise<void>;
}

export interface CashRepository {
  readCurrent(scope: CashScope): Promise<CashCurrentSnapshot>;
  transaction<T>(
    operation: (tx: CashTransaction) => Promise<T>,
  ): Promise<T>;
}

const MAX_MYSQL_INT = 2_147_483_647;
const REGISTER_NAME = "Caixa principal";
const UNAVAILABLE_MESSAGE =
  "O serviço de caixa está temporariamente indisponível.";
const CONFLICT_MESSAGE =
  "O estado do caixa mudou. Atualize e revise a abertura antes de confirmar.";

function unavailable(): CashServiceError {
  return new CashServiceError("SERVICE_UNAVAILABLE", UNAVAILABLE_MESSAGE);
}

function conflict(message = CONFLICT_MESSAGE): never {
  throw new CashServiceError("CONFLICT", message);
}

function duplicateKey(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062;
}

export function assertCashIdentity(
  identity: CashIdentitySnapshot | null,
  scope: CashScope,
  now: Date,
  permission: "read" | "write" = "write",
  writeAction: "open" | "movement" = "open",
): { operator: string; role: string } {
  if (!identity) {
    throw new CashServiceError(
      "UNAUTHORIZED",
      "A sessão comercial expirou. Entre novamente para continuar.",
    );
  }
  if (
    identity.sessionId !== scope.sessionId ||
    identity.sessionUserId !== scope.actorId ||
    identity.userId !== scope.actorId ||
    identity.membershipUserId !== scope.actorId
  ) {
    throw new CashServiceError("UNAUTHORIZED", "Sessão comercial inválida.");
  }
  if (
    identity.sessionRevokedAt !== null ||
    !Number.isFinite(identity.sessionExpiresAt?.getTime()) ||
    identity.sessionExpiresAt.getTime() <= now.getTime() ||
    identity.userDisabledAt !== null
  ) {
    throw new CashServiceError(
      "UNAUTHORIZED",
      "A sessão ou a conta não está mais ativa. Entre novamente.",
    );
  }
  if (
    identity.organizationId !== scope.organizationId ||
    identity.locationId !== scope.locationId ||
    !identity.membershipActive
  ) {
    throw new CashServiceError(
      "FORBIDDEN",
      "A associação ativa desta conta não permite acessar o caixa desta unidade.",
    );
  }
  if (!(permission === "read" ? canReadCash(identity.role) : canOpenCash(identity.role))) {
    throw new CashServiceError(
      "FORBIDDEN",
      permission === "read"
        ? "Seu perfil não pode consultar o caixa."
        : writeAction === "open"
          ? "Seu perfil pode consultar, mas não abrir o caixa."
          : "Seu perfil pode consultar, mas não registrar movimentações no caixa.",
    );
  }
  const operator = identity.userName.trim();
  if (operator.length < 1 || operator.length > 120) {
    throw new CashServiceError(
      "FORBIDDEN",
      "A conta autenticada não possui um nome de operador válido.",
    );
  }
  return { operator, role: identity.role };
}

function validateInput(input: CashOpenInput): CashOpenInput {
  try {
    return validateCashOpenInput(input);
  } catch (error) {
    if (error instanceof CashDomainError) {
      throw new CashServiceError("BAD_REQUEST", error.message);
    }
    throw error;
  }
}

function payloadDigest(actorId: number, input: CashOpenInput): string {
  return createHash("sha256")
    .update(cashOpenPayloadCanonical(actorId, input), "utf8")
    .digest("hex");
}

function isSameOpeningRequest(
  stored: CashStoredOpening,
  actorId: number,
  digest: string,
): boolean {
  return stored.operatorId === actorId && stored.payloadDigest === digest;
}

function replayResult(stored: CashStoredOpening): CashOpenResult {
  return {
    opening: {
      id: stored.id,
      registerId: stored.registerId,
      operatorId: stored.operatorId,
      operator: stored.operator,
      openingFloat: stored.openingFloat,
      operationDate: stored.operationDate,
      shift: { ...stored.shift },
      openedAt: stored.openedAt,
    },
    revision: stored.resultRevision,
    replayed: true,
  };
}

export function createCashService(
  repository: CashRepository,
  nowProvider: () => Date = () => new Date(),
) {
  return {
    async position(scope: CashScope): Promise<CashPosition> {
      const now = new Date(nowProvider().getTime());
      const clock = cashClockAt(now);
      const current = await repository.readCurrent(scope);
      const revision = current.register?.revision ?? 0;
      if (!Number.isSafeInteger(revision) || revision < 0) {
        throw unavailable();
      }
      return {
        revision,
        serverNow: clock.serverNow,
        operationDate: clock.operationDate,
        scheduledShift: clock.scheduledShift
          ? { ...clock.scheduledShift }
          : null,
        activeOpening: current.activeOpening,
      };
    },

    async open(
      scope: CashScope,
      input: CashOpenInput,
    ): Promise<CashOpenResult> {
      const normalized = validateInput(input);
      const digest = payloadDigest(scope.actorId, normalized);

      try {
        return await repository.transaction(async (tx) => {
          if (!(await tx.lockLocation(scope))) {
            throw new CashServiceError(
              "FORBIDDEN",
              "A unidade da sessão não está disponível para esta operação.",
            );
          }

          const identity = await tx.lockIdentity(scope);
          const identityNow = new Date(nowProvider().getTime());
          const actor = assertCashIdentity(identity, scope, identityNow, "write");

          // Retry lookup precedes the current register, active slot, revision and
          // operating-window checks so a confirmed request survives lost replies.
          const stored = await tx.findOpeningByIntent(
            scope,
            normalized.intentId,
          );
          if (stored) {
            if (!isSameOpeningRequest(stored, scope.actorId, digest)) {
              conflict(
                "Este ID de intenção já foi usado com outros dados ou por outra conta. Gere uma nova confirmação.",
              );
            }
            return replayResult(stored);
          }

          // These lookups acquire the remaining row locks before the authoritative
          // clock check. The location lock serializes first-register creation.
          const existingRegister = await tx.findRegister(scope);
          const activeOpening = existingRegister
            ? await tx.findActiveOpening(scope, existingRegister.id)
            : null;
          const committedNow = new Date(nowProvider().getTime());
          assertCashIdentity(identity, scope, committedNow, "write");

          let clock;
          try {
            clock = cashClockAt(committedNow);
          } catch {
            throw new CashServiceError(
              "SERVICE_UNAVAILABLE",
              "O calendário operacional não consegue validar o horário atual.",
            );
          }
          if (
            clock.operationDate !== normalized.operationDate ||
            !clock.scheduledShift ||
            clock.scheduledShift.id !== normalized.shiftId
          ) {
            conflict(
              "A data ou o turno mudou enquanto a abertura era confirmada. Atualize o caixa e faça uma nova revisão.",
            );
          }

          const currentRevision = existingRegister?.revision ?? 0;
          if (
            !Number.isSafeInteger(currentRevision) ||
            currentRevision < 0
          ) {
            throw unavailable();
          }
          if (normalized.expectedRevision !== currentRevision) {
            conflict();
          }
          if (currentRevision >= MAX_MYSQL_INT) {
            conflict("A revisão do caixa atingiu o limite suportado. Solicite suporte.");
          }
          if (activeOpening) {
            conflict(
              "Já existe um turno aberto no caixa principal. Ele não é encerrado automaticamente e impede uma nova abertura.",
            );
          }

          let register = existingRegister;
          if (!register) {
            if (normalized.expectedRevision !== 0) conflict();
            register = await tx.createRegister(scope, REGISTER_NAME);
            if (register.revision !== 0) throw unavailable();
          }

          const revision = currentRevision + 1;
          const shift = getCashShiftForDate(
            normalized.operationDate,
            normalized.shiftId,
          );
          const openedAt = committedNow;
          const didIncrement = await tx.incrementRevision(
            scope,
            register.id,
            currentRevision,
          );
          if (!didIncrement) conflict();

          const opening = await tx.insertOpening({
            organizationId: scope.organizationId,
            locationId: scope.locationId,
            registerId: register.id,
            operatorId: scope.actorId,
            operator: actor.operator,
            openingFloatCents: BigInt(normalized.openingFloat),
            operationDate: normalized.operationDate,
            timeZone: "America/Sao_Paulo",
            shiftId: shift.id,
            shiftLabel: shift.label,
            shiftStart: shift.start,
            shiftEnd: shift.end,
            openedAt,
            activeSlot: "active",
            intentId: normalized.intentId,
            payloadDigest: digest,
            resultRevision: revision,
          });

          await tx.insertAudit({
            organizationId: scope.organizationId,
            locationId: scope.locationId,
            registerId: register.id,
            openingId: opening.id,
            actorId: scope.actorId,
            event: "cash.opened",
            revision,
            payloadDigest: digest,
            metadata: JSON.stringify({
              operationDate: normalized.operationDate,
              timeZone: "America/Sao_Paulo",
              shift,
              openingFloatCents: normalized.openingFloat,
              intentId: normalized.intentId,
            }),
            createdAt: openedAt,
          });

          return {
            opening: {
              id: opening.id,
              registerId: opening.registerId,
              operatorId: opening.operatorId,
              operator: opening.operator,
              openingFloat: opening.openingFloat,
              operationDate: opening.operationDate,
              shift: { ...opening.shift },
              openedAt: opening.openedAt,
            },
            revision,
            replayed: false,
          };
        });
      } catch (error) {
        if (error instanceof CashServiceError) throw error;
        if (duplicateKey(error)) {
          conflict(
            "Outra abertura foi confirmada ao mesmo tempo. Atualize o estado e revise antes de tentar novamente.",
          );
        }
        throw error;
      }
    },
  };
}

type CashDb = Exclude<Awaited<ReturnType<typeof getDb>>, null>;
export type CashTx = Parameters<Parameters<CashDb["transaction"]>[0]>[0];

type CashRegisterRow = typeof businessCashRegisters.$inferSelect;
type CashOpeningRow = typeof businessCashOpenings.$inferSelect;

function registerFromRow(row: CashRegisterRow): CashRegisterSnapshot {
  return { id: row.id, revision: row.revision };
}

function openingFromRow(row: CashOpeningRow): CashStoredOpening {
  const openingFloat = Number(row.openingFloatCents);
  if (!Number.isSafeInteger(openingFloat) || openingFloat < 0) {
    throw unavailable();
  }
  if (!(row.openedAt instanceof Date) || !Number.isFinite(row.openedAt.getTime())) {
    throw unavailable();
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    locationId: row.locationId,
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
    intentId: row.intentId,
    activeSlot: row.activeSlot,
    payloadDigest: row.payloadDigest,
    resultRevision: row.resultRevision,
  };
}

function publicOpening(opening: CashStoredOpening): CashOpening {
  return {
    id: opening.id,
    registerId: opening.registerId,
    operatorId: opening.operatorId,
    operator: opening.operator,
    openingFloat: opening.openingFloat,
    operationDate: opening.operationDate,
    shift: { ...opening.shift },
    openedAt: opening.openedAt,
  };
}

export async function lockCashLocation(tx: CashTx, scope: CashScope): Promise<boolean> {
  const rows = await tx
    .select({ id: businessLocations.id })
    .from(businessLocations)
    .where(
      and(
        eq(businessLocations.organizationId, scope.organizationId),
        eq(businessLocations.id, scope.locationId),
      ),
    )
    .limit(1)
    .for("update");
  return Boolean(rows[0]);
}

export async function lockCashIdentity(
  tx: CashTx,
  scope: CashScope,
): Promise<CashIdentitySnapshot | null> {
  const [user] = await tx
    .select({ id: businessUsers.id, name: businessUsers.name, disabledAt: businessUsers.disabledAt })
    .from(businessUsers)
    .where(eq(businessUsers.id, scope.actorId))
    .limit(1)
    .for("update");
  if (!user) return null;

  const [membership] = await tx
    .select({
      userId: businessMemberships.userId,
      organizationId: businessMemberships.organizationId,
      locationId: businessMemberships.locationId,
      active: businessMemberships.active,
      role: businessMemberships.role,
    })
    .from(businessMemberships)
    .where(and(
      eq(businessMemberships.userId, scope.actorId),
      eq(businessMemberships.organizationId, scope.organizationId),
      eq(businessMemberships.locationId, scope.locationId),
    ))
    .limit(1)
    .for("update");
  if (!membership) return null;

  // Match business-auth lock order: user, membership, then session.
  const [session] = await tx
    .select({
      id: businessSessions.id,
      userId: businessSessions.userId,
      expiresAt: businessSessions.expiresAt,
      revokedAt: businessSessions.revokedAt,
    })
    .from(businessSessions)
    .where(and(
      eq(businessSessions.id, scope.sessionId),
      eq(businessSessions.userId, scope.actorId),
    ))
    .limit(1)
    .for("update");
  if (!session) return null;
  return {
    sessionId: session.id,
    sessionUserId: session.userId,
    sessionExpiresAt: session.expiresAt,
    sessionRevokedAt: session.revokedAt,
    userId: user.id,
    userName: user.name,
    userDisabledAt: user.disabledAt,
    membershipUserId: membership.userId,
    organizationId: membership.organizationId,
    locationId: membership.locationId,
    membershipActive: membership.active,
    role: membership.role,
  };
}

function drizzleTransaction(tx: CashTx): CashTransaction {
  return {
    lockLocation: (scope) => lockCashLocation(tx, scope),
    lockIdentity: (scope) => lockCashIdentity(tx, scope),

    async findOpeningByIntent(scope, intentId) {
      const rows = await tx
        .select()
        .from(businessCashOpenings)
        .where(
          and(
            eq(businessCashOpenings.organizationId, scope.organizationId),
            eq(businessCashOpenings.locationId, scope.locationId),
            eq(businessCashOpenings.intentId, intentId),
          ),
        )
        .limit(1)
        .for("update");
      return rows[0] ? openingFromRow(rows[0]) : null;
    },

    async findRegister(scope) {
      const rows = await tx
        .select()
        .from(businessCashRegisters)
        .where(
          and(
            eq(businessCashRegisters.organizationId, scope.organizationId),
            eq(businessCashRegisters.locationId, scope.locationId),
          ),
        )
        .limit(1)
        .for("update");
      return rows[0] ? registerFromRow(rows[0]) : null;
    },

    async findActiveOpening(scope, registerId) {
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
        .limit(1)
        .for("update");
      return rows[0] ? publicOpening(openingFromRow(rows[0])) : null;
    },

    async createRegister(scope, name) {
      const [created] = await tx
        .insert(businessCashRegisters)
        .values({
          organizationId: scope.organizationId,
          locationId: scope.locationId,
          name,
          revision: 0,
          createdBy: scope.actorId,
        })
        .$returningId();
      if (!created?.id) throw unavailable();
      return { id: created.id, revision: 0 };
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

    async insertOpening(input) {
      const [created] = await tx
        .insert(businessCashOpenings)
        .values({
          organizationId: input.organizationId,
          locationId: input.locationId,
          registerId: input.registerId,
          operatorId: input.operatorId,
          operator: input.operator,
          openingFloatCents: input.openingFloatCents,
          operationDate: input.operationDate,
          timeZone: input.timeZone,
          shiftId: input.shiftId,
          shiftLabel: input.shiftLabel,
          shiftStart: input.shiftStart,
          shiftEnd: input.shiftEnd,
          openedAt: input.openedAt,
          activeSlot: input.activeSlot,
          intentId: input.intentId,
          payloadDigest: input.payloadDigest,
          resultRevision: input.resultRevision,
        })
        .$returningId();
      if (!created?.id) throw unavailable();
      const rows = await tx
        .select()
        .from(businessCashOpenings)
        .where(
          and(
            eq(businessCashOpenings.id, created.id),
            eq(businessCashOpenings.organizationId, input.organizationId),
            eq(businessCashOpenings.locationId, input.locationId),
          ),
        )
        .limit(1);
      if (!rows[0]) throw unavailable();
      return openingFromRow(rows[0]);
    },

    async insertAudit(input) {
      await tx.insert(businessCashOpeningAudits).values(input);
    },
  };
}

function drizzleRepository(db: CashDb): CashRepository {
  return {
    async readCurrent(scope) {
      const registers = await db
        .select()
        .from(businessCashRegisters)
        .where(
          and(
            eq(businessCashRegisters.organizationId, scope.organizationId),
            eq(businessCashRegisters.locationId, scope.locationId),
          ),
        )
        .limit(1);
      const register = registers[0] ? registerFromRow(registers[0]) : null;
      if (!register) return { register: null, activeOpening: null };

      const openings = await db
        .select()
        .from(businessCashOpenings)
        .where(
          and(
            eq(businessCashOpenings.organizationId, scope.organizationId),
            eq(businessCashOpenings.locationId, scope.locationId),
            eq(businessCashOpenings.registerId, register.id),
            eq(businessCashOpenings.activeSlot, "active"),
          ),
        )
        .limit(1);
      return {
        register,
        activeOpening: openings[0]
          ? publicOpening(openingFromRow(openings[0]))
          : null,
      };
    },

    transaction(operation) {
      return db.transaction((tx) => operation(drizzleTransaction(tx)));
    },
  };
}

async function serviceWithDatabase() {
  const db = await getDb();
  if (!db) throw unavailable();
  return createCashService(drizzleRepository(db));
}

export async function getCashPosition(scope: CashScope): Promise<CashPosition> {
  const service = await serviceWithDatabase();
  return service.position(scope);
}

export async function openCash(
  scope: CashScope,
  input: CashOpenInput,
): Promise<CashOpenResult> {
  const service = await serviceWithDatabase();
  return service.open(scope, input);
}
