import { describe, expect, it, vi } from "vitest";
import {
  applyShiftOpening,
  createEmptyOpeningData,
  prepareShiftOpening,
} from "../lib/shift-opening";
import {
  applyShiftMovement,
  createEmptyMovementData,
  prepareShiftMovement,
} from "../lib/shift-movements";
import { createShiftMovementStore } from "../lib/shift-movements-store";

const now = new Date("2026-10-28T10:20:00-03:00");
const openingData = applyShiftOpening(
  createEmptyOpeningData(),
  prepareShiftOpening(createEmptyOpeningData(), "Ana", 20000, now),
  now,
  "open-store",
);
const opening = openingData.opening!;
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
function mem() {
  let raw: string | null = null;
  let rawOpening: string | null = JSON.stringify(openingData);
  const storage = {
    read: vi.fn(async () => raw),
    write: vi.fn(async (x: string) => {
      raw = x;
    }),
    readOpening: vi.fn(async () => rawOpening),
  };
  return {
    storage,
    raw: () => raw,
    setRaw: (x: string | null) => {
      raw = x;
    },
    setOpening: (x: string | null) => {
      rawOpening = x;
    },
  };
}

describe("store local de movimentos", () => {
  it("carrega, grava e só publica após concluir o write", async () => {
    const m = mem();
    let release!: () => void;
    let entered!: () => void;
    let done = false;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    m.storage.write.mockImplementation(async (x) => {
      entered();
      await new Promise<void>((r) => {
        release = r;
      });
      m.setRaw(x);
      done = true;
    });
    const store = createShiftMovementStore(m.storage, { now: () => now });
    await store.reload();
    const review = prepareShiftMovement(
      store.getSnapshot().data,
      opening,
      draft,
      now,
      "intent-1",
    );
    const promise = store.record(review);
    expect(store.getSnapshot().busy).toBe(true);
    await started;
    expect(done).toBe(false);
    release();
    await expect(promise).resolves.toMatchObject({ id: "intent-1" });
    expect(store.getSnapshot().data.revision).toBe(1);
  });
  it("não permite duplicidade em concorrência nem escreve sem abertura", async () => {
    const m = mem();
    let release!: (value: string | null) => void;
    const store = createShiftMovementStore(m.storage, { now: () => now });
    await store.reload();
    m.storage.read.mockReturnValueOnce(
      new Promise((r) => {
        release = r;
      }),
    );
    const review = prepareShiftMovement(
      store.getSnapshot().data,
      opening,
      draft,
      now,
      "intent",
    );
    const op = store.record(review);
    await expect(store.record(review)).rejects.toThrow("andamento");
    release(null);
    await expect(op).resolves.toMatchObject({ id: "intent" });
  });
  it("preserva o estado anterior em erro de leitura ou quota", async () => {
    const m = mem();
    const store = createShiftMovementStore(m.storage, { now: () => now });
    await store.reload();
    const review = prepareShiftMovement(
      store.getSnapshot().data,
      opening,
      draft,
      now,
      "quota",
    );
    m.storage.write.mockRejectedValue(new Error("QuotaExceededError"));
    await expect(store.record(review)).rejects.toThrow("QuotaExceededError");
    expect(store.getSnapshot()).toMatchObject({
      data: { revision: 0 },
      busy: false,
    });
    m.storage.read.mockRejectedValueOnce(new Error("SecurityError"));
    await expect(store.reload()).rejects.toThrow("SecurityError");
    expect(store.getSnapshot().loadError).toContain("SecurityError");
  });
  it("não sobrescreve histórico corrompido nem abertura diferente", async () => {
    const m = mem();
    const store = createShiftMovementStore(m.storage, { now: () => now });
    m.setRaw("{bad");
    await expect(store.reload()).rejects.toThrow("Falha");
    expect(m.raw()).toBe("{bad");
    const firstReview = prepareShiftMovement(
      createEmptyMovementData(),
      opening,
      draft,
      now,
      "historic",
    );
    const ledger = applyShiftMovement(
      createEmptyMovementData(),
      opening,
      firstReview,
      now,
    );
    m.setRaw(JSON.stringify(ledger));
    m.setOpening(
      JSON.stringify({
        ...openingData,
        opening: { ...opening, operator: "Outra" },
      }),
    );
    await expect(store.reload()).rejects.toThrow("não corresponde");
    expect(m.storage.write).not.toHaveBeenCalled();
  });
  it("recupera replay da mesma intenção sem duplicar depois de resposta perdida", async () => {
    const m = mem();
    const store = createShiftMovementStore(m.storage, { now: () => now });
    await store.reload();
    const review = prepareShiftMovement(
      store.getSnapshot().data,
      opening,
      draft,
      now,
      "stable-intent",
    );
    m.storage.write.mockImplementationOnce(async (x) => {
      m.setRaw(x);
      throw new Error("ack lost");
    });
    await expect(store.record(review)).rejects.toThrow("ack lost");
    const count = JSON.parse(m.raw()!).movements.length;
    await store.reload();
    await expect(store.record(review)).resolves.toMatchObject({
      id: "stable-intent",
    });
    expect(JSON.parse(m.raw()!).movements).toHaveLength(count);
  });
  it("congela snapshots e não permite escrever com abertura mudada no último instante", async () => {
    const m = mem();
    const store = createShiftMovementStore(m.storage, { now: () => now });
    await store.reload();
    expect(Object.isFrozen(store.getSnapshot())).toBe(true);
    const review = prepareShiftMovement(
      store.getSnapshot().data,
      opening,
      draft,
      now,
      "racy",
    );
    m.storage.readOpening
      .mockImplementationOnce(async () => JSON.stringify(openingData))
      .mockImplementationOnce(async () =>
        JSON.stringify({
          ...openingData,
          opening: { ...opening, operator: "Changed" },
        }),
      );
    await expect(store.record(review)).rejects.toThrow(
      "mudou antes da gravação",
    );
    expect(m.storage.write).not.toHaveBeenCalled();
  });
  it("revalida a janela depois que a última leitura cruza o fim do turno", async () => {
    const m = mem();
    const beforeEnd = new Date("2026-10-28T13:59:59-03:00");
    const afterEnd = new Date("2026-10-28T14:00:00-03:00");
    const times = [beforeEnd, afterEnd];
    const store = createShiftMovementStore(m.storage, {
      now: () => times.shift() ?? afterEnd,
    });
    await store.reload();
    const review = prepareShiftMovement(
      store.getSnapshot().data,
      opening,
      draft,
      beforeEnd,
      "window-race",
    );
    let release!: (value: string | null) => void;
    let entered!: () => void;
    const finalReadStarted = new Promise<void>((resolve) => {
      entered = resolve;
    });
    m.storage.readOpening
      .mockImplementationOnce(async () => JSON.stringify(openingData))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
            entered();
          }),
      );
    const pending = store.record(review);
    await finalReadStarted;
    release(JSON.stringify(openingData));
    await expect(pending).rejects.toThrow("turno mudou ou terminou");
    expect(m.storage.write).not.toHaveBeenCalled();
    expect(store.getSnapshot().data.revision).toBe(0);
  });
});
