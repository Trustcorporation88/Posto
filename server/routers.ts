import { parse as parseCookieHeader } from "cookie";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { ENV } from "./_core/env";
import {
  businessManagerProcedure,
  businessOwnerProcedure,
  businessProcedure,
  publicProcedure,
  requireTrustedOrigin,
  router,
} from "./_core/trpc";
import { getSessionCookieName, getSessionCookieOptions } from "./_core/cookies";
import {
  INVITE_ROLES,
  LoginRateLimiter,
  normalizeEmail,
  SESSION_COOKIE,
  validEmail,
  validatePassword,
  cookieOptions,
} from "./auth/security";
import {
  acceptInvitation,
  acceptPasswordReset,
  authenticate,
  bootstrap,
  createInvitation,
  createOwnerPasswordReset,
  createPasswordReset,
  issueSession,
  listInvitations,
  listMembers,
  organizationExists,
  revokeInvitation,
  revokeSession,
  setMemberRole,
  setMemberStatus,
} from "./auth/service";
import { fuelRouter } from "./modules/fuel";

const loginRateLimiter = new LoginRateLimiter();
const emailSchema = z.string().refine(validEmail, "E-mail inválido.");
const passwordSchema = z.string().refine(validatePassword, "Senha inválida.");
const genericLoginError =
  "Não foi possível entrar. Verifique os dados ou tente mais tarde.";

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("message" in error)) return "";
  return String(error.message);
}

function isProjectOwner(user: { openId: string; role: string } | null) {
  return Boolean(
    user &&
    user.role === "admin" &&
    ENV.ownerOpenId &&
    user.openId === ENV.ownerOpenId,
  );
}

function businessSessionToken(cookieHeader: string | undefined) {
  if (!cookieHeader) return "";
  try {
    return parseCookieHeader(cookieHeader)[SESSION_COOKIE] ?? "";
  } catch {
    return "";
  }
}

function businessCookieOptions(req: Parameters<typeof cookieOptions>[0]) {
  const publicTransport = cookieOptions(req);
  return {
    ...getSessionCookieOptions(req as never),
    httpOnly: true,
    path: "/",
    sameSite: publicTransport.sameSite,
    secure: publicTransport.secure,
  };
}

const businessAuth = router({
  setupStatus: publicProcedure.query(async ({ ctx }) => ({
    hasOrganization: await organizationExists(),
    canBootstrap: isProjectOwner(ctx.user),
  })),

  bootstrapOwner: publicProcedure
    .use(requireTrustedOrigin)
    .input(
      z.object({
        organizationName: z.string().trim().min(1).max(160),
        locationName: z.string().trim().min(1).max(160),
        ownerName: z.string().trim().min(2).max(120),
        email: emailSchema,
        password: passwordSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isProjectOwner(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Acesso não autorizado.",
        });
      }
      try {
        return await bootstrap(input);
      } catch (error) {
        if (errorCode(error) === "BOOTSTRAP_CLOSED") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A configuração inicial já foi concluída.",
          });
        }
        throw error;
      }
    }),

  login: publicProcedure
    .use(requireTrustedOrigin)
    .input(
      z.object({
        email: z.string().max(320),
        password: z.string().max(256),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const key = `${ctx.req.ip || "unknown"}:${normalizeEmail(input.email)}`;
      if (!loginRateLimiter.allowed(key)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: genericLoginError,
        });
      }

      const authenticated = await authenticate(input.email, input.password);
      if (!authenticated) {
        loginRateLimiter.fail(key);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: genericLoginError,
        });
      }

      const issued = await issueSession(authenticated.user.id);
      if (!issued) {
        loginRateLimiter.fail(key);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: genericLoginError,
        });
      }
      loginRateLimiter.clear(key);
      ctx.res.cookie(SESSION_COOKIE, issued.token, {
        ...businessCookieOptions(ctx.req),
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      return { success: true };
    }),

  me: publicProcedure.query(({ ctx }) =>
    ctx.businessUser &&
    ctx.businessMembership &&
    ctx.businessOrganization &&
    ctx.businessLocation
      ? {
          ...ctx.businessUser,
          role: ctx.businessMembership.role,
          organization: ctx.businessOrganization,
          location: ctx.businessLocation,
        }
      : null,
  ),

  csrf: businessProcedure.query(({ ctx }) => ({
    token: ctx.businessSession.csrfToken,
  })),

  logout: businessProcedure.mutation(async ({ ctx }) => {
    await revokeSession(businessSessionToken(ctx.req.headers.cookie));
    ctx.res.clearCookie(SESSION_COOKIE, businessCookieOptions(ctx.req));
    return { success: true };
  }),

  acceptInvite: publicProcedure
    .use(requireTrustedOrigin)
    .input(
      z.object({
        token: z.string().min(20).max(200),
        name: z.string().trim().min(2).max(120),
        password: passwordSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const userId = await acceptInvitation(
        input.token,
        input.name,
        input.password,
      );
      if (!userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Convite inválido, expirado ou já utilizado. Solicite um novo link ao administrador.",
        });
      }
      return { success: true };
    }),

  resetPassword: publicProcedure
    .use(requireTrustedOrigin)
    .input(
      z.object({
        token: z.string().min(20).max(200),
        password: passwordSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const changed = await acceptPasswordReset(input.token, input.password);
      if (!changed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Link inválido, expirado ou já utilizado. Solicite outro.",
        });
      }
      return { success: true };
    }),

  ownerPasswordResetLink: publicProcedure
    .use(requireTrustedOrigin)
    .mutation(async ({ ctx }) => {
      if (!isProjectOwner(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Acesso não autorizado.",
        });
      }
      const token = await createOwnerPasswordReset();
      if (!token) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Não há conta proprietária ativa para recuperar.",
        });
      }
      return { token };
    }),
});

