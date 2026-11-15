import { describe, expect, it } from "vitest";
import {
  aggregateDailyFuel,
  litersToMilli,
  localDateKey,
  milliToLiters,
  setupSteps,
  summarizeClosings,
  trailingDates,
} from "../lib/business/dashboard";

const TZ = "America/Sao_Paulo";

describe("dashboard aggregation", () => {
  it("uses the station local date, not UTC", () => {
    // 01:30 UTC on the 15th is still 22:30 on the 14th in Bauru.
    expect(localDateKey(new Date("2026-11-15T01:30:00Z"), TZ)).toBe("2026-11-14");
    expect(localDateKey(new Date("2026-11-15T03:00:00Z"), TZ)).toBe("2026-11-15");
  });

  it("lists trailing dates across month and year boundaries", () => {
    expect(trailingDates("2027-01-02", 4)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(() => trailingDates("15/11/2026", 3)).toThrow("INVALID_DATE_RANGE");
    expect(() => trailingDates("2026-11-15", 0)).toThrow("INVALID_DATE_RANGE");
  });

  it("converts liters exactly in milliliters", () => {
    expect(litersToMilli("1234.5")).toBe(1_234_500n);
    expect(litersToMilli("0.001")).toBe(1n);
    expect(litersToMilli("-2.25")).toBe(-2_250n);
    expect(milliToLiters(1_234_567n)).toBe("1234.567");
    expect(milliToLiters(-5n)).toBe("-0.005");
    expect(() => litersToMilli("1.2345")).toThrow("INVALID_LITERS");
  });

  it("groups sales per local day, keeps empty days and flags unknown cost", () => {
    const series = aggregateDailyFuel(
      [
        { measuredAt: new Date("2026-11-14T17:00:00Z"), quantityLiters: "100.500", revenueCents: 63_215n, costCents: 56_000n },
        // 22:00 in Bauru on the 14th, already the 15th in UTC.
        { measuredAt: new Date("2026-11-15T01:00:00Z"), quantityLiters: "50.000", revenueCents: 31_450n, costCents: 28_000n },
        { measuredAt: new Date("2026-11-15T17:00:00Z"), quantityLiters: "10.000", revenueCents: 6_290n, costCents: null },
        { measuredAt: new Date("2026-11-20T17:00:00Z"), quantityLiters: "999.000", revenueCents: 1n, costCents: 1n },
      ],
      ["2026-11-13", "2026-11-14", "2026-11-15"],
      TZ,
    );
    expect(series).toEqual([
      { date: "2026-11-13", quantityLiters: "0.000", revenueCents: 0n, marginCents: 0n, readingCount: 0 },
      { date: "2026-11-14", quantityLiters: "150.500", revenueCents: 94_665n, marginCents: 10_665n, readingCount: 2 },
      { date: "2026-11-15", quantityLiters: "10.000", revenueCents: 6_290n, marginCents: null, readingCount: 1 },
    ]);
  });

  it("orders the first-use checklist and marks partial steps as pending", () => {
    const steps = setupSteps({
      products: 2,
      productsWithPrice: 1,
      tanks: 2,
      tanksMeasured: 0,
      nozzles: 3,
      nozzlesWithBaseline: 3,
      teamMembers: 1,
      pendingInvites: 1,
      cashTurns: 0,
    });
    expect(steps.map((step) => [step.id, step.done])).toEqual([
      ["products", true],
      ["tanks", true],
      ["nozzles", true],
      ["prices", false],
      ["baselines", true],
      ["measurements", false],
      ["team", true],
      ["cash", false],
    ]);
    const empty = setupSteps({
      products: 0,
      productsWithPrice: 0,
      tanks: 0,
      tanksMeasured: 0,
      nozzles: 0,
      nozzlesWithBaseline: 0,
      teamMembers: 1,
      pendingInvites: 0,
      cashTurns: 0,
    });
    // "0 of 0" must never count as done.
    expect(empty.every((step) => !step.done)).toBe(true);
  });

  it("sums closings exactly and counts pending differences", () => {
    const methods = (dinheiro: number, pix: number) => ({ dinheiro, pix, debito: 0, credito: 0 });
    const totals = summarizeClosings([
      { status: "fechado", countedByMethod: methods(50_000, 20_000), differenceByMethod: methods(0, 0) },
      { status: "diferenca-pendente", countedByMethod: methods(30_000, 0), differenceByMethod: methods(-750, 0) },
    ]);
    expect(totals).toEqual({
      turns: 2,
      pending: 1,
      countedByMethod: methods(80_000, 20_000),
      differenceByMethod: methods(-750, 0),
    });
    expect(() =>
      summarizeClosings([
        { status: "fechado", countedByMethod: methods(Number.MAX_SAFE_INTEGER, 0), differenceByMethod: methods(0, 0) },
        { status: "fechado", countedByMethod: methods(1, 0), differenceByMethod: methods(0, 0) },
      ]),
    ).toThrow("UNSAFE_TOTAL");
  });
});
