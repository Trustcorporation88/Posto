import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { CashClosingState } from "../lib/business/cash-closing-domain";
import {
  buildCashClosingReview,
  cashClosingCanRecover,
  cashClosingDraftFromForm,
  cashClosingFormBelongsToOpening,
  cashClosingReviewMatchesActor,
  cashClosingReviewMatchesState,
  emptyCashClosingForm,
} from "../lib/business/cash-closing-ui";

const shift = {
  id: "turno-1" as const,
  label: "Turno 1",
  start: "06:00",
  end: "14:00",
};

const state: CashClosingState = {
  revision: 18,
  serverNow: "2026-11-14T04:00:00.000Z",
  operationDate: "2026-11-14",
  scheduledShift: null,
  activeOpening: {
    id: 23,
    registerId: 4,
    operatorId: 11,
    operator: "Operador da abertura",
    openingFloat: 10_000,
    operationDate: "2026-11-13",
    shift,
    openedAt: "2026-11-13T09:00:00.000Z",
  },
  summary: {
    cashExpected: 15_000,
    openingFloat: 10_000,
    receiptsByMethod: {
      dinheiro: 5_000,
      pix: 1_000,
      debito: 500,
      credito: 250,
    },
    sales: 6_750,
    previousReceipts: 0,
    supplies: 0,
    withdrawals: 0,
    count: 4,
  },
  latestClosing: null,
};

const intentId = "9a0e7a7f-8415-4b32-b94f-a31fe4e17479";
const baseForm = {
  countedText: {
    dinheiro: "160,00",
    pix: "8,00",
    debito: "6,00",
    credito: "2,50",
  },
  varianceReason: "Diferenças identificadas na conferência",
};

function review(
  overrides: Partial<Parameters<typeof buildCashClosingReview>[0]> = {},
) {
  return buildCashClosingReview({
    form: baseForm,
    state,
    intentId,
    unitName: "Unidade Bauru",
    registerName: "Caixa principal",
    actorId: 18,
    actorName: "Caixa autenticada",
    ...overrides,
  });
}

