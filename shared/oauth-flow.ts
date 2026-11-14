export type OwnerOAuthPurpose = "setup" | "recover";

export function isOwnerOAuthPurpose(value: unknown): value is OwnerOAuthPurpose {
  return value === "setup" || value === "recover";
}

export function ownerOAuthPath(purpose: OwnerOAuthPurpose, result: "returned" | "failed") {
  return `${purpose === "recover" ? "/gestao/recuperar" : "/gestao/configurar"}?oauth=${result}`;
}

export function decodeOAuthRedirectUri(state: string): string {
  if (!state || state.length > 8192) throw new Error("Invalid OAuth state");
  const decoded = atob(state);
  if (decoded.startsWith("{")) {
    const value: unknown = JSON.parse(decoded);
    if (!value || typeof value !== "object" || !("redirectUri" in value) ||
        typeof value.redirectUri !== "string") throw new Error("Invalid OAuth state");
    return value.redirectUri;
  }
  // Native clients already in use send the legacy base64 callback URI.
  return decoded;
}

export function isExactWebOAuthCallback(value: string): boolean {
  try {
    if (!value || value.length > 2048) return false;
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === "/api/oauth/callback" && url.href === value;
  } catch {
    return false;
  }
}

export function pairedExpoApiOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    const hostname = url.hostname.replace(/^(8081|8328)-/, "3000-");
    if (hostname === url.hostname) return "";
    url.hostname = hostname;
    return url.origin;
  } catch {
    return "";
  }
}
