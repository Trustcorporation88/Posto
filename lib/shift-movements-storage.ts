import AsyncStorage from "@react-native-async-storage/async-storage";
export const MOVEMENTS_STORAGE_KEY = "sobra:station-movements:v1";
export async function readMovementData(): Promise<string | null> {
  return AsyncStorage.getItem(MOVEMENTS_STORAGE_KEY);
}
export async function writeMovementData(value: string): Promise<void> {
  await AsyncStorage.setItem(MOVEMENTS_STORAGE_KEY, value);
}
