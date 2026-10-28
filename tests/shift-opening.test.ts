import { describe, expect, it, vi } from "vitest";
import {
  applyShiftOpening,
  createEmptyOpeningData,
  prepareShiftOpening,
  validateOpeningData,
} from "../lib/shift-opening";
import { createShiftOpeningStore } from "../lib/shift-opening-store";
import type { ShiftOpeningData } from "../lib/shift-opening";

const NORMAL = new Date("2026-10-28T10:00:00-03:00");
const SUNDAY = new Date("2026-10-25T08:00:00-03:00");
const HOLIDAY = new Date("2026-11-20T08:00:00-03:00");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function makeStorage(initial: string | null = null) {
  let raw = initial;
  const storage = {
    read: vi.fn(async () => raw),
    write: vi.fn(async (value: string) => {
      raw = value;
    }),
  };
  return {
    storage,
    getRaw: () => raw,
    setRaw: (value: string | null) => {
      raw = value;
    },
  };
}

function reviewFor(
  data: ShiftOpeningData = createEmptyOpeningData(),
  now = NORMAL,
) {
  return prepareShiftOpening(data, "Ana Operadora", 1250, now);
}

describe("abertura de turno: domínio", () => {
  it("cria estado vazio e aceita fundo zero", () => {
    const data = createEmptyOpeningData();
    expect(data).toEqual({ version: 1, revision: 0, opening: null });
    const review = prepareShiftOpening(data, "Jo", 0, NORMAL);
    expect(review).toMatchObject({
      operator: "Jo",
      openingFloat: 0,
      operationDate: "2026-10-28",
      expectedRevision: 0,
      shift: { id: "turno-1", start: "06:00", end: "14:00" },
    });
  });

  it("normaliza nome e retorna cópias defensivas do registro", () => {
    const review = prepareShiftOpening(
      createEmptyOpeningData(),
      "  Ana Operadora  ",
      1250,
      NORMAL,
    );
    const result = applyShiftOpening(
      createEmptyOpeningData(),
      review,
      NORMAL,
      "opening-1",
    );
    expect(result.opening).toMatchObject({
      id: "opening-1",
      status: "aberto",
      registerId: "caixa-principal",
      operator: "Ana Operadora",
      openingFloat: 1250,
      operationDate: "2026-10-28",
      scheduleKind: "normal",
      timeZone: "America/Sao_Paulo",
      openedAt: "2026-10-28T13:00:00.000Z",
      shift: { id: "turno-1", label: "Turno 1", start: "06:00", end: "14:00" },
    });
    expect(result.revision).toBe(1);

    const source = JSON.parse(JSON.stringify(result));
    const validated = validateOpeningData(source);
    source.opening.operator = "modificado";
    source.opening.shift.start = "00:00";
    source.opening.holidayNames.push("inventado");
    validated.opening!.shift.start = "00:00";
    validated.opening!.holidayNames.push("local");
    expect(result.opening!.operator).toBe("Ana Operadora");
    expect(result.opening!.shift.start).toBe("06:00");
    expect(result.opening!.holidayNames).toEqual([]);
  });

  it("rejeita campos, revisão e dinheiro inválidos", () => {
    expect(() =>
      prepareShiftOpening(createEmptyOpeningData(), "A", 0, NORMAL),
    ).toThrow("2 a 80");
    expect(() =>
      prepareShiftOpening(createEmptyOpeningData(), "Ana\n", 0, NORMAL),
    ).toThrow("controle");
    expect(() =>
      prepareShiftOpening(createEmptyOpeningData(), "Ana", -1, NORMAL),
    ).toThrow("não negativo");
    expect(() =>
      validateOpeningData({ version: 2, revision: 0, opening: null }),
    ).toThrow("Versão");
    expect(() =>
      validateOpeningData({ version: 1, revision: 1, opening: null }),
    ).toThrow("revisão zero");
    expect(() =>
      validateOpeningData({ version: 1, revision: 0, opening: {} }),
    ).toThrow();
    expect(() =>
      validateOpeningData({
        version: 1,
        revision: Number.MAX_SAFE_INTEGER + 1,
        opening: null,
      }),
    ).toThrow("inteiro seguro");
  });

  it("permite apenas o turno vigente, com domingo, feriado e fronteiras inclusivas/exclusivas", () => {
    expect(
      prepareShiftOpening(createEmptyOpeningData(), "Ana", 0, NORMAL).shift,
    ).toMatchObject({
      id: "turno-1",
      start: "06:00",
      end: "14:00",
    });
    expect(
      prepareShiftOpening(
        createEmptyOpeningData(),
        "Ana",
        0,
        new Date("2026-10-28T14:00:00-03:00"),
      ).shift,
    ).toMatchObject({ id: "turno-2", start: "14:00", end: "22:00" });
    expect(
      prepareShiftOpening(createEmptyOpeningData(), "Ana", 0, SUNDAY),
    ).toMatchObject({
      operationDate: "2026-10-25",
      shift: { start: "07:00", end: "13:00" },
    });
    expect(
      prepareShiftOpening(createEmptyOpeningData(), "Ana", 0, HOLIDAY),
    ).toMatchObject({
      operationDate: "2026-11-20",
      shift: { start: "07:00", end: "13:00" },
    });
    for (const now of [
      new Date("2026-10-28T05:59:00-03:00"),
      new Date("2026-10-28T22:00:00-03:00"),
      new Date("2026-10-25T19:00:00-03:00"),
    ]) {
      expect(() =>
        prepareShiftOpening(createEmptyOpeningData(), "Ana", 0, now),
      ).toThrow("turno vigente");
    }
  });

  it("bloqueia abertura duplicada sem fechamento automático", () => {
    const first = applyShiftOpening(
      createEmptyOpeningData(),
      reviewFor(),
      NORMAL,
      "first",
    );
    expect(() =>
      prepareShiftOpening(
        first,
        "Outra",
        0,
        new Date("2026-10-29T10:00:00-03:00"),
      ),
    ).toThrow("ativa");
    expect(() =>
      applyShiftOpening(first, reviewFor(), NORMAL, "second"),
    ).toThrow();
  });

  it("exige nova revisão se a confirmação atravessar a fronteira de turno", () => {
    const review = reviewFor();
    expect(() =>
      applyShiftOpening(
        createEmptyOpeningData(),
        review,
        new Date("2026-10-28T14:00:00-03:00"),
        "late",
      ),
    ).toThrow("mudaram");
  });
});