describe("viewmodel de fechamento do caixa central", () => {
  it("inicia as quatro contagens e a justificativa em branco", () => {
    expect(emptyCashClosingForm()).toEqual({
      countedText: { dinheiro: "", pix: "", debito: "", credito: "" },
      varianceReason: "",
    });
  });

  it("aceita zero explícito em todos os meios e preserva centavos exatos", () => {
    const parsed = cashClosingDraftFromForm({
      countedText: {
        dinheiro: "0,00",
        pix: "1.234,56",
        debito: "0",
        credito: "2,01",
      },
      varianceReason: "",
    });
    expect(parsed.countedByMethod).toEqual({
      dinheiro: 0,
      pix: 123_456,
      debito: 0,
      credito: 201,
    });
  });

  it("não aceita nenhum campo monetário em branco e bloqueia valores fora da precisão segura", () => {
    for (const method of ["dinheiro", "pix", "debito", "credito"] as const) {
      const incomplete = {
        countedText: { ...baseForm.countedText, [method]: "" },
        varianceReason: baseForm.varianceReason,
      };
      expect(() => cashClosingDraftFromForm(incomplete)).toThrow(
        "Informe a contagem",
      );
    }
    expect(() =>
      cashClosingDraftFromForm({
        countedText: {
          dinheiro: "999999999999999999,99",
          pix: "0",
          debito: "0",
          credito: "0",
        },
        varianceReason: "",
      }),
    ).toThrow(/limite seguro|válido/i);
  });

  it("compara dinheiro físico incluindo o fundo e diferenças positivas e negativas por meio", () => {
    const result = review();
    expect(result.totals.openingFloat).toBe(10_000);
    expect(result.totals.expectedByMethod).toEqual({
      dinheiro: 15_000,
      pix: 1_000,
      debito: 500,
      credito: 250,
    });
    expect(result.totals.countedByMethod).toEqual({
      dinheiro: 16_000,
      pix: 800,
      debito: 600,
      credito: 250,
    });
    expect(result.totals.differenceByMethod).toEqual({
      dinheiro: 1_000,
      pix: -200,
      debito: 100,
      credito: 0,
    });
    expect(result.status).toBe("diferenca-pendente");
    expect(result.summary.openingFloat).toBe(10_000);
    expect(result.summary.cashExpected).toBe(15_000);
  });

  it("exige justificativa manual de 3 a 500 caracteres quando existe diferença", () => {
    expect(() => review({ form: { ...baseForm, varianceReason: "" } })).toThrow(
      /justificativa/i,
    );
    expect(() =>
      review({ form: { ...baseForm, varianceReason: "no" } }),
    ).toThrow(/3 a 500/i);
    expect(() =>
      review({ form: { ...baseForm, varianceReason: "x".repeat(501) } }),
    ).toThrow(/500/i);
    expect(() =>
      review({ form: { ...baseForm, varianceReason: "caixa\nquebrado" } }),
    ).toThrow(/inválid/i);
  });

  it("permite justificativa vazia quando todos os valores coincidem", () => {
    const exactForm = {
      countedText: {
        dinheiro: "150,00",
        pix: "10,00",
        debito: "5,00",
        credito: "2,50",
      },
      varianceReason: "",
    };
    expect(review({ form: exactForm })).toMatchObject({
      status: "fechado",
      totals: {
        differenceByMethod: {
          dinheiro: 0,
          pix: 0,
          debito: 0,
          credito: 0,
        },
      },
    });
  });

  it("congela ator, revisão e data/turno originais mesmo quando o servidor avançou de data", () => {
    const result = review();
    expect(result.payload).toMatchObject({
      intentId,
      expectedRevision: 18,
      expectedActorId: 18,
      openingId: 23,
      operationDate: "2026-11-13",
      shiftId: "turno-1",
      countedByMethod: {
        dinheiro: 16_000,
        pix: 800,
        debito: 600,
        credito: 250,
      },
    });
    expect(result.opening.openedAt).toBe("2026-11-13T09:00:00.000Z");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.payload)).toBe(true);
    expect(Object.isFrozen(result.payload.countedByMethod)).toBe(true);
    expect(result.payload.operationDate).not.toBe(state.operationDate);
  });

  it("bloqueia troca de ator/nome e revisão/abertura desatualizadas", () => {
    const result = review();
    expect(cashClosingReviewMatchesActor(result, 18, "Caixa autenticada")).toBe(
      true,
    );
    expect(cashClosingReviewMatchesActor(result, 19, "Caixa autenticada")).toBe(
      false,
    );
    expect(cashClosingReviewMatchesActor(result, 18, "Outra conta")).toBe(
      false,
    );
    expect(cashClosingReviewMatchesState(result, state)).toBe(true);
    expect(
      cashClosingReviewMatchesState(result, { ...state, revision: 19 }),
    ).toBe(false);
    expect(
      cashClosingReviewMatchesState(result, {
        ...state,
        activeOpening: { ...state.activeOpening!, id: 24 },
      }),
    ).toBe(false);
    expect(
      cashClosingReviewMatchesState(result, {
        ...state,
        activeOpening: null,
      } as CashClosingState),
    ).toBe(false);
  });

  it("permite recuperar a mesma intenção mesmo com o caixa fechado ou outra abertura ativa", () => {
    const captured = review();
    const closedState = { ...state, revision: 19, activeOpening: null };
    const newerOpeningState = {
      ...state,
      revision: 20,
      activeOpening: { ...state.activeOpening!, id: 24 },
    };

    expect(cashClosingReviewMatchesState(captured, closedState)).toBe(false);
    expect(cashClosingReviewMatchesState(captured, newerOpeningState)).toBe(
      false,
    );
    for (const currentSnapshot of [closedState, newerOpeningState]) {
      expect(currentSnapshot.activeOpening?.id).not.toBe(
        captured.payload.openingId,
      );
      expect(
        cashClosingCanRecover(
          captured,
          18,
          "Caixa autenticada",
          true,
          true,
          true,
        ),
      ).toBe(true);
    }
    expect(
      cashClosingCanRecover(
        captured,
        19,
        "Caixa autenticada",
        true,
        true,
        true,
      ),
    ).toBe(false);
    expect(
      cashClosingCanRecover(
        captured,
        18,
        "Caixa autenticada",
        false,
        true,
        true,
      ),
    ).toBe(false);
    expect(
      cashClosingCanRecover(
        captured,
        18,
        "Caixa autenticada",
        true,
        false,
        true,
      ),
    ).toBe(false);
    expect(
      cashClosingCanRecover(
        captured,
        18,
        "Caixa autenticada",
        true,
        true,
        false,
      ),
    ).toBe(false);
  });

  it("não associa as contagens preservadas a uma abertura diferente", () => {
    expect(cashClosingFormBelongsToOpening(23, 23)).toBe(true);
    expect(cashClosingFormBelongsToOpening(23, 24)).toBe(false);
    expect(cashClosingFormBelongsToOpening(23, null)).toBe(false);
    expect(cashClosingFormBelongsToOpening(null, 24)).toBe(false);
  });

  it("monta o painel estável fora da condição da abertura e sem key por abertura", () => {
    const source = readFileSync(
      new URL("../components/sobra/gestao/cash-module.tsx", import.meta.url),
      "utf8",
    );
    const openingBranchStart = source.indexOf("{activeOpening && !review ? (");
    const openingBranchEnd = source.indexOf(") : null}", openingBranchStart);
    const panelStart = source.indexOf("<CashClosingPanel");
    const panelEnd = source.indexOf("/>", panelStart);
    const panelElement = source.slice(panelStart, panelEnd);

    expect(openingBranchStart).toBeGreaterThanOrEqual(0);
    expect(openingBranchEnd).toBeGreaterThan(openingBranchStart);
    expect(panelStart).toBeGreaterThan(openingBranchEnd);
    expect(panelElement).not.toMatch(/\bkey\s*=/);
  });

  it("mantém o payload capturado imutável depois de mudanças nos valores de origem", () => {
    const form = {
      countedText: { ...baseForm.countedText },
      varianceReason: baseForm.varianceReason,
    };
    const captured = review({ form });
    form.countedText.dinheiro = "999,99";
    form.varianceReason = "alterado depois da revisão";
    expect(captured.payload.countedByMethod.dinheiro).toBe(16_000);
    expect(captured.payload.varianceReason).toBe(
      "Diferenças identificadas na conferência",
    );
  });
});
