export type TxType = "receita" | "despesa";

export interface Category {
  id: string;
  name: string;
  type: TxType;
  color: string;
  icon: string;
}

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  categoryId: string;
  type: TxType;
}

export interface Budget {
  month: string;
  categoryId: string;
  amount: number;
}

export interface AppData {
  version: 1;
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
}

export interface CategorySpending {
  category: Category;
  spent: number;
  limit: number | null;
  remaining: number | null;
  percentage: number | null;
}

export interface Summary {
  income: number;
  expenses: number;
  balance: number;
  budgetTotal: number;
  budgetRemaining: number;
  spentBudgeted: number;
  categorySpending: CategorySpending[];
}

export interface TrendPoint {
  month: string;
  label: string;
  income: number;
  expenses: number;
}

export interface Insight {
  id: string;
  tone: "warning" | "positive" | "neutral";
  title: string;
  message: string;
}

const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;
const MAX_SAFE_CENTS_BIGINT = BigInt(MAX_SAFE_CENTS);

const INITIAL_CATEGORIES: ReadonlyArray<Category> = [
  {
    id: "moradia",
    name: "Moradia",
    type: "despesa",
    color: "#214D40",
    icon: "home",
  },
  {
    id: "mercado",
    name: "Mercado",
    type: "despesa",
    color: "#52796F",
    icon: "cart",
  },
  {
    id: "restaurantes",
    name: "Restaurantes",
    type: "despesa",
    color: "#C86646",
    icon: "restaurant",
  },
  {
    id: "transporte",
    name: "Transporte",
    type: "despesa",
    color: "#5C6B73",
    icon: "car",
  },
  {
    id: "saude",
    name: "Saúde",
    type: "despesa",
    color: "#7A9E7E",
    icon: "heart",
  },
  {
    id: "lazer",
    name: "Lazer",
    type: "despesa",
    color: "#9C6B30",
    icon: "sparkles",
  },
  {
    id: "educacao",
    name: "Educação",
    type: "despesa",
    color: "#657153",
    icon: "book",
  },
  {
    id: "outros-despesas",
    name: "Outros",
    type: "despesa",
    color: "#899878",
    icon: "ellipsis",
  },
  {
    id: "salario",
    name: "Salário",
    type: "receita",
    color: "#214D40",
    icon: "briefcase",
  },
  {
    id: "trabalho-extra",
    name: "Trabalho extra",
    type: "receita",
    color: "#52796F",
    icon: "trending-up",
  },
  {
    id: "outros-recebimentos",
    name: "Outros recebimentos",
    type: "receita",
    color: "#7A9E7E",
    icon: "plus-circle",
  },
];

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const BRAZILIAN_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

function fail(message: string): never {
  throw new TypeError(`Dados inválidos: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${field} deve ser um texto não vazio`);
  }
  return value;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  return (
    year >= 1 &&
    year <= 9999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

function assertMonth(month: string): void {
  if (normalizeMonth(month) === null) {
    throw new RangeError(`Mês inválido: ${month}`);
  }
}

function normalizeMonth(month: unknown): string | null {
  if (typeof month !== "string") return null;
  const match = MONTH_PATTERN.exec(month.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 1 || year > 9999 || monthNumber < 1 || monthNumber > 12)
    return null;
  return `${match[1]}-${match[2]}`;
}

function addAmounts(values: number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError(
        "A soma dos montantes excede o limite seguro de inteiros",
      );
    }
  }
  return total;
}

function sumTransactions(
  transactions: Transaction[],
  month: string,
  type: TxType,
): number {
  return addAmounts(
    transactions
      .filter(
        (transaction) =>
          transaction.date.slice(0, 7) === month && transaction.type === type,
      )
      .map((transaction) => transaction.amount),
  );
}

function makeDemoDate(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function formatInsightPercent(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value));
}

/** Return a fresh state with the categories shipped by the first version of Sobra. */
export function createEmptyData(): AppData {
  return {
    version: 1,
    categories: INITIAL_CATEGORIES.map((category) => ({ ...category })),
    transactions: [],
    budgets: [],
  };
}

