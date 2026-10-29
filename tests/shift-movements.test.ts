import { describe, expect, it } from "vitest";
import {
  applyShiftOpening,
  createEmptyOpeningData,
  prepareShiftOpening,
} from "../lib/shift-opening";
import {
  applyShiftMovement,
  createEmptyMovementData,
  getMovementSummary,
  prepareShiftMovement,
  validateMovementData,
} from "../lib/shift-movements";
import type { ShiftMovementDraft } from "../lib/shift-movements";

const openAt = new Date("2026-10-28T10:00:00-03:00");
const opened = applyShiftOpening(
  createEmptyOpeningData(),
  prepareShiftOpening(createEmptyOpeningData(), "Ana", 20000, openAt),
  openAt,
  "open-1",
).opening!;
const at = new Date("2026-10-28T10:15:00-03:00");
const base = (): ShiftMovementDraft => ({
  type: "recebimento",
  paymentMethod: "dinheiro",
  receiptNature: "venda",
  amount: 5000,
  description: "Venda combustível",
  reference: "",
  counterparty: "",
  responsible: "Ana",
});
function add(
  data: ReturnType<typeof createEmptyMovementData>,
  patch: Partial<ShiftMovementDraft>,
  id: string,
  now = at,
) {
  const review = prepareShiftMovement(
    data,
    opened,
    { ...base(), ...patch },
    now,
    id,
  );
  return applyShiftMovement(data, opened, review, now);
}

