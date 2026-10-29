import {
  getScheduleForDate,
  getScheduledShift,
  getStationNow,
} from "./station-calendar";
import { validateOpeningData } from "./shift-opening";
import type { ShiftOpening, StationShift } from "./shift-opening";

export type MovementType = "recebimento" | "sangria" | "suprimento";
export type PaymentMethod = "dinheiro" | "pix" | "debito" | "credito";
export type ReceiptNature = "venda" | "conta-anterior";
export type ShiftMovementDraft = {
  type: MovementType;
  paymentMethod: PaymentMethod;
  receiptNature: ReceiptNature | null;
  amount: number;
  description: string;
  reference: string;
  counterparty: string;
  responsible: string;
};
export type ShiftMovement = ShiftMovementDraft & {
  id: string;
  openingId: string;
  recordedAt: string;
};
export type ShiftMovementData = {
  version: 1;
  revision: number;
  opening: ShiftOpening | null;
  movements: ShiftMovement[];
};
export type ShiftMovementReview = ShiftMovementDraft & {
  id: string;
  openingId: string;
  expectedRevision: number;
  operationDate: string;
  shiftId: StationShift["id"];
};
export type MovementSummary = {
  cashExpected: number;
  openingFloat: number;
  receiptsByMethod: Record<PaymentMethod, number>;
  sales: number;
  previousReceipts: number;
  supplies: number;
  withdrawals: number;
  count: number;
};

const PAYMENTS: PaymentMethod[] = ["dinheiro", "pix", "debito", "credito"];
const TYPES: MovementType[] = ["recebimento", "sangria", "suprimento"];
const REFS: ReceiptNature[] = ["venda", "conta-anterior"];
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX = Number.MAX_SAFE_INTEGER;
const DATA_KEYS = ["version", "revision", "opening", "movements"];
const DRAFT_KEYS = [
  "type",
  "paymentMethod",
  "receiptNature",
  "amount",
  "description",
  "reference",
  "counterparty",
  "responsible",
];
const MOVEMENT_KEYS = [...DRAFT_KEYS, "id", "openingId", "recordedAt"];
const REVIEW_KEYS = [
  ...DRAFT_KEYS,
  "id",
  "openingId",
  "expectedRevision",
  "operationDate",
  "shiftId",
];

