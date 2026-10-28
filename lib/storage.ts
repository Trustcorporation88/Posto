import AsyncStorage from "@react-native-async-storage/async-storage";
export const STORAGE_KEY = "sobra:budget:v1";
export async function readStoredData(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY);
}
export async function writeStoredData(value: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, value);
}
