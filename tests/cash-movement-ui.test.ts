import { describe, expect, it } from "vitest";
import {
  buildCashMovementReview,
  cashMovementDraftFromForm,
  cashMovementReviewMatchesActor,
  changeCashMovementType,
  emptyCashMovementForm,
} from "../lib/business/cash-movement-ui";
import type { CashTurnSnapshot } from "../lib/business/cash-movement-domain";

const summary = {
  cashExpected: 10_000,
  openingFloat: 10_000,
  receiptsByMethod: { dinheiro: 0, pix: 0, debito: 0, credito: 0 },
  sales: 0,
  previousReceipts: 0,
  supplies: 0,
  withdrawals: 0,
  count: 0,
};
const shift = {
  id: "turno-1" as const,
  label: "Turno 1",
  start: "06:00",
  end: "14:00",
};
const snapshot: CashTurnSnapshot = {
  revision: 7,
  serverNow: "2026-11-13T15:00:00.000Z",
  operationDate: "2026-11-13",
  scheduledShift: shift,
  activeOpening: {
    id: 23,
    registerId: 1,
    operatorId: 11,
    operator: "Operador da abertura",
    openingFloat: 10_000,
    operationDate: "2026-11-13",
    shift,
    openedAt: "2026-11-13T09:00:00.000Z",
  },
  summary,
};

describe("viewmodel de movimentos do caixa central", () => {
  it("inicia com os campos monetários e textuais em branco", () => {
    const form = emptyCashMovementForm();
    expect(form.amountText).toBe("");
    expect(form.description).toBe("");
    expect(form.reference).toBe("");
    expect(form.counterparty).toBe("");
    expect(form.receiptNature).toBeNull();
  });

  it("limpa natureza, meio e contraparte incompatíveis ao alternar para custódia", () => {
    const receipt = {
      ...emptyCashMovementForm(),
      paymentMethod: "pix" as const,
      receiptNature: "conta-anterior" as const,
      counterparty: "Cliente antigo",
    };
    const custody = changeCashMovementType(receipt, "sangria");
    expect(custody).toMatchObject({
      type: "sangria",
      paymentMethod: "dinheiro",
      receiptNature: null,
      counterparty: "",
    });
  });

  it("constrói payload de custódia sem campos ocultos de recebimento", () => {
    const form = {
      ...emptyCashMovementForm(),
      type: "sangria" as const,
      paymentMethod: "credito" as const,
      receiptNature: "venda" as const,
      amountText: "12,34",
      description: "Retirada para cofre",
      counterparty: "Cofre central",
    };
    expect(cashMovementDraftFromForm(form)).toEqual({
      type: "sangria",
      paymentMethod: "dinheiro",
      receiptNature: null,
      amount: 1234,
      description: "Retirada para cofre",
      reference: "",
      counterparty: "Cofre central",
    });
  });

  it("rejeita valor em branco, zero e referência ausente em Pix", () => {
    const base = {
      ...emptyCashMovementForm(),
      description: "Venda no turno",
    };
    expect(() => cashMovementDraftFromForm(base)).toThrow("Informe o valor");
    expect(() =>
      cashMovementDraftFromForm({ ...base, amountText: "0,00" }),
    ).toThrow("positivo");
    expect(() =>
      cashMovementDraftFromForm({ ...base, amountText: "1,00" }),
    ).toThrow("Informe se o recebimento");
    expect(() =>
      cashMovementDraftFromForm({
        ...base,
        amountText: "1,00",
        paymentMethod: "pix",
        receiptNature: "venda",
      }),
    ).toThrow("referência");
  });

  it("congela revisão com responsável autenticado e projeção sobre o resumo completo", () => {
    const form = {
      ...emptyCashMovementForm(),
      receiptNature: "venda" as const,
      amountText: "25,50",
      description: "Abastecimento registrado",
    };
    const review = buildCashMovementReview({
      form,
      snapshot,
      intentId: "9a0e7a7f-8415-4b32-b94f-a31fe4e17479",
      unitName: "Unidade Bauru",
      responsibleId: 18,
      responsibleName: "Caixa da sessão",
    });
    expect(review.payload).toMatchObject({
      intentId: "9a0e7a7f-8415-4b32-b94f-a31fe4e17479",
      expectedRevision: 7,
      expectedActorId: 18,
      openingId: 23,
      operationDate: "2026-11-13",
      shiftId: "turno-1",
      amount: 2550,
    });
    expect(review.responsibleId).toBe(18);
    expect(review.responsibleName).toBe("Caixa da sessão");
    expect(review.openingOperatorName).toBe("Operador da abertura");
    expect(review.before.cashExpected).toBe(10_000);
    expect(review.after.cashExpected).toBe(12_550);
    expect(review.after.sales).toBe(2_550);
    expect(Object.isFrozen(review)).toBe(true);
    expect(Object.isFrozen(review.payload)).toBe(true);
    expect(Object.isFrozen(review.before.receiptsByMethod)).toBe(true);
    expect(snapshot.summary?.cashExpected).toBe(10_000);
  });

  it("bloqueia a revisão quando o responsável atual não é o mesmo da conferência", () => {
    const review = buildCashMovementReview({
      form: {
        ...emptyCashMovementForm(),
        receiptNature: "venda",
        amountText: "1,00",
        description: "Venda no turno",
      },
      snapshot,
      intentId: "9a0e7a7f-8415-4b32-b94f-a31fe4e17479",
      unitName: "Unidade Bauru",
      responsibleId: 18,
      responsibleName: "Caixa da sessão",
    });
    expect(cashMovementReviewMatchesActor(review, 18, "Caixa da sessão")).toBe(
      true,
    );
    expect(cashMovementReviewMatchesActor(review, 19, "Caixa da sessão")).toBe(
      false,
    );
    expect(cashMovementReviewMatchesActor(review, 18, "Outra conta")).toBe(
      false,
    );
    expect(cashMovementReviewMatchesActor(review, 0, "Caixa da sessão")).toBe(
      false,
    );
    expect(review.payload.expectedActorId).toBe(18);
  });

  it("não cria revisão para abertura de outro turno ou snapshot incompleto", () => {
    const expired: CashTurnSnapshot = {
      ...snapshot,
      scheduledShift: {
        ...shift,
        id: "turno-2",
        label: "Turno 2",
        start: "14:00",
        end: "22:00",
      },
    };
    const args = {
      form: {
        ...emptyCashMovementForm(),
        amountText: "1,00",
        description: "Venda no turno",
      },
      intentId: "9a0e7a7f-8415-4b32-b94f-a31fe4e17479",
      unitName: "Unidade Bauru",
      responsibleId: 18,
      responsibleName: "Caixa da sessão",
    };
    expect(() =>
      buildCashMovementReview({ ...args, snapshot: expired }),
    ).toThrow("fora do turno vigente");
    expect(() =>
      buildCashMovementReview({
        ...args,
        snapshot: { ...snapshot, summary: null },
      }),
    ).toThrow("resumo atuais");
  });
});
