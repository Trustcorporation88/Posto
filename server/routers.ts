import { parse as parseCookieHeader } from "cookie";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  businessManagerProcedure,
  businessOwnerProcedure,
  businessProcedure,
  publicProcedure,
  requireTrustedOrigin,
  router,
} from "./_core/trpc";
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
  createInvitation,
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
import { cashRouter } from "./modules/cash";

const loginRateLimiter = new LoginRateLimiter();
const emailSchema = z.string().refine(validEmail, "E-mail inválido.");
const passwordSchema = z.string().refine(validatePassword, "Senha inválida.");
const genericLoginError =
  "Não foi possível entrar. Verifique os dados ou tente mais tarde.";

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("message" in error)) return "";
  return String(error.message);
}

function businessSessionToken(cookieHeader: string | undefined) {
  if (!cookieHeader) return "";
  try {
    return parseCookieHeader(cookieHeader)[SESSION_COOKIE] ?? "";
  } catch {
    return "";
  }
}

const businessAuth = router({
  // The first owner is created on the server (`node dist/admin.mjs bootstrap`), never here.
  setupStatus: publicProcedure.query(async () => ({
    hasOrganization: await organizationExists(),
  })),

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
        ...cookieOptions(ctx.req),
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
    ctx.res.clearCookie(SESSION_COOKIE, cookieOptions(ctx.req));
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
            message: "Este e-mail já possui uma conta no GAS PUMP.",
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
  businessAuth,
  businessAdmin,
  cash: cashRouter,
  fuel: fuelRouter,
});

export type AppRouter = typeof appRouter;
