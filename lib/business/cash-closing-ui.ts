import {
  compareCashClosing,
  validateCashClosingDraft,
  type CashCloseInput,
  type CashClosingCounts,
  type CashClosingDraft,
  type CashClosingState,
} from "./cash-closing-domain";
import type { CashOpening } from "./cash-domain";
import type { CashMovementSummary } from "./cash-movement-domain";
import type { ShiftClosureTotals } from "../station-register";
import { moneyToCents } from "./fuel-domain";

export const CASH_CLOSING_METHODS = [
  "dinheiro",
  "pix",
  "debito",
  "credito",
] as const satisfies readonly (keyof CashClosingCounts)[];

export const CASH_CLOSING_METHOD_LABELS: Record<
  keyof CashClosingCounts,
  string
> = {
  dinheiro: "Dinheiro físico contado (inclui o fundo)",
  pix: "Pix bruto dos relatórios",
  debito: "Débito bruto dos relatórios",
  credito: "Crédito bruto dos relatórios",
};

export type CashClosingFormValues = {
  countedText: Record<keyof CashClosingCounts, string>;
  varianceReason: string;
};

export type CashClosingReview = Readonly<{
  payload: Readonly<CashCloseInput>;
  opening: Readonly<CashOpening>;
  summary: Readonly<CashMovementSummary>;
  totals: Readonly<ShiftClosureTotals>;
  status: "fechado" | "diferenca-pendente";
  unitName: string;
  registerName: string;
  openingOperatorId: number;
  openingOperatorName: string;
  closingActorId: number;
  closingActorName: string;
  shiftLabel: string;
  shiftStart: string;
  shiftEnd: string;
}>;

export function emptyCashClosingForm(): CashClosingFormValues {
  return {
    countedText: {
      dinheiro: "",
      pix: "",
      debito: "",
      credito: "",
    },
    varianceReason: "",
  };
}

export function cashClosingDraftFromForm(
  values: CashClosingFormValues,
): CashClosingDraft {
  const countedByMethod = {} as CashClosingCounts;
  for (const method of CASH_CLOSING_METHODS) {
    const text = values.countedText[method];
    if (!text.trim()) {
      throw new Error(
        `Informe a contagem de ${CASH_CLOSING_METHOD_LABELS[method]}. Use zero explicitamente quando não houver valor.`,
      );
    }
    const amount = moneyToCents(text, true);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error(
        `A contagem de ${CASH_CLOSING_METHOD_LABELS[method]} deve ser um valor não negativo em centavos seguros.`,
      );
    }
    countedByMethod[method] = amount;
  }
  return validateCashClosingDraft({
    countedByMethod,
    varianceReason: values.varianceReason,
  });
}

function freezeSummary(
  summary: CashMovementSummary,
): Readonly<CashMovementSummary> {
  return Object.freeze({
    ...summary,
    receiptsByMethod: Object.freeze({ ...summary.receiptsByMethod }),
  });
}

function freezeTotals(
  totals: ShiftClosureTotals,
): Readonly<ShiftClosureTotals> {
  return Object.freeze({
    ...totals,
    expectedByMethod: Object.freeze({ ...totals.expectedByMethod }),
    countedByMethod: Object.freeze({ ...totals.countedByMethod }),
    differenceByMethod: Object.freeze({ ...totals.differenceByMethod }),
  });
}

function freezeOpening(opening: CashOpening): Readonly<CashOpening> {
  return Object.freeze({
    ...opening,
    shift: Object.freeze({ ...opening.shift }),
  });
}

/**
 * Capture a single, immutable close review from the full server snapshot. The
 * operation date and shift always come from the opening being closed, never
 * from today's server calendar or its currently scheduled shift.
 */
export function buildCashClosingReview(input: {
  form: CashClosingFormValues;
  state: CashClosingState;
  intentId: string;
  unitName: string;
  registerName: string;
  actorId: number;
  actorName: string;
}): CashClosingReview {
  const opening = input.state.activeOpening;
  const summary = input.state.summary;
  if (!opening || !summary) {
    throw new Error(
      "A abertura ativa e o resumo completo ainda não foram recebidos do servidor.",
    );
  }
  if (!Number.isSafeInteger(input.state.revision) || input.state.revision < 0) {
    throw new Error("A revisão global do caixa está indisponível.");
  }
  if (!Number.isSafeInteger(input.actorId) || input.actorId <= 0) {
    throw new Error("A identidade da sessão autenticada está indisponível.");
  }
  const actorName = input.actorName.trim();
  if (!actorName) {
    throw new Error("O nome da sessão autenticada está indisponível.");
  }

  const draft = cashClosingDraftFromForm(input.form);
  const comparison = compareCashClosing(
    summary,
    draft.countedByMethod,
    draft.varianceReason,
  );
  const frozenDraft = Object.freeze({
    ...draft,
    countedByMethod: Object.freeze({ ...draft.countedByMethod }),
  });
  const payload = Object.freeze({
    ...frozenDraft,
    intentId: input.intentId,
    expectedRevision: input.state.revision,
    expectedActorId: input.actorId,
    openingId: opening.id,
    operationDate: opening.operationDate,
    shiftId: opening.shift.id,
  }) satisfies Readonly<CashCloseInput>;
  const frozenOpening = freezeOpening(opening);

  return Object.freeze({
    payload,
    opening: frozenOpening,
    summary: freezeSummary(summary),
    totals: freezeTotals(comparison.totals),
    status: comparison.status,
    unitName: input.unitName,
    registerName: input.registerName,
    openingOperatorId: opening.operatorId,
    openingOperatorName: opening.operator,
    closingActorId: input.actorId,
    closingActorName: actorName,
    shiftLabel: opening.shift.label,
    shiftStart: opening.shift.start,
    shiftEnd: opening.shift.end,
  });
}

export function cashClosingReviewMatchesActor(
  review: CashClosingReview,
  actorId: number,
  actorName: string,
): boolean {
  return (
    Number.isSafeInteger(actorId) &&
    actorId > 0 &&
    review.payload.expectedActorId === actorId &&
    review.closingActorId === actorId &&
    review.closingActorName === actorName.trim()
  );
}

/** An uncertain intent may only be replayed by its original authenticated actor. */
export function cashClosingCanRecover(
  review: CashClosingReview,
  actorId: number,
  actorName: string,
  allowedToClose: boolean,
  csrfReady: boolean,
  screenActive: boolean,
): boolean {
  return (
    allowedToClose &&
    csrfReady &&
    screenActive &&
    cashClosingReviewMatchesActor(review, actorId, actorName)
  );
}

/** A draft belongs only to the opening where the user explicitly started it. */
export function cashClosingFormBelongsToOpening(
  formOpeningId: number | null,
  currentOpeningId: number | null,
): boolean {
  return formOpeningId !== null && formOpeningId === currentOpeningId;
}

/** Compare only immutable opening identity and global revision, not today's shift. */
export function cashClosingReviewMatchesState(
  review: CashClosingReview,
  state: CashClosingState | undefined,
): boolean {
  const opening = state?.activeOpening;
  return Boolean(
    state &&
    opening &&
    state.revision === review.payload.expectedRevision &&
    opening.id === review.payload.openingId &&
    opening.operationDate === review.payload.operationDate &&
    opening.shift.id === review.payload.shiftId &&
    opening.operatorId === review.openingOperatorId &&
    opening.operator === review.openingOperatorName,
  );
}

export function createCashClosingIntentId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    return (token === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}
