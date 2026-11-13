export function oauthFrontendRedirect(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  // Production serves Web and API together. A fixed relative path avoids internal Host,
  // stale Preview URLs and request-controlled return destinations. The root page resumes
  // the existing sessionStorage setup/recovery flow.
  if (env.NODE_ENV === "production") return "/";
  return env.EXPO_WEB_PREVIEW_URL || env.EXPO_PACKAGER_PROXY_URL || "http://localhost:8081";
}
