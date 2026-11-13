import { describe, expect, it } from "vitest";
import {
  CashClosingServiceError,
  createCashClosingService,
  type CashClosingAuditInsert,
  type CashClosingInsert,
  type CashClosingRegister,
  type CashClosingRepository,
  type CashClosingTransaction,
  type CashScope,
  type CashStoredClosing,
} from "../server/modules/cash-closing-service";
import type {
  CashClosing,
  CashClosingCounts,
  CashClosingHistoryPage,
  CashClosingState,
} from "../lib/business/cash-closing-domain";
import type { CashMovementSummary } from "../lib/business/cash-movement-domain";
import type { CashMovementOpening } from "../server/modules/cash-movement-service";
import type { CashIdentitySnapshot } from "../server/modules/cash-service";

const scope: CashScope = {
  organizationId: 10,
  locationId: 20,
  actorId: 30,
  sessionId: 40,
};
const closedAt = new Date("2026-11-13T18:00:00.000Z");
const counts: CashClosingCounts = {
  dinheiro: 1_000,
  pix: 200,
  debito: 300,
  credito: 400,
};
const baseSummary: CashMovementSummary = {
  cashExpected: 1_000,
  openingFloat: 500,
  receiptsByMethod: { dinheiro: 450, pix: 200, debito: 300, credito: 400 },
  sales: 1_200,
  previousReceipts: 150,
  supplies: 100,
  withdrawals: 50,
  count: 3,
};
const openingSeed: CashMovementOpening = {
  id: 80,
  registerId: 60,
  operatorId: 22,
  operator: "Operador da abertura",
  openingFloat: 500,
  operationDate: "2026-11-13",
  shift: { id: "turno-1", label: "Turno 1", start: "06:00", end: "14:00" },
  openedAt: "2026-11-13T09:00:00.000Z",
  organizationId: scope.organizationId,
  locationId: scope.locationId,
  activeSlot: "active",
};
const openingInput = {
  intentId: "123e4567-e89b-42d3-a456-426614174000",
  expectedRevision: 4,
  expectedActorId: scope.actorId,
  openingId: openingSeed.id,
  operationDate: openingSeed.operationDate,
  shiftId: openingSeed.shift.id,
  countedByMethod: counts,
  varianceReason: "",
};
const openingTime = new Date(openingSeed.openedAt);
const lastMovementTime = new Date("2026-11-13T17:00:00.000Z");

function identityFor(
  actorId = scope.actorId,
  value: Partial<CashIdentitySnapshot> = {},
): CashIdentitySnapshot {
  return {
    sessionId:
      actorId === scope.actorId ? scope.sessionId : scope.sessionId + 1,
    sessionUserId: actorId,
    sessionExpiresAt: new Date("2026-11-14T00:00:00.000Z"),
    sessionRevokedAt: null,
    userId: actorId,
    userName:
      actorId === scope.actorId ? "Conferente Autenticada" : "Nova Conta",
    userDisabledAt: null,
    membershipUserId: actorId,
    organizationId: scope.organizationId,
    locationId: scope.locationId,
    membershipActive: true,
    role: "cashier",
    ...value,
  };
}

type MemoryStore = {
  locationExists: boolean;
  identity: CashIdentitySnapshot | null;
  register: CashClosingRegister;
  openings: CashMovementOpening[];
  summary: CashMovementSummary;
  cutoff: { lastMovementId: number | null; lastMovementAt: Date | null };
  closings: CashStoredClosing[];
  audits: CashClosingAuditInsert[];
  nextClosingId: number;
  failAudit: boolean;
};

function cloneOpening(opening: CashMovementOpening): CashMovementOpening {
  return { ...opening, shift: { ...opening.shift } };
}
function cloneSummary(summary: CashMovementSummary): CashMovementSummary {
  return { ...summary, receiptsByMethod: { ...summary.receiptsByMethod } };
}
function cloneClosing(closing: CashStoredClosing): CashStoredClosing {
  return {
    ...closing,
    opening: { ...closing.opening, shift: { ...closing.opening.shift } },
    summary: cloneSummary(closing.summary),
    totals: {
      ...closing.totals,
      expectedByMethod: { ...closing.totals.expectedByMethod },
      countedByMethod: { ...closing.totals.countedByMethod },
      differenceByMethod: { ...closing.totals.differenceByMethod },
    },
  };
}
function cloneStore(store: MemoryStore): MemoryStore {
  return {
    ...store,
    identity: store.identity ? { ...store.identity } : null,
    register: { ...store.register },
    openings: store.openings.map(cloneOpening),
    summary: cloneSummary(store.summary),
    cutoff: {
      lastMovementId: store.cutoff.lastMovementId,
      lastMovementAt: store.cutoff.lastMovementAt
        ? new Date(store.cutoff.lastMovementAt)
        : null,
    },
    closings: store.closings.map(cloneClosing),
    audits: store.audits.map((audit) => ({ ...audit })),
  };
}
function publicOpening(opening: CashMovementOpening) {
  const {
    organizationId: _org,
    locationId: _loc,
    activeSlot: _slot,
    ...result
  } = opening;
  return result;
}

