import { describe, expect, it } from "vitest";
import { oauthFrontendRedirect } from "../server/_core/oauth-return";

describe("OAuth frontend return", () => {
  it("always returns to the current published origin through a fixed path", () => {
    expect(oauthFrontendRedirect({ NODE_ENV: "production" })).toBe("/");
    expect(oauthFrontendRedirect({
      NODE_ENV: "production",
      EXPO_WEB_PREVIEW_URL: "https://old-preview.example.test",
      EXPO_PACKAGER_PROXY_URL: "https://old-metro.example.test",
    })).toBe("/");
  });
  it("keeps the paired Expo web origin for development", () => {
    expect(oauthFrontendRedirect({
      NODE_ENV: "development",
      EXPO_WEB_PREVIEW_URL: "https://web-preview.example.test",
      EXPO_PACKAGER_PROXY_URL: "https://metro-preview.example.test",
    })).toBe("https://web-preview.example.test");
  });
  it("uses packager/local fallbacks only outside production", () => {
    expect(oauthFrontendRedirect({ NODE_ENV: "development", EXPO_PACKAGER_PROXY_URL: "https://metro-preview.example.test" })).toBe("https://metro-preview.example.test");
    expect(oauthFrontendRedirect({ NODE_ENV: "development" })).toBe("http://localhost:8081");
  });
  it.each(["setup", "recover"] as const)("returns %s directly in production, ignoring stale Preview configuration", (purpose) => {
    const path = purpose === "setup" ? "/gestao/configurar" : "/gestao/recuperar";
    expect(oauthFrontendRedirect({ NODE_ENV: "production", EXPO_WEB_PREVIEW_URL: "https://stale.example.test" }, purpose)).toBe(`${path}?oauth=returned`);
    expect(oauthFrontendRedirect({ NODE_ENV: "production" }, purpose, "failed")).toBe(`${path}?oauth=failed`);
  });
  it.each(["setup", "recover"] as const)("returns %s to its paired Preview screen", (purpose) => {
    const path = purpose === "setup" ? "/gestao/configurar" : "/gestao/recuperar";
    expect(oauthFrontendRedirect({ NODE_ENV: "development", EXPO_WEB_PREVIEW_URL: "https://web-preview.example.test" }, purpose)).toBe(`https://web-preview.example.test${path}?oauth=returned`);
  });
});
