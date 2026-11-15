/**
 * Development on one machine: Expo Web runs on :8081 and the API on :3000.
 * Only loopback hosts are paired, so a published site always uses its own origin.
 */
export function localDevApiOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!loopback || url.port !== "8081") return "";
    url.port = "3000";
    return url.origin;
  } catch {
    return "";
  }
}
