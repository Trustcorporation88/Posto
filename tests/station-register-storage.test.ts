import { afterEach, describe, expect, it, vi } from "vitest";
import {
  STATION_REGISTER_STORAGE_KEY as WEB_KEY,
  readStationRegisterData as readWeb,
  writeStationRegisterData as writeWeb,
} from "../lib/station-register-storage.web";
import {
  STATION_REGISTER_STORAGE_KEY as NATIVE_KEY,
  readStationRegisterData as readNative,
  writeStationRegisterData as writeNative,
} from "../lib/station-register-storage";

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

describe("persistência exclusiva do registro do posto", () => {
  it("mantém o orçamento e as chaves de abertura/movimentos legadas na web", async () => {
    const originals = new Map([
      ["sobra:budget:v1", '{"budget":"manter"}'],
      ["sobra:station-opening:v1", '{"opening":"legado"}'],
      ["sobra:station-movements:v1", '{"movements":"legado"}'],
    ]);
    const values = new Map(originals);
    const getItem = vi.fn((key: string) => values.get(key) ?? null);
    const setItem = vi.fn((key: string, value: string) =>
      values.set(key, value),
    );
    vi.stubGlobal("window", { localStorage: { getItem, setItem } });
    expect(WEB_KEY).toBe("sobra:station-register:v1");
    expect(await readWeb()).toBeNull();
    await writeWeb('{"version":1,"revision":0}');
    expect(await readWeb()).toBe('{"version":1,"revision":0}');
    for (const [key, value] of originals) expect(values.get(key)).toBe(value);
    expect(setItem.mock.calls).toEqual([
      [WEB_KEY, '{"version":1,"revision":0}'],
    ]);
    expect(getItem.mock.calls.every(([key]) => key === WEB_KEY)).toBe(true);
  });

  it("usa a mesma chave única no dispositivo nativo e aguarda a persistência", async () => {
    expect(NATIVE_KEY).toBe(WEB_KEY);
    native.getItem.mockResolvedValue(null);
    let finish: (() => void) | undefined;
    native.setItem.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    expect(await readNative()).toBeNull();
    let done = false;
    const writing = writeNative("register").then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    expect(native.getItem).toHaveBeenCalledWith(NATIVE_KEY);
    expect(native.setItem).toHaveBeenCalledWith(NATIVE_KEY, "register");
    finish!();
    await writing;
    expect(done).toBe(true);
  });

  it("propaga erro de leitura, gravação e falta de navegador", async () => {
    native.getItem.mockRejectedValue(new Error("AsyncStorage read failed"));
    native.setItem.mockRejectedValue(new Error("AsyncStorage write failed"));
    await expect(readNative()).rejects.toThrow("AsyncStorage read failed");
    await expect(writeNative("new")).rejects.toThrow(
      "AsyncStorage write failed",
    );
    vi.stubGlobal("window", undefined);
    expect(await readWeb()).toBeNull();
    await expect(writeWeb("new")).rejects.toThrow("indisponível");
  });
});
