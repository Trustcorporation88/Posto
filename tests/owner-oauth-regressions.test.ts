import { describe, expect, it } from "vitest";
import { pairedExpoApiOrigin } from "../shared/oauth-flow";
import { canRequestOwnerRecovery } from "../lib/business-owner-access";

describe("Preview API fallback", () => {
  it.each(["8081", "8328"])("pairs %s with API 3000 when no explicit base is set", (port) => {
    expect(pairedExpoApiOrigin(`https://${port}-fixture.example.test`)).toBe("https://3000-fixture.example.test");
  });
  it("keeps the production origin relative and does not derive an arbitrary API host", () => {
    expect(pairedExpoApiOrigin("https://station.example.test")).toBe("");
    expect(pairedExpoApiOrigin("invalid")).toBe("");
  });
});

describe("recovery gate before mutation", () => {
  const ready = { authenticated: true, checking: false, apiFailed: false, canBootstrap: true, hasOrganization: true, oauthFailed: false };
  it("requires an authenticated and authorized owner with an existing organization", () => {
    expect(canRequestOwnerRecovery(ready)).toBe(true);
  });
  it.each([
    { authenticated: false }, { checking: true }, { apiFailed: true },
    { canBootstrap: false }, { hasOrganization: false }, { oauthFailed: true },
  ])("blocks incomplete or refused authorization %j", (override) => {
    expect(canRequestOwnerRecovery({ ...ready, ...override })).toBe(false);
  });
});
