export const MOVEMENTS_STORAGE_KEY = "sobra:station-movements:v1";
export async function readMovementData(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(MOVEMENTS_STORAGE_KEY);
}
export async function writeMovementData(value: string): Promise<void> {
  if (typeof window === "undefined")
    throw new Error("Armazenamento local indisponível.");
  window.localStorage.setItem(MOVEMENTS_STORAGE_KEY, value);
}
