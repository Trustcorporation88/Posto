import { ownerOAuthPath, type OwnerOAuthPurpose } from "../../shared/oauth-flow";

export function oauthFrontendRedirect(
  env: Readonly<Record<string, string | undefined>> = process.env,
  purpose?: OwnerOAuthPurpose,
  result: "returned" | "failed" = "returned",
): string {
  const target = purpose ? ownerOAuthPath(purpose, result) : "/";
  // Production Web and API share the origin. Never derive a public URL from Host.
  if (env.NODE_ENV === "production") return target;
  const frontend = env.EXPO_WEB_PREVIEW_URL || env.EXPO_PACKAGER_PROXY_URL || "http://localhost:8081";
  return purpose ? new URL(target, frontend).toString() : frontend;
}
