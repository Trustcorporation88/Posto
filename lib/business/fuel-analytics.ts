/**
 * Monthly fuel analytics for the dashboard: month-to-date, month-end projection, the last 12
 * closed months and stock coverage. Pure and exact (milliliters and cents as bigint).
 */
import { litersToMilli, localDateKey, milliToLiters, trailingDates } from "./dashboard";

export type AnalyticsRow = {
  measuredAt: Date;
  productId: number;
  quantityLiters: string;
  revenueCents: bigint | null;
  costCents: bigint | null;
};

type Totals = { milli: bigint; revenue: bigint; cost: bigint; costKnown: boolean; count: number };
const empty = (): Totals => ({ milli: 0n, revenue: 0n, cost: 0n, costKnown: true, count: 0 });
function add(target: Totals, row: AnalyticsRow) {
  target.milli += litersToMilli(row.quantityLiters);
  target.revenue += row.revenueCents ?? 0n;
  if (row.costCents === null) target.costKnown = false;
  else target.cost += row.costCents;
  target.count += 1;
}
function merge(target: Totals, source: Totals) {
  target.milli += source.milli;
  target.revenue += source.revenue;
  target.cost += source.cost;
  target.costKnown &&= source.costKnown;
  target.count += source.count;
}
const margin = (t: Totals) => (t.count === 0 ? 0n : t.costKnown ? t.revenue - t.cost : null);
/** Rounded integer division for non-negative scale-up of exact totals. */
function scale(value: bigint, numerator: number, denominator: number) {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  return (value * n * 2n + d) / (d * 2n);
}

export type Amounts = { liters: string; revenueCents: bigint; marginCents: bigint | null };
const amounts = (t: Totals): Amounts => ({
  liters: milliToLiters(t.milli),
  revenueCents: t.revenue,
  marginCents: margin(t),
});

export type MonthPoint = Amounts & {
  month: string;
  readingCount: number;
  byProduct: Record<number, { liters: string; revenueCents: bigint }>;
};

export type ProductMonth = Amounts & {
  productId: number;
  projectedLiters: string | null;
  projectedRevenueCents: bigint | null;
  average12Liters: string | null;
  average12RevenueCents: bigint | null;
  dailyAverageLiters30: string;
};

export type FuelAnalytics = {
  months: MonthPoint[];
  average12: {
    liters: string;
    revenueCents: bigint;
    monthsWithData: number;
    /** First month with data, left out of the average because it started after day 1. */
    excludedPartialMonth: string | null;
  } | null;
  current: Amounts & {
    month: string;
    daysInMonth: number;
    completedDays: number;
    completed: Amounts;
    previousSamePeriod: Amounts & { month: string };
    projectedLiters: string | null;
    projectedRevenueCents: bigint | null;
    projectedMarginCents: bigint | null;
    daily: (Amounts & { date: string; readingCount: number })[];
    byProduct: ProductMonth[];
  };
};

export function monthKey(date: string) {
  return date.slice(0, 7);
}

export function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export function daysInMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value, 0)).getUTCDate();
}

/** Earliest instant the analytics need: the first day of the month 12 months before today. */
export function analyticsStart(today: string) {
  return `${shiftMonth(monthKey(today), -12)}-01`;
}

