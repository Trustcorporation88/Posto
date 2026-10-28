import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readStoredData as readWeb,
  writeStoredData as writeWeb,
  STORAGE_KEY,
} from "../lib/storage.web";
import {
  readStoredData as readNative,
  writeStoredData as writeNative,
} from "../lib/storage";
import { createDemoData, validateData } from "../lib/budget";

const { native } = vi.hoisted(() => ({
  native: { getItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: native,
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("armazenamento estritamente local", () => {
  it("restaura exatamente o estado financeiro no navegador", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
      },
    });
    expect(await readWeb()).toBeNull();
    const data = createDemoData("2026-10");
    await writeWeb(JSON.stringify(data));
    expect(values.has(STORAGE_KEY)).toBe(true);
    expect(validateData(JSON.parse((await readWeb())!))).toEqual(data);
  });
  it("não engole falhas de leitura e não sobrescreve dados quando a quota impede gravação", async () => {
    const previous = '{"preservar":"dados anteriores"}';
    let stored = previous;
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => stored,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    });
    await expect(writeWeb("novo estado")).rejects.toThrow("QuotaExceededError");
    expect(stored).toBe(previous);
    expect(await readWeb()).toBe(previous);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
      },
    });
    await expect(readWeb()).rejects.toThrow("SecurityError");
  });
  it("usa AsyncStorage no adaptador nativo e aguarda a gravação", async () => {
    native.getItem.mockResolvedValue("estado nativo");
    native.setItem.mockResolvedValue(undefined);
    expect(await readNative()).toBe("estado nativo");
    await writeNative("novo estado");
    expect(native.getItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(native.setItem).toHaveBeenCalledWith(STORAGE_KEY, "novo estado");
  });
  it("propaga erros nativos e rejeita dados corrompidos em vez de descartá-los", async () => {
    native.setItem.mockRejectedValue(new Error("Disco cheio"));
    await expect(writeNative("novo")).rejects.toThrow("Disco cheio");
    expect(() =>
      validateData({
        version: 88,
        categories: [],
        transactions: [],
        budgets: [],
      }),
    ).toThrow();
    expect(() =>
      validateData({
        version: 1,
        categories: [],
        transactions: [{}],
        budgets: [],
      }),
    ).toThrow();
  });
});
