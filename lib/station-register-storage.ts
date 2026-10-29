import AsyncStorage from "@react-native-async-storage/async-storage";
import { readOpeningData } from "./shift-opening-storage";
import { readMovementData } from "./shift-movements-storage";

export const STATION_REGISTER_STORAGE_KEY = "sobra:station-register:v1";
export async function readStationRegisterData(): Promise<string | null> {
  return AsyncStorage.getItem(STATION_REGISTER_STORAGE_KEY);
}
export async function writeStationRegisterData(value: string): Promise<void> {
  await AsyncStorage.setItem(STATION_REGISTER_STORAGE_KEY, value);
}
export async function readLegacyOpeningData(): Promise<string | null> {
  return readOpeningData();
}
export async function readLegacyMovementData(): Promise<string | null> {
  return readMovementData();
}
