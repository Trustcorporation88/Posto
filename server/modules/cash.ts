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
import {
  CashMovementServiceError,
  getCashMovementHistory,
  getCashTurnSnapshot,
  recordCashMovement,
} from "./cash-movement-service";
import { validateCashMovementDraft } from "../../lib/business/cash-movement-domain";

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
    if (
      error instanceof CashServiceError ||
      error instanceof CashMovementServiceError
    ) {
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
      .refine(
        Number.isSafeInteger,
        "O fundo precisa ser um inteiro seguro em centavos.",
      ),
  })
  .strict();

const cashMovementDraftSchema = z
  .object({
    type: z.enum(["recebimento", "sangria", "suprimento"]),
    paymentMethod: z.enum(["dinheiro", "pix", "debito", "credito"]),
    receiptNature: z.enum(["venda", "conta-anterior"]).nullable(),
    amount: z
      .number()
      .int()
      .positive()
      .refine(
        Number.isSafeInteger,
        "O valor precisa ser um inteiro seguro em centavos.",
      ),
    description: z.string(),
    reference: z.string(),
    counterparty: z.string(),
  })
  .strict();
const cashMovementInput = cashMovementDraftSchema
  .extend({
    intentId: z.string().uuid(),
    expectedRevision: z
      .number()
      .int()
      .nonnegative()
      .refine(Number.isSafeInteger),
    expectedActorId: z.number().int().positive().refine(Number.isSafeInteger),
    openingId: z.number().int().positive().refine(Number.isSafeInteger),
    operationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    shiftId: z.enum(["turno-1", "turno-2"]),
  })
  .strict();
const movementHistoryInput = z
  .object({
    openingId: z.number().int().positive().refine(Number.isSafeInteger),
    limit: z.number().int().positive().max(100).default(50),
    cursor: z.number().int().positive().refine(Number.isSafeInteger).optional(),
  })
  .strict();

export const cashRouter = router({
  turnSnapshot: cashReadProcedure.query(({ ctx }) =>
    cashError(() => getCashTurnSnapshot(scopeFrom(ctx))),
  ),
  movementHistory: cashReadProcedure
    .input(movementHistoryInput)
    .query(({ ctx, input }) =>
      cashError(() => getCashMovementHistory(scopeFrom(ctx), input)),
    ),
  recordMovement: cashOpenProcedure
    .input(cashMovementInput)
    .mutation(({ ctx, input }) => {
      try {
        validateCashMovementDraft({
          type: input.type,
          paymentMethod: input.paymentMethod,
          receiptNature: input.receiptNature,
          amount: input.amount,
          description: input.description,
          reference: input.reference,
          counterparty: input.counterparty,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Movimentação inválida.",
        });
      }
      return cashError(() => recordCashMovement(scopeFrom(ctx), input));
    }),
  position: cashReadProcedure.query(({ ctx }) =>
    cashError(() => getCashPosition(scopeFrom(ctx))),
  ),
  open: cashOpenProcedure
    .input(cashOpenInput)
    .mutation(({ ctx, input }) =>
      cashError(() => openCash(scopeFrom(ctx), input)),
    ),
});
