import AsyncStorage from "@react-native-async-storage/async-storage";

export const OPENING_STORAGE_KEY = "sobra:station-opening:v1";

export async function readOpeningData(): Promise<string | null> {
  return AsyncStorage.getItem(OPENING_STORAGE_KEY);
}

export async function writeOpeningData(value: string): Promise<void> {
  await AsyncStorage.setItem(OPENING_STORAGE_KEY, value);
}
