import { ONE_YEAR_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import { getUserByOpenId, upsertUser } from "../db";
import {
  getSessionCookieName,
  getSessionCookieOptions,
} from "./cookies";
import { sdk } from "./sdk";
import { oauthFrontendRedirect } from "./oauth-return";
import { parse as parseCookieHeader } from "cookie";
import { ENV } from "./env";
import { trustedExpoWebOrigins } from "./cors";
import { isOwnerOAuthPurpose } from "../../shared/oauth-flow";
import {
  createOwnerOAuthAttempt,
  isAllowedOwnerOAuthStart,
  ownerOAuthLoginUrl,
  OWNER_OAUTH_TTL_MS,
  validateOwnerOAuthAttempt,
} from "./owner-oauth-flow";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

async function syncUser(userInfo: {
  openId?: string | null;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  platform?: string | null;
}) {
  if (!userInfo.openId) {
    throw new Error("openId missing from user info");
  }

  const lastSignedIn = new Date();
  await upsertUser({
    openId: userInfo.openId,
    name: userInfo.name || null,
    email: userInfo.email ?? null,
    loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
    lastSignedIn,
  });
  const saved = await getUserByOpenId(userInfo.openId);
  return (
    saved ?? {
      openId: userInfo.openId,
      name: userInfo.name,
      email: userInfo.email,
      loginMethod: userInfo.loginMethod ?? null,
      lastSignedIn,
    }
  );
}

function buildUserResponse(
  user:
    | Awaited<ReturnType<typeof getUserByOpenId>>
    | {
        openId: string;
        name?: string | null;
        email?: string | null;
        loginMethod?: string | null;
        lastSignedIn?: Date | null;
      },
) {
  return {
    id: (user as any)?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    loginMethod: user?.loginMethod ?? null,
    lastSignedIn: (user?.lastSignedIn ?? new Date()).toISOString(),
  };
}

export function registerOAuthRoutes(app: Express) {
  app.post("/api/oauth/start", (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const purpose: unknown = req.body?.purpose;
    const redirectUri: unknown = req.body?.redirectUri;
    const trustedOrigins = trustedExpoWebOrigins();
    for (const configured of [process.env.EXPO_WEB_PREVIEW_URL, process.env.EXPO_PACKAGER_PROXY_URL]) {
      if (configured) trustedOrigins.add(configured);
    }
    if (!isOwnerOAuthPurpose(purpose) || typeof redirectUri !== "string" ||
        !isAllowedOwnerOAuthStart({
          redirectUri,
          origin: req.headers.origin,
          sameOrigin: req.headers["sec-fetch-site"] === "same-origin",
          trustedOrigins,
          configuredApiBase: process.env.EXPO_PUBLIC_API_BASE_URL,
        })) {
      res.status(403).json({ error: "Não foi possível iniciar uma autenticação nesta origem." });
      return;
    }
    try {
      const attempt = createOwnerOAuthAttempt(purpose, redirectUri, ENV.cookieSecret);
      const portal = process.env.MANUS_OAUTH_PORTAL_URL ?? process.env.VITE_OAUTH_PORTAL_URL ?? process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ?? "";
      const loginUrl = ownerOAuthLoginUrl(portal, ENV.appId, redirectUri, attempt.state);
      const options = getSessionCookieOptions(req);
      const name = options.secure ? "__Host-gas_pump_oauth_pending" : "gas_pump_local_oauth_pending";
      res.cookie(name, attempt.cookie, { ...options, maxAge: OWNER_OAUTH_TTL_MS });
      res.json({ loginUrl });
    } catch {
      res.status(503).json({ error: "A configuração de autenticação não está disponível. Nenhuma conta foi criada." });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    res.setHeader("Cache-Control", "no-store");
    const options = getSessionCookieOptions(req);
    const name = options.secure ? "__Host-gas_pump_oauth_pending" : "gas_pump_local_oauth_pending";
    let pendingCookie: string | undefined;
    try {
      pendingCookie = parseCookieHeader(req.headers.cookie ?? "")[name];
    } catch {
      // An invalid browser cookie is not authorization.
    }
    const pending = validateOwnerOAuthAttempt(pendingCookie, state ?? "", ENV.cookieSecret);
    // Consume the browser-bound attempt before token exchange, including failures.
    res.clearCookie(name, options);
    if (!code || !state || !pending) {
      res.redirect(302, oauthFrontendRedirect(process.env, pending?.purpose ?? "setup", "failed"));
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      await syncUser(userInfo);
      const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(getSessionCookieName(req), sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      // The signed browser attempt decides a fixed screen, not sessionStorage or query URLs.
      res.redirect(302, oauthFrontendRedirect(process.env, pending.purpose));
    } catch {
      console.error("[OAuth] Callback failed");
      res.redirect(302, oauthFrontendRedirect(process.env, pending.purpose, "failed"));
    }
  });

  app.get("/api/oauth/mobile", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      const user = await syncUser(userInfo);

      const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(getSessionCookieName(req), sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      res.json({
        app_session_id: sessionToken,
        user: buildUserResponse(user),
      });
    } catch {
      console.error("[OAuth] Mobile exchange failed");
      res.status(500).json({ error: "OAuth mobile exchange failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(getSessionCookieName(req), {
      ...cookieOptions,
      maxAge: -1,
    });
    res.json({ success: true });
  });

  // Get current authenticated user - works with both cookie (web) and Bearer token (mobile)
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ user: buildUserResponse(user) });
    } catch {
      console.error("[Auth] /api/auth/me failed");
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });

  // Establish session cookie from Bearer token
  // Used by iframe preview: frontend receives token via postMessage, then calls this endpoint
  // to get a proper Set-Cookie response from the backend (3000-xxx domain)
  app.post("/api/auth/session", async (req: Request, res: Response) => {
    try {
      // Authenticate using Bearer token from Authorization header
      const user = await sdk.authenticateRequest(req);

      // Get the token from the Authorization header to set as cookie
      const authHeader = req.headers.authorization || req.headers.Authorization;
      if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        res.status(400).json({ error: "Bearer token required" });
        return;
      }
      const token = authHeader.slice("Bearer ".length).trim();

      // Set cookie for this domain (3000-xxx)
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(getSessionCookieName(req), token, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      res.json({ success: true, user: buildUserResponse(user) });
    } catch {
      console.error("[Auth] /api/auth/session failed");
      res.status(401).json({ error: "Invalid token" });
    }
  });
}
