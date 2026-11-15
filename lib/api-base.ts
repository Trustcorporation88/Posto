import Constants from "expo-constants";
import { Platform } from "react-native";
import { localDevApiOrigin } from "./api-origin";

type PublicRuntimeConfig = { apiBaseUrl?: string; demoMode?: boolean };

/** Values injected by the production server before the bundle runs (see web-static.ts). */
function injectedConfig(): PublicRuntimeConfig | undefined {
  if (Platform.OS !== "web") return undefined;
  return (globalThis as typeof globalThis & { __SOBRA_PUBLIC_CONFIG__?: PublicRuntimeConfig })
    .__SOBRA_PUBLIC_CONFIG__;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

function configuredBase() {
  return (
    injectedConfig()?.apiBaseUrl ||
    extra.apiBaseUrl ||
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    ""
  );
}

/** True only on the separate demonstration deployment (DEMO_MODE=true on the server). */
export function isDemoMode(): boolean {
  return injectedConfig()?.demoMode === true;
}

/** Base URL for API calls. Empty means same origin (production). */
export function getApiBaseUrl(): string {
  const configured = configuredBase();
  if (configured) return configured.replace(/\/$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    return localDevApiOrigin(window.location.origin);
  }
  return "";
}
