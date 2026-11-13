import { describe, expect, it } from "vitest";
import {
  applyMovingAverageDelta,
  assertWithinTankCapacity,
  doesFuelTankTheoreticalBalanceMatch,
  FuelDomainError,
  isMovementTimestampAtOrAfter,
  isTimestampAtOrBefore,
  isTimestampStrictlyAfter,
  litersAtPriceToCents,
  litersToMilliLiters,
  meterInterval,
  moneyToCents,
  movingAverageCost,
  signedLitersToMilliLiters,
  tankVariance,
} from "../lib/business/fuel-domain";

describe("fuel domain exact decimal arithmetic", () => {
  it("permits equal movement timestamps but rejects events earlier than the ledger", () => {
    expect(isMovementTimestampAtOrAfter(1_000, null)).toBe(true);
    expect(isMovementTimestampAtOrAfter(1_001, 1_000)).toBe(true);
    expect(isMovementTimestampAtOrAfter(1_000, 1_000)).toBe(true);
    expect(isMovementTimestampAtOrAfter(999, 1_000)).toBe(false);
  });

  it("requires physical measurements and inventory events to follow their prior snapshot", () => {
    expect(isTimestampStrictlyAfter(1_001, null)).toBe(true);
    expect(isTimestampStrictlyAfter(1_001, 1_000)).toBe(true);
    expect(isTimestampStrictlyAfter(1_000, 1_000)).toBe(false);
    expect(isTimestampStrictlyAfter(999, 1_000)).toBe(false);
  });

  it("rejects future operational timestamps while allowing the current instant", () => {
    expect(isTimestampAtOrBefore(1_000, 1_000)).toBe(true);
    expect(isTimestampAtOrBefore(999, 1_000)).toBe(true);
    expect(isTimestampAtOrBefore(1_001, 1_000)).toBe(false);
  });

  it("parses signed theoretical inventory without float conversion", () => {
    expect(signedLitersToMilliLiters("-12,345")).toBe(-12_345n);
    expect(signedLitersToMilliLiters("0")).toBe(0n);
    expect(() => signedLitersToMilliLiters("-1,2345")).toThrow(
      FuelDomainError,
    );
  });

  it("requires a measurement to match the theoretical balance shown for confirmation", () => {
    expect(doesFuelTankTheoreticalBalanceMatch("-1,200", "-1.2")).toBe(true);
    expect(doesFuelTankTheoreticalBalanceMatch("2,500", "2.501")).toBe(false);
    expect(doesFuelTankTheoreticalBalanceMatch("invalid", "0.000")).toBe(false);
  });

  it("parses comma and point decimal liters to exact thousandths", () => {
    expect(litersToMilliLiters("1234,567")).toBe(1_234_567n);
    expect(litersToMilliLiters("1234.5")).toBe(1_234_500n);
    expect(litersToMilliLiters("0,001")).toBe(1n);
  });

  it.each(["", "-1", "+1", "1,2345", "1.234,567", "1e3", "1 000"])(
    "rejects ambiguous or out-of-scale liters: %s",
    (value) =>
      expect(() => litersToMilliLiters(value)).toThrow(FuelDomainError),
  );

  it("parses Brazilian and invariant currency formats to integer cents", () => {
    expect(moneyToCents("7,15")).toBe(715);
    expect(moneyToCents("7.15")).toBe(715);
    expect(moneyToCents("R$ 1.234,56")).toBe(123_456);
    expect(moneyToCents("1.234")).toBe(123_400);
  });

  it.each(["", "-7,15", "1,234", "1,2.3", "7,15.99", "1e4"])(
    "rejects invalid money: %s",
    (value) => expect(() => moneyToCents(value)).toThrow(FuelDomainError),
  );

  it("calculates meter volume and rounds the period total to cents once", () => {
    const result = meterInterval({
      previousCounterLiters: "10000,125",
      finalCounterLiters: "10123,456",
      centsPerLiter: 629,
    });
    expect(result.volumeLiters).toBe("123.331");
    expect(result.estimatedRevenueCents).toBe(77_575);
  });

  it("rejects a lower final counter unless the caller uses the separate reset event", () => {
    expect(() =>
      meterInterval({
        previousCounterLiters: "100",
        finalCounterLiters: "99",
        centsPerLiter: 600,
      }),
    ).toThrowError(expect.objectContaining({ code: "METER_COUNTER_REVERSED" }));
  });

  it("uses integer arithmetic for a large volume-price multiplication", () => {
    expect(litersAtPriceToCents(99_999_999_999n, 799)).toBe(79_899_999_999);
  });

  it("computes physical minus theoretical stock with an explicit sign", () => {
    expect(tankVariance("1000,250", "998,750")).toMatchObject({
      differenceMilliLiters: -1_500n,
      differenceLiters: "-1.500",
      hasDifference: true,
    });
    expect(tankVariance("100", "100").hasDifference).toBe(false);
  });

  it("enforces configured tank capacity without rounding", () => {
    expect(() =>
      assertWithinTankCapacity({
        nextTheoreticalLiters: "1000,001",
        capacityLiters: "1000",
      }),
    ).toThrowError(expect.objectContaining({ code: "CAPACITY_EXCEEDED" }));
  });
});

