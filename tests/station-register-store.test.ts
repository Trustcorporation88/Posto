import { describe, expect, it, vi } from "vitest";
import {
  applyShiftMovement,
  createEmptyMovementData,
  prepareShiftMovement,
} from "../lib/shift-movements";
import {
  applyShiftOpening,
  createEmptyOpeningData,
  prepareShiftOpening,
} from "../lib/shift-opening";
import {
  applyStationClosure,
  createEmptyStationRegister,
  prepareStationClosure,
  prepareStationMovement,
  prepareStationOpening,
} from "../lib/station-register";
import { createStationRegisterStore } from "../lib/station-register-store";

const openAt = new Date("2026-10-28T10:00:00-03:00");
const moveAt = new Date("2026-10-28T10:15:00-03:00");
const closeAt = new Date("2026-10-28T13:45:00-03:00");
const draft = {
  type: "recebimento" as const,
  paymentMethod: "dinheiro" as const,
  receiptNature: "venda" as const,
  amount: 500,
  description: "Venda de teste",
  reference: "",
  counterparty: "",
  responsible: "Ana",
};
function legacySnapshot() {
  const openingData = applyShiftOpening(
    createEmptyOpeningData(),
    prepareShiftOpening(createEmptyOpeningData(), "Ana", 20000, openAt),
    openAt,
    "legacy-opening",
  );
  const movementData = applyShiftMovement(
    createEmptyMovementData(),
    openingData.opening!,
    prepareShiftMovement(
      createEmptyMovementData(),
      openingData.opening!,
      draft,
      moveAt,
      "legacy-movement",
    ),
    moveAt,
  );
  return { openingData, movementData };
}
function memory(
  initial: {
    current?: string | null;
    opening?: string | null;
    movements?: string | null;
  } = {},
) {
  let current = initial.current ?? null;
  const opening = initial.opening ?? null;
  const movements = initial.movements ?? null;
  const storage = {
    read: vi.fn(async () => current),
    write: vi.fn(async (value: string) => {
      current = value;
    }),
    readLegacyOpening: vi.fn(async () => opening),
    readLegacyMovements: vi.fn(async () => movements),
  };
  return {
    storage,
    getCurrent: () => current,
    setCurrent: (value: string | null) => {
      current = value;
    },
  };
}
async function openedStore(options: { now?: () => Date } = {}) {
  const m = memory();
  const store = createStationRegisterStore(m.storage, options);
  await store.reload();
  const review = prepareStationOpening(
    store.getSnapshot().data,
    "Ana",
    20000,
    openAt,
  );
  await store.open(review);
  return { store, memory: m };
}