export function fuelAnalytics(input: {
  rows: readonly AnalyticsRow[];
  today: string;
  timeZone: string;
  productIds: readonly number[];
}): FuelAnalytics {
  const { today, timeZone, productIds } = input;
  const currentMonth = monthKey(today);
  const months = Array.from({ length: 12 }, (_, index) => shiftMonth(currentMonth, index - 12));
  const previousMonth = months[11];
  const completedDays = Number(today.slice(8, 10)) - 1;
  const monthDays = daysInMonth(currentMonth);
  const last30 = new Set(trailingDates(today, 31).slice(0, 30));

  const byMonth = new Map(months.map((month) => [month, { all: empty(), product: new Map<number, Totals>() }]));
  const byDay = new Map<string, Totals>();
  const currentAll = empty();
  const currentCompleted = empty();
  const previousSame = empty();
  const currentProduct = new Map<number, { all: Totals; completed: Totals }>();
  const last30Product = new Map<number, bigint>();

  const firstDayByMonth = new Map<string, number>();
  for (const row of input.rows) {
    const date = localDateKey(row.measuredAt, timeZone);
    const month = monthKey(date);
    const day = Number(date.slice(8, 10));
    if (day < (firstDayByMonth.get(month) ?? 32)) firstDayByMonth.set(month, day);
    if (last30.has(date)) last30Product.set(row.productId, (last30Product.get(row.productId) ?? 0n) + litersToMilli(row.quantityLiters));
    const monthly = byMonth.get(month);
    if (monthly) {
      add(monthly.all, row);
      const product = monthly.product.get(row.productId) ?? empty();
      add(product, row);
      monthly.product.set(row.productId, product);
      if (month === previousMonth && day <= completedDays) add(previousSame, row);
      continue;
    }
    if (month !== currentMonth || date > today) continue;
    add(currentAll, row);
    const dayTotals = byDay.get(date) ?? empty();
    add(dayTotals, row);
    byDay.set(date, dayTotals);
    const product = currentProduct.get(row.productId) ?? { all: empty(), completed: empty() };
    add(product.all, row);
    if (day <= completedDays) {
      add(product.completed, row);
      add(currentCompleted, row);
    }
    currentProduct.set(row.productId, product);
  }

  const monthPoints: MonthPoint[] = months.map((month) => {
    const bucket = byMonth.get(month)!;
    const byProduct: MonthPoint["byProduct"] = {};
    for (const [productId, totals] of bucket.product) {
      byProduct[productId] = { liters: milliToLiters(totals.milli), revenueCents: totals.revenue };
    }
    return { month, readingCount: bucket.all.count, byProduct, ...amounts(bucket.all) };
  });

  // Average over closed months that have any sale, so months before the system started do not
  // drag the average down. The first month with data is also left out when it started after
  // day 1 (the month the station began using the system), as long as another month remains.
  let withData = months.filter((month) => byMonth.get(month)!.all.count > 0);
  let excludedPartialMonth: string | null = null;
  if (withData.length > 1 && (firstDayByMonth.get(withData[0]) ?? 1) > 1) {
    excludedPartialMonth = withData[0];
    withData = withData.slice(1);
  }
  const sumMonths = (pick: (month: string) => Totals) => {
    const total = empty();
    for (const month of withData) merge(total, pick(month));
    return total;
  };
  const allMonths = sumMonths((month) => byMonth.get(month)!.all);
  const average12 = withData.length
    ? {
        liters: milliToLiters(scale(allMonths.milli, 1, withData.length)),
        revenueCents: scale(allMonths.revenue, 1, withData.length),
        monthsWithData: withData.length,
        excludedPartialMonth,
      }
    : null;

  const project = (totals: Totals) => (completedDays > 0 ? scale(totals.milli, monthDays, completedDays) : null);
  const projectRevenue = (totals: Totals) => (completedDays > 0 ? scale(totals.revenue, monthDays, completedDays) : null);
  const projectedMargin = (() => {
    if (completedDays === 0 || !currentCompleted.costKnown) return null;
    return scale(currentCompleted.revenue - currentCompleted.cost, monthDays, completedDays);
  })();

  const byProduct: ProductMonth[] = productIds.map((productId) => {
    const totals = currentProduct.get(productId) ?? { all: empty(), completed: empty() };
    const productMonths = sumMonths((month) => byMonth.get(month)!.product.get(productId) ?? empty());
    const projectedLiters = project(totals.completed);
    const projectedRevenue = projectRevenue(totals.completed);
    return {
      productId,
      ...amounts(totals.all),
      projectedLiters: projectedLiters === null ? null : milliToLiters(projectedLiters),
      projectedRevenueCents: projectedRevenue,
      average12Liters: withData.length ? milliToLiters(scale(productMonths.milli, 1, withData.length)) : null,
      average12RevenueCents: withData.length ? scale(productMonths.revenue, 1, withData.length) : null,
      dailyAverageLiters30: milliToLiters(scale(last30Product.get(productId) ?? 0n, 1, 30)),
    };
  });

  const dailyDates = trailingDates(today, Number(today.slice(8, 10)));
  const projectedLiters = project(currentCompleted);

  return {
    months: monthPoints,
    average12,
    current: {
      month: currentMonth,
      daysInMonth: monthDays,
      completedDays,
      ...amounts(currentAll),
      completed: amounts(currentCompleted),
      previousSamePeriod: { month: previousMonth, ...amounts(previousSame) },
      projectedLiters: projectedLiters === null ? null : milliToLiters(projectedLiters),
      projectedRevenueCents: projectRevenue(currentCompleted),
      projectedMarginCents: projectedMargin,
      daily: dailyDates.map((date) => {
        const totals = byDay.get(date) ?? empty();
        return { date, readingCount: totals.count, ...amounts(totals) };
      }),
      byProduct,
    },
  };
}

/** Percent change from `base` to `value`, one decimal; null without a positive base. */
export function percentChange(value: bigint, base: bigint): number | null {
  if (base <= 0n) return null;
  return Number(((value - base) * 1000n) / base) / 10;
}

/** Days the current stock lasts at the average daily volume; null without consumption. */
export function coverageDays(stockLiters: string, dailyAverageLiters: string): number | null {
  const daily = litersToMilli(dailyAverageLiters);
  const stock = litersToMilli(stockLiters);
  if (daily <= 0n) return null;
  if (stock <= 0n) return 0;
  return Number((stock * 10n) / daily) / 10;
}
