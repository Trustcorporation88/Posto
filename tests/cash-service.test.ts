import { describe, expect, it } from "vitest";
import {
  createCashService,
  type CashAuditInsert,
  type CashCurrentSnapshot,
  type CashIdentitySnapshot,
  type CashOpeningInsert,
  type CashRepository,
  type CashScope,
  type CashStoredOpening,
  type CashTransaction,
} from "../server/modules/cash-service";
import type { CashOpenInput } from "../lib/business/cash-domain";

const scope: CashScope = {
  organizationId: 10,
  locationId: 20,
  actorId: 30,
  sessionId: 40,
};
const openingInput: CashOpenInput = {
  intentId: "123e4567-e89b-42d3-a456-426614174000",
  expectedRevision: 0,
  operationDate: "2026-11-13",
  shiftId: "turno-1",
  openingFloat: 0,
};
const duringFirstShift = new Date("2026-11-13T09:15:30.456Z");

function identityFor(
  value: Partial<CashIdentitySnapshot> = {},
): CashIdentitySnapshot {
  return {
    sessionId: scope.sessionId,
    sessionUserId: scope.actorId,
    sessionExpiresAt: new Date("2026-11-14T00:00:00.000Z"),
    sessionRevokedAt: null,
    userId: scope.actorId,
    userName: "Operador Autenticado",
    userDisabledAt: null,
    membershipUserId: scope.actorId,
    organizationId: scope.organizationId,
    locationId: scope.locationId,
    membershipActive: true,
    role: "cashier",
    ...value,
  };
}

type StoredRegister = {
  id: number;
  revision: number;
  organizationId: number;
  locationId: number;
};
type Store = {
  locationExists: boolean;
  identity: CashIdentitySnapshot | null;
  register: StoredRegister | null;
  openings: CashStoredOpening[];
  audits: CashAuditInsert[];
  nextRegisterId: number;
  nextOpeningId: number;
  failAudit: boolean;
};

function cloneStore(store: Store): Store {
  return {
    ...store,
    identity: store.identity ? { ...store.identity } : null,
    register: store.register ? { ...store.register } : null,
    openings: store.openings.map((opening) => ({
      ...opening,
      shift: { ...opening.shift },
    })),
    audits: store.audits.map((audit) => ({ ...audit })),
  };
}

class MemoryCashRepository implements CashRepository {
  private store: Store;
  private tail: Promise<void> = Promise.resolve();

  constructor(identity: CashIdentitySnapshot | null = identityFor()) {
    this.store = {
      locationExists: true,
      identity,
      register: null,
      openings: [],
      audits: [],
      nextRegisterId: 100,
      nextOpeningId: 200,
      failAudit: false,
    };
  }

  get state(): Store {
    return cloneStore(this.store);
  }

  setIdentity(identity: CashIdentitySnapshot | null) {
    this.store.identity = identity ? { ...identity } : null;
  }

  setLocationExists(exists: boolean) {
    this.store.locationExists = exists;
  }

  failAuditWrite() {
    this.store.failAudit = true;
  }

  async readCurrent(requestScope: CashScope): Promise<CashCurrentSnapshot> {
    const register = this.store.register;
    if (
      !register ||
      register.organizationId !== requestScope.organizationId ||
      register.locationId !== requestScope.locationId
    ) {
      return { register: null, activeOpening: null };
    }
    const active = this.store.openings.find(
      (opening) =>
        opening.organizationId === requestScope.organizationId &&
        opening.locationId === requestScope.locationId &&
        opening.activeSlot === "active",
    );
    return {
      register: { id: register.id, revision: register.revision },
      activeOpening: active
        ? {
            id: active.id,
            registerId: active.registerId,
            operatorId: active.operatorId,
            operator: active.operator,
            openingFloat: active.openingFloat,
            operationDate: active.operationDate,
            shift: { ...active.shift },
            openedAt: active.openedAt,
          }
        : null,
    };
  }

