import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  clearBusinessQueryCache,
  isBusinessQueryKey,
} from "../lib/business-query-cache";

const profileKey = [["businessAuth", "me"], { type: "query" }] as const;

describe("cache privado da sessão comercial", () => {
  it("identifica os módulos comerciais sem confundir queries locais ou públicas", () => {
    expect(isBusinessQueryKey(profileKey)).toBe(true);
    expect(isBusinessQueryKey([["cash", "position"]])).toBe(true);
    expect(isBusinessQueryKey([["fuel", "dashboard"]])).toBe(true);
    expect(isBusinessQueryKey([["businessAdmin", "listMembers"]])).toBe(true);
    expect(isBusinessQueryKey(["businessAuth.me"])).toBe(true);
    expect(isBusinessQueryKey(["budget"])).toBe(false);
    expect(isBusinessQueryKey([["system", "health"]])).toBe(false);
  });

  it("remove perfil, CSRF e dados privados sem apagar queries do app local", async () => {
    const client = new QueryClient();
    const csrfKey = [["businessAuth", "csrf"]] as const;
    const cashKey = [["cash", "position"]] as const;
    const fuelKey = [["fuel", "configuration"]] as const;
    const teamKey = [["businessAdmin", "listMembers"]] as const;
    for (const key of [profileKey, csrfKey, cashKey, fuelKey, teamKey]) {
      client.setQueryData(key, { previousAccount: true });
    }
    client.setQueryData(["budget"], { localData: true });
    await clearBusinessQueryCache(client);
    for (const key of [profileKey, csrfKey, cashKey, fuelKey, teamKey]) {
      expect(client.getQueryData(key)).toBeUndefined();
    }
    expect(client.getQueryData(["budget"])).toEqual({ localData: true });
    client.clear();
  });

  it("cancela consulta antiga para que a resposta tardia não recoloque o perfil anterior", async () => {
    const client = new QueryClient();
    let resolveOld!: (value: { name: string }) => void;
    const pending = client.fetchQuery({
      queryKey: profileKey,
      queryFn: () => new Promise<{ name: string }>((resolve) => {
        resolveOld = resolve;
      }),
    }).catch(() => undefined);
    await clearBusinessQueryCache(client);
    resolveOld({ name: "Conta anterior" });
    await pending;
    expect(client.getQueryData(profileKey)).toBeUndefined();
    client.clear();
  });
});
