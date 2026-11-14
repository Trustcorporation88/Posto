import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  isExactWebOAuthCallback,
  isOwnerOAuthPurpose,
  type OwnerOAuthPurpose,
} from "../../shared/oauth-flow";

export const OWNER_OAUTH_TTL_MS = 10 * 60 * 1000;

export function isAllowedOwnerOAuthStart(input: {
  redirectUri: string;
  origin: string | undefined;
  sameOrigin: boolean;
  trustedOrigins: ReadonlySet<string>;
  configuredApiBase?: string;
}) {
  try {
    if (!input.origin || !isExactWebOAuthCallback(input.redirectUri)) return false;
    const origin = new URL(input.origin);
    if (origin.protocol !== "https:" && origin.protocol !== "http:") return false;
    if (origin.origin !== input.origin || origin.username || origin.password) return false;
    if (!input.sameOrigin && !input.trustedOrigins.has(input.origin)) return false;
    if (input.sameOrigin) return new URL(input.redirectUri).origin === input.origin;
    const allowed = new Set([input.origin]);
    const paired = new URL(input.origin);
    paired.hostname = paired.hostname.replace(/^(8081|8328)-/, "3000-");
    allowed.add(paired.origin);
    if (input.configuredApiBase) allowed.add(new URL(input.configuredApiBase).origin);
    return allowed.has(new URL(input.redirectUri).origin);
  } catch {
    return false;
  }
}

type PendingOAuth = {
  purpose: OwnerOAuthPurpose;
  redirectUri: string;
  nonce: string;
  issuedAt: number;
};

function signature(encoded: string, secret: string) {
  if (!secret) throw new Error("OAuth signing configuration unavailable");
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

export function createOwnerOAuthAttempt(
  purpose: OwnerOAuthPurpose,
  redirectUri: string,
  secret: string,
  now = Date.now(),
) {
  if (!isOwnerOAuthPurpose(purpose) || !isExactWebOAuthCallback(redirectUri)) {
    throw new Error("Invalid OAuth attempt");
  }
  const pending: PendingOAuth = { purpose, redirectUri, nonce: randomBytes(32).toString("hex"), issuedAt: now };
  const encoded = Buffer.from(JSON.stringify(pending)).toString("base64url");
  const cookie = `${encoded}.${signature(encoded, secret)}`;
  const state = Buffer.from(JSON.stringify({ redirectUri, nonce: pending.nonce })).toString("base64");
  return { cookie, state };
}

export function validateOwnerOAuthAttempt(
  cookie: string | undefined,
  state: string,
  secret: string,
  now = Date.now(),
): PendingOAuth | null {
  try {
    if (!cookie || cookie.length > 8192 || !state || state.length > 8192) return null;
    const parts = cookie.split(".");
    if (parts.length !== 2) return null;
    const expected = Buffer.from(signature(parts[0], secret));
    const received = Buffer.from(parts[1]);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    const pending = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as PendingOAuth;
    const returned = JSON.parse(Buffer.from(state, "base64").toString("utf8"));
    if (!isOwnerOAuthPurpose(pending.purpose) || !isExactWebOAuthCallback(pending.redirectUri) ||
        !/^[a-f0-9]{64}$/.test(pending.nonce) || !Number.isSafeInteger(pending.issuedAt) ||
        now < pending.issuedAt || now - pending.issuedAt >= OWNER_OAUTH_TTL_MS ||
        !returned || typeof returned !== "object" ||
        returned.nonce !== pending.nonce || returned.redirectUri !== pending.redirectUri) return null;
    return pending;
  } catch {
    return null;
  }
}

export function ownerOAuthLoginUrl(portal: string, appId: string, redirectUri: string, state: string) {
  if (!portal || !appId) throw new Error("OAuth configuration unavailable");
  const base = new URL(portal);
  if (base.protocol !== "https:" || base.username || base.password) throw new Error("Invalid OAuth portal");
  const url = new URL("app-auth", `${base.href.replace(/\/$/, "")}/`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("responseType", "code");
  return url.toString();
}
