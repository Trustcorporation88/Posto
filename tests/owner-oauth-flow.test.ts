import { describe, expect, it } from "vitest";
import {
  decodeOAuthRedirectUri,
  isExactWebOAuthCallback,
  isOwnerOAuthPurpose,
} from "../shared/oauth-flow";
import {
  OWNER_OAUTH_TTL_MS,
  createOwnerOAuthAttempt,
  ownerOAuthLoginUrl,
  validateOwnerOAuthAttempt,
} from "../server/_core/owner-oauth-flow";
import { ownerAccessNotice } from "../lib/business-owner-access";

const FIXTURE_SECRET = "vitest-only-fixture-signing-password-not-a-real-secret";
const CALLBACK = "https://callback.example.test/api/oauth/callback";
const OTHER_CALLBACK = "https://other.example.test/api/oauth/callback";
const PORTAL = "https://portal.example.test/";
const NOW = 1_800_000_000_000;

function encoded(value: unknown): string {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64");
}

describe("owner OAuth attempt", () => {
  it("creates a distinct nonce for each attempt and binds nonce and redirect URI to its state", () => {
    const first = createOwnerOAuthAttempt("setup", CALLBACK, FIXTURE_SECRET, NOW);
    const second = createOwnerOAuthAttempt("setup", CALLBACK, FIXTURE_SECRET, NOW);
    expect(first.cookie).not.toBe(second.cookie);

    const firstPending = validateOwnerOAuthAttempt(first.cookie, first.state, FIXTURE_SECRET, NOW);
    const secondPending = validateOwnerOAuthAttempt(second.cookie, second.state, FIXTURE_SECRET, NOW);
    expect(firstPending?.nonce).toMatch(/^[a-f0-9]{64}$/);
    expect(secondPending?.nonce).toMatch(/^[a-f0-9]{64}$/);
    expect(firstPending?.nonce).not.toBe(secondPending?.nonce);
    expect(validateOwnerOAuthAttempt(first.cookie, second.state, FIXTURE_SECRET, NOW)).toBeNull();

    const tamperedRedirect = encoded({ redirectUri: OTHER_CALLBACK, nonce: firstPending!.nonce });
    expect(validateOwnerOAuthAttempt(first.cookie, tamperedRedirect, FIXTURE_SECRET, NOW)).toBeNull();
    const tamperedNonce = encoded({ redirectUri: CALLBACK, nonce: "0".repeat(64) });
    expect(validateOwnerOAuthAttempt(first.cookie, tamperedNonce, FIXTURE_SECRET, NOW)).toBeNull();
  });

  it("accepts only the fixed setup/recover purposes and preserves the selected purpose", () => {
    expect(isOwnerOAuthPurpose("setup")).toBe(true);
    expect(isOwnerOAuthPurpose("recover")).toBe(true);
    for (const invalid of ["login", "admin", "Setup", "", null, undefined]) {
      expect(isOwnerOAuthPurpose(invalid)).toBe(false);
      expect(() => createOwnerOAuthAttempt(invalid as never, CALLBACK, FIXTURE_SECRET, NOW)).toThrow();
    }
    expect(validateOwnerOAuthAttempt(createOwnerOAuthAttempt("setup", CALLBACK, FIXTURE_SECRET, NOW).cookie,
      createOwnerOAuthAttempt("setup", CALLBACK, FIXTURE_SECRET, NOW).state, FIXTURE_SECRET, NOW)).toBeNull();
    for (const purpose of ["setup", "recover"] as const) {
      const attempt = createOwnerOAuthAttempt(purpose, CALLBACK, FIXTURE_SECRET, NOW);
      expect(validateOwnerOAuthAttempt(attempt.cookie, attempt.state, FIXTURE_SECRET, NOW)?.purpose).toBe(purpose);
    }
  });

  it("rejects altered signatures, missing cookies, a different signing key, and malformed/legacy state", () => {
    const attempt = createOwnerOAuthAttempt("recover", CALLBACK, FIXTURE_SECRET, NOW);
    const [payload, signature] = attempt.cookie.split(".");
    const changedSignature = `${payload}.${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;
    expect(validateOwnerOAuthAttempt(changedSignature, attempt.state, FIXTURE_SECRET, NOW)).toBeNull();
    expect(validateOwnerOAuthAttempt(undefined, attempt.state, FIXTURE_SECRET, NOW)).toBeNull();
    expect(validateOwnerOAuthAttempt(attempt.cookie, attempt.state, `${FIXTURE_SECRET}-different`, NOW)).toBeNull();
    expect(validateOwnerOAuthAttempt(attempt.cookie, "not-json-or-base64", FIXTURE_SECRET, NOW)).toBeNull();
    expect(validateOwnerOAuthAttempt(attempt.cookie, encoded(CALLBACK), FIXTURE_SECRET, NOW)).toBeNull();
    expect(validateOwnerOAuthAttempt(attempt.cookie, encoded({ redirectUri: CALLBACK }), FIXTURE_SECRET, NOW)).toBeNull();
  });

  it("rejects attempts at or beyond ten minutes old and timestamps in the future", () => {
    const attempt = createOwnerOAuthAttempt("setup", CALLBACK, FIXTURE_SECRET, NOW);
    expect(validateOwnerOAuthAttempt(attempt.cookie, attempt.state, FIXTURE_SECRET, NOW + OWNER_OAUTH_TTL_MS - 1)).not.toBeNull();
    expect(validateOwnerOAuthAttempt(attempt.cookie, attempt.state, FIXTURE_SECRET, NOW + OWNER_OAUTH_TTL_MS)).toBeNull();
    expect(validateOwnerOAuthAttempt(attempt.cookie, attempt.state, FIXTURE_SECRET, NOW - 1)).toBeNull();
  });

  it("does not expose the signing secret in the returned attempt or validation output", () => {
    const attempt = createOwnerOAuthAttempt("setup", CALLBACK, FIXTURE_SECRET, NOW);
    const pending = validateOwnerOAuthAttempt(attempt.cookie, attempt.state, FIXTURE_SECRET, NOW);
    expect(JSON.stringify({ attempt, pending })).not.toContain(FIXTURE_SECRET);
  });
});

describe("owner OAuth login URL", () => {
  it("uses the HTTPS portal app-auth contract with code, app ID, state, and callback", () => {
    const url = new URL(ownerOAuthLoginUrl(PORTAL, "fixture-app-id", CALLBACK, "fixture-state"));
    expect(url.origin).toBe("https://portal.example.test");
    expect(url.pathname).toBe("/app-auth");
    expect(url.searchParams.get("responseType")).toBe("code");
    expect(url.searchParams.get("appId")).toBe("fixture-app-id");
    expect(url.searchParams.get("state")).toBe("fixture-state");
    expect(url.searchParams.get("redirectUri")).toBe(CALLBACK);
  });

  it("rejects non-HTTPS portals and portals containing credentials", () => {
    expect(() => ownerOAuthLoginUrl("http://portal.example.test", "fixture-app", CALLBACK, "state")).toThrow();
    expect(() => ownerOAuthLoginUrl("https://user:pass@portal.example.test", "fixture-app", CALLBACK, "state")).toThrow();
  });
});

describe("OAuth redirect URI helpers", () => {
  it("decodes JSON web state and legacy native URI state", () => {
    expect(decodeOAuthRedirectUri(encoded({ redirectUri: CALLBACK, nonce: "fixture" }))).toBe(CALLBACK);
    expect(decodeOAuthRedirectUri(encoded("gas-pump://oauth/return"))).toBe("gas-pump://oauth/return");
  });

  it("requires an exact web callback without query, hash, credentials, or arbitrary path", () => {
    expect(isExactWebOAuthCallback(CALLBACK)).toBe(true);
    for (const invalid of [
      `${CALLBACK}?code=fixture`,
      `${CALLBACK}#fragment`,
      "https://user:pass@callback.example.test/api/oauth/callback",
      "https://callback.example.test/arbitrary",
      "https://callback.example.test/api/oauth/callback/extra",
      "ftp://callback.example.test/api/oauth/callback",
      "https://callback.example.test/api/oauth/callback/",
    ]) expect(isExactWebOAuthCallback(invalid)).toBe(false);
  });
});

