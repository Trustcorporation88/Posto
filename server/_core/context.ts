import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { SESSION_COOKIE } from "../auth/security";
import { resolveSession } from "../auth/service";
export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  businessUser?: { id: number; name: string; email: string } | null;
  businessMembership?: {
    id: number;
    role: string;
    organizationId: number;
    locationId: number;
    active: boolean;
  } | null;
  businessOrganization?: { id: number; name: string } | null;
  businessLocation?: {
    id: number;
    name: string;
    city: string;
    state: string;
    timezone: string;
  } | null;
  businessSession?: {
    id: number;
    userId: number;
    csrfHash: string;
    csrfToken: string;
  } | null;
  businessCsrf?: string | null;
};
function cookieValue(header: string | undefined, name: string) {
  if (!header) return "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i >= 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return "";
      }
    }
  }
  return "";
}
export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  let business = null;
  try {
    business = await resolveSession(
      cookieValue(opts.req.headers.cookie, SESSION_COOKIE),
    );
  } catch {
    business = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    businessUser: business?.user ?? null,
    businessMembership: business?.membership ?? null,
    businessOrganization: business?.organization ?? null,
    businessLocation: business?.location ?? null,
    businessSession: business?.session ?? null,
    businessCsrf: business?.session.csrfHash ?? null,
  };
}
