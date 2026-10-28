import { describe, expect, it } from "vitest";

import {
  changeMonth,
  createEmptyData,
  createDemoData,
  currentMonth,
  getInsights,
  getSummary,
  getTrend,
  money,
  monthTitle,
  normalizeDate,
  parseMoney,
  todayISO,
  validateData,
} from "../lib/budget";

describe("núcleo financeiro", () => {
  it("converte dinheiro brasileiro e decimal ponto sem aceitar ambiguidades", () => {
    expect(parseMoney("0")).toBe(0);
    expect(parseMoney("12,34")).toBe(1234);
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("R$ 1.234,56")).toBe(123456);
    expect(parseMoney("1234.56")).toBe(123456);
    expect(parseMoney("12.3")).toBe(1230);
    expect(parseMoney("1.234")).toBeNull();
    expect(parseMoney("1,234")).toBeNull();
    expect(parseMoney("1.2345")).toBeNull();
    expect(parseMoney("-10,00")).toBeNull();
    expect(parseMoney("R$ 10,00 extra")).toBeNull();
    expect(parseMoney("1,ab")).toBeNull();
    expect(parseMoney("1.aa")).toBeNull();
    expect(parseMoney("10, 1")).toBeNull();
    expect(parseMoney("10,1e")).toBeNull();
    expect(money(0)).toBe("R$ 0,00");
    expect(money(123456)).toBe("R$ 1.234,56");
    expect(money(-1234)).toBe("-R$ 12,34");
  });

  it("valida datas reais sem deixar o fuso deslocar a data", () => {
    expect(normalizeDate("2024-02-29")).toBe("2024-02-29");
    expect(normalizeDate("29/02/2024")).toBe("2024-02-29");
    expect(normalizeDate("29/02/2023")).toBeNull();
    expect(normalizeDate("31/04/2025")).toBeNull();
    expect(normalizeDate("2025-04-31")).toBeNull();
    expect(normalizeDate("2025-1-01")).toBeNull();

    const now = new Date();
    const expectedToday = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
      .map((part, index) =>
        index === 0
          ? String(part).padStart(4, "0")
          : String(part).padStart(2, "0"),
      )
      .join("-");
    expect(todayISO()).toBe(expectedToday);
    expect(currentMonth()).toBe(expectedToday.slice(0, 7));
  });

  it("formata e desloca competências em português", () => {
    expect(monthTitle("2026-01")).toBe("janeiro de 2026");
    expect(changeMonth("2026-01", -1)).toBe("2025-12");
    expect(changeMonth("2025-12", 1)).toBe("2026-01");
    expect(changeMonth("2025-01", 13)).toBe("2026-02");
  });

  it("mantém orçamento e saldo financeiro distintos, com excesso exato de 32%", () => {
    const data = createDemoData("2026-06");
    const summary = getSummary(data, "2026-06");
    const restaurants = summary.categorySpending.find(
      (item) => item.category.id === "restaurantes",
    );

    expect(data.transactions).toHaveLength(18);
    expect(summary.income).toBe(500000);
    expect(summary.expenses).toBe(133200);
    expect(summary.balance).toBe(366800);
    expect(summary.budgetTotal).toBe(10000);
    expect(summary.spentBudgeted).toBe(13200);
    expect(summary.budgetRemaining).toBe(-3200);
    expect(restaurants).toMatchObject({
      spent: 13200,
      limit: 10000,
      remaining: -3200,
      percentage: 132,
    });
    expect(
      getInsights(data, "2026-06").some((insight) =>
        insight.message.includes("32% acima"),
      ),
    ).toBe(true);
  });

  it("produz tendência de seis meses e inclui meses vazios com zero", () => {
    const empty = createEmptyData();
    const trend = getTrend(empty, "2026-06");
    expect(trend).toHaveLength(6);
    expect(trend.map((point) => point.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
    expect(
      trend.every((point) => point.income === 0 && point.expenses === 0),
    ).toBe(true);

    const demoTrend = getTrend(createDemoData("2026-06"), "2026-06");
    expect(demoTrend).toHaveLength(6);
    expect(demoTrend[5]).toMatchObject({
      month: "2026-06",
      income: 500000,
      expenses: 133200,
    });
  });

  it("trata orçamento zero como sem orçamento e nunca divide por zero", () => {
    const data = createEmptyData();
    data.transactions.push({
      id: "tx-zero-budget",
      description: "Almoço",
      amount: 1000,
      date: "2026-06-10",
      categoryId: "restaurantes",
      type: "despesa",
    });
    data.budgets.push({
      month: "2026-06",
      categoryId: "restaurantes",
      amount: 0,
    });
    const summary = getSummary(data, "2026-06");
    const restaurants = summary.categorySpending.find(
      (item) => item.category.id === "restaurantes",
    );
    expect(restaurants).toMatchObject({
      spent: 1000,
      limit: null,
      remaining: null,
      percentage: null,
    });
    expect(summary.budgetTotal).toBe(0);
    expect(summary.spentBudgeted).toBe(0);
    expect(
      getInsights(data, "2026-06").every(
        (insight) => !insight.message.includes("Infinity"),
      ),
    ).toBe(true);
  });

  it("valida referências, tipos, ids, datas, duplicatas e montantes seguros", () => {
    const empty = createEmptyData();
    const valid = {
      ...empty,
      transactions: [
        {
          id: "tx-valid",
          description: "Salário",
          amount: 10000,
          date: "31/01/2026",
          categoryId: "salario",
          type: "receita" as const,
        },
      ],
      budgets: [{ month: "2026-01", categoryId: "restaurantes", amount: 0 }],
    };
    expect(validateData(valid).transactions[0].date).toBe("2026-01-31");
    expect(() => validateData({ ...valid, version: 2 })).toThrow();
    expect(() =>
      validateData({
        ...valid,
        transactions: [{ ...valid.transactions[0], date: "2026-02-30" }],
      }),
    ).toThrow();
    expect(() =>
      validateData({
        ...valid,
        transactions: [
          {
            ...valid.transactions[0],
            categoryId: "salario",
            type: "despesa" as const,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateData({
        ...valid,
        transactions: [{ ...valid.transactions[0], id: "salario" }],
      }),
    ).toThrow();
    expect(() =>
      validateData({
        ...valid,
        budgets: [
          { month: "2026-01", categoryId: "restaurantes", amount: 0 },
          { month: "2026-01", categoryId: "restaurantes", amount: 1 },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateData({
        ...valid,
        transactions: [
          { ...valid.transactions[0], amount: Number.MAX_SAFE_INTEGER + 1 },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateData({
        ...valid,
        budgets: [{ month: "2026-01", categoryId: "restaurantes", amount: -1 }],
      }),
    ).toThrow();
  });
});