  async transaction<T>(
    operation: (tx: CashTransaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const draft = cloneStore(this.store);
    const tx: CashTransaction = {
      lockLocation: async () => draft.locationExists,
      lockIdentity: async () =>
        draft.identity ? { ...draft.identity } : null,
      findOpeningByIntent: async (requestScope, intentId) => {
        const found = draft.openings.find(
          (opening) =>
            opening.organizationId === requestScope.organizationId &&
            opening.locationId === requestScope.locationId &&
            opening.intentId === intentId,
        );
        return found ? { ...found, shift: { ...found.shift } } : null;
      },
      findRegister: async (requestScope) => {
        const register = draft.register;
        if (
          !register ||
          register.organizationId !== requestScope.organizationId ||
          register.locationId !== requestScope.locationId
        ) {
          return null;
        }
        return { id: register.id, revision: register.revision };
      },
      findActiveOpening: async (requestScope, registerId) => {
        const found = draft.openings.find(
          (opening) =>
            opening.organizationId === requestScope.organizationId &&
            opening.locationId === requestScope.locationId &&
            opening.registerId === registerId &&
            opening.activeSlot === "active",
        );
        return found
          ? {
              id: found.id,
              registerId: found.registerId,
              operatorId: found.operatorId,
              operator: found.operator,
              openingFloat: found.openingFloat,
              operationDate: found.operationDate,
              shift: { ...found.shift },
              openedAt: found.openedAt,
            }
          : null;
      },
      createRegister: async (requestScope) => {
        if (draft.register) throw new Error("duplicate register");
        const register: StoredRegister = {
          id: draft.nextRegisterId++,
          revision: 0,
          organizationId: requestScope.organizationId,
          locationId: requestScope.locationId,
        };
        draft.register = register;
        return { id: register.id, revision: 0 };
      },
      incrementRevision: async (requestScope, registerId, expected) => {
        if (
          !draft.register ||
          draft.register.id !== registerId ||
          draft.register.organizationId !== requestScope.organizationId ||
          draft.register.locationId !== requestScope.locationId ||
          draft.register.revision !== expected
        ) {
          return false;
        }
        draft.register.revision += 1;
        return true;
      },
      insertOpening: async (input: CashOpeningInsert) => {
        const stored: CashStoredOpening = {
          id: draft.nextOpeningId++,
          registerId: input.registerId,
          operatorId: input.operatorId,
          operator: input.operator,
          openingFloat: Number(input.openingFloatCents),
          operationDate: input.operationDate,
          shift: {
            id: input.shiftId,
            label: input.shiftLabel,
            start: input.shiftStart,
            end: input.shiftEnd,
          },
          openedAt: input.openedAt.toISOString(),
          organizationId: input.organizationId,
          locationId: input.locationId,
          intentId: input.intentId,
          payloadDigest: input.payloadDigest,
          activeSlot: input.activeSlot,
          resultRevision: input.resultRevision,
        };
        draft.openings.push(stored);
        return { ...stored, shift: { ...stored.shift } };
      },
      insertAudit: async (input) => {
        if (draft.failAudit) throw new Error("simulated audit failure");
        draft.audits.push({ ...input });
      },
    };

    try {
      const result = await operation(tx);
      this.store = draft;
      return result;
    } finally {
      release();
    }
  }
}

function service(
  repository: MemoryCashRepository,
  now: () => Date = () => duringFirstShift,
) {
  return createCashService(repository, now);
}

function expectCashCode(promise: Promise<unknown>, code: string) {
  return expect(promise).rejects.toMatchObject({
    name: "CashServiceError",
    code,
  });
}

describe("serviço do caixa central", () => {
  it("consulta estado sem criar caixa e deriva posição/revisão zero", async () => {
    const repository = new MemoryCashRepository();
    const position = await service(repository).position(scope);
    expect(position).toMatchObject({
      revision: 0,
      serverNow: "2026-11-13T09:15:30.456Z",
      operationDate: "2026-11-13",
      scheduledShift: { id: "turno-1" },
      activeOpening: null,
    });
    expect(repository.state.register).toBeNull();
    expect(repository.state.openings).toHaveLength(0);
    expect(repository.state.audits).toHaveLength(0);
  });

  it("abre com zero explícito, nome da sessão, revisão e auditoria atômicas", async () => {
    const repository = new MemoryCashRepository();
    const result = await service(repository).open(scope, openingInput);
    expect(result).toEqual({
      opening: {
        id: 200,
        registerId: 100,
        operatorId: scope.actorId,
        operator: "Operador Autenticado",
        openingFloat: 0,
        operationDate: "2026-11-13",
        shift: {
          id: "turno-1",
          label: "Turno 1",
          start: "06:00",
          end: "14:00",
        },
        openedAt: "2026-11-13T09:15:30.456Z",
      },
      revision: 1,
      replayed: false,
    });
    expect(repository.state.register?.revision).toBe(1);
    expect(repository.state.openings).toHaveLength(1);
    expect(repository.state.audits).toHaveLength(1);
    expect(repository.state.audits[0]).toMatchObject({
      actorId: scope.actorId,
      openingId: result.opening.id,
      event: "cash.opened",
      revision: 1,
      createdAt: duringFirstShift,
    });
  });

  it("reproduz resultado idempotente após mudança de turno mesmo havendo abertura ativa", async () => {
    const repository = new MemoryCashRepository();
    const original = await service(repository).open(scope, openingInput);
    const retry = await service(
      repository,
      () => new Date("2026-11-13T17:15:30.456Z"),
    ).open(scope, openingInput);
    expect(retry).toEqual({ ...original, replayed: true });
    expect(repository.state.openings).toHaveLength(1);
    expect(repository.state.audits).toHaveLength(1);
  });

  it("rejeita payload divergente ou reuso da intenção por outro autor", async () => {
    const repository = new MemoryCashRepository();
    await service(repository).open(scope, openingInput);
    await expectCashCode(
      service(repository).open(scope, { ...openingInput, openingFloat: 100 }),
      "CONFLICT",
    );

    const anotherScope = { ...scope, actorId: 31, sessionId: 41 };
    repository.setIdentity(
      identityFor({
        sessionId: anotherScope.sessionId,
        sessionUserId: anotherScope.actorId,
        userId: anotherScope.actorId,
        membershipUserId: anotherScope.actorId,
      }),
    );
    await expectCashCode(
      service(repository).open(anotherScope, openingInput),
      "CONFLICT",
    );
    expect(repository.state.openings).toHaveLength(1);
  });

  it("rejeita turno encerrado entre aquisição dos locks e validação final", async () => {
    const repository = new MemoryCashRepository();
    let clockCalls = 0;
    const serviceWithClock = service(repository, () => {
      clockCalls += 1;
      return clockCalls === 1
        ? new Date("2026-11-13T16:59:59.999Z")
        : new Date("2026-11-13T17:00:00.000Z");
    });
    await expectCashCode(serviceWithClock.open(scope, openingInput), "CONFLICT");
    expect(clockCalls).toBe(2);
    expect(repository.state.register).toBeNull();
    expect(repository.state.openings).toHaveLength(0);
  });

  it("conflita revisão obsoleta e não permite outra abertura ativa", async () => {
    const repository = new MemoryCashRepository();
    await service(repository).open(scope, openingInput);
    await expectCashCode(
      service(repository).open(scope, {
        ...openingInput,
        intentId: "123e4567-e89b-42d3-a456-426614174001",
      }),
      "CONFLICT",
    );
    await expectCashCode(
      service(repository).open(scope, {
        ...openingInput,
        intentId: "123e4567-e89b-42d3-a456-426614174002",
        expectedRevision: 1,
      }),
      "CONFLICT",
    );
    expect(repository.state.openings).toHaveLength(1);
  });

  it("revalida sessão, associação, usuário ativo e papel sob o adapter transacional", async () => {
    const inactiveSession = new MemoryCashRepository(
      identityFor({ sessionRevokedAt: new Date("2026-11-13T08:00:00Z") }),
    );
    await expectCashCode(
      service(inactiveSession).open(scope, openingInput),
      "UNAUTHORIZED",
    );

    const disabledUser = new MemoryCashRepository(
      identityFor({ userDisabledAt: new Date("2026-11-13T08:00:00Z") }),
    );
    await expectCashCode(
      service(disabledUser).open(scope, openingInput),
      "UNAUTHORIZED",
    );

    const inactiveMembership = new MemoryCashRepository(
      identityFor({ membershipActive: false }),
    );
    await expectCashCode(
      service(inactiveMembership).open(scope, openingInput),
      "FORBIDDEN",
    );

    const otherTenant = new MemoryCashRepository(
      identityFor({ locationId: scope.locationId + 1 }),
    );
    await expectCashCode(
      service(otherTenant).open(scope, openingInput),
      "FORBIDDEN",
    );

    const viewer = new MemoryCashRepository(identityFor({ role: "finance_viewer" }));
    await expectCashCode(service(viewer).open(scope, openingInput), "FORBIDDEN");

    const expiredSession = new MemoryCashRepository(
      identityFor({ sessionExpiresAt: new Date("2026-11-13T09:15:30.456Z") }),
    );
    await expectCashCode(
      service(expiredSession).open(scope, openingInput),
      "UNAUTHORIZED",
    );
  });

  it("bloqueia unidade sem associação persistente e sessão de outro usuário", async () => {
    const missingLocation = new MemoryCashRepository();
    missingLocation.setLocationExists(false);
    await expectCashCode(
      service(missingLocation).open(scope, openingInput),
      "FORBIDDEN",
    );

    const wrongSession = new MemoryCashRepository(
      identityFor({ sessionId: scope.sessionId + 1 }),
    );
    await expectCashCode(
      service(wrongSession).open(scope, openingInput),
      "UNAUTHORIZED",
    );
  });

  it("reverte caixa, revisão e abertura quando a gravação de auditoria falha", async () => {
    const repository = new MemoryCashRepository();
    repository.failAuditWrite();
    await expect(
      service(repository).open(scope, openingInput),
    ).rejects.toThrow("simulated audit failure");
    expect(repository.state.register).toBeNull();
    expect(repository.state.openings).toHaveLength(0);
    expect(repository.state.audits).toHaveLength(0);
  });

  it("serializa aberturas concorrentes e confirma no máximo uma transação", async () => {
    const repository = new MemoryCashRepository();
    const serviceInstance = service(repository);
    const secondInput = {
      ...openingInput,
      intentId: "123e4567-e89b-42d3-a456-426614174001",
    };
    const outcomes = await Promise.allSettled([
      serviceInstance.open(scope, openingInput),
      serviceInstance.open(scope, secondInput),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({
      name: "CashServiceError",
      code: "CONFLICT",
    });
    expect(repository.state.register?.revision).toBe(1);
    expect(repository.state.openings).toHaveLength(1);
    expect(repository.state.audits).toHaveLength(1);
  });

  it("rejeita entrada inválida antes de abrir transação", async () => {
    const repository = new MemoryCashRepository();
    await expectCashCode(
      service(repository).open(scope, { ...openingInput, openingFloat: Number.MAX_SAFE_INTEGER + 1 }),
      "BAD_REQUEST",
    );
    expect(repository.state.register).toBeNull();
  });
});
