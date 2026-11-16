import { describe, expect, it } from "vitest";
import {
  analyticsStart,
  coverageDays,
  daysInMonth,
  fuelAnalytics,
  percentChange,
  shiftMonth,
  type AnalyticsRow,
} from "../lib/business/fuel-analytics";

const TZ = "America/Sao_Paulo";
/** 17:00 UTC = 14:00 in Bauru, safely inside the local day. */
const row = (date: string, productId: number, liters: string, revenue: bigint, cost: bigint | null = 0n): AnalyticsRow => ({
  measuredAt: new Date(`${date}T17:00:00Z`),
  productId,
  quantityLiters: liters,
  revenueCents: revenue,
  costCents: cost,
});

describe("fuel analytics calendar helpers", () => {
  it("moves across years and knows month lengths", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", -12)).toBe("2025-11");
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-11")).toBe(30);
    expect(analyticsStart("2026-11-15")).toBe("2025-11-01");
  });
});

describe("month-end projection and 12-month history", () => {
  const rows: AnalyticsRow[] = [
    // Current month, days 1-10 completed + partial today (11th).
    ...Array.from({ length: 10 }, (_, index) =>
      row(`2026-11-${String(index + 1).padStart(2, "0")}`, 1, "100.000", 60_000n, 50_000n),
    ),
    row("2026-11-11", 1, "40.000", 24_000n, 20_000n),
    row("2026-11-05", 2, "50.000", 22_000n, 19_000n),
    // Previous month: same period (days 1-10) and later days.
    row("2026-10-03", 1, "800.000", 480_000n, 400_000n),
    row("2026-10-25", 1, "1000.000", 600_000n, 500_000n),
    // Older closed month and one outside the 12-month window.
    row("2026-01-01", 1, "1200.000", 720_000n, 600_000n),
    row("2025-10-10", 1, "9999.000", 1n, 1n),
  ];
  const result = fuelAnalytics({ rows, today: "2026-11-11", timeZone: TZ, productIds: [1, 2] });

  it("lists exactly the 12 closed months, oldest first", () => {
    expect(result.months).toHaveLength(12);
    expect(result.months[0].month).toBe("2025-11");
    expect(result.months[11].month).toBe("2026-10");
    expect(result.months[11].liters).toBe("1800.000");
    expect(result.months[11].byProduct[1]).toEqual({ liters: "1800.000", revenueCents: 1_080_000n });
  });

  it("averages only months with sales", () => {
    expect(result.average12).toEqual({
      liters: "1500.000",
      revenueCents: 900_000n,
      monthsWithData: 2,
      excludedPartialMonth: null,
    });
  });

  it("leaves a first month that started mid-month out of the average", () => {
    const partial = fuelAnalytics({
      rows: [row("2026-08-20", 1, "300.000", 1n), row("2026-09-01", 1, "1000.000", 1n), row("2026-10-01", 1, "1200.000", 1n)],
      today: "2026-11-11",
      timeZone: TZ,
      productIds: [1],
    });
    expect(partial.average12).toMatchObject({ liters: "1100.000", monthsWithData: 2, excludedPartialMonth: "2026-08" });
    // A single partial month is still better than no average at all.
    const single = fuelAnalytics({ rows: [row("2026-10-20", 1, "300.000", 1n)], today: "2026-11-11", timeZone: TZ, productIds: [1] });
    expect(single.average12).toMatchObject({ liters: "300.000", monthsWithData: 1, excludedPartialMonth: null });
  });

  it("projects the month from completed days only", () => {
    const { current } = result;
    expect(current.completedDays).toBe(10);
    expect(current.daysInMonth).toBe(30);
    expect(current.liters).toBe("1090.000"); // includes today's partial reading
    expect(current.completed.liters).toBe("1050.000");
    expect(current.projectedLiters).toBe("3150.000"); // 1050 / 10 × 30
    expect(current.projectedRevenueCents).toBe(1_866_000n); // 622_000 / 10 × 30
    expect(current.projectedMarginCents).toBe((622_000n - 519_000n) * 3n);
    expect(current.previousSamePeriod).toMatchObject({ month: "2026-10", liters: "800.000" });
    expect(current.daily).toHaveLength(11);
    expect(current.daily[10]).toMatchObject({ date: "2026-11-11", liters: "40.000" });
  });

  it("breaks the month down per product", () => {
    const [gas, ethanol] = result.current.byProduct;
    expect(gas).toMatchObject({ productId: 1, liters: "1040.000", projectedLiters: "3000.000", average12Liters: "1500.000" });
    expect(ethanol).toMatchObject({ productId: 2, liters: "50.000", projectedLiters: "150.000", average12Liters: "0.000" });
  });

  it("has no projection on the first day of the month", () => {
    const first = fuelAnalytics({ rows, today: "2026-11-01", timeZone: TZ, productIds: [1] });
    expect(first.current.projectedLiters).toBeNull();
    expect(first.current.projectedRevenueCents).toBeNull();
  });

  it("marks margin unknown when any sale has no cost", () => {
    const unknown = fuelAnalytics({
      rows: [row("2026-11-02", 1, "10.000", 6_000n, null)],
      today: "2026-11-05",
      timeZone: TZ,
      productIds: [1],
    });
    expect(unknown.current.marginCents).toBeNull();
    expect(unknown.current.projectedMarginCents).toBeNull();
    expect(unknown.average12).toBeNull();
  });
});

describe("dashboard ratios", () => {
  it("computes percent change only with a positive base", () => {
    expect(percentChange(1_100n, 1_000n)).toBe(10);
    expect(percentChange(950n, 1_000n)).toBe(-5);
    expect(percentChange(5n, 0n)).toBeNull();
  });

  it("computes stock coverage in days", () => {
    expect(coverageDays("15000.000", "3000.000")).toBe(5);
    expect(coverageDays("1000.000", "0.000")).toBeNull();
    expect(coverageDays("-20.000", "100.000")).toBe(0);
  });
});
