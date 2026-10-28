import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OPENING_STORAGE_KEY,
  readOpeningData as readWeb,
  writeOpeningData as writeWeb,
} from "../lib/shift-opening-storage.web";
import {
  readOpeningData as readNative,
  writeOpeningData as writeNative,
} from "../lib/shift-opening-storage";

const { native } = vi.hoisted(() => ({
  native: { getItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: native,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("persistência da abertura isolada do orçamento", () => {
  it("grava a abertura web sem ler ou alterar o orçamento pessoal", async () => {
    const budgetKey = "sobra:budget:v1";
    const budget = '{"version":1,"preservar":"orçamento anterior"}';
    const values = new Map([[budgetKey, budget]]);
    const getItem = vi.fn((key: string) => values.get(key) ?? null);
    const setItem = vi.fn((key: string, value: string) => {
      values.set(key, value);
    });
    vi.stubGlobal("window", { localStorage: { getItem, setItem } });
    expect(await readWeb()).toBeNull();
    await writeWeb("abertura");
    expect(await readWeb()).toBe("abertura");
    expect(values.get(budgetKey)).toBe(budget);
    expect(
      getItem.mock.calls.every(([key]) => key === OPENING_STORAGE_KEY),
    ).toBe(true);
    expect(setItem).toHaveBeenCalledWith(OPENING_STORAGE_KEY, "abertura");
  });

  it("propaga quota e permissão bloqueada, sem alterar registro anterior", async () => {
    let stored = "abertura anterior";
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => stored,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    });
    await expect(writeWeb("nova")).rejects.toThrow("QuotaExceededError");
    expect(stored).toBe("abertura anterior");
    expect(await readWeb()).toBe("abertura anterior");
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
      },
    });
    await expect(readWeb()).rejects.toThrow("SecurityError");
  });

  it("não grava durante renderização sem navegador", async () => {
    vi.stubGlobal("window", undefined);
    expect(await readWeb()).toBeNull();
    await expect(writeWeb("nova")).rejects.toThrow("indisponível");
  });

  it("usa somente a chave de abertura no dispositivo nativo e aguarda setItem", async () => {
    native.getItem.mockResolvedValue("estado");
    let resolve: (() => void) | undefined;
    native.setItem.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    expect(await readNative()).toBe("estado");
    let finished = false;
    const writing = writeNative("novo").then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    resolve!();
    await writing;
    expect(finished).toBe(true);
    expect(native.getItem).toHaveBeenCalledWith(OPENING_STORAGE_KEY);
    expect(native.setItem).toHaveBeenCalledWith(OPENING_STORAGE_KEY, "novo");
  });

  it("não engole erros nativos de leitura ou gravação", async () => {
    native.getItem.mockRejectedValue(new Error("Falha leitura"));
    native.setItem.mockRejectedValue(new Error("Disco cheio"));
    await expect(readNative()).rejects.toThrow("Falha leitura");
    await expect(writeNative("nova")).rejects.toThrow("Disco cheio");
  });
});
