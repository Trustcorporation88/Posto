export const STORAGE_KEY = "sobra:budget:v1";
export async function readStoredData(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}
export async function writeStoredData(value: string): Promise<void> {
  if (typeof window === "undefined")
    throw new Error("Armazenamento do navegador indisponível.");
  window.localStorage.setItem(STORAGE_KEY, value);
}