describe("abertura de turno: store local", () => {
  it("faz reload, abre com sucesso e publica somente após write concluído", async () => {
    const memory = makeStorage();
    let writeFinished = false;
    memory.storage.write.mockImplementation(async (value: string) => {
      memory.setRaw(value);
      writeFinished = true;
    });
    const store = createShiftOpeningStore(memory.storage, {
      now: () => NORMAL,
      id: () => "store-id",
    });
    const notifications: OpeningStoreSnapshotLike[] = [];
    store.subscribe(() => {
      const snapshot = store.getSnapshot();
      notifications.push({ busy: snapshot.busy, ready: snapshot.ready });
    });

    await store.reload();
    const review = reviewFor(store.getSnapshot().data);
    const opening = await store.open(review);
    expect(writeFinished).toBe(true);
    expect(opening.id).toBe("store-id");
    expect(store.getSnapshot()).toMatchObject({
      ready: true,
      busy: false,
      loadError: "",
      data: { revision: 1, opening: { id: "store-id", openingFloat: 1250 } },
    });
    expect(notifications.map((item) => item.busy)).toEqual([
      true,
      false,
      true,
      false,
    ]);

    const returnedShift = opening.shift;
    returnedShift.start = "00:00";
    opening.holidayNames.push("não compartilhar");
    expect(store.getSnapshot().data.opening!.shift.start).toBe("06:00");
    expect(store.getSnapshot().data.opening!.holidayNames).toEqual([]);

    const secondStore = createShiftOpeningStore(memory.storage);
    await secondStore.reload();
    expect(secondStore.getSnapshot().data).toEqual(store.getSnapshot().data);
  });

  it("mantém o estado antigo em falha de quota e libera busy", async () => {
    const memory = makeStorage();
    memory.storage.write.mockRejectedValue(new Error("QuotaExceededError"));
    const store = createShiftOpeningStore(memory.storage, {
      now: () => NORMAL,
      id: () => "quota-id",
    });
    await store.reload();
    const before = store.getSnapshot().data;
    await expect(store.open(reviewFor(before))).rejects.toThrow(
      "QuotaExceededError",
    );
    expect(store.getSnapshot()).toMatchObject({
      busy: false,
      ready: true,
      loadError: "",
      data: before,
    });
  });

  it("bloqueia concorrência no mesmo contexto antes da leitura assíncrona", async () => {
    const memory = makeStorage();
    const read = deferred<string | null>();
    memory.storage.read.mockReturnValueOnce(read.promise);
    const store = createShiftOpeningStore(memory.storage, {
      now: () => NORMAL,
      id: () => "busy-id",
    });
    const first = store.open(reviewFor());
    expect(store.getSnapshot().busy).toBe(true);
    await expect(store.open(reviewFor())).rejects.toThrow("andamento");
    expect(memory.storage.read).toHaveBeenCalledTimes(1);
    read.resolve(null);
    await expect(first).resolves.toMatchObject({ id: "busy-id" });
  });

  it("revalida a janela depois da leitura e não grava turno obsoleto", async () => {
    const memory = makeStorage();
    const read = deferred<string | null>();
    memory.storage.read.mockReturnValueOnce(read.promise);
    let now = new Date("2026-10-28T13:59:00-03:00");
    const store = createShiftOpeningStore(memory.storage, {
      now: () => now,
      id: () => "boundary-id",
    });
    const pending = store.open(reviewFor(createEmptyOpeningData(), now));
    now = new Date("2026-10-28T14:00:00-03:00");
    read.resolve(null);
    await expect(pending).rejects.toThrow("mudaram");
    expect(memory.storage.write).not.toHaveBeenCalled();
    expect(store.getSnapshot().busy).toBe(false);
  });

  it("rejeita disco corrompido e não o apaga", async () => {
    const memory = makeStorage("{corrompido");
    const store = createShiftOpeningStore(memory.storage, {
      now: () => NORMAL,
    });
    await expect(store.reload()).rejects.toThrow("Falha ao ler");
    expect(memory.getRaw()).toBe("{corrompido");
    expect(store.getSnapshot()).toMatchObject({
      busy: false,
      ready: true,
      loadError: expect.stringContaining("Falha ao ler"),
    });
    await expect(store.open(reviewFor())).rejects.toThrow("Falha ao ler");
    expect(memory.storage.write).not.toHaveBeenCalled();
  });

  it("conclui a primeira tentativa com erro e permite nova leitura sem apagar dados", async () => {
    const memory = makeStorage();
    memory.storage.read.mockRejectedValueOnce(new Error("SecurityError"));
    const store = createShiftOpeningStore(memory.storage);
    await expect(store.reload()).rejects.toThrow("SecurityError");
    expect(store.getSnapshot()).toMatchObject({
      ready: true,
      busy: false,
      loadError: expect.stringContaining("SecurityError"),
      data: { opening: null, revision: 0 },
    });
    expect(memory.storage.write).not.toHaveBeenCalled();
    await store.reload();
    expect(store.getSnapshot()).toMatchObject({
      ready: true,
      loadError: "",
      busy: false,
    });
  });

  it("mantém snapshots estáveis e profundamente congelados", async () => {
    const memory = makeStorage();
    const store = createShiftOpeningStore(memory.storage, {
      now: () => NORMAL,
      id: () => "frozen-id",
    });
    const initial = store.getSnapshot();
    expect(initial).toBe(store.getSnapshot());
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(initial.data)).toBe(true);
    await store.reload();
    await store.open(reviewFor());
    const snapshot = store.getSnapshot();
    expect(snapshot).toBe(store.getSnapshot());
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.data)).toBe(true);
    expect(Object.isFrozen(snapshot.data.opening)).toBe(true);
    expect(Object.isFrozen(snapshot.data.opening!.shift)).toBe(true);
    expect(Object.isFrozen(snapshot.data.opening!.holidayNames)).toBe(true);
    expect(() => {
      snapshot.data.opening!.operator = "Modificado";
    }).toThrow();
    expect(() => {
      snapshot.data.opening!.shift.start = "00:00";
    }).toThrow();
    expect(() =>
      snapshot.data.opening!.holidayNames.push("Inventado"),
    ).toThrow();
    expect(store.getSnapshot().data.opening!.operator).toBe("Ana Operadora");
  });

  it("publica conflito quando a revisão ou o conteúdo bruto ficou obsoleto", async () => {
    const memory = makeStorage();
    const store = createShiftOpeningStore(memory.storage, {
      now: () => NORMAL,
      id: () => "local-id",
    });
    await store.reload();
    const review = reviewFor();
    const external = applyShiftOpening(
      createEmptyOpeningData(),
      review,
      NORMAL,
      "external-id",
    );
    memory.setRaw(JSON.stringify(external));

    await expect(store.open(review)).rejects.toThrow("Conflito");
    expect(store.getSnapshot().data).toEqual(external);
    expect(memory.storage.write).not.toHaveBeenCalled();
  });

  it("não deixa listeners duplicados ou reload em andamento causar loop", async () => {
    const memory = makeStorage();
    const store = createShiftOpeningStore(memory.storage);
    let calls = 0;
    const listener = () => {
      calls += 1;
      void store.reload();
    };
    const unsubscribe = store.subscribe(listener);
    await store.reload();
    await Promise.resolve();
    unsubscribe();
    const before = calls;
    await store.reload();
    expect(calls).toBe(before);
    expect(calls).toBeLessThan(4);
  });
});

type OpeningStoreSnapshotLike = { busy: boolean; ready: boolean };
