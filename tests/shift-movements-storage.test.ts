import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MOVEMENTS_STORAGE_KEY,
  readMovementData as readWeb,
  writeMovementData as writeWeb,
} from "../lib/shift-movements-storage.web";
import {
  readMovementData as readNative,
  writeMovementData as writeNative,
} from "../lib/shift-movements-storage";
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
describe("armazenamento separado de movimentações", () => {
  it("usa exclusivamente sua chave web e preserva orçamento e abertura", async () => {
    const values = new Map([
      ["sobra:budget:v1", "budget"],
      ["sobra:station-opening:v1", "opening"],
    ]);
    const localStorage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
    };
    vi.stubGlobal("window", { localStorage });
    expect(await readWeb()).toBeNull();
    await writeWeb("movements");
    expect(await readWeb()).toBe("movements");
    expect(values.get("sobra:budget:v1")).toBe("budget");
    expect(values.get("sobra:station-opening:v1")).toBe("opening");
    expect(localStorage.setItem).toHaveBeenCalledWith(
      MOVEMENTS_STORAGE_KEY,
      "movements",
    );
    expect(
      localStorage.getItem.mock.calls.every(
        ([key]) => key === MOVEMENTS_STORAGE_KEY,
      ),
    ).toBe(true);
  });
  it("usa somente chave própria no AsyncStorage e aguarda gravação", async () => {
    native.getItem.mockResolvedValue("prior");
    native.setItem.mockResolvedValue(undefined);
    expect(await readNative()).toBe("prior");
    await writeNative("next");
    expect(native.getItem).toHaveBeenCalledWith(MOVEMENTS_STORAGE_KEY);
    expect(native.setItem).toHaveBeenCalledWith(MOVEMENTS_STORAGE_KEY, "next");
  });
  it("propaga falha de armazenamento sem tentar apagá-la", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    });
    await expect(readWeb()).rejects.toThrow("SecurityError");
    await expect(writeWeb("x")).rejects.toThrow("QuotaExceededError");
  });
});
