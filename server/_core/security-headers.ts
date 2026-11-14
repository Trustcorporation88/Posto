import type { RequestHandler } from "express";

/**
 * Extra origins allowed to embed the site in a frame, e.g. a hosting dashboard preview.
 * Only exact https origins are accepted; anything else is ignored so a typo can never
 * widen framing to arbitrary sites.
 */
export function allowedFrameAncestors(raw = process.env.SOBRA_FRAME_ANCESTORS ?? ""): string[] {
  const origins: string[] = [];
  for (const value of raw.split(/[\s,]+/)) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && url.origin === value && !origins.includes(value)) {
        origins.push(value);
      }
    } catch {
      // Ignore invalid entries.
    }
  }
  return origins;
}

function requestUsesHttps(req: Parameters<RequestHandler>[0]) {
  if (req.secure) return true;
  const forwarded = req.headers["x-forwarded-proto"];
  const first = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : "";
  return first === "https";
}

/**
 * Baseline browser protections for every response. A full script/style
 * Content-Security-Policy is intentionally not set yet: Expo Web and the OAuth flow
 * need a report-only rollout first. Only `frame-ancestors` is enforced here.
 */
export function createSecurityHeadersMiddleware(
  frameAncestors = allowedFrameAncestors(),
): RequestHandler {
  const ancestors = ["'self'", ...frameAncestors].join(" ");
  return (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Content-Security-Policy", `frame-ancestors ${ancestors}`);
    // Legacy browsers ignore CSP frame-ancestors; they only understand same-origin here.
    if (frameAncestors.length === 0) res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );
    if (requestUsesHttps(req)) {
      res.setHeader("Strict-Transport-Security", "max-age=15552000");
    }
    next();
  };
}
