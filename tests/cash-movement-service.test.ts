import { describe, expect, it } from "vitest";
import {
  cashMovementSummaryFromAggregate,
  createCashMovementService,
  type CashMovementAuditInsert,
  type CashMovementInsert,
  type CashMovementOpening,
  type CashMovementRepository,
  type CashMovementTransaction,
  type CashScope,
  type CashStoredMovement,
} from "../server/modules/cash-movement-service";
import type { CashIdentitySnapshot } from "../server/modules/cash-service";
import type {
  CashMovement,
  CashMovementSummary,
} from "../lib/business/cash-movement-domain";
import { projectCashMovementSummary } from "../lib/business/cash-movement-domain";

const scope: CashScope = {
  organizationId: 10,
  locationId: 20,
  actorId: 31,
  sessionId: 41,
};
const now = new Date("2026-11-13T09:15:30.456Z");
const opening: CashMovementOpening = {
  id: 70,
  organizationId: 10,
  locationId: 20,
  registerId: 60,
  operatorId: 30,
  operator: "Operador da abertura",
  openingFloat: 100,
  operationDate: "2026-11-13",
  shift: { id: "turno-1", label: "Turno 1", start: "06:00", end: "14:00" },
  openedAt: "2026-11-13T09:00:00.000Z",
  activeSlot: "active",
};
function identity(
  value: Partial<CashIdentitySnapshot> = {},
): CashIdentitySnapshot {
  return {
    sessionId: scope.sessionId,
    sessionUserId: scope.actorId,
    sessionExpiresAt: new Date("2026-11-14T00:00:00.000Z"),
    sessionRevokedAt: null,
    userId: scope.actorId,
    userName: "Responsável autenticado",
    userDisabledAt: null,
    membershipUserId: scope.actorId,
    organizationId: scope.organizationId,
    locationId: scope.locationId,
    membershipActive: true,
    role: "cashier",
    ...value,
  };
}
const blankSummary = (openingFloat: number): CashMovementSummary => ({
  cashExpected: openingFloat,
  openingFloat,
  receiptsByMethod: { dinheiro: 0, pix: 0, debito: 0, credito: 0 },
  sales: 0,
  previousReceipts: 0,
  supplies: 0,
  withdrawals: 0,
  count: 0,
});
function input(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type: "recebimento" as const,
    paymentMethod: "dinheiro" as const,
    receiptNature: "venda" as const,
    amount: 70,
    description: "Venda de combustível",
    reference: "",
    counterparty: "",
    intentId: "123e4567-e89b-42d3-a456-426614174010",
    expectedRevision: 0,
    expectedActorId: scope.actorId,
    openingId: opening.id,
    operationDate: opening.operationDate,
    shiftId: "turno-1" as const,
    ...overrides,
  };
}
type MemoryState = {
  locationExists: boolean;
  identity: CashIdentitySnapshot | null;
  register: { id: number; revision: number };
  opening: CashMovementOpening;
  movements: CashStoredMovement[];
  audits: CashMovementAuditInsert[];
  nextMovementId: number;
  failAudit: boolean;
  events: string[];
};
function cloneState(state: MemoryState): MemoryState {
  return {
    ...state,
    identity: state.identity ? { ...state.identity } : null,
    register: { ...state.register },
    opening: { ...state.opening, shift: { ...state.opening.shift } },
    movements: state.movements.map((movement) => ({ ...movement })),
    audits: state.audits.map((audit) => ({ ...audit })),
    events: [...state.events],
  };
}
class MemoryRepository implements CashMovementRepository {
  readonly trace: string[] = [];
  private value: MemoryState;
  private tail: Promise<void> = Promise.resolve();
  constructor(identityValue: CashIdentitySnapshot | null = identity()) {
    this.value = {
      locationExists: true,
      identity: identityValue,
      register: { id: opening.registerId, revision: 0 },
      opening: { ...opening, shift: { ...opening.shift } },
      movements: [],
      audits: [],
      nextMovementId: 500,
      failAudit: false,
      events: [],
    };
  }
  get state() {
    return cloneState(this.value);
  }
  setIdentity(value: CashIdentitySnapshot | null) {
    this.value.identity = value ? { ...value } : null;
  }
  failAuditWrite() {
    this.value.failAudit = true;
  }
  setOpening(value: CashMovementOpening) {
    this.value.opening = { ...value, shift: { ...value.shift } };
  }
  setCash(value: number) {
    this.value.opening.openingFloat = value;
  }
  private summary(forOpening: CashMovementOpening): CashMovementSummary {
    let summary = blankSummary(forOpening.openingFloat);
    for (const movement of this.value.movements
      .filter((item) => item.openingId === forOpening.id)
      .sort((a, b) => a.id - b.id)) {
      const draft = {
        type: movement.type,
        paymentMethod: movement.paymentMethod,
        receiptNature: movement.receiptNature,
        amount: movement.amount,
        description: movement.description,
        reference: movement.reference,
        counterparty: movement.counterparty,
      };
      summary = projectCashMovementSummary(summary, draft);
    }
    return summary;
  }
  async readTurnSnapshot(_scope: CashScope): Promise<any> {
    const { register, opening: active } = this.value;
    return {
      revision: register.revision,
      serverNow: now.toISOString(),
      operationDate: "2026-11-13",
      scheduledShift: {
        id: "turno-1",
        label: "Turno 1",
        start: "06:00",
        end: "14:00",
      },
      activeOpening: { ...active, shift: { ...active.shift } },
      summary: this.summary(active),
    };
  }
  async readHistory(
    _scope: CashScope,
    openingId: number,
    limit: number,
    cursor?: number,
  ) {
    const rows = this.value.movements
      .filter(
        (movement) =>
          movement.openingId === openingId &&
          (cursor === undefined || movement.id < cursor),
      )
      .sort((a, b) => b.id - a.id);
    const slice = rows.slice(0, limit + 1);
    const more = slice.length > limit;
    const selected = slice.slice(0, limit);
    const items: CashMovement[] = selected.map(
      ({
        organizationId: _o,
        locationId: _l,
        intentId: _i,
        payloadDigest: _p,
        resultRevision: _r,
        referenceDigest: _d,
        ...movement
      }) => movement,
    );
    return {
      openingId,
      items,
      nextCursor: more ? items[items.length - 1]!.id : null,
      totalCount: this.value.movements.filter(
        (movement) => movement.openingId === openingId,
      ).length,
      revision: this.value.register.revision,
    };
  }
  async transaction<T>(
    operation: (tx: CashMovementTransaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const draft = cloneState(this.value);
    const mark = (event: string) => {
      draft.events.push(event);
      this.trace.push(event);
    };
    const tx: CashMovementTransaction = {
      lockLocation: async () => {
        mark("lock-location");
        return draft.locationExists;
      },
      lockIdentity: async () => {
        mark("lock-identity");
        return draft.identity ? { ...draft.identity } : null;
      },
      findMovementByIntent: async (_scope, intentId) => {
        mark("find-intent");
        return (
          draft.movements.find((movement) => movement.intentId === intentId) ??
          null
        );
      },
      findRegister: async () => {
        mark("find-register");
        return { ...draft.register };
      },
      findActiveOpening: async (_scope, registerId, openingId) => {
        mark("find-opening");
        return draft.opening.id === openingId &&
          draft.opening.registerId === registerId &&
          draft.opening.activeSlot === "active"
          ? { ...draft.opening, shift: { ...draft.opening.shift } }
          : null;
      },
      aggregateOpening: async (_scope, selectedOpening) => {
        mark("aggregate");
        return this.summary(selectedOpening);
      },
      latestRecordedAt: async (_scope, openingId) => {
        mark("latest");
        return draft.movements
          .filter((movement) => movement.openingId === openingId)
          .sort(
            (a, b) =>
              Date.parse(b.recordedAt) - Date.parse(a.recordedAt) ||
              b.id - a.id,
          )[0]?.recordedAt
          ? new Date(
              draft.movements
                .filter((movement) => movement.openingId === openingId)
                .sort(
                  (a, b) =>
                    Date.parse(b.recordedAt) - Date.parse(a.recordedAt) ||
                    b.id - a.id,
                )[0]!.recordedAt,
            )
          : null;
      },
      findReference: async (_scope, openingId, method, digest) => {
        mark("find-reference");
        return draft.movements.some(
          (movement) =>
            movement.openingId === openingId &&
            movement.paymentMethod === method &&
            movement.referenceDigest === digest,
        );
      },
      incrementRevision: async (_scope, registerId, expected) => {
        if (
          draft.register.id !== registerId ||
          draft.register.revision !== expected
        )
          return false;
        draft.register.revision += 1;
        return true;
      },
      insertMovement: async (record: CashMovementInsert) => {
        const movement: CashStoredMovement = {
          ...record,
          id: draft.nextMovementId++,
          amount: Number(record.amount),
          recordedAt: record.recordedAt.toISOString(),
        };
        draft.movements.push(movement);
        return movement;
      },
      insertAudit: async (audit) => {
        if (draft.failAudit) throw new Error("simulated audit failure");
        draft.audits.push({ ...audit });
      },
    };
    try {
      const result = await operation(tx);
      mark("commit");
      this.value = draft;
      return result;
    } finally {
      release();
    }
  }
}
function service(repository: MemoryRepository, clock: () => Date = () => now) {
  return createCashMovementService(repository, clock);
}
function expectCode(promise: Promise<unknown>, code: string) {
  return expect(promise).rejects.toMatchObject({ code });
}

describe("serviço multiusuário de movimentos do caixa (adapter em memória)", () => {
  it("recusa revisão de outra conta antes de gravar movimento ou auditoria", async () => {
    const repository = new MemoryRepository();
    await expectCode(
      service(repository).record(
        scope,
        input({ expectedActorId: scope.actorId + 1 }),
      ),
      "CONFLICT",
    );
    expect(repository.state.movements).toHaveLength(0);
    expect(repository.state.audits).toHaveLength(0);
    expect(repository.state.register.revision).toBe(0);
  });

  it("registra autor autenticado distinto do operador da abertura, revisa totais e reproduz replay após perder a resposta", async () => {
    const repository = new MemoryRepository();
    const first = await service(repository).record(scope, input());
    expect(first).toMatchObject({
      revision: 1,
      replayed: false,
      movement: {
        id: 500,
        openingId: opening.id,
        registerId: opening.registerId,
        responsibleId: scope.actorId,
        responsible: "Responsável autenticado",
        recordedAt: now.toISOString(),
      },
    });
    expect(repository.state.opening.operatorId).not.toBe(
      first.movement.responsibleId,
    );
    const retry = await service(
      repository,
      () => new Date("2026-11-13T18:00:00.000Z"),
    ).record(scope, input());
    expect(retry).toEqual({ ...first, replayed: true });
    expect(repository.state.movements).toHaveLength(1);
    expect(repository.state.register.revision).toBe(1);
    expect(repository.state.audits).toHaveLength(1);
    await expectCode(
      service(repository).record(scope, input({ amount: 71 })),
      "CONFLICT",
    );
  });

  it("revalida sessão, conta, associação, tenant e papel sob lock", async () => {
    for (const bad of [
      identity({ sessionRevokedAt: now }),
      identity({ userDisabledAt: now }),
      identity({ sessionExpiresAt: now }),
    ]) {
      await expectCode(
        service(new MemoryRepository(bad)).record(scope, input()),
        "UNAUTHORIZED",
      );
    }
    await expectCode(
      service(
        new MemoryRepository(identity({ membershipActive: false })),
      ).record(scope, input()),
      "FORBIDDEN",
    );
    await expectCode(
      service(new MemoryRepository(identity({ locationId: 999 }))).record(
        scope,
        input(),
      ),
      "FORBIDDEN",
    );
    await expectCode(
      service(
        new MemoryRepository(identity({ role: "finance_viewer" })),
      ).record(scope, input()),
      "FORBIDDEN",
    );
    await expectCode(
      service(new MemoryRepository(identity({ role: "attendant" }))).record(
        scope,
        input(),
      ),
      "FORBIDDEN",
    );
  });

  it("bloqueia referência duplicada por caixa/turno/método, comparando caixa e permitindo outro método/abertura", async () => {
    const repository = new MemoryRepository();
    const first = input({
      paymentMethod: "pix",
      reference: " NSU-abc ",
      intentId: "123e4567-e89b-42d3-a456-426614174011",
    });
    await service(repository).record(scope, first);
    await expectCode(
      service(repository).record(
        scope,
        input({
          paymentMethod: "pix",
          reference: "nsu-ABC",
          intentId: "123e4567-e89b-42d3-a456-426614174012",
          expectedRevision: 1,
        }),
      ),
      "CONFLICT",
    );
    await expect(
      service(repository).record(
        scope,
        input({
          paymentMethod: "debito",
          reference: "nsu-ABC",
          intentId: "123e4567-e89b-42d3-a456-426614174013",
          expectedRevision: 1,
        }),
      ),
    ).resolves.toMatchObject({ replayed: false });
    const secondOpening = {
      ...opening,
      id: opening.id + 1,
      openedAt: "2026-11-13T09:00:00.000Z",
    };
    repository.setOpening(secondOpening);
    await expect(
      service(repository).record(
        scope,
        input({
          paymentMethod: "pix",
          reference: "nsu-abc",
          openingId: secondOpening.id,
          expectedRevision: 2,
          intentId: "123e4567-e89b-42d3-a456-426614174014",
        }),
      ),
    ).resolves.toMatchObject({ replayed: false });
  });

  it("exige abertura ativa correta e recusa operação quando o relógio cruza o fim do turno", async () => {
    const wrong = new MemoryRepository();
    await expectCode(
      service(wrong).record(scope, input({ openingId: 71 })),
      "CONFLICT",
    );
    const closed = new MemoryRepository();
    closed.setOpening({ ...opening, activeSlot: null });
    await expectCode(service(closed).record(scope, input()), "CONFLICT");
    const afterWindow = new MemoryRepository();
    await expectCode(
      service(afterWindow, () => new Date("2026-11-13T17:00:00.000Z")).record(
        scope,
        input(),
      ),
      "CONFLICT",
    );
    expect(afterWindow.state.movements).toHaveLength(0);
  });

  it("amostra o relógio de commit só depois de todas as leituras/agregações", async () => {
    const repository = new MemoryRepository();
    const samples = [now, new Date("2026-11-13T17:00:00.000Z")];
    const operation = service(repository, () => {
      repository.trace.push("clock");
      return samples.shift()!;
    }).record(
      scope,
      input({
        paymentMethod: "pix",
        reference: "NSU relógio",
      }),
    );
    await expectCode(operation, "CONFLICT");
    expect(
      repository.trace.indexOf("clock", repository.trace.indexOf("clock") + 1),
    ).toBeGreaterThan(repository.trace.indexOf("find-reference"));
    // Final clock moved into the next shift after all reads; the transaction rolled back.
    expect(repository.state.movements).toHaveLength(0);
  });

  it("revalida expiração da sessão depois das leituras e antes de qualquer write", async () => {
    const repository = new MemoryRepository(
      identity({ sessionExpiresAt: new Date("2026-11-13T09:16:00.000Z") }),
    );
    const samples = [now, new Date("2026-11-13T09:16:00.000Z")];
    await expectCode(
      service(repository, () => samples.shift()!).record(scope, input()),
      "UNAUTHORIZED",
    );
    expect(repository.state.movements).toHaveLength(0);
    expect(repository.state.register.revision).toBe(0);
  });

  it("reverte revisão e movimento quando a auditoria falha", async () => {
    const repository = new MemoryRepository();
    repository.failAuditWrite();
    await expect(service(repository).record(scope, input())).rejects.toThrow(
      "simulated audit failure",
    );
    expect(repository.state.register.revision).toBe(0);
    expect(repository.state.movements).toHaveLength(0);
    expect(repository.state.audits).toHaveLength(0);
  });

  it("serializa duas sangrias concorrentes; a segunda não pode exceder o dinheiro disponível", async () => {
    const repository = new MemoryRepository();
    repository.setCash(100);
    const withdrawals = (id: string) =>
      input({
        type: "sangria",
        paymentMethod: "dinheiro",
        receiptNature: null,
        amount: 70,
        description: "Retirada para cofre",
        counterparty: "Cofre central",
        intentId: id,
      });
    const results = await Promise.allSettled([
      service(repository).record(
        scope,
        withdrawals("123e4567-e89b-42d3-a456-426614174015"),
      ),
      service(repository).record(
        scope,
        withdrawals("123e4567-e89b-42d3-a456-426614174016"),
      ),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(
      1,
    );
    const final = await repository.readTurnSnapshot(scope);
    expect(final.summary?.cashExpected).toBe(30);
    expect(final.revision).toBe(1);
  });

  it("converte SUM/COUNT SQL de strings decimais exatas e rejeita overflow", () => {
    const aggregate = {
      receiptsCash: "9007199254740990",
      receiptsPix: "0",
      receiptsDebit: "0",
      receiptsCredit: "0",
      sales: "9007199254740990",
      previousReceipts: "0",
      supplies: "0",
      withdrawals: "0",
      movementCount: "9007199254740990",
    };
    expect(cashMovementSummaryFromAggregate(aggregate, 0n)).toMatchObject({
      cashExpected: Number.MAX_SAFE_INTEGER - 1,
      receiptsByMethod: { dinheiro: Number.MAX_SAFE_INTEGER - 1 },
      count: Number.MAX_SAFE_INTEGER - 1,
    });
    expect(() =>
      cashMovementSummaryFromAggregate(
        {
          ...aggregate,
          receiptsCash: "9007199254740992",
          sales: "0",
          movementCount: "1",
        },
        0n,
      ),
    ).toThrow(/precisão segura/i);
    expect(() =>
      cashMovementSummaryFromAggregate({ ...aggregate, receiptsCash: 1.5 }, 0n),
    ).toThrow(/formato impreciso/i);
  });

  it("rejeita relógio regressivo em relação ao timestamp mais recente", async () => {
    const repository = new MemoryRepository();
    await service(
      repository,
      () => new Date("2026-11-13T09:20:00.000Z"),
    ).record(scope, input());
    await expectCode(
      service(repository, () => new Date("2026-11-13T09:10:00.000Z")).record(
        scope,
        input({
          expectedRevision: 1,
          intentId: "123e4567-e89b-42d3-a456-426614174099",
        }),
      ),
      "CONFLICT",
    );
    expect(repository.state.movements).toHaveLength(1);
  });

  it("página por ID decrescente mantém total e resumo de todo o histórico", async () => {
    const repository = new MemoryRepository();
    const operation = service(repository);
    for (let i = 0; i < 3; i += 1) {
      await operation.record(
        scope,
        input({
          amount: i + 1,
          expectedRevision: i,
          intentId: `123e4567-e89b-42d3-a456-42661417402${i}`,
        }),
      );
    }
    const first = await operation.history(scope, {
      openingId: opening.id,
      limit: 2,
    });
    expect(first.items.map((item) => item.id)).toEqual([502, 501]);
    expect(first).toMatchObject({
      nextCursor: 501,
      totalCount: 3,
      revision: 3,
    });
    const second = await operation.history(scope, {
      openingId: opening.id,
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((item) => item.id)).toEqual([500]);
    expect(second).toMatchObject({
      nextCursor: null,
      totalCount: 3,
      revision: 3,
    });
    const snapshot = await operation.turnSnapshot(scope);
    expect(snapshot.summary).toMatchObject({
      count: 3,
      sales: 6,
      cashExpected: 106,
    });
  });
});
