import { describe, expect, it } from "vitest";
import {
  CashMovementDomainError,
  projectCashMovementSummary,
  validateCashMovementDraft,
  validateCashMovementInput,
  type CashMovementDraft,
  type CashMovementSummary,
} from "../lib/business/cash-movement-domain";

const summary: CashMovementSummary = {
  cashExpected: 1000,
  openingFloat: 500,
  receiptsByMethod: { dinheiro: 700, pix: 100, debito: 200, credito: 0 },
  sales: 900,
  previousReceipts: 100,
  supplies: 50,
  withdrawals: 250,
  count: 5,
};
const receipt: CashMovementDraft = {
  type: "recebimento",
  paymentMethod: "dinheiro",
  receiptNature: "venda",
  amount: 25,
  description: "Venda no balcão",
  reference: "",
  counterparty: "",
};

describe("domínio puro dos movimentos centralizados", () => {
  it("normaliza espaços e mantém somente os campos de draft do contrato", () => {
    expect(
      validateCashMovementDraft({
        ...receipt,
        description: "  Venda do turno  ",
      }),
    ).toEqual({
      ...receipt,
      description: "Venda do turno",
    });
  });

  it("exige referência documental/eletrônica e valida natureza e campos de custódia", () => {
    expect(() =>
      validateCashMovementDraft({
        ...receipt,
        paymentMethod: "pix",
        reference: "",
      }),
    ).toThrow(/referência/i);
    expect(() =>
      validateCashMovementDraft({ ...receipt, receiptNature: null }),
    ).toThrow(/recebimento/i);
    expect(() =>
      validateCashMovementDraft({
        ...receipt,
        type: "sangria",
        paymentMethod: "pix",
        receiptNature: null,
        counterparty: "Fornecedor",
      }),
    ).toThrow(/dinheiro físico/i);
    expect(() =>
      validateCashMovementDraft({
        ...receipt,
        type: "suprimento",
        paymentMethod: "dinheiro",
        receiptNature: null,
        counterparty: "  ",
      }),
    ).toThrow(/origem ou destino/i);
    expect(() =>
      validateCashMovementDraft({ ...receipt, reference: "NSU\n123" }),
    ).toThrow(/Referência/i);
  });

  it("rejeita zero, centavos não inteiros, campos inesperados e dados de cartão não previstos", () => {
    expect(() => validateCashMovementDraft({ ...receipt, amount: 0 })).toThrow(
      CashMovementDomainError,
    );
    expect(() =>
      validateCashMovementDraft({ ...receipt, amount: 1.25 }),
    ).toThrow(/inteiros seguros/i);
    expect(() =>
      validateCashMovementDraft({ ...receipt, pan: "4111111111111111" }),
    ).toThrow(/campos ausentes ou inesperados/i);
  });

  it("projeta venda, recebimento eletrônico, suprimento e sangria com BigInt", () => {
    expect(projectCashMovementSummary(summary, receipt)).toEqual({
      ...summary,
      cashExpected: 1025,
      receiptsByMethod: { ...summary.receiptsByMethod, dinheiro: 725 },
      sales: 925,
      count: 6,
    });
    expect(
      projectCashMovementSummary(summary, {
        ...receipt,
        paymentMethod: "pix",
        reference: "NSU 99",
        amount: 30,
      }),
    ).toMatchObject({
      cashExpected: 1000,
      receiptsByMethod: { pix: 130 },
      sales: 930,
      count: 6,
    });
    expect(
      projectCashMovementSummary(summary, {
        ...receipt,
        type: "suprimento",
        paymentMethod: "dinheiro",
        receiptNature: null,
        counterparty: "Banco",
        amount: 50,
      }),
    ).toMatchObject({ cashExpected: 1050, supplies: 100, count: 6 });
    expect(
      projectCashMovementSummary(summary, {
        ...receipt,
        type: "sangria",
        paymentMethod: "dinheiro",
        receiptNature: null,
        counterparty: "Cofre",
        amount: 200,
      }),
    ).toMatchObject({ cashExpected: 800, withdrawals: 450, count: 6 });
  });

  it("bloqueia sangria indisponível e overflow de todos os totais prospectivos", () => {
    expect(() =>
      projectCashMovementSummary(summary, {
        ...receipt,
        type: "sangria",
        paymentMethod: "dinheiro",
        receiptNature: null,
        counterparty: "Cofre",
        amount: 1001,
      }),
    ).toThrow(/sangria/i);
    const nearMax = {
      ...summary,
      cashExpected: Number.MAX_SAFE_INTEGER,
      receiptsByMethod: {
        ...summary.receiptsByMethod,
        dinheiro: Number.MAX_SAFE_INTEGER,
      },
    };
    expect(() => projectCashMovementSummary(nearMax, receipt)).toThrow(
      /limite seguro/i,
    );
  });

  it("valida envelope UUID/revisão/abertura/data/turno em modo estrito", () => {
    const input = {
      ...receipt,
      intentId: "123e4567-e89b-42d3-a456-426614174000",
      expectedRevision: 7,
      expectedActorId: 31,
      openingId: 20,
      operationDate: "2026-11-13",
      shiftId: "turno-1" as const,
    };
    expect(validateCashMovementInput(input)).toEqual(input);
    expect(() =>
      validateCashMovementInput({ ...input, intentId: "not-uuid" }),
    ).toThrow(/UUID/i);
    expect(() =>
      validateCashMovementInput({
        ...input,
        openingId: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow(/abertura/i);
    expect(() =>
      validateCashMovementInput({ ...input, expectedActorId: 0 }),
    ).toThrow(/identidade/i);
    expect(() =>
      validateCashMovementInput({ ...input, operationDate: "2026-02-30" }),
    ).toThrow(/Data operacional/i);
    expect(() =>
      validateCashMovementInput({ ...input, shiftId: "turno-3" as never }),
    ).toThrow(/turno inválido/i);
    expect(() => validateCashMovementInput({ ...input, ownerId: 2 })).toThrow(
      /campos ausentes ou inesperados/i,
    );
  });
});
