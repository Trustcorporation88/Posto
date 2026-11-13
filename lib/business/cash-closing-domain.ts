import { getScheduleForDate } from "../station-calendar";
import type { CashOpening } from "./cash-domain";
import type {
  CashMovementSummary,
  CashTurnSnapshot,
} from "./cash-movement-domain";
import type { ShiftClosureTotals } from "../station-register";

export type CashClosingCounts = Record<
  "dinheiro" | "pix" | "debito" | "credito",
  number
>;

export type CashClosingDraft = {
  countedByMethod: CashClosingCounts;
  varianceReason: string;
};

export type CashCloseInput = CashClosingDraft & {
  intentId: string;
  expectedRevision: number;
  expectedActorId: number;
  openingId: number;
  operationDate: string;
  shiftId: "turno-1" | "turno-2";
};

export type CashClosing = {
  id: number;
  openingId: number;
  registerId: number;
  opening: CashOpening;
  closedById: number;
  closedBy: string;
  closedAt: string;
  totals: ShiftClosureTotals;
  summary: CashMovementSummary;
  varianceReason: string;
  status: "fechado" | "diferenca-pendente";
  lastMovementId: number | null;
  revision: number;
};

export type CashCloseResult = {
  closing: CashClosing;
  revision: number;
  replayed: boolean;
};

export type CashClosingState = CashTurnSnapshot & {
  latestClosing: CashClosing | null;
};

export type CashClosingHistoryPage = {
  items: CashClosing[];
  nextCursor: number | null;
  totalCount: number;
  revision: number;
};

export type CashClosingDomainErrorCode =
  | "INVALID_CLOSING"
  | "INVALID_INTENT_ID"
  | "INVALID_REVISION"
  | "INVALID_ACTOR_ID"
  | "INVALID_OPENING_ID"
  | "INVALID_OPERATION_DATE"
  | "INVALID_SHIFT"
  | "INVALID_COUNTS"
  | "INVALID_VARIANCE_REASON"
  | "INVALID_SUMMARY";

export class CashClosingDomainError extends Error {
  constructor(
    readonly code: CashClosingDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CashClosingDomainError";
  }
}

const METHODS = ["dinheiro", "pix", "debito", "credito"] as const;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const DRAFT_KEYS = ["countedByMethod", "varianceReason"];
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

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: UnknownRecord, keys: string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new CashClosingDomainError(
      "INVALID_CLOSING",
      `${label}: campos ausentes ou inesperados.`,
    );
  }
}

function safeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new CashClosingDomainError(
      "INVALID_COUNTS",
      `${label} deve ser um inteiro não negativo em centavos seguros.`,
    );
  }
  return value as number;
}

function counts(value: unknown): CashClosingCounts {
  if (!isRecord(value)) {
    throw new CashClosingDomainError(
      "INVALID_COUNTS",
      "Informe os quatro valores contados por meio de pagamento.",
    );
  }
  exactKeys(value, [...METHODS], "Valores contados/conferidos");
  return Object.fromEntries(
    METHODS.map((method) => [
      method,
      safeInteger(value[method], `Contagem de ${method}`),
    ]),
  ) as CashClosingCounts;
}

function reason(value: unknown): string {
  if (typeof value !== "string" || CONTROL.test(value)) {
    throw new CashClosingDomainError(
      "INVALID_VARIANCE_REASON",
      "A justificativa contém caracteres inválidos.",
    );
  }
  const normalized = value.trim();
  if (normalized.length > 500) {
    throw new CashClosingDomainError(
      "INVALID_VARIANCE_REASON",
      "A justificativa deve ter até 500 caracteres.",
    );
  }
  return normalized;
}

/** Validate and normalize only the user-entered fields; missing means not counted, not zero. */
export function validateCashClosingDraft(input: unknown): CashClosingDraft {
  if (!isRecord(input)) {
    throw new CashClosingDomainError(
      "INVALID_CLOSING",
      "Conferência do fechamento inválida.",
    );
  }
  exactKeys(input, DRAFT_KEYS, "Conferência do fechamento");
  return {
    countedByMethod: counts(input.countedByMethod),
    varianceReason: reason(input.varianceReason),
  };
}