function record(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
function exact(
  x: Record<string, unknown>,
  keys: string[],
  label: string,
): void {
  const a = Object.keys(x).sort(),
    e = [...keys].sort();
  if (a.length !== e.length || a.some((k, i) => k !== e[i]))
    throw new Error(`${label}: campos ausentes ou inesperados.`);
}
function text(
  x: unknown,
  min: number,
  max: number,
  label: string,
  optional = false,
): string {
  if (typeof x !== "string" || CONTROL.test(x))
    throw new Error(`${label} inválido.`);
  const s = x.trim();
  if ((optional && s.length === 0) || (s.length >= min && s.length <= max))
    return s;
  throw new Error(
    `${label} deve ter ${optional ? `até ${max}` : `${min} a ${max}`} caracteres.`,
  );
}
function idValue(x: unknown, label: string): string {
  return text(x, 1, 128, label);
}
function positiveCents(x: unknown): number {
  if (!Number.isSafeInteger(x) || (x as number) <= 0)
    throw new Error("Valor deve ser positivo, em centavos inteiros seguros.");
  return x as number;
}
function revisionValue(x: unknown): number {
  if (!Number.isSafeInteger(x) || (x as number) < 0)
    throw new Error("Revisão inválida.");
  return x as number;
}
function isoDate(x: unknown): string {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(x))
    throw new Error("Data operacional inválida.");
  getScheduleForDate(x);
  return x;
}
function openingEqual(a: ShiftOpening, b: ShiftOpening): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function validateOpening(opening: unknown): ShiftOpening {
  return validateOpeningData({ version: 1, revision: 1, opening }).opening!;
}
function normalizeDraft(input: unknown): ShiftMovementDraft {
  if (!record(input)) throw new Error("Movimentação inválida.");
  exact(input, DRAFT_KEYS, "Movimentação");
  const type = input.type;
  if (!TYPES.includes(type as MovementType))
    throw new Error("Tipo de movimentação inválido.");
  const paymentMethod = input.paymentMethod;
  if (!PAYMENTS.includes(paymentMethod as PaymentMethod))
    throw new Error("Meio de pagamento inválido.");
  let receiptNature: ReceiptNature | null;
  if (type === "recebimento") {
    if (!REFS.includes(input.receiptNature as ReceiptNature))
      throw new Error("Informe se o recebimento é venda ou conta anterior.");
    receiptNature = input.receiptNature as ReceiptNature;
  } else {
    if (input.receiptNature !== null)
      throw new Error("Sangria e suprimento não têm natureza de recebimento.");
    if (paymentMethod !== "dinheiro")
      throw new Error(
        "Sangria e suprimento são movimentações de dinheiro físico.",
      );
    receiptNature = null;
  }
  const reference = text(input.reference, 0, 120, "Referência", true);
  if (
    type === "recebimento" &&
    (paymentMethod !== "dinheiro" || receiptNature === "conta-anterior") &&
    !reference
  )
    throw new Error(
      "Informe a referência do recebimento eletrônico ou da conta anterior.",
    );
  const counterparty = text(
    input.counterparty,
    0,
    120,
    "Origem/destino",
    type === "recebimento",
  );
  if (type !== "recebimento" && counterparty.length < 3)
    throw new Error("Informe a origem ou o destino (3 a 120 caracteres).");
  return {
    type: type as MovementType,
    paymentMethod: paymentMethod as PaymentMethod,
    receiptNature,
    amount: positiveCents(input.amount),
    description: text(input.description, 3, 200, "Descrição"),
    reference,
    counterparty,
    responsible: text(input.responsible, 2, 80, "Responsável"),
  };
}
function normalizeMovement(x: unknown): ShiftMovement {
  if (!record(x)) throw new Error("Registro de movimentação inválido.");
  exact(x, MOVEMENT_KEYS, "Registro de movimentação");
  const draft = normalizeDraft(
    Object.fromEntries(DRAFT_KEYS.map((k) => [k, x[k]])),
  );
  const id = idValue(x.id, "Identificador");
  const openingId = idValue(x.openingId, "Vínculo da abertura");
  if (typeof x.recordedAt !== "string" || !ISO.test(x.recordedAt))
    throw new Error("Horário de registro inválido.");
  const date = new Date(x.recordedAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== x.recordedAt)
    throw new Error("Horário de registro inválido.");
  return { ...draft, id, openingId, recordedAt: x.recordedAt };
}
export function createEmptyMovementData(): ShiftMovementData {
  return { version: 1, revision: 0, opening: null, movements: [] };
}
export function validateMovementData(input: unknown): ShiftMovementData {
  if (!record(input)) throw new Error("Dados de movimentações inválidos.");
  exact(input, DATA_KEYS, "Dados de movimentações");
  if (input.version !== 1)
    throw new Error("Versão de movimentações incompatível.");
  const revision = revisionValue(input.revision);
  if (!Array.isArray(input.movements) || revision !== input.movements.length)
    throw new Error("Revisão incompatível com o histórico.");
  if (input.opening === null) {
    if (revision !== 0)
      throw new Error("Histórico sem vínculo de abertura inválido.");
    return createEmptyMovementData();
  }
  const opening = validateOpening(input.opening);
  const movements = input.movements.map(normalizeMovement);
  const ids = new Set<string>();
  const refs = new Set<string>();
  let last = Date.parse(opening.openedAt);
  for (const m of movements) {
    if (m.openingId !== opening.id)
      throw new Error("Movimentação vinculada a outra abertura.");
    if (ids.has(m.id))
      throw new Error("Identificador de movimentação duplicado.");
    ids.add(m.id);
    const time = Date.parse(m.recordedAt);
    const station = getStationNow(new Date(time));
    const shift = getScheduledShift(station.date, station.time);
    if (
      time < last ||
      station.date !== opening.operationDate ||
      !shift ||
      shift.id !== opening.shift.id
    )
      throw new Error("Horário de movimentação incompatível com o turno.");
    last = time;
    if (m.type === "recebimento" && m.reference) {
      const key = `${m.paymentMethod}:${m.reference.toLocaleLowerCase("pt-BR")}`;
      if (refs.has(key))
        throw new Error(
          "Referência de transação/documento duplicada no mesmo meio de pagamento.",
        );
      refs.add(key);
    }
  }
  // Dados locais também precisam manter totais exatos ao serem relidos, não
  // apenas quando o formulário cria um movimento novo.
  for (const method of PAYMENTS) {
    checkedSum(
      movements
        .filter((m) => m.type === "recebimento" && m.paymentMethod === method)
        .map((m) => m.amount),
    );
  }
  checkedSum(
    movements.filter((m) => m.type === "recebimento").map((m) => m.amount),
  );
  checkedSum(
    movements.filter((m) => m.type === "suprimento").map((m) => m.amount),
  );
  checkedSum(
    movements.filter((m) => m.type === "sangria").map((m) => m.amount),
  );
  let cash = BigInt(opening.openingFloat);
  for (const m of movements) {
    if (m.type === "recebimento" && m.paymentMethod === "dinheiro")
      cash += BigInt(m.amount);
    else if (m.type === "suprimento") cash += BigInt(m.amount);
    else if (m.type === "sangria") cash -= BigInt(m.amount);
    if (cash < 0n || cash > BigInt(MAX))
      throw new Error("Histórico produz um dinheiro esperado inválido.");
  }
  return { version: 1, revision, opening, movements };
}
function checkedSum(values: number[]): number {
  let total = 0n;
  for (const value of values) {
    total += BigInt(value);
    if (total > BigInt(MAX) || total < -BigInt(MAX))
      throw new RangeError("Total excede a precisão monetária segura.");
  }
  return Number(total);
}
export function getMovementSummary(
  openingInput: ShiftOpening,
  dataInput: ShiftMovementData,
): MovementSummary {
  const opening = validateOpening(openingInput);
  const data = validateMovementData(dataInput);
  if (!data.opening || !openingEqual(data.opening, opening))
    throw new Error("O histórico não corresponde à abertura deste turno.");
  const receipts = data.movements.filter((m) => m.type === "recebimento");
  const receiptsByMethod = Object.fromEntries(
    PAYMENTS.map((method) => [
      method,
      checkedSum(
        receipts.filter((m) => m.paymentMethod === method).map((m) => m.amount),
      ),
    ]),
  ) as Record<PaymentMethod, number>;
  const supplies = checkedSum(
    data.movements.filter((m) => m.type === "suprimento").map((m) => m.amount),
  );
  const withdrawals = checkedSum(
    data.movements.filter((m) => m.type === "sangria").map((m) => m.amount),
  );
  return {
    openingFloat: opening.openingFloat,
    receiptsByMethod,
    sales: checkedSum(
      receipts.filter((m) => m.receiptNature === "venda").map((m) => m.amount),
    ),
    previousReceipts: checkedSum(
      receipts
        .filter((m) => m.receiptNature === "conta-anterior")
        .map((m) => m.amount),
    ),
    supplies,
    withdrawals,
    cashExpected: checkedSum([
      opening.openingFloat,
      receiptsByMethod.dinheiro,
      supplies,
      -withdrawals,
    ]),
    count: data.movements.length,
  };
}
function validateWindow(opening: ShiftOpening, now: Date): void {
  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    now.getTime() < Date.parse(opening.openedAt)
  )
    throw new Error("Horário atual inválido ou anterior à abertura.");
  const station = getStationNow(now);
  const shift = getScheduledShift(station.date, station.time);
  if (
    station.date !== opening.operationDate ||
    !shift ||
    shift.id !== opening.shift.id
  )
    throw new Error(
      "O turno mudou ou terminou; não é possível registrar esta movimentação.",
    );
}
export function validateMovementReview(input: unknown): ShiftMovementReview {
  if (!record(input)) throw new Error("Revisão de movimentação inválida.");
  exact(input, REVIEW_KEYS, "Revisão de movimentação");
  const draft = normalizeDraft(
    Object.fromEntries(DRAFT_KEYS.map((k) => [k, input[k]])),
  );
  const id = idValue(input.id, "Identificador de intenção");
  const openingId = idValue(input.openingId, "Vínculo da abertura");
  const expectedRevision = revisionValue(input.expectedRevision);
  const operationDate = isoDate(input.operationDate);
  if (input.shiftId !== "turno-1" && input.shiftId !== "turno-2")
    throw new Error("Turno inválido.");
  return {
    ...draft,
    id,
    openingId,
    expectedRevision,
    operationDate,
    shiftId: input.shiftId,
  };
}
export function createMovementIntentId(): string {
  const c = globalThis.crypto?.randomUUID?.();
  return c && c.length < 129
    ? c
    : `movement-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
export function prepareShiftMovement(
  dataInput: ShiftMovementData,
  openingInput: ShiftOpening,
  draftInput: ShiftMovementDraft,
  now: Date,
  id = createMovementIntentId(),
): ShiftMovementReview {
  const data = validateMovementData(dataInput),
    opening = validateOpening(openingInput);
  if (data.opening && !openingEqual(data.opening, opening))
    throw new Error("A abertura mudou; atualize o turno.");
  if (data.opening === null && data.movements.length)
    throw new Error("Histórico sem abertura.");
  validateWindow(opening, now);
  const draft = normalizeDraft(draftInput);
  const review: ShiftMovementReview = {
    ...draft,
    id: idValue(id, "Identificador de intenção"),
    openingId: opening.id,
    expectedRevision: data.revision,
    operationDate: opening.operationDate,
    shiftId: opening.shift.id,
  };
  if (draft.type === "recebimento" && draft.reference) {
    const normalized = draft.reference.toLocaleLowerCase("pt-BR");
    if (
      data.movements.some(
        (m) =>
          m.type === "recebimento" &&
          m.paymentMethod === draft.paymentMethod &&
          m.reference.toLocaleLowerCase("pt-BR") === normalized,
      )
    )
      throw new Error(
        "Já existe um recebimento com esta referência neste meio de pagamento.",
      );
  }
  if (draft.type === "sangria") {
    const summary = getMovementSummary(
      opening,
      data.opening ? data : { ...data, opening },
    );
    if (draft.amount > summary.cashExpected)
      throw new Error(
        "A sangria não pode superar o dinheiro esperado na gaveta.",
      );
  }
  // Verifica overflow prospectivo antes da confirmação.
  const prospective = [
    ...data.movements,
    {
      ...draft,
      id: review.id,
      openingId: opening.id,
      recordedAt: now.toISOString(),
    },
  ];
  getMovementSummary(
    opening,
    validateMovementData({
      version: 1,
      revision: prospective.length,
      opening: data.opening ?? opening,
      movements: prospective,
    }),
  );
  return review;
}
export function applyShiftMovement(
  dataInput: ShiftMovementData,
  openingInput: ShiftOpening,
  reviewInput: ShiftMovementReview,
  now: Date,
): ShiftMovementData {
  const data = validateMovementData(dataInput),
    opening = validateOpening(openingInput),
    review = validateMovementReview(reviewInput);
  if (review.expectedRevision !== data.revision)
    throw new Error("O histórico mudou; revise novamente.");
  if (
    review.openingId !== opening.id ||
    review.operationDate !== opening.operationDate ||
    review.shiftId !== opening.shift.id
  )
    throw new Error("A revisão não corresponde à abertura atual.");
  validateWindow(opening, now);
  const duplicateId = data.movements.find((m) => m.id === review.id);
  if (duplicateId) {
    const {
      id: _id,
      openingId: _oid,
      expectedRevision: _r,
      operationDate: _d,
      shiftId: _s,
      ...payload
    } = review;
    const {
      id: _mid,
      openingId: _moid,
      recordedAt: _at,
      ...stored
    } = duplicateId;
    if (JSON.stringify(payload) !== JSON.stringify(stored))
      throw new Error("Identificador já utilizado com dados diferentes.");
    return data;
  }
  if (review.expectedRevision !== data.revision)
    throw new Error("O histórico mudou; revise novamente.");
  const draft: ShiftMovementDraft = Object.fromEntries(
    DRAFT_KEYS.map((k) => [k, review[k as keyof ShiftMovementDraft]]),
  ) as ShiftMovementDraft;
  const movement: ShiftMovement = {
    ...normalizeDraft(draft),
    id: review.id,
    openingId: opening.id,
    recordedAt: now.toISOString(),
  };
  if (
    data.movements.length &&
    Date.parse(movement.recordedAt) <
      Date.parse(data.movements[data.movements.length - 1]!.recordedAt)
  )
    throw new Error(
      "O relógio não pode retroceder em relação ao último registro.",
    );
  const next = validateMovementData({
    version: 1,
    revision: data.revision + 1,
    opening: data.opening ?? opening,
    movements: [...data.movements, movement],
  });
  getMovementSummary(opening, next);
  return next;
}
export { openingEqual };