class MemoryCashClosingRepository implements CashClosingRepository {
  private store: MemoryStore;
  private tail: Promise<void> = Promise.resolve();

  constructor(
    options: {
      identity?: CashIdentitySnapshot | null;
      summary?: CashMovementSummary;
      cutoff?: { lastMovementId: number | null; lastMovementAt: Date | null };
      registerRevision?: number;
      activeSlot?: string | null;
    } = {},
  ) {
    const summary = cloneSummary(options.summary ?? baseSummary);
    this.store = {
      locationExists: true,
      identity:
        options.identity === undefined ? identityFor() : options.identity,
      register: { id: 60, revision: options.registerRevision ?? 4 },
      openings: [
        {
          ...cloneOpening(openingSeed),
          activeSlot: options.activeSlot ?? "active",
        },
      ],
      summary,
      cutoff: options.cutoff
        ? { ...options.cutoff }
        : {
            lastMovementId: summary.count ? 900 : null,
            lastMovementAt: summary.count ? new Date(lastMovementTime) : null,
          },
      closings: [],
      audits: [],
      nextClosingId: 500,
      failAudit: false,
    };
  }

  get state(): MemoryStore {
    return cloneStore(this.store);
  }
  setIdentity(identity: CashIdentitySnapshot | null) {
    this.store.identity = identity ? { ...identity } : null;
  }
  setLocationExists(value: boolean) {
    this.store.locationExists = value;
  }
  failAuditWrite() {
    this.store.failAudit = true;
  }
  useNextOpening(id = 81) {
    const current = this.store.register.revision;
    this.store.openings.push({
      ...cloneOpening(openingSeed),
      id,
      operatorId: scope.actorId,
      operator: "Novo Operador",
      operationDate: "2026-11-14",
      openedAt: "2026-11-14T09:00:00.000Z",
      activeSlot: "active",
    });
    this.store.register.revision = current + 1;
    this.store.summary = {
      ...baseSummary,
      cashExpected: 500,
      openingFloat: 500,
      receiptsByMethod: { dinheiro: 0, pix: 0, debito: 0, credito: 0 },
      sales: 0,
      previousReceipts: 0,
      supplies: 0,
      withdrawals: 0,
      count: 0,
    };
    this.store.cutoff = { lastMovementId: null, lastMovementAt: null };
  }

