import { moneyToCents } from "./fuel-domain";
import {
  projectCashMovementSummary,
  validateCashMovementDraft,
  type CashMovementDraft,
  type CashMovementInput,
  type CashMovementSummary,
  type CashMovementType,
  type CashPaymentMethod,
  type CashReceiptNature,
  type CashTurnSnapshot,
} from "./cash-movement-domain";

export type CashMovementFormValues = {
  type: CashMovementType;
  paymentMethod: CashPaymentMethod;
  receiptNature: CashReceiptNature | null;
  amountText: string;
  description: string;
  reference: string;
  counterparty: string;
};

export type CashMovementReview = {
  payload: Readonly<CashMovementInput>;
  before: Readonly<CashMovementSummary>;
  after: Readonly<CashMovementSummary>;
  unitName: string;
  registerName: string;
  openingOperatorId: number;
  openingOperatorName: string;
  responsibleId: number;
  responsibleName: string;
  shiftLabel: string;
  shiftStart: string;
  shiftEnd: string;
};

export function emptyCashMovementForm(): CashMovementFormValues {
  return {
    type: "recebimento",
    paymentMethod: "dinheiro",
    receiptNature: null,
    amountText: "",
    description: "",
    reference: "",
    counterparty: "",
  };
}

/** Switching the operation also clears values that would otherwise be hidden. */
export function changeCashMovementType(
  values: CashMovementFormValues,
  type: CashMovementType,
): CashMovementFormValues {
  if (values.type === type) return values;
  return {
    ...values,
    type,
    paymentMethod: "dinheiro",
    receiptNature: null,
    counterparty: "",
  };
}

export function cashMovementDraftFromForm(
  values: CashMovementFormValues,
): CashMovementDraft {
  if (!values.amountText.trim()) {
    throw new Error("Informe o valor da movimentação.");
  }
  const candidate: CashMovementDraft = {
    type: values.type,
    paymentMethod:
      values.type === "recebimento" ? values.paymentMethod : "dinheiro",
    receiptNature: values.type === "recebimento" ? values.receiptNature : null,
    amount: moneyToCents(values.amountText),
    description: values.description,
    reference: values.reference,
    counterparty: values.counterparty,
  };
  return validateCashMovementDraft(candidate);
}

function freezeSummary(
  summary: CashMovementSummary,
): Readonly<CashMovementSummary> {
  return Object.freeze({
    ...summary,
    receiptsByMethod: Object.freeze({ ...summary.receiptsByMethod }),
  });
}

export function createCashMovementIntentId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    return (token === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export function buildCashMovementReview(input: {
  form: CashMovementFormValues;
  snapshot: CashTurnSnapshot;
  intentId: string;
  unitName: string;
  responsibleId: number;
  responsibleName: string;
}): CashMovementReview {
  const { snapshot } = input;
  const opening = snapshot.activeOpening;
  if (!opening || !snapshot.summary) {
    throw new Error(
      "A abertura e o resumo atuais ainda não foram recebidos do servidor.",
    );
  }
  if (
    !snapshot.scheduledShift ||
    snapshot.operationDate !== opening.operationDate ||
    snapshot.scheduledShift.id !== opening.shift.id ||
    !Number.isFinite(Date.parse(snapshot.serverNow)) ||
    !Number.isFinite(Date.parse(opening.openedAt)) ||
    Date.parse(snapshot.serverNow) < Date.parse(opening.openedAt)
  ) {
    throw new Error(
      "A abertura está fora do turno vigente. O histórico segue disponível, mas novos movimentos estão bloqueados.",
    );
  }
  if (!Number.isSafeInteger(input.responsibleId) || input.responsibleId <= 0) {
    throw new Error(
      "A identidade da sessão não está disponível para registrar o movimento.",
    );
  }
  const responsibleName = input.responsibleName.trim();
  if (!responsibleName) {
    throw new Error(
      "O nome autenticado do responsável não está disponível na sessão.",
    );
  }

  const draft = cashMovementDraftFromForm(input.form);
  const payload = Object.freeze({
    ...draft,
    intentId: input.intentId,
    expectedRevision: snapshot.revision,
    expectedActorId: input.responsibleId,
    openingId: opening.id,
    operationDate: opening.operationDate,
    shiftId: opening.shift.id,
  });
  const before = freezeSummary(snapshot.summary);
  const after = freezeSummary(
    projectCashMovementSummary(snapshot.summary, draft),
  );

  return Object.freeze({
    payload,
    before,
    after,
    unitName: input.unitName,
    registerName: "Caixa principal",
    openingOperatorId: opening.operatorId,
    openingOperatorName: opening.operator,
    responsibleId: input.responsibleId,
    responsibleName,
    shiftLabel: opening.shift.label,
    shiftStart: opening.shift.start,
    shiftEnd: opening.shift.end,
  });
}

export function cashMovementReviewMatchesActor(
  review: CashMovementReview,
  responsibleId: number,
  responsibleName: string,
): boolean {
  return (
    Number.isSafeInteger(responsibleId) &&
    responsibleId > 0 &&
    review.responsibleId === responsibleId &&
    review.payload.expectedActorId === responsibleId &&
    review.responsibleName === responsibleName.trim()
  );
}