/** Validate the complete, frozen intent payload before starting a transaction. */
export function validateCashClosingInput(input: unknown): CashCloseInput {
  if (!isRecord(input)) {
    throw new CashClosingDomainError("INVALID_CLOSING", "Fechamento inválido.");
  }
  exactKeys(input, INPUT_KEYS, "Fechamento");
  const draft = validateCashClosingDraft({
    countedByMethod: input.countedByMethod,
    varianceReason: input.varianceReason,
  });
  if (typeof input.intentId !== "string" || !UUID.test(input.intentId)) {
    throw new CashClosingDomainError(
      "INVALID_INTENT_ID",
      "A intenção de fechamento precisa ser um UUID válido.",
    );
  }
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    (input.expectedRevision as number) < 0
  ) {
    throw new CashClosingDomainError(
      "INVALID_REVISION",
      "A revisão esperada deve ser um inteiro seguro não negativo.",
    );
  }
  if (
    !Number.isSafeInteger(input.expectedActorId) ||
    (input.expectedActorId as number) <= 0
  ) {
    throw new CashClosingDomainError(
      "INVALID_ACTOR_ID",
      "A identidade esperada da revisão é inválida.",
    );
  }
  if (
    !Number.isSafeInteger(input.openingId) ||
    (input.openingId as number) <= 0
  ) {
    throw new CashClosingDomainError(
      "INVALID_OPENING_ID",
      "A abertura revisada é inválida.",
    );
  }
  if (
    typeof input.operationDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(input.operationDate)
  ) {
    throw new CashClosingDomainError(
      "INVALID_OPERATION_DATE",
      "Informe a data operacional em formato AAAA-MM-DD.",
    );
  }
  let shifts;
  try {
    shifts = getScheduleForDate(input.operationDate).shifts;
  } catch {
    throw new CashClosingDomainError(
      "INVALID_OPERATION_DATE",
      "Data operacional inválida ou fora do calendário suportado.",
    );
  }
  if (input.shiftId !== "turno-1" && input.shiftId !== "turno-2") {
    throw new CashClosingDomainError(
      "INVALID_SHIFT",
      "Selecione um turno válido.",
    );
  }
  if (!shifts.some((shift) => shift.id === input.shiftId)) {
    throw new CashClosingDomainError(
      "INVALID_SHIFT",
      "O turno não pertence à data operacional informada.",
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

function summaryInteger(value: unknown, label: string): bigint {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new CashClosingDomainError(
      "INVALID_SUMMARY",
      `Resumo integral inválido: ${label}.`,
    );
  }
  return BigInt(value as number);
}

function checkedSigned(value: bigint, label: string): number {
  if (value > MAX_SAFE || value < -MAX_SAFE) {
    throw new CashClosingDomainError(
      "INVALID_SUMMARY",
      `A diferença de ${label} excede a precisão segura em centavos.`,
    );
  }
  return Number(value);
}

function normalizeSummary(summary: CashMovementSummary): CashMovementSummary {
  if (!isRecord(summary) || !isRecord(summary.receiptsByMethod)) {
    throw new CashClosingDomainError(
      "INVALID_SUMMARY",
      "O resumo integral do caixa está incompleto.",
    );
  }
  const receiptKeys = Object.keys(summary.receiptsByMethod).sort();
  const expectedKeys = [...METHODS].sort();
  if (
    receiptKeys.length !== expectedKeys.length ||
    receiptKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new CashClosingDomainError(
      "INVALID_SUMMARY",
      "O resumo integral não contém exatamente os quatro meios de pagamento.",
    );
  }
  return {
    cashExpected: Number(
      summaryInteger(summary.cashExpected, "dinheiro esperado"),
    ),
    openingFloat: Number(
      summaryInteger(summary.openingFloat, "fundo de abertura"),
    ),
    receiptsByMethod: Object.fromEntries(
      METHODS.map((method) => [
        method,
        Number(
          summaryInteger(
            summary.receiptsByMethod[method],
            `recebimentos ${method}`,
          ),
        ),
      ]),
    ) as CashClosingCounts,
    sales: Number(summaryInteger(summary.sales, "vendas")),
    previousReceipts: Number(
      summaryInteger(summary.previousReceipts, "recebimentos anteriores"),
    ),
    supplies: Number(summaryInteger(summary.supplies, "suprimentos")),
    withdrawals: Number(summaryInteger(summary.withdrawals, "sangrias")),
    count: Number(summaryInteger(summary.count, "quantidade de movimentos")),
  };
}

/** Compare each method independently with BigInt; no floating point or cross-method sum is used. */
export function compareCashClosing(
  summary: CashMovementSummary,
  countedByMethod: CashClosingCounts,
  varianceReason: string,
): {
  totals: ShiftClosureTotals;
  status: "fechado" | "diferenca-pendente";
} {
  const cleanSummary = normalizeSummary(summary);
  const cleanCounts = counts(countedByMethod);
  const cleanReason = reason(varianceReason);
  const expectedByMethod: CashClosingCounts = {
    dinheiro: cleanSummary.cashExpected,
    pix: cleanSummary.receiptsByMethod.pix,
    debito: cleanSummary.receiptsByMethod.debito,
    credito: cleanSummary.receiptsByMethod.credito,
  };
  const differenceByMethod = Object.fromEntries(
    METHODS.map((method) => [
      method,
      checkedSigned(
        BigInt(cleanCounts[method]) - BigInt(expectedByMethod[method]),
        method,
      ),
    ]),
  ) as CashClosingCounts;
  const differs = METHODS.some((method) => differenceByMethod[method] !== 0);
  if (differs && (cleanReason.length < 3 || cleanReason.length > 500)) {
    throw new CashClosingDomainError(
      "INVALID_VARIANCE_REASON",
      "Uma diferença exige justificativa de 3 a 500 caracteres.",
    );
  }
  return {
    totals: {
      expectedByMethod,
      countedByMethod: cleanCounts,
      differenceByMethod,
      openingFloat: cleanSummary.openingFloat,
      sales: cleanSummary.sales,
      previousReceipts: cleanSummary.previousReceipts,
      supplies: cleanSummary.supplies,
      withdrawals: cleanSummary.withdrawals,
      movementCount: cleanSummary.count,
    },
    status: differs ? "diferenca-pendente" : "fechado",
  };
}

/** Canonical normalized serialization covers every accepted input key for idempotency. */
export function cashClosingPayloadCanonical(input: CashCloseInput): string {
  return JSON.stringify({
    intentId: input.intentId.toLowerCase(),
    expectedRevision: input.expectedRevision,
    expectedActorId: input.expectedActorId,
    openingId: input.openingId,
    operationDate: input.operationDate,
    shiftId: input.shiftId,
    countedByMethod: Object.fromEntries(
      METHODS.map((method) => [method, input.countedByMethod[method]]),
    ),
    varianceReason: input.varianceReason.trim(),
  });
}

export type CashClosingOpeningSnapshot = CashOpening;
export type CashClosingSnapshotState = CashClosingState;
