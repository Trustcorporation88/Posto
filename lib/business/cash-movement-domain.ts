import { getScheduleForDate } from "../station-calendar";
import type { CashPosition } from "./cash-domain";
import type { MovementSummary } from "../shift-movements";

export type CashMovementType = "recebimento" | "sangria" | "suprimento";
export type CashPaymentMethod = "dinheiro" | "pix" | "debito" | "credito";
export type CashReceiptNature = "venda" | "conta-anterior";

export type CashMovementDraft = {
  type: CashMovementType;
  paymentMethod: CashPaymentMethod;
  receiptNature: CashReceiptNature | null;
  amount: number;
  description: string;
  reference: string;
  counterparty: string;
};

export type CashMovementInput = CashMovementDraft & {
  intentId: string;
  expectedRevision: number;
  expectedActorId: number;
  openingId: number;
  operationDate: string;
  shiftId: "turno-1" | "turno-2";
};

export type CashMovement = CashMovementDraft & {
  id: number;
  registerId: number;
  openingId: number;
  responsibleId: number;
  responsible: string;
  recordedAt: string;
};

export type CashMovementSummary = MovementSummary;
export type CashTurnSnapshot = CashPosition & {
  summary: CashMovementSummary | null;
};
export type CashMovementResult = {
  movement: CashMovement;
  revision: number;
  replayed: boolean;
};
export type CashMovementHistoryPage = {
  openingId: number;
  items: CashMovement[];
  nextCursor: number | null;
  totalCount: number;
  revision: number;
};

export type CashMovementDomainErrorCode =
  | "INVALID_MOVEMENT"
  | "INVALID_INTENT_ID"
  | "INVALID_REVISION"
  | "INVALID_ACTOR_ID"
  | "INVALID_OPENING_ID"
  | "INVALID_OPERATION_DATE"
  | "INVALID_SHIFT"
  | "INVALID_AMOUNT";

export class CashMovementDomainError extends Error {
  constructor(
    readonly code: CashMovementDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CashMovementDomainError";
  }
}

const TYPES = ["recebimento", "sangria", "suprimento"] as const;
const METHODS = ["dinheiro", "pix", "debito", "credito"] as const;
const NATURES = ["venda", "conta-anterior"] as const;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const DRAFT_KEYS = [
  "type",
  "paymentMethod",
  "receiptNature",
  "amount",
  "description",
  "reference",
  "counterparty",
];
const INPUT_KEYS = [
  ...DRAFT_KEYS,
  "intentId",
  "expectedRevision",
  "expectedActorId",
  "openingId",
  "operationDate",
  "shiftId",
];