/** Generate an identifier without depending on a platform-specific UUID package. */
export function createId(): string {
  const cryptoObject = (
    globalThis as {
      crypto?: {
        randomUUID?: () => string;
        getRandomValues?: (array: Uint32Array) => Uint32Array;
      };
    }
  ).crypto;
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
  if (cryptoObject?.getRandomValues) {
    const values = cryptoObject.getRandomValues(new Uint32Array(3));
    return `id-${Date.now().toString(36)}-${Array.from(values, (value) => value.toString(36)).join("")}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Create a clearly deterministic demonstration state covering the selected month and five predecessors. */
export function createDemoData(month: string): AppData {
  assertMonth(month);
  const data = createEmptyData();
  const transactions: Transaction[] = [];

  for (let index = 0; index < 6; index += 1) {
    const transactionMonth = changeMonth(month, index - 5);
    const restaurantAmount = index === 5 ? 13200 : 8000;
    transactions.push(
      {
        id: `demo-salary-${transactionMonth}`,
        description: "Salário",
        amount: 500000,
        date: makeDemoDate(transactionMonth, 5),
        categoryId: "salario",
        type: "receita",
      },
      {
        id: `demo-market-${transactionMonth}`,
        description: "Compras do mês",
        amount: 120000,
        date: makeDemoDate(transactionMonth, 10),
        categoryId: "mercado",
        type: "despesa",
      },
      {
        id: `demo-restaurant-${transactionMonth}`,
        description: "Restaurantes",
        amount: restaurantAmount,
        date: makeDemoDate(transactionMonth, 20),
        categoryId: "restaurantes",
        type: "despesa",
      },
    );
  }

  data.transactions = transactions;
  data.budgets = [{ month, categoryId: "restaurantes", amount: 10000 }];
  return data;
}

/** Validate and clone persisted data, rejecting orphaned or ambiguous records. */
export function validateData(input: unknown): AppData {
  if (!isRecord(input) || input.version !== 1) fail("version deve ser 1");
  if (!Array.isArray(input.categories)) fail("categories deve ser um array");
  if (!Array.isArray(input.transactions))
    fail("transactions deve ser um array");
  if (!Array.isArray(input.budgets)) fail("budgets deve ser um array");

  const allIds = new Set<string>();
  const categories: Category[] = input.categories.map((rawCategory, index) => {
    if (!isRecord(rawCategory)) fail(`categories[${index}] inválida`);
    const id = nonEmptyString(rawCategory.id, `categories[${index}].id`);
    if (allIds.has(id)) fail(`id duplicado: ${id}`);
    allIds.add(id);
    const name = nonEmptyString(rawCategory.name, `categories[${index}].name`);
    const type = rawCategory.type;
    if (type !== "receita" && type !== "despesa")
      fail(`categories[${index}].type inválido`);
    const color = nonEmptyString(
      rawCategory.color,
      `categories[${index}].color`,
    );
    const icon = nonEmptyString(rawCategory.icon, `categories[${index}].icon`);
    return { id, name, type, color, icon };
  });

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const transactions: Transaction[] = input.transactions.map(
    (rawTransaction, index) => {
      if (!isRecord(rawTransaction)) fail(`transactions[${index}] inválida`);
      const id = nonEmptyString(rawTransaction.id, `transactions[${index}].id`);
      if (allIds.has(id)) fail(`id duplicado: ${id}`);
      allIds.add(id);
      const description = nonEmptyString(
        rawTransaction.description,
        `transactions[${index}].description`,
      );
      const date = normalizeDate(rawTransaction.date as string);
      if (!date) fail(`transactions[${index}].date inválida`);
      const categoryId = nonEmptyString(
        rawTransaction.categoryId,
        `transactions[${index}].categoryId`,
      );
      const category = categoryById.get(categoryId);
      if (!category)
        fail(`transactions[${index}] referencia categoria inexistente`);
      const type = rawTransaction.type;
      if (type !== "receita" && type !== "despesa")
        fail(`transactions[${index}].type inválido`);
      if (category.type !== type)
        fail(`transactions[${index}] tem tipo incompatível com a categoria`);
      const amount = rawTransaction.amount;
      if (
        typeof amount !== "number" ||
        !Number.isSafeInteger(amount) ||
        amount <= 0
      ) {
        fail(
          `transactions[${index}].amount deve ser um inteiro seguro positivo`,
        );
      }
      return { id, description, amount, date, categoryId, type };
    },
  );

  const budgetKeys = new Set<string>();
  const budgets: Budget[] = input.budgets.map((rawBudget, index) => {
    if (!isRecord(rawBudget)) fail(`budgets[${index}] inválido`);
    const month = normalizeMonth(rawBudget.month);
    if (!month) fail(`budgets[${index}].month inválido`);
    const categoryId = nonEmptyString(
      rawBudget.categoryId,
      `budgets[${index}].categoryId`,
    );
    const category = categoryById.get(categoryId);
    if (!category) fail(`budgets[${index}] referencia categoria inexistente`);
    if (category.type !== "despesa")
      fail(`budgets[${index}] deve usar categoria de despesa`);
    const key = `${month}\u0000${categoryId}`;
    if (budgetKeys.has(key))
      fail(`orçamento duplicado para ${month} e ${categoryId}`);
    budgetKeys.add(key);
    const amount = rawBudget.amount;
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount < 0
    ) {
      fail(`budgets[${index}].amount deve ser um inteiro seguro não negativo`);
    }
    return { month, categoryId, amount };
  });

  const monthlyTotals = new Map<string, bigint>();
  for (const transaction of transactions) {
    const key = `${transaction.date.slice(0, 7)}:${transaction.type}`;
    const total = (monthlyTotals.get(key) ?? 0n) + BigInt(transaction.amount);
    if (total > MAX_SAFE_CENTS_BIGINT)
      fail("o total mensal excede a precisão monetária segura");
    monthlyTotals.set(key, total);
  }
  for (const budget of budgets) {
    const key = `${budget.month}:orcamento`;
    const total = (monthlyTotals.get(key) ?? 0n) + BigInt(budget.amount);
    if (total > MAX_SAFE_CENTS_BIGINT)
      fail("o orçamento mensal excede a precisão monetária segura");
    monthlyTotals.set(key, total);
  }

  return { version: 1, categories, transactions, budgets };
}

/** Parse non-negative Brazilian or unambiguous decimal-point money into integer cents. */
export function parseMoney(value: string): number | null {
  if (typeof value !== "string") return null;
  let text = value.replace(/\u00a0/g, " ").trim();
  if (text.length === 0 || /[-+]/.test(text)) return null;
  if (/^R\$\s*/i.test(text)) text = text.replace(/^R\$\s*/i, "");
  if (text.length === 0 || /\s/.test(text)) return null;

  let whole = text;
  let fraction = "";
  const commaCount = (text.match(/,/g) ?? []).length;
  const dotCount = (text.match(/\./g) ?? []).length;

  if (commaCount > 1) return null;
  if (commaCount === 1) {
    const parts = text.split(",");
    if (!/^\d{1,2}$/.test(parts[1])) return null;
    whole = parts[0];
    fraction = parts[1];
    if (dotCount > 0) {
      const groups = whole.split(".");
      if (
        groups.length < 2 ||
        !/^\d{1,3}$/.test(groups[0]) ||
        groups.slice(1).some((group) => !/^\d{3}$/.test(group))
      )
        return null;
      whole = groups.join("");
    } else if (!/^\d+$/.test(whole)) {
      return null;
    }
  } else if (dotCount === 1) {
    const parts = text.split(".");
    // A single dot followed by three digits is deliberately rejected: 1.234
    // is ambiguous between a decimal value and a thousands grouping.
    if (parts[1].length === 1 || parts[1].length === 2) {
      if (!/^\d+$/.test(parts[0]) || !/^\d{1,2}$/.test(parts[1])) return null;
      whole = parts[0];
      fraction = parts[1];
    } else {
      return null;
    }
  } else if (dotCount > 1) {
    const groups = text.split(".");
    if (
      !/^\d{1,3}$/.test(groups[0]) ||
      groups.slice(1).some((group) => !/^\d{3}$/.test(group))
    )
      return null;
    whole = groups.join("");
  }

  if (!/^\d+$/.test(whole)) return null;
  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  if (cents > MAX_SAFE_CENTS_BIGINT) return null;
  return Number(cents);
}

/** Normalize an ISO or Brazilian date after checking the Gregorian calendar. */
export function normalizeDate(value: string): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const iso = ISO_DATE_PATTERN.exec(text);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return validCalendarDate(year, month, day) ? text : null;
  }
  const brazilian = BRAZILIAN_DATE_PATTERN.exec(text);
  if (brazilian) {
    const day = Number(brazilian[1]);
    const month = Number(brazilian[2]);
    const year = Number(brazilian[3]);
    if (!validCalendarDate(year, month, day)) return null;
    return `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}`;
  }
  return null;
}

export function money(cents: number): string {
  if (typeof cents !== "number" || !Number.isSafeInteger(cents)) {
    throw new RangeError("O valor deve ser um inteiro seguro");
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(Object.is(cents, -0) ? 0 : cents / 100)
    .replace(/\u00a0/g, " ");
}

export function monthTitle(month: string): string {
  const normalized = normalizeMonth(month);
  if (!normalized) throw new RangeError(`Mês inválido: ${month}`);
  const monthNumber = Number(normalized.slice(5, 7));
  return `${MONTH_NAMES[monthNumber - 1]} de ${normalized.slice(0, 4)}`;
}

export function changeMonth(month: string, delta: number): string {
  const normalized = normalizeMonth(month);
  if (!normalized || !Number.isSafeInteger(delta))
    throw new RangeError("Mês ou deslocamento inválido");
  const year = Number(normalized.slice(0, 4));
  const monthNumber = Number(normalized.slice(5, 7));
  const absoluteMonth = year * 12 + (monthNumber - 1) + delta;
  const nextYear = Math.floor(absoluteMonth / 12);
  const nextMonth = (absoluteMonth % 12) + 1;
  if (nextYear < 1 || nextYear > 9999)
    throw new RangeError("O mês resultante está fora do intervalo suportado");
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

export function currentMonth(): string {
  const today = new Date();
  return `${String(today.getFullYear()).padStart(4, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

export function todayISO(): string {
  const today = new Date();
  return `${String(today.getFullYear()).padStart(4, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export function getSummary(data: AppData, month: string): Summary {
  assertMonth(month);
  const income = sumTransactions(data.transactions, month, "receita");
  const expenses = sumTransactions(data.transactions, month, "despesa");
  const budgetsForMonth = data.budgets.filter(
    (budget) => budget.month === month,
  );
  const budgetTotal = addAmounts(
    budgetsForMonth.map((budget) => budget.amount),
  );
  const budgetByCategory = new Map(
    budgetsForMonth.map((budget) => [budget.categoryId, budget.amount]),
  );
  const spentByCategory = new Map<string, number>();

  for (const transaction of data.transactions) {
    if (
      transaction.date.slice(0, 7) !== month ||
      transaction.type !== "despesa"
    )
      continue;
    const spent =
      (spentByCategory.get(transaction.categoryId) ?? 0) + transaction.amount;
    if (!Number.isSafeInteger(spent)) {
      throw new RangeError(
        "A soma dos montantes excede o limite seguro de inteiros",
      );
    }
    spentByCategory.set(transaction.categoryId, spent);
  }

  const categorySpending = data.categories
    .filter((category) => category.type === "despesa")
    .map((category): CategorySpending => {
      const spent = spentByCategory.get(category.id) ?? 0;
      const budget = budgetByCategory.get(category.id);
      const limit = typeof budget === "number" && budget > 0 ? budget : null;
      return {
        category,
        spent,
        limit,
        remaining: limit === null ? null : limit - spent,
        percentage: limit === null ? null : (spent / limit) * 100,
      };
    })
    .sort(
      (left, right) =>
        right.spent - left.spent ||
        left.category.name.localeCompare(right.category.name, "pt-BR") ||
        left.category.id.localeCompare(right.category.id),
    );

  const spentBudgeted = addAmounts(
    Array.from(spentByCategory.entries())
      .filter(([categoryId]) => (budgetByCategory.get(categoryId) ?? 0) > 0)
      .map(([, spent]) => spent),
  );

  return {
    income,
    expenses,
    balance: income - expenses,
    budgetTotal,
    budgetRemaining: budgetTotal - spentBudgeted,
    spentBudgeted,
    categorySpending,
  };
}

export function getTrend(data: AppData, month: string): TrendPoint[] {
  assertMonth(month);
  return Array.from({ length: 6 }, (_, index) => {
    const trendMonth = changeMonth(month, index - 5);
    return {
      month: trendMonth,
      label: monthTitle(trendMonth),
      income: sumTransactions(data.transactions, trendMonth, "receita"),
      expenses: sumTransactions(data.transactions, trendMonth, "despesa"),
    };
  });
}

export function getInsights(data: AppData, month: string): Insight[] {
  assertMonth(month);
  const summary = getSummary(data, month);
  const insights: Insight[] = [];

  for (const item of summary.categorySpending) {
    if (item.limit === null || item.spent <= 0) continue;
    if (item.spent > item.limit) {
      const excess = ((item.spent - item.limit) / item.limit) * 100;
      insights.push({
        id: `budget-over-${month}-${item.category.id}`,
        tone: "warning",
        title: "Orçamento excedido",
        message: `A categoria ${item.category.name} está ${formatInsightPercent(excess)}% acima do orçamento.`,
      });
    } else {
      insights.push({
        id: `budget-used-${month}-${item.category.id}`,
        tone: "positive",
        title: "Orçamento em acompanhamento",
        message: `Você usou ${formatInsightPercent((item.spent / item.limit) * 100)}% do orçamento de ${item.category.name}.`,
      });
    }
  }

  const previousMonth = changeMonth(month, -1);
  const previousExpenses = sumTransactions(
    data.transactions,
    previousMonth,
    "despesa",
  );
  if (previousExpenses > 0 && summary.expenses !== previousExpenses) {
    const change =
      ((summary.expenses - previousExpenses) / previousExpenses) * 100;
    if (summary.expenses < previousExpenses) {
      insights.push({
        id: `trend-down-${month}`,
        tone: "positive",
        title: "Despesas em queda",
        message: `Suas despesas caíram ${formatInsightPercent(Math.abs(change))}% em relação ao mês anterior.`,
      });
    } else {
      insights.push({
        id: `trend-up-${month}`,
        tone: "warning",
        title: "Despesas em alta",
        message: `Suas despesas aumentaram ${formatInsightPercent(change)}% em relação ao mês anterior.`,
      });
    }
  }

  const hasTransactions = data.transactions.some(
    (transaction) => transaction.date.slice(0, 7) === month,
  );
  const hasUnbudgetedExpenses = summary.categorySpending.some(
    (item) => item.spent > 0 && item.limit === null,
  );
  if (hasUnbudgetedExpenses && insights.length === 0) {
    insights.push({
      id: `unbudgeted-${month}`,
      tone: "neutral",
      title: "Categorias sem orçamento",
      message: "Há despesas em categorias sem orçamento definido.",
    });
  }
  if (!hasTransactions && insights.length === 0) {
    insights.push({
      id: `empty-${month}`,
      tone: "neutral",
      title: "Sem lançamentos",
      message: `Ainda não há lançamentos em ${monthTitle(month)}.`,
    });
  }

  return insights;
}
