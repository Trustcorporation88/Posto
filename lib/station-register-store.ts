import {
  applyStationClosure,
  applyStationMovement,
  applyStationOpening,
  createEmptyStationRegister,
  movementDataForRegister,
  stationRegisterFromLegacy,
  validateStationClosureReview,
  validateStationOpeningReview,
  validateStationRegister,
} from "./station-register";
import type {
  ShiftClosure,
  ShiftClosureReview,
  StationOpeningReview,
  StationRegisterData,
} from "./station-register";
import type { ShiftOpening } from "./shift-opening";
import type {
  ShiftMovement as MovementRecord,
  ShiftMovementReview,
} from "./shift-movements";

export type StationRegisterStorage = {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  readLegacyOpening(): Promise<string | null>;
  readLegacyMovements(): Promise<string | null>;
};
export type StationRegisterSnapshot = {
  data: StationRegisterData;
  ready: boolean;
  busy: boolean;
  loadError: string;
};
export type StationRegisterStore = {
  getSnapshot(): StationRegisterSnapshot;
  getServerSnapshot(): StationRegisterSnapshot;
  subscribe(listener: () => void): () => void;
  reload(): Promise<void>;
  open(review: StationOpeningReview): Promise<ShiftOpening>;
  record(review: ShiftMovementReview): Promise<MovementRecord>;
  close(review: ShiftClosureReview): Promise<ShiftClosure>;
};
type Options = { now?: () => Date; openingId?: () => string };
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function cloneData(input: StationRegisterData): StationRegisterData {
  return validateStationRegister(input);
}
function same(a: StationRegisterData, b: StationRegisterData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function freezeOpening(opening: ShiftOpening): void {
  Object.freeze(opening.shift);
  Object.freeze(opening.holidayNames);
  Object.freeze(opening);
}
function freezeMovement(movement: MovementRecord): void {
  Object.freeze(movement);
}
function freezeClosure(closure: ShiftClosure): void {
  freezeOpening(closure.opening);
  for (const movement of closure.movements) freezeMovement(movement);
  Object.freeze(closure.movements);
  for (const totals of [
    closure.totals.expectedByMethod,
    closure.totals.countedByMethod,
    closure.totals.differenceByMethod,
  ])
    Object.freeze(totals);
  Object.freeze(closure.totals);
  Object.freeze(closure);
}
function freezeSnapshot(
  dataInput: StationRegisterData,
  ready: boolean,
  busy: boolean,
  loadError: string,
): StationRegisterSnapshot {
  const data = cloneData(dataInput);
  if (data.opening) freezeOpening(data.opening);
  for (const movement of data.movements) freezeMovement(movement);
  Object.freeze(data.movements);
  for (const closure of data.closures) freezeClosure(closure);
  Object.freeze(data.closures);
  Object.freeze(data);
  return Object.freeze({ data, ready, busy, loadError });
}
function sameOpeningPayload(
  a: ShiftOpening | null,
  b: ShiftOpening | null,
): boolean {
  return Boolean(
    a &&
    b &&
    a.id === b.id &&
    a.operator === b.operator &&
    a.openingFloat === b.openingFloat &&
    a.operationDate === b.operationDate &&
    a.shift.id === b.shift.id &&
    a.openedAt === b.openedAt,
  );
}
function sameMovementPayload(
  a: MovementRecord,
  b: ShiftMovementReview,
): boolean {
  return (
    a.id === b.id &&
    a.openingId === b.openingId &&
    a.type === b.type &&
    a.paymentMethod === b.paymentMethod &&
    a.receiptNature === b.receiptNature &&
    a.amount === b.amount &&
    a.description === b.description &&
    a.reference === b.reference &&
    a.counterparty === b.counterparty &&
    a.responsible === b.responsible
  );
}
function sameClosurePayload(a: ShiftClosure, b: ShiftClosureReview): boolean {
  return (
    a.id === b.id &&
    a.openingId === b.openingId &&
    a.closedAt === b.closedAt &&
    a.closingOperator === b.closingOperator &&
    a.confirmer === b.confirmer &&
    a.varianceReason === b.varianceReason &&
    JSON.stringify(a.totals.countedByMethod) ===
      JSON.stringify(b.countedByMethod) &&
    JSON.stringify(a.totals.expectedByMethod) ===
      JSON.stringify(b.expectedByMethod) &&
    JSON.stringify(a.totals.differenceByMethod) ===
      JSON.stringify(b.differenceByMethod)
  );
}

export function createStationRegisterStore(
  storage: StationRegisterStorage,
  options: Options = {},
): StationRegisterStore {
  const server = freezeSnapshot(createEmptyStationRegister(), false, false, "");
  let snapshot = server;
  let locked = false;
  let notifying = false;
  const listeners = new Set<() => void>();
  const emit = () => {
    notifying = true;
    try {
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch {
          /* A subscriber cannot fail a local write. */
        }
      }
    } finally {
      notifying = false;
    }
  };
  const publish = (
    data: StationRegisterData,
    ready: boolean,
    loadError = "",
  ) => {
    snapshot = freezeSnapshot(data, ready, false, loadError);
    locked = false;
    emit();
  };
  const publishBusy = () => {
    locked = true;
    snapshot = freezeSnapshot(
      snapshot.data,
      snapshot.ready,
      true,
      snapshot.loadError,
    );
    emit();
  };
  async function readDisk(): Promise<StationRegisterData> {
    let raw: string | null;
    try {
      raw = await storage.read();
    } catch (error) {
      throw new Error(
        `Falha ao ler o registro local do posto: ${message(error)}`,
      );
    }
    if (raw !== null) {
      try {
        return validateStationRegister(JSON.parse(raw) as unknown);
      } catch (error) {
        throw new Error(
          `Registro local inválido; nada foi apagado: ${message(error)}`,
        );
      }
    }
    let openingRaw: string | null, movementsRaw: string | null;
    try {
      [openingRaw, movementsRaw] = await Promise.all([
        storage.readLegacyOpening(),
        storage.readLegacyMovements(),
      ]);
    } catch (error) {
      throw new Error(
        `Falha ao ler as versões anteriores do caixa: ${message(error)}`,
      );
    }
    return stationRegisterFromLegacy(openingRaw, movementsRaw);
  }
  function readFailure(error: unknown): Error {
    const text = message(error);
    publish(
      snapshot.data,
      true,
      text.startsWith("Falha") || text.startsWith("Registro")
        ? text
        : `Falha ao ler o registro local: ${text}`,
    );
    return new Error(text);
  }
  async function reload(): Promise<void> {
    if (locked || notifying) return;
    publishBusy();
    try {
      publish(await readDisk(), true);
    } catch (error) {
      throw readFailure(error);
    }
  }
  function ensureReady(): StationRegisterData {
    if (!snapshot.ready || snapshot.loadError)
      throw new Error("Releia o registro do caixa antes de continuar.");
    return cloneData(snapshot.data);
  }
  async function open(input: StationOpeningReview): Promise<ShiftOpening> {
    if (locked)
      throw new Error("Já existe uma operação do caixa em andamento.");
    const baseline = ensureReady();
    let review: StationOpeningReview;
    try {
      review = validateStationOpeningReview(input);
    } catch (error) {
      throw new Error(`Revisão de abertura inválida: ${message(error)}`);
    }
    publishBusy();
    let disk: StationRegisterData;
    try {
      disk = await readDisk();
    } catch (error) {
      throw readFailure(error);
    }
    if (
      disk.opening &&
      sameOpeningPayload(disk.opening, {
        ...disk.opening,
        id: review.id,
        operator: review.operator,
        openingFloat: review.openingFloat,
        operationDate: review.operationDate,
        shift: review.shift,
      })
    ) {
      publish(disk, true);
      return {
        ...disk.opening,
        shift: { ...disk.opening.shift },
        holidayNames: [...disk.opening.holidayNames],
      };
    }
    if (!same(disk, baseline)) {
      publish(disk, true);
      throw new Error(
        "O registro do caixa mudou. Releia e confirme a abertura novamente.",
      );
    }
    let next: StationRegisterData;
    try {
      next = applyStationOpening(
        disk,
        review,
        options.now?.() ?? new Date(),
        review.id,
      );
    } catch (error) {
      publish(baseline, true);
      throw error;
    }
    try {
      await storage.write(JSON.stringify(next));
    } catch (error) {
      publish(baseline, true);
      throw new Error(
        `Falha ao gravar a abertura. O registro anterior foi preservado: ${message(error)}`,
      );
    }
    publish(next, true);
    if (!next.opening) throw new Error("Abertura gravada sem registro ativo.");
    return {
      ...next.opening,
      shift: { ...next.opening.shift },
      holidayNames: [...next.opening.holidayNames],
    };
  }
  async function record(input: ShiftMovementReview): Promise<MovementRecord> {
    if (locked)
      throw new Error("Já existe uma operação do caixa em andamento.");
    const baseline = ensureReady();
    publishBusy();
    let disk: StationRegisterData;
    try {
      disk = await readDisk();
    } catch (error) {
      throw readFailure(error);
    }
    const review = input;
    const previous =
      disk.movements.find((movement) => movement.id === review.id) ??
      disk.closures
        .flatMap((closure) => closure.movements)
        .find((movement) => movement.id === review.id);
    if (previous) {
      if (sameMovementPayload(previous, review)) {
        publish(disk, true);
        return { ...previous };
      }
      publish(disk, true);
      throw new Error(
        "Identificador de movimento já registrado com dados diferentes.",
      );
    }
    if (!same(disk, baseline)) {
      publish(disk, true);
      throw new Error(
        "O registro do caixa mudou. Releia e revise o movimento novamente.",
      );
    }
    let next: StationRegisterData;
    try {
      next = applyStationMovement(disk, review, options.now?.() ?? new Date());
    } catch (error) {
      publish(baseline, true);
      throw error;
    }
    try {
      await storage.write(JSON.stringify(next));
    } catch (error) {
      publish(baseline, true);
      throw new Error(
        `Falha ao gravar movimento. O registro anterior foi preservado: ${message(error)}`,
      );
    }
    publish(next, true);
    const saved = next.movements[next.movements.length - 1];
    if (!saved) throw new Error("Movimento gravado sem registro.");
    return { ...saved };
  }
  async function close(input: ShiftClosureReview): Promise<ShiftClosure> {
    if (locked)
      throw new Error("Já existe uma operação do caixa em andamento.");
    const baseline = ensureReady();
    let review: ShiftClosureReview;
    try {
      review = validateStationClosureReview(input);
    } catch (error) {
      throw new Error(`Revisão de fechamento inválida: ${message(error)}`);
    }
    publishBusy();
    let disk: StationRegisterData;
    try {
      disk = await readDisk();
    } catch (error) {
      throw readFailure(error);
    }
    const previous = disk.closures.find((closure) => closure.id === review.id);
    if (previous) {
      if (sameClosurePayload(previous, review)) {
        publish(disk, true);
        return previous;
      }
      publish(disk, true);
      throw new Error(
        "Identificador de fechamento já registrado com dados diferentes.",
      );
    }
    if (!same(disk, baseline)) {
      publish(disk, true);
      throw new Error(
        "O registro mudou. Releia e revise a conferência antes de fechar.",
      );
    }
    let next: StationRegisterData;
    try {
      next = applyStationClosure(disk, review, options.now?.() ?? new Date());
    } catch (error) {
      publish(baseline, true);
      throw error;
    }
    try {
      await storage.write(JSON.stringify(next));
    } catch (error) {
      publish(baseline, true);
      throw new Error(
        `Falha ao gravar fechamento. O registro anterior foi preservado: ${message(error)}`,
      );
    }
    publish(next, true);
    const saved = next.closures.find((closure) => closure.id === review.id);
    if (!saved)
      throw new Error("Fechamento gravado sem registro no histórico.");
    return saved;
  }
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => server,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reload,
    open,
    record,
    close,
  };
}
