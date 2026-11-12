import {
  randomBytes,
  scrypt as scryptCb,
  createHash,
  timingSafeEqual,
} from "node:crypto";
const scrypt = (
  password: string,
  salt: Buffer,
  length: number,
  options: { N: number; r: number; p: number; maxmem: number },
) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, length, options, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
export const SESSION_COOKIE = "sobra_business_session";
export const ROLES = [
  "owner",
  "manager",
  "cashier",
  "attendant",
  "oil_technician",
  "finance_viewer",
] as const;
export type BusinessRole = (typeof ROLES)[number];
export const INVITE_ROLES = [
  "manager",
  "cashier",
  "attendant",
  "oil_technician",
  "finance_viewer",
] as const;
export const normalizeEmail = (v: string) => v.trim().toLowerCase();
export function validEmail(v: string) {
  return (
    v.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(v))
  );
}
export function validatePassword(v: string) {
  const n = Buffer.byteLength(v, "utf8");
  return n >= 12 && n <= 256;
}
const N = 16384,
  R = 8,
  P = 1,
  KEYLEN = 64,
  MAXMEM = 64 * 1024 * 1024;
export async function hashPassword(password: string) {
  if (!validatePassword(password)) throw new Error("INVALID_PASSWORD");
  const salt = randomBytes(16),
    key = await scrypt(password, salt, KEYLEN, {
      N,
      r: R,
      p: P,
      maxmem: MAXMEM,
    });
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${key.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  try {
    const parts = encoded.split("$");
    if (parts.length !== 6) return false;
    const [alg, ns, rs, ps, saltHex, keyHex] = parts;
    const n = Number(ns),
      r = Number(rs),
      p = Number(ps);
    if (
      alg !== "scrypt" ||
      n !== N ||
      r !== R ||
      p !== P ||
      !/^[a-f0-9]{32}$/i.test(saltHex) ||
      !/^[a-f0-9]{128}$/i.test(keyHex) ||
      !validatePassword(password)
    )
      return false;
    const expected = Buffer.from(keyHex, "hex"),
      actual = await scrypt(password, Buffer.from(saltHex, "hex"), KEYLEN, {
        N: n,
        r,
        p,
        maxmem: MAXMEM,
      });
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
export const randomToken = (bytes = 32) =>
  randomBytes(bytes).toString("base64url");
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const csrfTokenForSession = (sessionToken: string) =>
  tokenHash(`sobra-csrf-v1:${sessionToken}`);
export function constantTimeHexEqual(a: string, b: string) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
export function cookieOptions(req: {
  headers: Record<string, unknown>;
  protocol?: string;
}) {
  const forwarded = req.headers["x-forwarded-proto"];
  const https =
    (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : "") ===
    "https";
  return {
    httpOnly: true as const,
    path: "/" as const,
    sameSite: https ? ("none" as const) : ("lax" as const),
    secure: https,
  };
}
export class LoginRateLimiter {
  private hits = new Map<string, { count: number; until: number }>();
  constructor(
    private limit = 8,
    private windowMs = 900000,
    private maxEntries = 10000,
  ) {}
  get size() {
    return this.hits.size;
  }
  allowed(key: string, now = Date.now()) {
    this.prune(now);
    const x = this.hits.get(key);
    return !x || x.until <= now || x.count < this.limit;
  }
  fail(key: string, now = Date.now()) {
    this.prune(now);
    let x = this.hits.get(key);
    if (!x || x.until <= now) {
      if (this.hits.size >= this.maxEntries) {
        const oldest = this.hits.keys().next().value;
        if (oldest) this.hits.delete(oldest);
      }
      x = { count: 0, until: now + this.windowMs };
      this.hits.set(key, x);
    }
    x.count++;
  }
  clear(key: string) {
    this.hits.delete(key);
  }
  private prune(now: number) {
    for (const [k, v] of this.hits) if (v.until <= now) this.hits.delete(k);
  }
}
