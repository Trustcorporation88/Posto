import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { canOpenCash, canReadCash } from "../../lib/business/cash-domain";
import { businessProcedure, router } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";
import {
  CashServiceError,
  getCashPosition,
  openCash,
  type CashScope,
} from "./cash-service";

function scopeFrom(ctx: TrpcContext): CashScope {
  if (
    !ctx.businessUser ||
    !ctx.businessMembership ||
    !ctx.businessSession ||
    !ctx.businessOrganization ||
    !ctx.businessLocation
  ) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Sessão comercial inválida.",
    });
  }
  return {
    organizationId: ctx.businessOrganization.id,
    locationId: ctx.businessLocation.id,
    actorId: ctx.businessUser.id,
    sessionId: ctx.businessSession.id,
  };
}

async function cashError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CashServiceError) {
      throw new TRPCError({ code: error.code, message: error.message });
    }
    throw error;
  }
}

const cashReadProcedure = businessProcedure.use(({ ctx, next }) => {
  if (!ctx.businessMembership || !canReadCash(ctx.businessMembership.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Seu perfil não pode consultar o módulo de caixa.",
    });
  }
  return next();
});

const cashOpenProcedure = businessProcedure.use(({ ctx, next }) => {
  if (!ctx.businessMembership || !canOpenCash(ctx.businessMembership.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Seu perfil não pode abrir o caixa.",
    });
  }
  return next();
});

const cashOpenInput = z
  .object({
    intentId: z.string().uuid(),
    expectedRevision: z
      .number()
      .int()
      .nonnegative()
      .refine(Number.isSafeInteger, "A revisão precisa ser um inteiro seguro."),
    operationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    shiftId: z.enum(["turno-1", "turno-2"]),
    openingFloat: z
      .number()
      .int()
      .nonnegative()
      .refine(Number.isSafeInteger, "O fundo precisa ser um inteiro seguro em centavos."),
  })
  .strict();

export const cashRouter = router({
  position: cashReadProcedure.query(({ ctx }) =>
    cashError(() => getCashPosition(scopeFrom(ctx))),
  ),
  open: cashOpenProcedure
    .input(cashOpenInput)
    .mutation(({ ctx, input }) =>
      cashError(() => openCash(scopeFrom(ctx), input)),
    ),
});
