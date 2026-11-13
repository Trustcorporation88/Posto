import { describe, expect, it, vi } from "vitest";
import {
  installBusinessSessionEvents,
  notifyBusinessSessionChanged,
} from "../lib/business-session-events";

const markerKey = "sobra:business-session-change:v1";

function makeHub() {
  const channels = new Set<TestChannel>();
  const sent: unknown[] = [];
  class TestChannel {
    onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
    constructor(readonly name: string) { channels.add(this); }
    postMessage(data: unknown) {
      sent.push(data);
      for (const channel of channels) {
        if (channel !== this && channel.name === this.name) {
          channel.onmessage?.({ data } as MessageEvent<unknown>);
        }
      }
    }
    close() { channels.delete(this); }
  }
  return { Channel: TestChannel, channels, sent };
}

function makeBrowser(
  data = new Map<string, string>(),
  Channel?: unknown,
  blockedStorage = false,
) {
  const target = new EventTarget();
  const reload = vi.fn();
  const storage = {
    getItem: (key: string) => {
      if (blockedStorage) throw new Error("storage blocked");
      return data.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (blockedStorage) throw new Error("storage blocked");
      data.set(key, value);
    },
  };
  const browser = {
    localStorage: storage,
    location: { reload },
    BroadcastChannel: Channel,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  } as unknown as Window;
  return { browser, reload, data };
}

function storageEvent(browser: Window, key: string, newValue: string) {
  browser.dispatchEvent(Object.assign(new Event("storage"), { key, newValue }));
}

describe("invalidação comercial entre abas", () => {
  it("é seguro em SSR sem navegador", () => {
    expect(() => notifyBusinessSessionChanged()).not.toThrow();
    expect(() => installBusinessSessionEvents()()).not.toThrow();
  });

  it("envia somente marcador técnico e sinal, preservando registros financeiros locais", () => {
    const hub = makeHub();
    const tab = makeBrowser(new Map([["sobra:station-register:v1", "registro-local"]]), hub.Channel);
    notifyBusinessSessionChanged(tab.browser);
    expect(tab.data.get("sobra:station-register:v1")).toBe("registro-local");
    expect([...tab.data.keys()]).toEqual(["sobra:station-register:v1", markerKey]);
    expect(hub.sent).toHaveLength(1);
    expect(Object.keys(hub.sent[0] as object).sort()).toEqual(["source", "type", "version"]);
    expect(hub.sent[0]).toMatchObject({ type: "session-changed", version: 1 });
    expect(hub.channels.size).toBe(0);
  });

  it("não recarrega a aba iniciadora por broadcast próprio nem ao recuperar foco", () => {
    const hub = makeHub();
    const tab = makeBrowser(new Map(), hub.Channel);
    const cleanup = installBusinessSessionEvents(tab.browser);
    notifyBusinessSessionChanged(tab.browser);
    tab.browser.dispatchEvent(new Event("focus"));
    expect(tab.reload).not.toHaveBeenCalled();
    cleanup();
  });

  it("recarrega a outra aba apenas uma vez mesmo recebendo broadcast e storage", () => {
    const hub = makeHub();
    const data = new Map<string, string>();
    const first = makeBrowser(data, hub.Channel);
    const second = makeBrowser(data, hub.Channel);
    const stopFirst = installBusinessSessionEvents(first.browser);
    const stopSecond = installBusinessSessionEvents(second.browser);
    notifyBusinessSessionChanged(first.browser);
    storageEvent(second.browser, markerKey, data.get(markerKey)!);
    second.browser.dispatchEvent(new Event("focus"));
    expect(first.reload).not.toHaveBeenCalled();
    expect(second.reload).toHaveBeenCalledTimes(1);
    stopFirst();
    stopSecond();
  });

  it("ignora alterações do orçamento local e mensagens sem formato reconhecido", () => {
    const hub = makeHub();
    const tab = makeBrowser(new Map(), hub.Channel);
    const cleanup = installBusinessSessionEvents(tab.browser);
    storageEvent(tab.browser, "sobra:budget:v1", "novo-orçamento");
    for (const channel of hub.channels) {
      channel.onmessage?.({ data: { type: "other", version: 1 } } as MessageEvent<unknown>);
      channel.onmessage?.({ data: null } as MessageEvent<unknown>);
    }
    expect(tab.reload).not.toHaveBeenCalled();
    cleanup();
  });

  it("detecta marcador perdido durante suspensão quando volta ao foco", () => {
    const tab = makeBrowser();
    const cleanup = installBusinessSessionEvents(tab.browser);
    tab.data.set(markerKey, "nova-sessão-técnica");
    tab.browser.dispatchEvent(new Event("focus"));
    expect(tab.reload).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("funciona por canal quando armazenamento está bloqueado", () => {
    const hub = makeHub();
    const first = makeBrowser(new Map(), hub.Channel, true);
    const second = makeBrowser(new Map(), hub.Channel, true);
    const cleanup = installBusinessSessionEvents(second.browser);
    expect(() => notifyBusinessSessionChanged(first.browser)).not.toThrow();
    expect(second.reload).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("usa evento de storage quando canal não está disponível", () => {
    const tab = makeBrowser();
    const cleanup = installBusinessSessionEvents(tab.browser);
    storageEvent(tab.browser, markerKey, "nova-versão");
    expect(tab.reload).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("falha de envio do canal não transforma login confirmado em erro", () => {
    const close = vi.fn();
    class BrokenChannel {
      postMessage() { throw new Error("channel blocked"); }
      close = close;
    }
    const tab = makeBrowser(new Map(), BrokenChannel);
    expect(() => notifyBusinessSessionChanged(tab.browser)).not.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("remove listeners e fecha canal ao desmontar o layout", () => {
    const hub = makeHub();
    const tab = makeBrowser(new Map(), hub.Channel);
    const cleanup = installBusinessSessionEvents(tab.browser);
    expect(hub.channels.size).toBe(1);
    cleanup();
    storageEvent(tab.browser, markerKey, "novo");
    tab.data.set(markerKey, "novo");
    tab.browser.dispatchEvent(new Event("focus"));
    expect(tab.reload).not.toHaveBeenCalled();
    expect(hub.channels.size).toBe(0);
  });
});
