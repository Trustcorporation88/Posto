export const OPENING_STORAGE_KEY = "sobra:station-opening:v1";

export async function readOpeningData(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(OPENING_STORAGE_KEY);
}

export async function writeOpeningData(value: string): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Armazenamento do navegador indisponível.");
  }
  window.localStorage.setItem(OPENING_STORAGE_KEY, value);
}