type UnknownRecord = Record<string, unknown>;
function record(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: UnknownRecord, keys: string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, i) => key !== expected[i])
  ) {
    throw new CashMovementDomainError(
      "INVALID_MOVEMENT",
      `${label}: campos ausentes ou inesperados.`,
    );
  }
}
function cleanText(
  value: unknown,
  min: number,
  max: number,
  label: string,
  optional = false,
): string {
  if (typeof value !== "string" || CONTROL.test(value)) {
    throw new CashMovementDomainError("INVALID_MOVEMENT", `${label} inválido.`);
  }
  const normalized = value.trim();
  if (
    (optional && normalized.length === 0) ||
    (normalized.length >= min && normalized.length <= max)
  ) {
    return normalized;
  }
  throw new CashMovementDomainError(
    "INVALID_MOVEMENT",
    `${label} deve ter ${optional ? `até ${max}` : `${min} a ${max}`} caracteres.`,
  );
}
function movementDraft(value: unknown): CashMovementDraft {
  if (!record(value))
    throw new CashMovementDomainError(
      "INVALID_MOVEMENT",
      "Movimentação inválida.",
    );
  exactKeys(value, DRAFT_KEYS, "Movimentação");
  if (!TYPES.includes(value.type as CashMovementType)) {
    throw new CashMovementDomainError(
      "INVALID_MOVEMENT",
      "Tipo de movimentação inválido.",
    );
  }
  if (!METHODS.includes(value.paymentMethod as CashPaymentMethod)) {
    throw new CashMovementDomainError(
      "INVALID_MOVEMENT",
      "Meio de pagamento inválido.",
    );
  }
  const type = value.type as CashMovementType;
  const paymentMethod = value.paymentMethod as CashPaymentMethod;
  let receiptNature: CashReceiptNature | null;
  if (type === "recebimento") {
    if (!NATURES.includes(value.receiptNature as CashReceiptNature)) {
      throw new CashMovementDomainError(
        "INVALID_MOVEMENT",
        "Informe se o recebimento é venda do turno ou conta anterior.",
      );
    }
    receiptNature = value.receiptNature as CashReceiptNature;
  } else {
    if (value.receiptNature !== null) {
      throw new CashMovementDomainError(
        "INVALID_MOVEMENT",
        "Sangria e suprimento não têm natureza de recebimento.",
      );
    }
    if (paymentMethod !== "dinheiro") {
      throw new CashMovementDomainError(
        "INVALID_MOVEMENT",
        "Sangria e suprimento só podem movimentar dinheiro físico.",
      );
    }
    receiptNature = null;
  }
  if (!Number.isSafeInteger(value.amount) || (value.amount as number) <= 0) {
    throw new CashMovementDomainError(
      "INVALID_AMOUNT",
      "O valor deve ser positivo, em centavos inteiros seguros.",
    );
  }
  const description = cleanText(value.description, 3, 200, "Descrição/motivo");
  const reference = cleanText(value.reference, 0, 120, "Referência", true);
  if (
    type === "recebimento" &&
    (paymentMethod !== "dinheiro" || receiptNature === "conta-anterior") &&
    !reference
  ) {
    throw new CashMovementDomainError(
      "INVALID_MOVEMENT",
      "Informe a referência documental ou da transação eletrônica.",
    );
  }
  const counterparty = cleanText(
    value.counterparty,
    0,
    120,
    "Origem/destino",
    type === "recebimento",
  );
  if (type !== "recebimento" && counterparty.length < 3) {
    throw new CashMovementDomainError(
      "INVALID_MOVEMENT",
      "Informe a origem ou destino (3 a 120 caracteres).",
    );
  }
  return {
    type,
    paymentMethod,
    receiptNature,
    amount: value.amount as number,
    description,
    reference,
    counterparty,
  };
}

/** Pure field validation shared by UI and server; rejects unknown fields and control characters. */
export function validateCashMovementDraft(input: unknown): CashMovementDraft {
  return movementDraft(input);
}

function safeSummaryInteger(value: unknown, label: string): bigint {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new CashMovementDomainError(
      "INVALID_MOVEMENT",
      `Resumo inválido: ${label}.`,
    );
  }
  return BigInt(value as number);
}
function checked(value: bigint, label: string): number {
  if (value < 0n || value > MAX) {
    throw new CashMovementDomainError(
      "INVALID_AMOUNT",
      `O total ${label} excede o limite seguro de centavos.`,
    );
  }
  return Number(value);
}

/** Project one draft on a validated, all-history summary, using BigInt for every total. */
export function projectCashMovementSummary(
  summaryInput: CashMovementSummary,
  draftInput: CashMovementDraft,
): CashMovementSummary {
  const draft = movementDraft(draftInput);
  const summary = summaryInput;
  const cashExpected = safeSummaryInteger(
    summary.cashExpected,
    "dinheiro esperado",
  );
  const openingFloat = safeSummaryInteger(
    summary.openingFloat,
    "fundo de abertura",
  );
  const sales = safeSummaryInteger(summary.sales, "vendas");
  const previousReceipts = safeSummaryInteger(
    summary.previousReceipts,
    "recebimentos anteriores",
  );
  const supplies = safeSummaryInteger(summary.supplies, "suprimentos");
  const withdrawals = safeSummaryInteger(summary.withdrawals, "sangrias");
  const count = safeSummaryInteger(summary.count, "quantidade");
  const methodTotals = {} as Record<CashPaymentMethod, bigint>;
  for (const method of METHODS) {
    methodTotals[method] = safeSummaryInteger(
      summary.receiptsByMethod?.[method],
      `recebimentos ${method}`,
    );
  }
  const allReceipts = METHODS.reduce(
    (total, method) => total + methodTotals[method],
    0n,
  );
  checked(allReceipts, "dos recebimentos");
  const amount = BigInt(draft.amount);
  let nextCash = cashExpected;
  if (draft.type === "recebimento") {
    methodTotals[draft.paymentMethod] += amount;
    if (draft.receiptNature === "venda") checked(sales + amount, "das vendas");
    else checked(previousReceipts + amount, "dos recebimentos anteriores");
    if (draft.paymentMethod === "dinheiro") nextCash += amount;
  } else if (draft.type === "suprimento") {
    nextCash += amount;
    checked(supplies + amount, "dos suprimentos");
  } else {
    if (amount > cashExpected) {
      throw new CashMovementDomainError(
        "INVALID_AMOUNT",
        "A sangria não pode superar o dinheiro esperado na gaveta.",
      );
    }
    nextCash -= amount;
    checked(withdrawals + amount, "das sangrias");
  }
  for (const method of METHODS)
    checked(methodTotals[method], `dos recebimentos ${method}`);
  checked(
    METHODS.reduce((total, method) => total + methodTotals[method], 0n),
    "dos recebimentos",
  );
  return {
    cashExpected: checked(nextCash, "esperado em dinheiro"),
    openingFloat: checked(openingFloat, "do fundo de abertura"),
    receiptsByMethod: Object.fromEntries(
      METHODS.map((method) => [
        method,
        checked(methodTotals[method], `dos recebimentos ${method}`),
      ]),
    ) as Record<CashPaymentMethod, number>,
    sales: checked(
      sales +
        (draft.type === "recebimento" && draft.receiptNature === "venda"
          ? amount
          : 0n),
      "das vendas",
    ),
    previousReceipts: checked(
      previousReceipts +
        (draft.type === "recebimento" &&
        draft.receiptNature === "conta-anterior"
          ? amount
          : 0n),
      "dos recebimentos anteriores",
    ),
    supplies: checked(
      supplies + (draft.type === "suprimento" ? amount : 0n),
      "dos suprimentos",
    ),
    withdrawals: checked(
      withdrawals + (draft.type === "sangria" ? amount : 0n),
      "das sangrias",
    ),
    count: checked(count + 1n, "de movimentos"),
  };
}