describe("store do registro local de turnos", () => {
  it("migra abertura e movimento legado em memória, sem gravar na primeira leitura", async () => {
    const legacy = legacySnapshot();
    const openingRaw = JSON.stringify(legacy.openingData);
    const movementsRaw = JSON.stringify(legacy.movementData);
    const m = memory({ opening: openingRaw, movements: movementsRaw });
    const store = createStationRegisterStore(m.storage);
    await store.reload();
    expect(store.getSnapshot().data).toMatchObject({
      revision: 2,
      openingRevision: 1,
      opening: { id: "legacy-opening" },
      movements: [{ id: "legacy-movement" }],
      closures: [],
    });
    expect(m.storage.write).not.toHaveBeenCalled();
    expect(m.getCurrent()).toBeNull();
    expect(m.storage.readLegacyOpening).toHaveBeenCalledTimes(1);
    expect(m.storage.readLegacyMovements).toHaveBeenCalledTimes(1);
    expect(openingRaw).toBe(JSON.stringify(legacy.openingData));
    expect(movementsRaw).toBe(JSON.stringify(legacy.movementData));
  });

  it("fecha os movimentos migrados em uma gravação nova e mantém as chaves legadas intactas", async () => {
    const legacy = legacySnapshot();
    const openingRaw = JSON.stringify(legacy.openingData);
    const movementsRaw = JSON.stringify(legacy.movementData);
    const m = memory({ opening: openingRaw, movements: movementsRaw });
    const store = createStationRegisterStore(m.storage, { now: () => closeAt });
    await store.reload();
    const review = prepareStationClosure(
      store.getSnapshot().data,
      {
        closingOperator: "Ana",
        confirmer: "Bruno",
        countedByMethod: { dinheiro: 20500, pix: 0, debito: 0, credito: 0 },
        varianceReason: "",
      },
      closeAt,
      "legacy-close",
    );
    await store.close(review);
    const saved = JSON.parse(m.getCurrent()!) as ReturnType<
      typeof createEmptyStationRegister
    >;
    expect(saved).toMatchObject({
      opening: null,
      movements: [],
      closures: [
        { openingId: "legacy-opening", movements: [{ id: "legacy-movement" }] },
      ],
    });
    expect(m.storage.write).toHaveBeenCalledTimes(1);
    expect(m.storage.readLegacyOpening).toHaveBeenCalled();
    expect(m.storage.readLegacyMovements).toHaveBeenCalled();
    expect(m.getCurrent()).not.toBeNull();
  });

  it("fecha atomicamente e recupera retry após confirmação de gravação perdida sem duplicar", async () => {
    let clock = openAt;
    const { store, memory: m } = await openedStore({ now: () => clock });
    const register = store.getSnapshot().data;
    clock = moveAt;
    const movementReview = prepareStationMovement(
      register,
      draft,
      moveAt,
      "movement-1",
    );
    await store.record(movementReview);
    const closureReview = prepareStationClosure(
      store.getSnapshot().data,
      {
        closingOperator: "Ana",
        confirmer: "Bruno",
        countedByMethod: { dinheiro: 20500, pix: 0, debito: 0, credito: 0 },
        varianceReason: "",
      },
      closeAt,
      "close-intent-1",
    );
    clock = closeAt;
    m.storage.write.mockImplementationOnce(async (value) => {
      m.setCurrent(value);
      throw new Error("ack lost");
    });
    await expect(store.close(closureReview)).rejects.toThrow("ack lost");
    await store.reload();
    await expect(store.close(closureReview)).resolves.toMatchObject({
      id: "close-intent-1",
    });
    const saved = JSON.parse(m.getCurrent()!);
    expect(saved.closures).toHaveLength(1);
    expect(saved.closures[0].movements).toHaveLength(1);
    expect(m.storage.write).toHaveBeenCalledTimes(3);
  });

  it("preserva estado e campos na quota, e não publica sucesso antes do write", async () => {
    const m = memory();
    const store = createStationRegisterStore(m.storage, { now: () => openAt });
    await store.reload();
    const review = prepareStationOpening(
      store.getSnapshot().data,
      "Ana",
      20000,
      openAt,
    );
    m.storage.write.mockRejectedValue(new Error("QuotaExceededError"));
    await expect(store.open(review)).rejects.toThrow("preservado");
    expect(store.getSnapshot()).toMatchObject({
      data: createEmptyStationRegister(),
      busy: false,
      ready: true,
    });
    expect(m.getCurrent()).toBeNull();
  });

  it("não usa legado como fallback nem grava se o registro novo estiver corrompido", async () => {
    const legacy = legacySnapshot();
    const m = memory({
      current: "{broken",
      opening: JSON.stringify(legacy.openingData),
      movements: JSON.stringify(legacy.movementData),
    });
    const store = createStationRegisterStore(m.storage);
    await expect(store.reload()).rejects.toThrow("nada foi apagado");
    expect(store.getSnapshot().loadError).toContain("inválido");
    expect(m.storage.readLegacyOpening).not.toHaveBeenCalled();
    expect(m.storage.write).not.toHaveBeenCalled();
    expect(m.getCurrent()).toBe("{broken");
  });

  it("bloqueia duas aberturas concorrentes preparadas sobre o mesmo snapshot", async () => {
    const m = memory();
    const first = createStationRegisterStore(m.storage, { now: () => openAt });
    const second = createStationRegisterStore(m.storage, { now: () => openAt });
    await Promise.all([first.reload(), second.reload()]);
    const a = prepareStationOpening(
      first.getSnapshot().data,
      "Ana",
      20000,
      openAt,
    );
    const b = prepareStationOpening(
      second.getSnapshot().data,
      "Bruno",
      30000,
      openAt,
    );
    await first.open(a);
    await expect(second.open(b)).rejects.toThrow("mudou");
    expect(JSON.parse(m.getCurrent()!).opening.operator).toBe("Ana");
    expect(m.storage.write).toHaveBeenCalledTimes(1);
  });

  it("rejeita ID de fechamento reaproveitado com outra contagem", async () => {
    const { store } = await openedStore({ now: () => closeAt });
    const review = prepareStationClosure(
      store.getSnapshot().data,
      {
        closingOperator: "Ana",
        confirmer: "Bruno",
        countedByMethod: { dinheiro: 20000, pix: 0, debito: 0, credito: 0 },
        varianceReason: "Contagem menor, recontar a gaveta.",
      },
      closeAt,
      "same-close-id",
    );
    await store.close(review);
    const altered = {
      ...review,
      countedByMethod: { ...review.countedByMethod, dinheiro: 21000 },
      expectedByMethod: { ...review.expectedByMethod },
      differenceByMethod: { ...review.differenceByMethod, dinheiro: 1000 },
    };
    await expect(store.close(altered)).rejects.toThrow("dados diferentes");
  });

  it("preserva snapshot anterior se o registro local estiver corrompido", async () => {
    const legacy = legacySnapshot();
    const m = memory({
      opening: JSON.stringify(legacy.openingData),
      movements: "bad-json",
    });
    const store = createStationRegisterStore(m.storage);
    await expect(store.reload()).rejects.toThrow(
      "Falha ao migrar movimentos locais",
    );
    expect(m.storage.write).not.toHaveBeenCalled();
    expect(m.getCurrent()).toBeNull();
  });
});
