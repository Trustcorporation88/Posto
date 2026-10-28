import {
  applyShiftOpening,
  createEmptyOpeningData,
  validateOpeningData,
  validateShiftOpeningReview,
} from "./shift-opening";
import type {
  ShiftOpening,
  ShiftOpeningData,
  ShiftOpeningReview,
} from "./shift-opening";

export type ShiftOpeningStorage = {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
};

export type OpeningStoreOptions = {
  now?: () => Date;
  id?: () => string;
};

export type OpeningStoreSnapshot = {
  data: ShiftOpeningData;
  ready: boolean;
  busy: boolean;
  loadError: string;
};

export type ShiftOpeningStore = {
  getSnapshot(): OpeningStoreSnapshot;
  getServerSnapshot(): OpeningStoreSnapshot;
  subscribe(listener: () => void): () => void;
  reload(): Promise<void>;
  open(review: ShiftOpeningReview): Promise<ShiftOpening>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cloneStorageData(data: ShiftOpeningData): ShiftOpeningData {
  return validateOpeningData(data);
}

function dataEqual(left: ShiftOpeningData, right: ShiftOpeningData): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function makeDefaultId(): string {
  const cryptoObject = (
    globalThis as typeof globalThis & {
      crypto?: { randomUUID?: () => string };
    }
  ).crypto;
  if (typeof cryptoObject?.randomUUID === "function") {
    const candidate = cryptoObject.randomUUID();
    if (candidate.length > 0) return candidate;
  }
  return `opening-${Date.now().toString(36)}-${Math.floor(
    Math.random() * 0x100000000,
  ).toString(36)}`;
}

function makeSnapshot(
  data: ShiftOpeningData,
  ready: boolean,
  busy: boolean,
  loadError: string,
): OpeningStoreSnapshot {
  const copied = cloneStorageData(data);
  if (copied.opening) {
    Object.freeze(copied.opening.shift);
    Object.freeze(copied.opening.holidayNames);
    Object.freeze(copied.opening);
  }
  Object.freeze(copied);
  return Object.freeze({
    data: copied,
    ready,
    busy,
    loadError,
  });
}

export function createShiftOpeningStore(
  storage: ShiftOpeningStorage,
  options: OpeningStoreOptions = {},
): ShiftOpeningStore {
  const serverSnapshot = makeSnapshot(
    createEmptyOpeningData(),
    false,
    false,
    "",
  );
  let snapshot = serverSnapshot;
  let notifying = false;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    notifying = true;
    try {
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch {
          // A subscriber cannot turn a completed storage operation into a failure.
        }
      }
    } finally {
      notifying = false;
    }
  };

  const setSnapshot = (
    data: ShiftOpeningData,
    ready: boolean,
    busy: boolean,
    loadError: string,
  ): void => {
    snapshot = makeSnapshot(data, ready, busy, loadError);
    notify();
  };

  const setBusy = (busy: boolean): void => {
    snapshot = makeSnapshot(
      snapshot.data,
      snapshot.ready,
      busy,
      snapshot.loadError,
    );
    notify();
  };

  const readDisk = async (): Promise<ShiftOpeningData> => {
    let raw: string | null;
    try {
      raw = await storage.read();
    } catch (error) {
      throw new Error(
        `Falha ao ler a abertura do caixa: ${errorMessage(error)}`,
      );
    }
    if (raw === null) return createEmptyOpeningData();
    try {
      return validateOpeningData(JSON.parse(raw) as unknown);
    } catch (error) {
      throw new Error(
        `Falha ao ler a abertura do caixa: ${errorMessage(error)}`,
      );
    }
  };

  const publishReadError = (error: unknown): Error => {
    const message = errorMessage(error);
    setSnapshot(
      snapshot.data,
      true,
      false,
      message.startsWith("Falha ao ler a abertura do caixa:")
        ? message
        : `Falha ao ler a abertura do caixa: ${message}`,
    );
    return new Error(message);
  };

  const reload = async (): Promise<void> => {
    if (snapshot.busy || notifying) return;
    setBusy(true);
    try {
      const data = await readDisk();
      setSnapshot(data, true, false, "");
    } catch (error) {
      throw publishReadError(error);
    }
  };

  const open = async (review: ShiftOpeningReview): Promise<ShiftOpening> => {
    if (snapshot.busy) {
      throw new Error("Já existe uma operação de abertura em andamento.");
    }

    const baseline = cloneStorageData(snapshot.data);
    const baselineReady = snapshot.ready;
    const baselineError = snapshot.loadError;
    setBusy(true);

    let diskData: ShiftOpeningData;
    try {
      diskData = await readDisk();
    } catch (error) {
      throw publishReadError(error);
    }

    if (!dataEqual(diskData, baseline)) {
      setSnapshot(diskData, true, false, "");
      throw new Error(
        "Conflito: a abertura no armazenamento mudou; releia e confirme novamente.",
      );
    }

    let normalizedReview: ShiftOpeningReview;
    try {
      normalizedReview = validateShiftOpeningReview(review);
    } catch (error) {
      setSnapshot(baseline, baselineReady, false, baselineError);
      throw new Error(`Revisão de abertura inválida: ${errorMessage(error)}`);
    }

    let nextData: ShiftOpeningData;
    try {
      const now = options.now?.() ?? new Date();
      const id = options.id?.() ?? makeDefaultId();
      nextData = applyShiftOpening(diskData, normalizedReview, now, id);
    } catch (error) {
      setSnapshot(baseline, baselineReady, false, baselineError);
      throw new Error(`Não foi possível abrir o caixa: ${errorMessage(error)}`);
    }

    try {
      await storage.write(JSON.stringify(nextData));
    } catch (error) {
      setSnapshot(baseline, baselineReady, false, baselineError);
      throw new Error(
        `Falha ao gravar a abertura do caixa: ${errorMessage(error)}`,
      );
    }

    setSnapshot(nextData, true, false, "");
    if (nextData.opening === null) {
      throw new Error("Abertura gravada sem registro de abertura.");
    }
    return {
      ...nextData.opening,
      shift: { ...nextData.opening.shift },
      holidayNames: [...nextData.opening.holidayNames],
    };
  };

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reload,
    open,
  };
}
