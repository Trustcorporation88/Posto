import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { constantTimeHexEqual, tokenHash } from "../auth/security";
import { isLoopbackApiHost, trustedExpoWebOrigins } from "./cors";
import type { TrpcContext } from "./context";
import { publicErrorMessage } from "./trpc-errors";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    message: publicErrorMessage(error.code, shape.message),
  }),
});
export const router = t.router;
export const publicProcedure = t.procedure;

type OriginRequest = {
  hostname?: string;
  headers: {
    origin?: string;
    "sec-fetch-site"?: string;
    "x-forwarded-host"?: string | string[];
  };
};

export function originAllowed(
  req: OriginRequest,
  trustedOrigins = trustedExpoWebOrigins(),
) {
  // Browsers set Fetch Metadata themselves. Same-origin application requests are safe here;
  // state-changing business procedures still require the separate CSRF token below.
  if (req.headers["sec-fetch-site"] === "same-origin") return true;

  const origin = req.headers.origin;
  if (!origin) {
    const host = req.hostname || "";
    return (
      isLoopbackApiHost(host) && req.headers["x-forwarded-host"] === undefined
    );
  }

  try {
    const url = new URL(origin);
    if (url.origin !== origin) return false;
    if (isLoopbackApiHost(url.hostname)) {
      return isLoopbackApiHost(req.hostname || "");
    }
    return trustedOrigins.has(origin);
  } catch {
    return false;
  }
}

export const requireTrustedOrigin = t.middleware(({ ctx, next }) => {
  if (!originAllowed(ctx.req)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Origem não autorizada.",
    });
  }
  return next();
});

export const businessProcedure = t.procedure
  .use(requireTrustedOrigin)
  .use(
    t.middleware(({ ctx, next }) => {
      if (
        !ctx.businessUser ||
        !ctx.businessMembership?.active ||
        !ctx.businessOrganization ||
        !ctx.businessLocation ||
        !ctx.businessSession ||
        !ctx.businessCsrf
      ) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Sessão comercial inválida.",
        });
      }
      return next({
        ctx: {
          ...ctx,
          businessUser: ctx.businessUser,
          businessMembership: ctx.businessMembership,
          businessOrganization: ctx.businessOrganization,
          businessLocation: ctx.businessLocation,
          businessSession: ctx.businessSession,
          businessCsrf: ctx.businessCsrf,
        },
      });
    }),
  )
  .use(
    t.middleware(({ ctx, next }) => {
      if (!["GET", "HEAD", "OPTIONS"].includes(ctx.req.method)) {
        const raw = ctx.req.headers["x-sobra-csrf"];
        if (
          typeof raw !== "string" ||
          !constantTimeHexEqual(ctx.businessCsrf!, tokenHash(raw))
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Token CSRF inválido.",
          });
        }
      }
      return next();
    }),
  );

export const businessManagerProcedure = businessProcedure.use(
  t.middleware(({ ctx, next }) => {
    if (
      ctx.businessMembership?.role !== "owner" &&
      ctx.businessMembership?.role !== "manager"
    ) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
    }
    return next();
  }),
);

export const businessOwnerProcedure = businessProcedure.use(
  t.middleware(({ ctx, next }) => {
    if (ctx.businessMembership?.role !== "owner") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
    }
    return next();
  }),
);
