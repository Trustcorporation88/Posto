import { validateOpeningData } from "./shift-opening";
import type { ShiftOpening } from "./shift-opening";
import {
  applyShiftMovement,
  createEmptyMovementData,
  openingEqual,
  validateMovementData,
  validateMovementReview,
} from "./shift-movements";
import type {
  ShiftMovement,
  ShiftMovementData,
  ShiftMovementReview,
} from "./shift-movements";

type Storage = {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  readOpening(): Promise<string | null>;
};
type Snapshot = {
  data: ShiftMovementData;
  opening: ShiftOpening | null;
  ready: boolean;
  busy: boolean;
  loadError: string;
};
type Options = { now?: () => Date };
type Store = {
  getSnapshot(): Snapshot;
  getServerSnapshot(): Snapshot;
  subscribe(listener: () => void): () => void;
  reload(): Promise<void>;
  record(review: ShiftMovementReview): Promise<ShiftMovement>;
};
function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
function cloneOpening(o: ShiftOpening | null): ShiftOpening | null {
  return o
    ? validateOpeningData({ version: 1, revision: 1, opening: o }).opening
    : null;
}
function freezeSnapshot(
  data: ShiftMovementData,
  opening: ShiftOpening | null,
  ready: boolean,
  busy: boolean,
  loadError: string,
): Snapshot {
  const copy = validateMovementData(data);
  if (copy.opening) {
    Object.freeze(copy.opening.shift);
    Object.freeze(copy.opening.holidayNames);
    Object.freeze(copy.opening);
  }
  for (const m of copy.movements) Object.freeze(m);
  Object.freeze(copy.movements);
  Object.freeze(copy);
  const safeOpening = cloneOpening(opening);
  if (safeOpening) {
    Object.freeze(safeOpening.shift);
    Object.freeze(safeOpening.holidayNames);
    Object.freeze(safeOpening);
  }
  return Object.freeze({
    data: copy,
    opening: safeOpening,
    ready,
    busy,
    loadError,
  });
}
function same(a: ShiftMovementData, b: ShiftMovementData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
export function createShiftMovementStore(
  storage: Storage,
  options: Options = {},
): Store {
  const server = freezeSnapshot(
    createEmptyMovementData(),
    null,
    false,
    false,
    "",
  );
  let state = server;
  let busy = false;
  const listeners = new Set<() => void>();
  let notifying = false;
  const emit = () => {
    notifying = true;
    try {
      for (const fn of [...listeners]) {
        try {
          fn();
        } catch {
          /* listeners cannot fail storage */
        }
      }
    } finally {
      notifying = false;
    }
  };
  const set = (
    data: ShiftMovementData,
    opening: ShiftOpening | null,
    ready: boolean,
    loadError: string,
  ) => {
    state = freezeSnapshot(data, opening, ready, false, loadError);
    busy = false;
    emit();
  };
  const setBusy = () => {
    busy = true;
    state = freezeSnapshot(
      state.data,
      state.opening,
      state.ready,
      true,
      state.loadError,
    );
    emit();
  };
  async function readPair(): Promise<{
    data: ShiftMovementData;
    opening: ShiftOpening | null;
  }> {
    let rawOpen: string | null, rawMoves: string | null;
    try {
      [rawOpen, rawMoves] = await Promise.all([
        storage.readOpening(),
        storage.read(),
      ]);
    } catch (e) {
      throw new Error(`Falha ao ler caixa/movimentações: ${errorText(e)}`);
    }
    let opening: ShiftOpening | null = null;
    try {
      if (rawOpen !== null)
        opening = validateOpeningData(JSON.parse(rawOpen) as unknown).opening;
      if (rawOpen !== null && !opening)
        throw new Error("Registro de abertura ausente.");
    } catch (e) {
      throw new Error(`Falha ao ler abertura: ${errorText(e)}`);
    }
    let data: ShiftMovementData;
    try {
      data =
        rawMoves === null
          ? createEmptyMovementData()
          : validateMovementData(JSON.parse(rawMoves) as unknown);
    } catch (e) {
      throw new Error(`Falha ao ler movimentações: ${errorText(e)}`);
    }
    if (
      data.movements.length &&
      (!opening || !data.opening || !openingEqual(data.opening, opening))
    )
      throw new Error(
        "O histórico local não corresponde à abertura disponível; nenhum dado foi alterado.",
      );
    if (data.opening && opening && !openingEqual(data.opening, opening))
      throw new Error(
        "A abertura mudou desde o histórico; nenhum dado foi alterado.",
      );
    return { data, opening };
  }
  function readError(e: unknown): Error {
    const msg = errorText(e);
    set(
      state.data,
      state.opening,
      true,
      msg.startsWith("Falha") ||
        msg.startsWith("O histórico") ||
        msg.startsWith("A abertura")
        ? msg
        : `Falha ao ler: ${msg}`,
    );
    return new Error(msg);
  }
  async function reload(): Promise<void> {
    if (busy || notifying) return;
    setBusy();
    try {
      const pair = await readPair();
      set(pair.data, pair.opening, true, "");
    } catch (e) {
      throw readError(e);
    }
  }
  async function record(input: ShiftMovementReview): Promise<ShiftMovement> {
    if (busy) throw new Error("Já existe uma operação em andamento.");
    if (!state.ready || state.loadError)
      throw new Error("Releia a abertura e o histórico antes de registrar.");
    if (!state.opening)
      throw new Error("Abra o caixa antes de registrar movimentações.");
    const baseline = validateMovementData(state.data),
      openingBaseline = cloneOpening(state.opening)!;
    const review = validateMovementReview(input);
    setBusy();
    let pair: { data: ShiftMovementData; opening: ShiftOpening | null };
    try {
      pair = await readPair();
    } catch (e) {
      throw readError(e);
    }
    const readOpening = pair.opening;
    if (!readOpening || !openingEqual(readOpening, openingBaseline)) {
      set(
        pair.data,
        pair.opening,
        true,
        "A abertura do caixa mudou. Revise antes de continuar.",
      );
      throw new Error("A abertura mudou; movimentação não registrada.");
    }
    const previous = pair.data.movements.find((m) => m.id === review.id);
    if (previous) {
      const fields = [
        "type",
        "paymentMethod",
        "receiptNature",
        "amount",
        "description",
        "reference",
        "counterparty",
        "responsible",
      ] as const;
      if (
        fields.every((field) => previous[field] === review[field]) &&
        previous.openingId === review.openingId
      ) {
        set(pair.data, pair.opening, true, "");
        return { ...previous };
      }
      set(pair.data, pair.opening, true, "");
      throw new Error(
        "Identificador de intenção já registrado com dados diferentes.",
      );
    }
    if (!same(pair.data, baseline)) {
      set(pair.data, pair.opening, true, "");
      throw new Error("O histórico mudou. Releia e revise esta movimentação.");
    }
    const currentOpening = pair.opening;
    if (!currentOpening) {
      set(pair.data, null, true, "");
      throw new Error("A abertura do caixa não está disponível.");
    }
    let next: ShiftMovementData;
    try {
      next = applyShiftMovement(
        pair.data,
        currentOpening,
        review,
        options.now?.() ?? new Date(),
      );
    } catch (e) {
      set(pair.data, pair.opening, true, "");
      throw e;
    }
    // Confere a abertura novamente, depois da leitura do livro, antes de gravar.
    let finalOpening: ShiftOpening | null;
    try {
      const raw = await storage.readOpening();
      finalOpening =
        raw === null
          ? null
          : validateOpeningData(JSON.parse(raw) as unknown).opening;
    } catch (e) {
      throw readError(e);
    }
    const verifiedOpening = finalOpening;
    if (!verifiedOpening || !openingEqual(verifiedOpening, openingBaseline)) {
      set(
        pair.data,
        pair.opening,
        true,
        "A abertura mudou antes da gravação; histórico preservado. Releia antes de continuar.",
      );
      throw new Error("A abertura mudou antes da gravação.");
    }
    // A leitura final pode levar tempo: revalida o relógio depois dela para
    // impedir que a operação atravesse a fronteira do turno durante a espera.
    try {
      next = applyShiftMovement(
        pair.data,
        verifiedOpening,
        review,
        options.now?.() ?? new Date(),
      );
    } catch (e) {
      set(pair.data, pair.opening, true, "");
      throw e;
    }
    try {
      await storage.write(JSON.stringify(next));
    } catch (e) {
      // A gravação pode ter sido persistida e a confirmação perdida. Mantém a tela antiga,
      // a próxima releitura identifica o ID idempotente antes de permitir repetição.
      set(baseline, openingBaseline, true, "");
      throw new Error(`Falha ao gravar movimentação: ${errorText(e)}`);
    }
    set(next, verifiedOpening, true, "");
    const saved = next.movements[next.movements.length - 1];
    if (!saved) throw new Error("Movimentação gravada sem registro.");
    return { ...saved };
  }
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => server,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    reload,
    record,
  };
}
