import { describe, expect, it } from "vitest";
import {
  cookieOptions,
  csrfTokenForSession,
  constantTimeHexEqual,
  hashPassword,
  LoginRateLimiter,
  randomToken,
  tokenHash,
  validatePassword,
  verifyPassword,
} from "../server/auth/security";
import { originAllowed } from "../server/_core/trpc";

describe("business auth security primitives", () => {
  it("hashes passwords with a random salt and verifies only the original", async () => {
    const a = await hashPassword("senha-segura-com-12");
    const b = await hashPassword("senha-segura-com-12");
    expect(a).not.toBe(b);
    expect(await verifyPassword("senha-segura-com-12", a)).toBe(true);
    expect(await verifyPassword("senha-errada-com-12", a)).toBe(false);
  });
  it("rejects passwords outside UTF-8 byte bounds and malformed/unbounded hash parameters", async () => {
    expect(validatePassword("12345678901")).toBe(false);
    expect(validatePassword("á".repeat(6))).toBe(true);
    expect(validatePassword("a".repeat(257))).toBe(false);
    await expect(hashPassword("curta")).rejects.toThrow();
    expect(
      await verifyPassword("x".repeat(12), "scrypt$999999999$8$1$ab$cd"),
    ).toBe(false);
  });
  it("generates opaque tokens and stores only stable SHA-256 digests", () => {
    const token = randomToken();
    expect(token).not.toContain("=");
    expect(tokenHash(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash(token)).toBe(tokenHash(token));
  });
  it("derives a stable anti-CSRF token that is distinct for every session", () => {
    const csrf = csrfTokenForSession("session-token-a");
    const storedDigest = tokenHash(csrf);
    expect(csrf).toBe(csrfTokenForSession("session-token-a"));
    expect(csrf).not.toBe(csrfTokenForSession("session-token-b"));
    expect(constantTimeHexEqual(storedDigest, tokenHash(csrf))).toBe(true);
    expect(constantTimeHexEqual(storedDigest, tokenHash("other"))).toBe(false);
  });
  it("selects cookie security from forwarded HTTPS, never protocol fallback", () => {
    expect(
      cookieOptions({
        headers: { "x-forwarded-proto": "https, http" },
        protocol: "http",
      }),
    ).toMatchObject({
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
    expect(
      cookieOptions({
        headers: { "x-forwarded-proto": "http" },
        protocol: "https",
      }),
    ).toMatchObject({ secure: false, sameSite: "lax" });
  });
  it("limits attempts, expires counters and caps map size", () => {
    const limiter = new LoginRateLimiter(2, 100, 2);
    limiter.fail("ip:a", 1);
    limiter.fail("ip:a", 2);
    expect(limiter.allowed("ip:a", 3)).toBe(false);
    expect(limiter.allowed("ip:a", 102)).toBe(true);
    limiter.fail("ip:b", 1);
    limiter.fail("ip:c", 1);
    limiter.fail("ip:d", 1);
    expect(limiter.size).toBeLessThanOrEqual(2);
  });
});

describe("business request origin", () => {
  const request = (
    headers: Record<string, string>,
    hostname = "api.internal",
  ) =>
    ({ headers, hostname }) as unknown as Parameters<typeof originAllowed>[0];

  it("accepts only configured cross-origin preview origins", () => {
    const allowed = new Set(["https://preview.sobra.test"]);
    expect(
      originAllowed(request({ origin: "https://preview.sobra.test" }), allowed),
    ).toBe(true);
    expect(
      originAllowed(request({ origin: "https://attacker.test" }), allowed),
    ).toBe(false);
  });

  it("accepts browser-marked same-origin requests behind a proxy", () => {
    expect(
      originAllowed(
        request({
          origin: "https://sobra.example.com",
          "sec-fetch-site": "same-origin",
        }),
        new Set(),
      ),
    ).toBe(true);
    expect(
      originAllowed(request({ "sec-fetch-site": "same-origin" }), new Set()),
    ).toBe(true);
  });

  it("rejects unidentified remote requests but permits a local no-origin request", () => {
    expect(originAllowed(request({}), new Set())).toBe(false);
    expect(originAllowed(request({}, "localhost"), new Set())).toBe(true);
  });
});