  private async exclusive<T>(
    operation: (draft: MemoryStore) => Promise<T>,
  ): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const draft = cloneStore(this.store);
    try {
      const result = await operation(draft);
      this.store = draft;
      return result;
    } finally {
      release();
    }
  }

  // Test-adapter writer only; production movement registration is a separate service.
  async recordTestMovement(amount: number, at: Date): Promise<void> {
    return this.exclusive(async (draft) => {
      const opening = draft.openings.find(
        (item) => item.activeSlot === "active",
      );
      if (!opening)
        throw new CashClosingServiceError(
          "CONFLICT",
          "A abertura já foi encerrada.",
        );
      draft.summary.cashExpected += amount;
      draft.summary.receiptsByMethod.dinheiro += amount;
      draft.summary.sales += amount;
      draft.summary.count += 1;
      draft.cutoff.lastMovementId = (draft.cutoff.lastMovementId ?? 900) + 1;
      draft.cutoff.lastMovementAt = new Date(at);
      draft.register.revision += 1;
    });
  }

  async readState(_scope: CashScope): Promise<CashClosingState> {
    const active = this.store.openings.find(
      (opening) => opening.activeSlot === "active",
    );
    const latest =
      [...this.store.closings].sort((a, b) => b.id - a.id)[0] ?? null;
    return {
      revision: this.store.register.revision,
      serverNow: closedAt.toISOString(),
      operationDate: "2026-11-13",
      scheduledShift: null,
      activeOpening: active ? publicOpening(active) : null,
      summary: active ? cloneSummary(this.store.summary) : null,
      latestClosing: latest ? this.publicClosing(latest) : null,
    };
  }

  async readHistory(
    _scope: CashScope,
    input: { limit: number; cursor?: number },
  ): Promise<CashClosingHistoryPage> {
    const all = [...this.store.closings]
      .sort((a, b) => b.id - a.id)
      .filter((item) => input.cursor === undefined || item.id < input.cursor);
    const page = all.slice(0, input.limit + 1);
    const hasMore = page.length > input.limit;
    const selected = page.slice(0, input.limit);
    return {
      items: selected.map((item) => this.publicClosing(item)),
      nextCursor: hasMore ? (selected[selected.length - 1]?.id ?? null) : null,
      totalCount: this.store.closings.length,
      revision: this.store.register.revision,
    };
  }

  private publicClosing(item: CashStoredClosing): CashClosing {
    const {
      organizationId: _org,
      locationId: _loc,
      intentId: _intent,
      payloadDigest: _digest,
      ...result
    } = item;
    return result;
  }

  transaction<T>(
    operation: (tx: CashClosingTransaction) => Promise<T>,
  ): Promise<T> {
    return this.exclusive(async (draft) => {
      const tx: CashClosingTransaction = {
        lockLocation: async () => draft.locationExists,
        lockIdentity: async () =>
          draft.identity ? { ...draft.identity } : null,
        findRegister: async (requestScope) =>
          requestScope.organizationId === scope.organizationId &&
          requestScope.locationId === scope.locationId
            ? { ...draft.register }
            : null,
        findOpening: async (requestScope, registerId, openingId) => {
          if (
            requestScope.organizationId !== scope.organizationId ||
            requestScope.locationId !== scope.locationId ||
            registerId !== draft.register.id
          )
            return null;
          const found = draft.openings.find((item) => item.id === openingId);
          return found ? cloneOpening(found) : null;
        },
        findClosingByIntent: async (requestScope, intentId) => {
          const found = draft.closings.find(
            (item) =>
              item.organizationId === requestScope.organizationId &&
              item.locationId === requestScope.locationId &&
              item.intentId === intentId,
          );
          return found ? cloneClosing(found) : null;
        },
        findClosingByOpening: async (requestScope, registerId, openingId) => {
          const found = draft.closings.find(
            (item) =>
              item.organizationId === requestScope.organizationId &&
              item.locationId === requestScope.locationId &&
              item.registerId === registerId &&
              item.openingId === openingId,
          );
          return found ? cloneClosing(found) : null;
        },
        aggregateOpening: async (_scope, _opening) =>
          cloneSummary(draft.summary),
        movementCutoff: async () => ({
          lastMovementId: draft.cutoff.lastMovementId,
          lastMovementAt: draft.cutoff.lastMovementAt
            ? new Date(draft.cutoff.lastMovementAt)
            : null,
        }),
        incrementRevision: async (requestScope, registerId, expected) => {
          if (
            requestScope.organizationId !== scope.organizationId ||
            requestScope.locationId !== scope.locationId ||
            registerId !== draft.register.id ||
            draft.register.revision !== expected
          )
            return false;
          draft.register.revision += 1;
          return true;
        },
        insertClosing: async (input: CashClosingInsert) => {
          if (draft.closings.some((item) => item.openingId === input.openingId))
            throw Object.assign(new Error("duplicate opening"), {
              code: "ER_DUP_ENTRY",
            });
          const stored: CashStoredClosing = {
            id: draft.nextClosingId++,
            organizationId: input.organizationId,
            locationId: input.locationId,
            openingId: input.openingId,
            registerId: input.registerId,
            opening: { ...input.opening, shift: { ...input.opening.shift } },
            closedById: input.closedById,
            closedBy: input.closedBy,
            closedAt: input.closedAt.toISOString(),
            totals: {
              ...input.totals,
              expectedByMethod: { ...input.totals.expectedByMethod },
              countedByMethod: { ...input.totals.countedByMethod },
              differenceByMethod: { ...input.totals.differenceByMethod },
            },
            summary: cloneSummary(input.summary),
            varianceReason: input.varianceReason,
            status: input.status,
            lastMovementId: input.lastMovementId,
            revision: input.revision,
            intentId: input.intentId,
            payloadDigest: input.payloadDigest,
          };
          draft.closings.push(stored);
          return cloneClosing(stored);
        },
        releaseOpening: async (requestScope, registerId, openingId) => {
          if (
            requestScope.organizationId !== scope.organizationId ||
            requestScope.locationId !== scope.locationId ||
            registerId !== draft.register.id
          )
            return false;
          const opening = draft.openings.find((item) => item.id === openingId);
          if (!opening || opening.activeSlot !== "active") return false;
          opening.activeSlot = null;
          return true;
        },
        insertAudit: async (input: CashClosingAuditInsert) => {
          if (draft.failAudit)
            throw new Error("simulated closing audit failure");
          draft.audits.push({ ...input });
        },
      };
      return operation(tx);
    });
  }
}

