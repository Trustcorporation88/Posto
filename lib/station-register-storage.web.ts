import { readOpeningData } from "./shift-opening-storage";
import { readMovementData } from "./shift-movements-storage";

export const STATION_REGISTER_STORAGE_KEY = "sobra:station-register:v1";
export async function readStationRegisterData(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STATION_REGISTER_STORAGE_KEY);
}
export async function writeStationRegisterData(value: string): Promise<void> {
  if (typeof window === "undefined")
    throw new Error("Armazenamento local indisponível.");
  window.localStorage.setItem(STATION_REGISTER_STORAGE_KEY, value);
}
export async function readLegacyOpeningData(): Promise<string | null> {
  return readOpeningData();
}
export async function readLegacyMovementData(): Promise<string | null> {
  return readMovementData();
}