export function validateCashMovementInput(input: unknown): CashMovementInput {
  if (!record(input))
    throw new CashMovementDomainError(
      "INVALID_MOVEMENT",
      "Movimentação inválida.",
    );
  exactKeys(input, INPUT_KEYS, "Movimentação");
  const draft = movementDraft(
    Object.fromEntries(DRAFT_KEYS.map((key) => [key, input[key]])),
  );
  if (typeof input.intentId !== "string" || !UUID.test(input.intentId)) {
    throw new CashMovementDomainError(
      "INVALID_INTENT_ID",
      "A intenção precisa de um UUID válido.",
    );
  }
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    (input.expectedRevision as number) < 0
  ) {
    throw new CashMovementDomainError(
      "INVALID_REVISION",
      "A revisão esperada deve ser um inteiro seguro não negativo.",
    );
  }
  if (
    !Number.isSafeInteger(input.expectedActorId) ||
    (input.expectedActorId as number) <= 0
  ) {
    throw new CashMovementDomainError(
      "INVALID_ACTOR_ID",
      "A identidade esperada da revisão é inválida.",
    );
  }
  if (
    !Number.isSafeInteger(input.openingId) ||
    (input.openingId as number) <= 0
  ) {
    throw new CashMovementDomainError(
      "INVALID_OPENING_ID",
      "A abertura esperada é inválida.",
    );
  }
  if (
    typeof input.operationDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(input.operationDate)
  ) {
    throw new CashMovementDomainError(
      "INVALID_OPERATION_DATE",
      "Informe a data operacional válida.",
    );
  }
  let shifts;
  try {
    shifts = getScheduleForDate(input.operationDate).shifts;
  } catch {
    throw new CashMovementDomainError(
      "INVALID_OPERATION_DATE",
      "Data operacional inválida ou fora do calendário suportado.",
    );
  }
  if (input.shiftId !== "turno-1" && input.shiftId !== "turno-2") {
    throw new CashMovementDomainError("INVALID_SHIFT", "Turno inválido.");
  }
  if (!shifts.some((shift) => shift.id === input.shiftId)) {
    throw new CashMovementDomainError(
      "INVALID_SHIFT",
      "O turno não pertence à escala desta data.",
    );
  }
  return {
    ...draft,
    intentId: input.intentId.toLowerCase(),
    expectedRevision: input.expectedRevision as number,
    expectedActorId: input.expectedActorId as number,
    openingId: input.openingId as number,
    operationDate: input.operationDate,
    shiftId: input.shiftId,
  };
}

export function cashMovementPayloadCanonical(
  actorId: number,
  input: CashMovementInput,
): string {
  return JSON.stringify({
    actorId,
    input: { ...input, intentId: input.intentId.toLowerCase() },
  });
}
