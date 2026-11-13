import { describe, expect, it } from "vitest";
import {
  countPendingCurrentFuelTankDifferences,
  filterCurrentFuelTankSnapshots,
  type CurrentFuelTankSnapshot,
} from "../lib/business/fuel-dashboard";

const tanks: CurrentFuelTankSnapshot[] = [
  { id: 11, productId: 1, latestMeasurement: { status: "pending" } },
  { id: 12, productId: 1, latestMeasurement: { status: "matched" } },
  { id: 21, productId: 2, latestMeasurement: { status: "pending" } },
  { id: 22, productId: 2, latestMeasurement: null },
];

describe("current fuel tank dashboard filters", () => {
  it("combines product and tank filters before counting pending measurements", () => {
    const filtered = filterCurrentFuelTankSnapshots(tanks, {
      productId: 1,
      tankId: 11,
    });

    expect(filtered.map((tank) => tank.id)).toEqual([11]);
    expect(countPendingCurrentFuelTankDifferences(filtered)).toBe(1);
  });

  it("restricts current tank snapshots to tanks served by the selected pump", () => {
    const filtered = filterCurrentFuelTankSnapshots(tanks, {
      pumpId: 8,
      tankIdsForSelectedPump: new Set([12, 21]),
    });

    expect(filtered.map((tank) => tank.id)).toEqual([12, 21]);
    expect(countPendingCurrentFuelTankDifferences(filtered)).toBe(1);
  });

  it("returns no tanks when a selected pump has no active nozzle-to-tank association", () => {
    expect(
      filterCurrentFuelTankSnapshots(tanks, {
        pumpId: 99,
        tankIdsForSelectedPump: new Set(),
      }),
    ).toEqual([]);
  });
});
