import { describe, expect, it } from "vitest";
import { createEmptyData, validateData } from "../lib/budget";

describe("precisão de totais financeiros", () => {
  it("rejeita a soma mensal insegura antes da persistência", () => {
    const data = createEmptyData();
    data.transactions = [
      {
        id: "tx1",
        description: "Receita grande",
        amount: Number.MAX_SAFE_INTEGER,
        date: "2026-10-01",
        type: "receita",
        categoryId: "salario",
      },
      {
        id: "tx2",
        description: "Outra receita",
        amount: 1,
        date: "2026-10-02",
        type: "receita",
        categoryId: "salario",
      },
    ];
    expect(() => validateData(data)).toThrow("total mensal");
    data.transactions[1].date = "2026-11-02";
    expect(() => validateData(data)).not.toThrow();
  });
  it("rejeita soma insegura de orçamentos na mesma competência", () => {
    const data = createEmptyData();
    data.budgets = [
      {
        month: "2026-10",
        categoryId: "moradia",
        amount: Number.MAX_SAFE_INTEGER,
      },
      { month: "2026-10", categoryId: "mercado", amount: 1 },
    ];
    expect(() => validateData(data)).toThrow("orçamento mensal");
  });
});