function closeService(
  repository: MemoryCashClosingRepository,
  now: () => Date = () => closedAt,
) {
  return createCashClosingService(repository, now);
}
function expectCode(promise: Promise<unknown>, code: string) {
  return expect(promise).rejects.toMatchObject({ code });
}

describe("serviço de fechamento do caixa (adapter em memória)", () => {
  it("fecha com autoria autenticada, snapshot e auditoria atômicos", async () => {
    const repository = new MemoryCashClosingRepository();
    const result = await closeService(repository).close(scope, openingInput);
    expect(result).toMatchObject({
      revision: 5,
      replayed: false,
      closing: {
        id: 500,
        openingId: 80,
        registerId: 60,
        opening: { operatorId: 22, operator: "Operador da abertura" },
        closedById: scope.actorId,
        closedBy: "Conferente Autenticada",
        closedAt: closedAt.toISOString(),
        totals: {
          expectedByMethod: counts,
          countedByMethod: counts,
          differenceByMethod: { dinheiro: 0, pix: 0, debito: 0, credito: 0 },
          movementCount: 3,
        },
        summary: baseSummary,
        status: "fechado",
        lastMovementId: 900,
        revision: 5,
      },
    });
    expect(repository.state.register.revision).toBe(5);
    expect(repository.state.openings[0]?.activeSlot).toBeNull();
    expect(repository.state.closings).toHaveLength(1);
    expect(repository.state.audits).toHaveLength(1);
    expect(repository.state.audits[0]).toMatchObject({
      event: "cash.closed",
      actorId: scope.actorId,
      openingId: 80,
      revision: 5,
      createdAt: closedAt,
    });
  });

  it("permite fechamento após janela e em outra data sem alterar data/turno da abertura", async () => {
    const repository = new MemoryCashClosingRepository({
      identity: identityFor(scope.actorId, {
        sessionExpiresAt: new Date("2026-11-30T00:00:00.000Z"),
      }),
    });
    const afterWindow = new Date("2026-11-20T03:00:00.000Z");
    const result = await closeService(repository, () => afterWindow).close(
      scope,
      openingInput,
    );
    expect(result.closing.closedAt).toBe(afterWindow.toISOString());
    expect(result.closing.opening.operationDate).toBe("2026-11-13");
    expect(result.closing.opening.shift.id).toBe("turno-1");
  });

  it("rejeita data/turno diferentes da abertura, ator declarado divergente e revisão obsoleta", async () => {
    const repository = new MemoryCashClosingRepository();
    const service = closeService(repository);
    await expectCode(
      service.close(scope, { ...openingInput, operationDate: "2026-11-14" }),
      "CONFLICT",
    );
    await expectCode(
      service.close(scope, { ...openingInput, shiftId: "turno-2" }),
      "CONFLICT",
    );
    await expectCode(
      service.close(scope, {
        ...openingInput,
        expectedActorId: scope.actorId + 1,
      }),
      "CONFLICT",
    );
    await expectCode(
      service.close(scope, { ...openingInput, expectedRevision: 3 }),
      "CONFLICT",
    );
    expect(repository.state.closings).toHaveLength(0);
    expect(repository.state.register.revision).toBe(4);
  });

  it("fecha com diferença justificada e mantém o status pendente encerrado", async () => {
    const repository = new MemoryCashClosingRepository();
    const result = await closeService(repository).close(scope, {
      ...openingInput,
      countedByMethod: { ...counts, pix: 180 },
      varianceReason: "Diferença no relatório de Pix",
    });
    expect(result.closing.status).toBe("diferenca-pendente");
    expect(result.closing.totals.differenceByMethod.pix).toBe(-20);
    expect(repository.state.openings[0]?.activeSlot).toBeNull();
    expect(repository.state.summary.count).toBe(3);
  });

  it("bloqueia viewer, frentista, associação inativa e unidade fora do escopo", async () => {
    for (const role of ["finance_viewer", "attendant", "oil_technician"]) {
      const repository = new MemoryCashClosingRepository({
        identity: identityFor(scope.actorId, { role }),
      });
      await expectCode(
        closeService(repository).close(scope, openingInput),
        "FORBIDDEN",
      );
    }
    const inactive = new MemoryCashClosingRepository({
      identity: identityFor(scope.actorId, { membershipActive: false }),
    });
    await expectCode(
      closeService(inactive).close(scope, openingInput),
      "FORBIDDEN",
    );
    const missingLocation = new MemoryCashClosingRepository();
    missingLocation.setLocationExists(false);
    await expectCode(
      closeService(missingLocation).close(scope, openingInput),
      "FORBIDDEN",
    );
  });

  it("revalida sessão expirada depois das leituras e recusa relógio anterior ao último movimento", async () => {
    const expiringIdentity = identityFor(scope.actorId, {
      sessionExpiresAt: new Date("2026-11-13T18:00:00.000Z"),
    });
    const expiring = new MemoryCashClosingRepository({
      identity: expiringIdentity,
    });
    let clockCalls = 0;
    const ticking = closeService(expiring, () => {
      clockCalls += 1;
      return clockCalls === 1
        ? new Date("2026-11-13T17:59:59.000Z")
        : new Date("2026-11-13T18:00:00.000Z");
    });
    await expectCode(ticking.close(scope, openingInput), "UNAUTHORIZED");
    expect(clockCalls).toBe(2);
    expect(expiring.state.closings).toHaveLength(0);

    const earlier = new MemoryCashClosingRepository();
    await expectCode(
      closeService(earlier, () => new Date("2026-11-13T16:59:59.000Z")).close(
        scope,
        openingInput,
      ),
      "CONFLICT",
    );
  });

  it("reverte revisão, snapshot, slot e auditoria quando a auditoria falha", async () => {
    const repository = new MemoryCashClosingRepository();
    repository.failAuditWrite();
    await expect(
      closeService(repository).close(scope, openingInput),
    ).rejects.toThrow("simulated closing audit failure");
    expect(repository.state.register.revision).toBe(4);
    expect(repository.state.openings[0]?.activeSlot).toBe("active");
    expect(repository.state.closings).toHaveLength(0);
    expect(repository.state.audits).toHaveLength(0);
  });

  it("reproduz a mesma confirmação depois de nova abertura; outra conta não recupera o replay", async () => {
    const repository = new MemoryCashClosingRepository();
    const service = closeService(repository);
    const original = await service.close(scope, openingInput);
    repository.useNextOpening();
    const replay = await service.close(scope, openingInput);
    expect(replay).toEqual({ ...original, replayed: true });
    expect(repository.state.closings).toHaveLength(1);
    expect(
      repository.state.openings.find((item) => item.id === 81)?.activeSlot,
    ).toBe("active");

    const otherScope = { ...scope, actorId: 31, sessionId: 41 };
    repository.setIdentity(identityFor(otherScope.actorId));
    await expectCode(
      service.close(otherScope, {
        ...openingInput,
        expectedActorId: otherScope.actorId,
      }),
      "CONFLICT",
    );
    expect(repository.state.closings).toHaveLength(1);
  });

  it("rejeita replay divergente, sessão revogada e payload inválido", async () => {
    const repository = new MemoryCashClosingRepository();
    const service = closeService(repository);
    await service.close(scope, openingInput);
    await expectCode(
      service.close(scope, {
        ...openingInput,
        countedByMethod: { ...counts, dinheiro: 999 },
      }),
      "CONFLICT",
    );

    const revoked = new MemoryCashClosingRepository({
      identity: identityFor(scope.actorId, {
        sessionRevokedAt: new Date("2026-11-13T10:00:00Z"),
      }),
    });
    await expectCode(
      closeService(revoked).close(scope, openingInput),
      "UNAUTHORIZED",
    );
    const invalid = new MemoryCashClosingRepository();
    await expectCode(
      closeService(invalid).close(scope, {
        ...openingInput,
        countedByMethod: { ...counts, pix: -1 },
      }),
      "BAD_REQUEST",
    );
  });

  it("serializa dois fechamentos concorrentes e confirma somente um", async () => {
    const repository = new MemoryCashClosingRepository();
    const service = closeService(repository);
    const second = {
      ...openingInput,
      intentId: "123e4567-e89b-42d3-a456-426614174001",
    };
    const outcomes = await Promise.allSettled([
      service.close(scope, openingInput),
      service.close(scope, second),
    ]);
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(outcomes.filter((item) => item.status === "rejected")).toHaveLength(
      1,
    );
    expect(repository.state.register.revision).toBe(5);
    expect(repository.state.closings).toHaveLength(1);
    expect(repository.state.audits).toHaveLength(1);
  });

  it("o adapter serializa fechamento versus movimento e invalida a revisão obsoleta", async () => {
    const closeFirstRepository = new MemoryCashClosingRepository();
    const closeFirstService = closeService(closeFirstRepository);
    const closeFirst = closeFirstService.close(scope, openingInput);
    const movementAfter = closeFirstRepository.recordTestMovement(
      100,
      new Date("2026-11-13T17:30:00.000Z"),
    );
    const [closeFirstResult, movementAfterResult] = await Promise.allSettled([
      closeFirst,
      movementAfter,
    ]);
    expect(closeFirstResult.status).toBe("fulfilled");
    expect(movementAfterResult.status).toBe("rejected");
    expect(
      closeFirstResult.status === "fulfilled" &&
        closeFirstResult.value.closing.totals.movementCount,
    ).toBe(3);

    const movementFirstRepository = new MemoryCashClosingRepository();
    const movementFirstService = closeService(movementFirstRepository);
    const movement = movementFirstRepository.recordTestMovement(
      100,
      new Date("2026-11-13T17:30:00.000Z"),
    );
    const staleClose = movementFirstService.close(scope, openingInput);
    const [movementResult, closeAfterResult] = await Promise.allSettled([
      movement,
      staleClose,
    ]);
    expect(movementResult.status).toBe("fulfilled");
    expect(closeAfterResult.status).toBe("rejected");
    expect(
      closeAfterResult.status === "rejected" && closeAfterResult.reason,
    ).toMatchObject({
      name: "CashClosingServiceError",
      code: "CONFLICT",
    });
    expect(movementFirstRepository.state.register.revision).toBe(5);
    expect(movementFirstRepository.state.closings).toHaveLength(0);

    const closeAfter = await movementFirstService.close(scope, {
      ...openingInput,
      intentId: "123e4567-e89b-42d3-a456-426614174002",
      expectedRevision: 5,
      countedByMethod: { ...counts, dinheiro: 1_100 },
    });
    expect(closeAfter.closing.totals.movementCount).toBe(4);
    expect(closeAfter.closing.lastMovementId).toBe(901);
    expect(closeAfter.closing.revision).toBe(6);
    expect(closeAfter.closing.summary).toMatchObject({
      cashExpected: 1_100,
      receiptsByMethod: { dinheiro: 550 },
      count: 4,
    });
    expect(movementFirstRepository.state.register.revision).toBe(6);
  });

  it("mantém corte e quantidade congelados, e history é paginado por ID", async () => {
    const emptyRepository = new MemoryCashClosingRepository({
      summary: {
        ...baseSummary,
        cashExpected: 500,
        openingFloat: 500,
        receiptsByMethod: { dinheiro: 0, pix: 0, debito: 0, credito: 0 },
        sales: 0,
        previousReceipts: 0,
        supplies: 0,
        withdrawals: 0,
        count: 0,
      },
      cutoff: { lastMovementId: null, lastMovementAt: null },
    });
    const result = await closeService(emptyRepository).close(scope, {
      ...openingInput,
      countedByMethod: { dinheiro: 500, pix: 0, debito: 0, credito: 0 },
    });
    expect(result.closing.lastMovementId).toBeNull();
    expect(result.closing.totals.movementCount).toBe(0);

    const repository = new MemoryCashClosingRepository();
    const service = closeService(repository);
    await service.close(scope, openingInput);
    const page = await service.history(scope, { limit: 20 });
    expect(page).toMatchObject({
      totalCount: 1,
      revision: 5,
      nextCursor: null,
      items: [{ id: 500, lastMovementId: 900, totals: { movementCount: 3 } }],
    });
  });
});