describe("owner access notices", () => {
  const baseline = {
    checking: false,
    apiFailed: false,
    authenticated: false,
    canBootstrap: false,
    hasOrganization: false,
  };

  it("covers verification, API failure, and an existing organization", () => {
    expect(ownerAccessNotice({ ...baseline, checking: true }).message).toContain("Verificando");
    expect(ownerAccessNotice({ ...baseline, apiFailed: true }).message).toContain("API");
    expect(ownerAccessNotice({ ...baseline, hasOrganization: true }).message).toContain("já foi configurada");
  });

  it("covers OAuth failure and an unrecognized session after return", () => {
    expect(ownerAccessNotice({ ...baseline, oauthResult: "failed" }).message).toContain("tentativa expirou");
    const returned = ownerAccessNotice({ ...baseline, oauthResult: "returned" });
    expect(returned.message).toContain("sessão Manus não foi reconhecida");
    expect(returned.warning).toBe(true);
  });

  it("distinguishes an authenticated non-owner from an authorized owner", () => {
    const nonOwner = ownerAccessNotice({ ...baseline, authenticated: true, canBootstrap: false });
    expect(nonOwner.message).toContain("não foi autorizada como proprietária");
    expect(nonOwner.warning).toBe(true);

    const owner = ownerAccessNotice({ ...baseline, authenticated: true, canBootstrap: true });
    expect(owner.message).toContain("reconhecida como proprietária");
    expect(owner.warning).toBe(false);
  });
});