describe("fuel moving weighted-average valuation", () => {
  it("replays equal-second MySQL events by numeric append ID", () => {
    const result = movingAverageCost([
      {
        id: "10",
        occurredAt: 1_000,
        quantityMilliLiters: "-500",
        valueCents: null,
      },
      {
        id: "9",
        occurredAt: 1_000,
        quantityMilliLiters: "1000",
        valueCents: "600",
      },
    ]);
    expect(result.get("10")).toMatchObject({
      issueCostCents: 300,
      quantityMilliLiters: 500n,
      inventoryValueCents: 300n,
      averageUnitCostCentsPerLiter: 600,
    });
  });

  it("allocates cost of sales from the weighted average and preserves exact remaining value", () => {
    const result = movingAverageCost([
      {
        id: "opening",
        occurredAt: 1,
        quantityMilliLiters: "1000000",
        valueCents: "5000000",
      },
      {
        id: "receipt",
        occurredAt: 2,
        quantityMilliLiters: "1000000",
        valueCents: "6000000",
      },
      {
        id: "sale",
        occurredAt: 3,
        quantityMilliLiters: "-100000",
        valueCents: null,
      },
    ]);
    expect(result.get("receipt")?.averageUnitCostCentsPerLiter).toBe(5500);
    expect(result.get("sale")).toMatchObject({
      issueCostCents: 550_000,
      quantityMilliLiters: 1_900_000n,
      inventoryValueCents: 10_450_000n,
      averageUnitCostCentsPerLiter: 5500,
    });
  });

  it("does not invent a cost basis for unvalued opening stock", () => {
    const result = movingAverageCost([
      {
        id: "opening",
        occurredAt: 1,
        quantityMilliLiters: "1000000",
        valueCents: null,
      },
      {
        id: "receipt",
        occurredAt: 2,
        quantityMilliLiters: "100000",
        valueCents: "600000",
      },
      {
        id: "sale",
        occurredAt: 3,
        quantityMilliLiters: "-50000",
        valueCents: null,
      },
    ]);
    expect(result.get("receipt")?.averageUnitCostCentsPerLiter).toBeNull();
    expect(result.get("sale")?.issueCostCents).toBeNull();
  });

  it("restores a known cost basis only after an uncosted deficit is cleared", () => {
    const result = movingAverageCost([
      {
        id: "sale",
        occurredAt: 1,
        quantityMilliLiters: "-100000",
        valueCents: null,
      },
      {
        id: "receipt",
        occurredAt: 2,
        quantityMilliLiters: "150000",
        valueCents: "900000",
      },
    ]);
    expect(result.get("receipt")).toMatchObject({
      quantityMilliLiters: 50_000n,
      inventoryValueCents: 300_000n,
      averageUnitCostCentsPerLiter: 6000,
    });
  });

  it("updates the materialized state with the same weighted-average allocation", () => {
    const afterOpening = applyMovingAverageDelta(
      {
        quantityMilliLiters: "0",
        inventoryValueCents: "0",
        costKnown: true,
      },
      1_000_000n,
      5_000_000n,
    );
    const afterReceipt = applyMovingAverageDelta(
      afterOpening.state,
      1_000_000n,
      6_000_000n,
    );
    const afterSale = applyMovingAverageDelta(
      afterReceipt.state,
      -100_000n,
      null,
    );
    expect(afterSale.issueCostCents).toBe(550_000n);
    expect(afterSale.state).toEqual({
      quantityMilliLiters: "1900000",
      inventoryValueCents: "10450000",
      costKnown: true,
    });
  });

  it("does not invent cost when readings exceed known tank inventory", () => {
    const result = applyMovingAverageDelta(
      {
        quantityMilliLiters: "100000",
        inventoryValueCents: "600000",
        costKnown: true,
      },
      -150_000n,
      null,
    );
    expect(result.issueCostCents).toBeNull();
    expect(result.state).toEqual({
      quantityMilliLiters: "-50000",
      inventoryValueCents: null,
      costKnown: false,
    });
  });

  it("restores an incremental cost basis after a priced delivery clears shortage", () => {
    const result = applyMovingAverageDelta(
      {
        quantityMilliLiters: "-100000",
        inventoryValueCents: null,
        costKnown: false,
      },
      150_000n,
      900_000n,
    );
    expect(result.state).toEqual({
      quantityMilliLiters: "50000",
      inventoryValueCents: "300000",
      costKnown: true,
    });
  });
});