describe("movimentações do posto", () => {
  it("separa vendas, conta anterior e recebimentos por meio; dinheiro esperado exclui eletrônicos", () => {
    let data = createEmptyMovementData();
    data = add(data, {}, "cash");
    data = add(data, { paymentMethod: "pix", reference: "pix-1" }, "pix");
    data = add(
      data,
      { paymentMethod: "debito", reference: "pos1/nsu-2" },
      "debit",
    );
    data = add(
      data,
      { paymentMethod: "credito", reference: "pos1/nsu-3" },
      "credit",
    );
    data = add(
      data,
      {
        paymentMethod: "dinheiro",
        receiptNature: "conta-anterior",
        reference: "fatura-2",
        amount: 1000,
      },
      "old",
    );
    expect(getMovementSummary(opened, data)).toMatchObject({
      openingFloat: 20000,
      cashExpected: 26000,
      sales: 20000,
      previousReceipts: 1000,
      count: 5,
      receiptsByMethod: {
        dinheiro: 6000,
        pix: 5000,
        debito: 5000,
        credito: 5000,
      },
    });
  });

  it("limita uma primeira sangria ao fundo de abertura", () => {
    expect(() =>
      add(
        createEmptyMovementData(),
        {
          type: "sangria",
          receiptNature: null,
          amount: 20001,
          description: "Retirada para cofre",
          counterparty: "Cofre central",
        },
        "initial-too-much",
      ),
    ).toThrow("não pode superar");
    const data = add(
      createEmptyMovementData(),
      {
        type: "sangria",
        receiptNature: null,
        amount: 5000,
        description: "Retirada para cofre",
        counterparty: "Cofre central",
      },
      "initial-withdraw",
    );
    expect(getMovementSummary(opened, data).cashExpected).toBe(15000);
  });

  it("sangria e suprimento alteram somente custódia em dinheiro", () => {
    let data = add(
      createEmptyMovementData(),
      {
        type: "suprimento",
        receiptNature: null,
        amount: 4000,
        description: "Troco adicional",
        counterparty: "Cofre do gerente",
      },
      "supply",
    );
    data = add(
      data,
      {
        type: "sangria",
        receiptNature: null,
        amount: 7000,
        description: "Depósito parcial",
        counterparty: "Cofre central",
      },
      "withdraw",
    );
    expect(getMovementSummary(opened, data)).toMatchObject({
      cashExpected: 17000,
      supplies: 4000,
      withdrawals: 7000,
      sales: 0,
    });
    expect(() =>
      prepareShiftMovement(
        data,
        opened,
        {
          ...base(),
          type: "sangria",
          receiptNature: null,
          amount: 17001,
          description: "Sangria excedente",
          counterparty: "Cofre central",
        },
        at,
        "too-much",
      ),
    ).toThrow("não pode superar");
  });

  it("exige referência para Pix/cartão e conta anterior, sem pedir referência para venda em dinheiro", () => {
    expect(() =>
      prepareShiftMovement(
        createEmptyMovementData(),
        opened,
        { ...base(), paymentMethod: "pix" },
        at,
        "no-ref",
      ),
    ).toThrow("referência");
    expect(() =>
      prepareShiftMovement(
        createEmptyMovementData(),
        opened,
        { ...base(), receiptNature: "conta-anterior" },
        at,
        "old-no-ref",
      ),
    ).toThrow("referência");
    expect(
      prepareShiftMovement(
        createEmptyMovementData(),
        opened,
        base(),
        at,
        "cash-no-ref",
      ).id,
    ).toBe("cash-no-ref");
  });

  it("rejeita referências repetidas no mesmo meio e aceita no meio diferente", () => {
    const data = add(
      createEmptyMovementData(),
      { paymentMethod: "pix", reference: "TX-9" },
      "one",
    );
    expect(() =>
      prepareShiftMovement(
        data,
        opened,
        { ...base(), paymentMethod: "pix", reference: " tx-9 " },
        at,
        "two",
      ),
    ).toThrow("referência");
    expect(
      prepareShiftMovement(
        data,
        opened,
        { ...base(), paymentMethod: "credito", reference: "TX-9" },
        at,
        "three",
      ).id,
    ).toBe("three");
  });

  it("rejeita campos inválidos, métodos eletrônicos para sangria e movimentos órfãos", () => {
    expect(() =>
      prepareShiftMovement(
        createEmptyMovementData(),
        opened,
        { ...base(), amount: 0 },
        at,
        "zero",
      ),
    ).toThrow("positivo");
    expect(() =>
      prepareShiftMovement(
        createEmptyMovementData(),
        opened,
        { ...base(), responsible: "A" },
        at,
        "responsible",
      ),
    ).toThrow("2 a 80");
    expect(() =>
      prepareShiftMovement(
        createEmptyMovementData(),
        opened,
        {
          ...base(),
          type: "sangria",
          receiptNature: null,
          paymentMethod: "pix",
          description: "Sangria Pix",
          counterparty: "Destino",
        },
        at,
        "pix-cash",
      ),
    ).toThrow("dinheiro físico");
    expect(() =>
      validateMovementData({
        version: 1,
        revision: 1,
        opening: null,
        movements: [
          {
            ...base(),
            id: "orphan",
            openingId: "open-1",
            recordedAt: at.toISOString(),
          },
        ],
      }),
    ).toThrow();
  });

  it("não grava fora da janela, em outro turno, antes da abertura ou com relógio retrocedido", () => {
    const data = add(createEmptyMovementData(), {}, "first");
    for (const late of [
      new Date("2026-10-28T14:00:00-03:00"),
      new Date("2026-10-29T10:00:00-03:00"),
      new Date("2026-10-28T09:59:00-03:00"),
    ]) {
      expect(() =>
        prepareShiftMovement(data, opened, base(), late, "late"),
      ).toThrow();
    }
    expect(() =>
      add(data, {}, "backwards", new Date("2026-10-28T10:14:00-03:00")),
    ).toThrow();
  });

  it("valida vínculo completo da abertura e rejeita totais acima do inteiro seguro", () => {
    expect(() =>
      getMovementSummary(
        { ...opened, operator: "Outra pessoa" },
        createEmptyMovementData(),
      ),
    ).toThrow("não corresponde");
    let data = createEmptyMovementData();
    data = add(data, { amount: Number.MAX_SAFE_INTEGER - 20000 }, "max");
    expect(() => add(data, { amount: 1 }, "overflow")).toThrow();
  });

  it("rejeita snapshots malformados e movimentos associados a outra abertura", () => {
    const data = add(createEmptyMovementData(), {}, "first");
    const corrupt = JSON.parse(JSON.stringify(data));
    corrupt.movements[0].recordedAt = "not-a-timestamp";
    expect(() => validateMovementData(corrupt)).toThrow();
    const changed = JSON.parse(JSON.stringify(data));
    changed.movements[0].openingId = "other";
    expect(() => validateMovementData(changed)).toThrow("outra abertura");
  });
});
