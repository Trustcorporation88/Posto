export type CurrentFuelTankSnapshot = {
  id: number;
  productId: number;
  latestMeasurement: { status: string } | null;
};

export type CurrentFuelTankFilters = {
  productId?: number;
  tankId?: number;
  pumpId?: number;
  tankIdsForSelectedPump?: ReadonlySet<number>;
};

/** Inventory snapshots are current-state data, not bounded by the sales/reporting period. */
export function filterCurrentFuelTankSnapshots<TRow extends CurrentFuelTankSnapshot>(
  rows: readonly TRow[],
  filters: CurrentFuelTankFilters,
): TRow[] {
  return rows.filter((row) =>
    (!filters.productId || row.productId === filters.productId) &&
    (!filters.tankId || row.id === filters.tankId) &&
    (!filters.pumpId || filters.tankIdsForSelectedPump?.has(row.id) === true),
  );
}

export function countPendingCurrentFuelTankDifferences(
  rows: readonly CurrentFuelTankSnapshot[],
): number {
  return rows.filter((row) => row.latestMeasurement?.status === "pending").length;
}
