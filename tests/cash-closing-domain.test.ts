import { describe, expect, it } from "vitest";
import {
  CashClosingDomainError,
  compareCashClosing,
  validateCashClosingDraft,
  validateCashClosingInput,
  type CashClosingCounts,
  type CashClosingDraft,
} from "../lib/business/cash-closing-domain";
import type { CashMovementSummary } from "../lib/business/cash-movement-domain";

const zero: CashClosingCounts = {
  dinheiro: 0,
  pix: 0,
  debito: 0,
  credito: 0,
};
const summary: CashMovementSummary = {
  cashExpected: 100,
  openingFloat: 100,
  receiptsByMethod: { ...zero },
  sales: 0,
  previousReceipts: 0,
  supplies: 0,
  withdrawals: 0,
  count: 0,
};
const draft: CashClosingDraft = {
  countedByMethod: { ...zero, dinheiro: 100 },
  varianceReason: "",
};
const fullInput = {
  ...draft,
  intentId: "123e4567-e89b-42d3-a456-426614174000",
  expectedRevision: 4,
  expectedActorId: 30,
  openingId: 80,
  operationDate: "2026-11-13",
  shiftId: "turno-1" as const,
};

function expectDomainError(operation: () => unknown) {
  expect(operation).toThrow(CashClosingDomainError);
}

describe("domínio puro do fechamento central", () => {
  it("aceita zero explícito e exige exatamente os quatro meios", () => {
    expect(validateCashClosingDraft(draft)).toEqual(draft);
    expectDomainError(() =>
      validateCashClosingDraft({
        ...draft,
        countedByMethod: { dinheiro: 0, pix: 0, debito: 0 },
      }),
    );
    expectDomainError(() =>
      validateCashClosingDraft({
        ...draft,
        countedByMethod: { ...zero, dinheiro: 0, vale: 0 },
      }),
    );
    expectDomainError(() =>
      validateCashClosingDraft({ ...draft, extra: true }),
    );
  });

  it("rejeita contagem ausente, negativa, fracionária ou acima da precisão segura", () => {
    for (const value of [undefined, -1, 1.25, Number.MAX_SAFE_INTEGER + 1]) {
      expectDomainError(() =>
        validateCashClosingDraft({
          countedByMethod: { ...zero, dinheiro: value },
          varianceReason: "",
        }),
      );
    }
  });

  it("normaliza UUID e justificativa, e rejeita input extra ou data/turno incompatível", () => {
    expect(
      validateCashClosingInput({
        ...fullInput,
        intentId: fullInput.intentId.toUpperCase(),
        varianceReason: "  divergência verificada  ",
      }),
    ).toMatchObject({
      intentId: fullInput.intentId,
      varianceReason: "divergência verificada",
    });
    expectDomainError(() =>
      validateCashClosingInput({ ...fullInput, confirmer: "Nome do cliente" }),
    );
    expectDomainError(() =>
      validateCashClosingInput({ ...fullInput, operationDate: "2026-02-30" }),
    );
    expectDomainError(() =>
      validateCashClosingInput({ ...fullInput, shiftId: "invalid" as never }),
    );
  });

  it("compara os quatro meios independentemente e produz snapshot completo", () => {
    const allMethods: CashMovementSummary = {
      ...summary,
      cashExpected: 1_150,
      openingFloat: 500,
      receiptsByMethod: {
        dinheiro: 400,
        pix: 200,
        debito: 300,
        credito: 250,
      },
      supplies: 300,
      withdrawals: 50,
      sales: 1_000,
      previousReceipts: 150,
      count: 9,
    };
    const result = compareCashClosing(
      allMethods,
      { dinheiro: 1_150, pix: 180, debito: 310, credito: 250 },
      "  diferença Pix e débito  ",
    );
    expect(result).toEqual({
      totals: {
        expectedByMethod: {
          dinheiro: 1_150,
          pix: 200,
          debito: 300,
          credito: 250,
        },
        countedByMethod: {
          dinheiro: 1_150,
          pix: 180,
          debito: 310,
          credito: 250,
        },
        differenceByMethod: {
          dinheiro: 0,
          pix: -20,
          debito: 10,
          credito: 0,
        },
        openingFloat: 500,
        sales: 1_000,
        previousReceipts: 150,
        supplies: 300,
        withdrawals: 50,
        movementCount: 9,
      },
      status: "diferenca-pendente",
    });
  });

  it("exige justificativa entre 3–500 caracteres somente quando existe diferença", () => {
    expect(
      compareCashClosing(summary, { ...zero, dinheiro: 100 }, "").status,
    ).toBe("fechado");
    for (const varianceReason of ["", "  ", "ab"]) {
      expectDomainError(() =>
        compareCashClosing(summary, { ...zero, dinheiro: 101 }, varianceReason),
      );
    }
    expect(
      compareCashClosing(summary, { ...zero, dinheiro: 101 }, "x".repeat(500))
        .status,
    ).toBe("diferenca-pendente");
    expectDomainError(() =>
      compareCashClosing(summary, { ...zero, dinheiro: 101 }, "x".repeat(501)),
    );
    expectDomainError(() =>
      compareCashClosing(summary, { ...zero, dinheiro: 100 }, "não\npermitido"),
    );
  });

  it("usa diferença signed BigInt exata no limite seguro sem somar meios", () => {
    const max = Number.MAX_SAFE_INTEGER;
    const atPositiveLimit = compareCashClosing(
      { ...summary, cashExpected: 0, openingFloat: 0 },
      { ...zero, dinheiro: max },
      "diferença positiva",
    );
    expect(atPositiveLimit.totals.differenceByMethod.dinheiro).toBe(max);
    const atNegativeLimit = compareCashClosing(
      { ...summary, cashExpected: max, openingFloat: max },
      { ...zero, dinheiro: 0 },
      "diferença negativa",
    );
    expect(atNegativeLimit.totals.differenceByMethod.dinheiro).toBe(-max);
    expect(
      compareCashClosing(
        { ...summary, cashExpected: max, openingFloat: max },
        { ...zero, dinheiro: max },
        "",
      ).totals.differenceByMethod.dinheiro,
    ).toBe(0);
  });
});