const businessAdmin = router({
  listMembers: businessManagerProcedure.query(({ ctx }) =>
    listMembers(ctx.businessOrganization.id, ctx.businessLocation.id),
  ),

  listInvitations: businessManagerProcedure.query(({ ctx }) =>
    listInvitations(ctx.businessOrganization.id, ctx.businessLocation.id),
  ),

  createInvite: businessOwnerProcedure
    .input(z.object({ email: emailSchema, role: z.enum(INVITE_ROLES) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const token = await createInvitation(
          ctx.businessUser.id,
          ctx.businessOrganization.id,
          ctx.businessLocation.id,
          input.email,
          input.role,
        );
        return { token };
      } catch (error) {
        const code = errorCode(error);
        if (code === "BUSINESS_USER_EXISTS") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este e-mail já possui uma conta no Sobra Gestão.",
          });
        }
        if (code === "INVITATION_PENDING") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Já existe um convite pendente para este e-mail.",
          });
        }
        throw error;
      }
    }),

  setMemberStatus: businessOwnerProcedure
    .input(
      z.object({ memberId: z.number().int().positive(), active: z.boolean() }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await setMemberStatus(
          ctx.businessUser.id,
          ctx.businessOrganization.id,
          ctx.businessLocation.id,
          input.memberId,
          input.active,
        );
      } catch {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Não foi possível alterar o acesso. Verifique a equipe e as permissões.",
        });
      }
    }),

  setMemberRole: businessOwnerProcedure
    .input(
      z.object({
        memberId: z.number().int().positive(),
        role: z.enum(INVITE_ROLES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await setMemberRole(
          ctx.businessUser.id,
          ctx.businessOrganization.id,
          ctx.businessLocation.id,
          input.memberId,
          input.role,
        );
      } catch {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Não foi possível alterar a função desta conta.",
        });
      }
    }),

  createPasswordReset: businessOwnerProcedure
    .input(z.object({ memberId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const token = await createPasswordReset(
          ctx.businessUser.id,
          ctx.businessOrganization.id,
          ctx.businessLocation.id,
          input.memberId,
        );
        return { token };
      } catch {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Não foi possível gerar um link para esta conta.",
        });
      }
    }),

  revokeInvitation: businessOwnerProcedure
    .input(z.object({ invitationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await revokeInvitation(
          ctx.businessUser.id,
          ctx.businessOrganization.id,
          ctx.businessLocation.id,
          input.invitationId,
        );
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Convite não encontrado ou já utilizado.",
        });
      }
    }),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(getSessionCookieName(ctx.req), {
        ...getSessionCookieOptions(ctx.req),
        maxAge: -1,
      });
      return { success: true } as const;
    }),
  }),
  businessAuth,
  businessAdmin,
  fuel: fuelRouter,
});

export type AppRouter = typeof appRouter;
