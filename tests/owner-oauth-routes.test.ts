import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { registerOAuthRoutes } from "../server/_core/oauth";
import { isAllowedOwnerOAuthStart } from "../server/_core/owner-oauth-flow";

const fake = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn(), getUserInfo: vi.fn(), createSessionToken: vi.fn(),
  upsertUser: vi.fn(), getUserByOpenId: vi.fn(),
}));
vi.mock("../server/_core/sdk", () => ({ sdk: fake }));
vi.mock("../server/db", () => fake);
vi.mock("../server/_core/env", () => ({ ENV: { appId: "fixture-project", cookieSecret: "fixture-signing-secret-not-real" } }));

let server: Server;
let base: string;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("MANUS_OAUTH_PORTAL_URL", "https://login.example.test");
  fake.exchangeCodeForToken.mockResolvedValue({ accessToken: "fixture-provider-token" });
  fake.getUserInfo.mockResolvedValue({ openId: "fixture-owner", name: "Test Owner" });
  fake.upsertUser.mockResolvedValue(undefined);
  fake.getUserByOpenId.mockResolvedValue({ id: 1, openId: "fixture-owner", role: "admin" });
  fake.createSessionToken.mockResolvedValue("fixture-session");
  const app = express();
  app.use(express.json());
  registerOAuthRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fixture listener");
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function begin(purpose = "setup", secure = false) {
  const response = await fetch(`${base}/api/oauth/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Origin: base, "Sec-Fetch-Site": "same-origin",
      ...(secure ? { "X-Forwarded-Proto": "https" } : {}),
    },
    body: JSON.stringify({ purpose, redirectUri: `${base}/api/oauth/callback` }),
  });
  const data = await response.json();
  const state = data.loginUrl ? new URL(data.loginUrl).searchParams.get("state") : "";
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { response, state: state ?? "", cookie, data };
}
async function callback(state: string, cookie = "", secure = false) {
  return fetch(`${base}/api/oauth/callback?${new URLSearchParams({ code: "fixture-code", state })}`, {
    redirect: "manual",
    headers: { Cookie: cookie, ...(secure ? { "X-Forwarded-Proto": "https" } : {}) },
  });
}

describe("browser-bound owner OAuth routes, no database or provider requests", () => {
  it.each(["setup", "recover"])("returns directly to the fixed %s screen without browser storage", async (purpose) => {
    const started = await begin(purpose);
    expect(started.response.status).toBe(200);
    const loginUrl = new URL(started.data.loginUrl);
    expect(loginUrl.searchParams.get("responseType")).toBe("code");
    const returned = await callback(started.state, started.cookie);
    expect(returned.status).toBe(302);
    expect(returned.headers.get("location")).toBe(`${purpose === "recover" ? "/gestao/recuperar" : "/gestao/configurar"}?oauth=returned`);
    expect(returned.headers.get("set-cookie")).toContain("Expires=Thu, 01 Jan 1970");
    expect(fake.exchangeCodeForToken).toHaveBeenCalledWith("fixture-code", started.state);
    expect(fake.upsertUser).toHaveBeenCalledTimes(1);
  });

  it("sets a host-only HttpOnly Secure SameSite=None cookie on the public HTTPS transport", async () => {
    const { response } = await begin("setup", true);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("__Host-gas_pump_oauth_pending=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Domain=");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("fails closed without the browser cookie and never exchanges or syncs a user", async () => {
    const { state } = await begin();
    const returned = await callback(state);
    expect(returned.headers.get("location")).toBe("/gestao/configurar?oauth=failed");
    expect(fake.exchangeCodeForToken).not.toHaveBeenCalled();
    expect(fake.upsertUser).not.toHaveBeenCalled();
  });

  it("rejects a nonce from another attempt before exchange or synchronization", async () => {
    const first = await begin();
    const second = await begin();
    const returned = await callback(first.state, second.cookie);
    expect(returned.headers.get("location")).toBe("/gestao/configurar?oauth=failed");
    expect(fake.exchangeCodeForToken).not.toHaveBeenCalled();
    expect(fake.upsertUser).not.toHaveBeenCalled();
  });

  it("ignores a request-controlled return URL and purpose", async () => {
    const started = await begin();
    const response = await fetch(`${base}/api/oauth/callback?${new URLSearchParams({
      code: "fixture-code", state: started.state, returnTo: "https://attacker.example.test", purpose: "recover",
    })}`, { redirect: "manual", headers: { Cookie: started.cookie } });
    expect(response.headers.get("location")).toBe("/gestao/configurar?oauth=returned");
  });

  it.each(["https://attacker.example.test/api/oauth/callback", `${"https://app.example.test"}/wrong`])("refuses unauthorized callback %s", async (redirectUri) => {
    const response = await fetch(`${base}/api/oauth/start`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: base, "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ purpose: "setup", redirectUri }),
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("refuses unrecognized purpose or missing request origin", async () => {
    expect((await begin("admin")).response.status).toBe(403);
    const response = await fetch(`${base}/api/oauth/start`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "setup", redirectUri: `${base}/api/oauth/callback` }),
    });
    expect(response.status).toBe(403);
  });

  it("explains provider failure on the right screen without creating a session", async () => {
    const started = await begin("recover");
    fake.exchangeCodeForToken.mockRejectedValueOnce(new Error("fixture failure"));
    const returned = await callback(started.state, started.cookie);
    expect(returned.headers.get("location")).toBe("/gestao/recuperar?oauth=failed");
    expect(fake.upsertUser).not.toHaveBeenCalled();
    expect(fake.createSessionToken).not.toHaveBeenCalled();
  });

  it("keeps the legacy native endpoint and state format unchanged", async () => {
    const state = Buffer.from("fixture-app://oauth/callback").toString("base64");
    const response = await fetch(`${base}/api/oauth/mobile?${new URLSearchParams({ code: "fixture-code", state })}`);
    expect(response.status).toBe(200);
    expect(fake.exchangeCodeForToken).toHaveBeenCalledWith("fixture-code", state);
  });

  it("keeps a cancelled recovery on the recovery screen without token exchange", async () => {
    const started = await begin("recover");
    const response = await fetch(`${base}/api/oauth/callback?${new URLSearchParams({ state: started.state, error: "access_denied" })}`, {
      redirect: "manual", headers: { Cookie: started.cookie },
    });
    expect(response.headers.get("location")).toBe("/gestao/recuperar?oauth=failed");
    expect(fake.exchangeCodeForToken).not.toHaveBeenCalled();
    expect(fake.upsertUser).not.toHaveBeenCalled();
    expect(fake.createSessionToken).not.toHaveBeenCalled();
  });
});

describe("OAuth origin validation", () => {
  it("accepts only explicitly trusted paired Preview origins", () => {
    const origin = "https://8328-fixture.example.test";
    expect(isAllowedOwnerOAuthStart({ origin, redirectUri: "https://3000-fixture.example.test/api/oauth/callback", sameOrigin: false, trustedOrigins: new Set([origin]) })).toBe(true);
    expect(isAllowedOwnerOAuthStart({ origin, redirectUri: "https://3000-fixture.example.test/api/oauth/callback", sameOrigin: false, trustedOrigins: new Set() })).toBe(false);
    expect(isAllowedOwnerOAuthStart({ origin, redirectUri: "https://elsewhere.example.test/api/oauth/callback", sameOrigin: false, trustedOrigins: new Set([origin]) })).toBe(false);
  });
});
