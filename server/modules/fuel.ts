import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { businessManagerProcedure, businessProcedure, router } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";
import {
  createFuelAdjustment,
  createFuelNozzle,
  createFuelPrice,
  createFuelProduct,
  createFuelPump,
  createFuelReceipt,
  createFuelTank,
  FuelServiceError,
  getFuelDashboard,
  listFuelConfiguration,
  recordFuelBaseline,
  recordFuelInterval,
  recordFuelTankMeasurement,
  resetFuelMeter,
  setFuelNozzleActive,
  setFuelProductActive,
  setFuelPumpActive,
  setFuelTankActive,
} from "./fuel-service";

const id = z.number().int().positive();
const liters = z.string().trim().min(1).max(24);
const money = z.string().trim().min(1).max(32);
const code = z.string().trim().min(1).max(32);
const name = z.string().trim().min(1).max(120);
const dateTime = z.string().datetime({ offset: true }).max(40);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reason = z.string().trim().min(3).max(500);

function scopeFrom(ctx: TrpcContext) {
  if (!ctx.businessUser || !ctx.businessMembership) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão comercial inválida." });
  }
  return {
    organizationId: ctx.businessMembership.organizationId,
    locationId: ctx.businessMembership.locationId,
    actorId: ctx.businessUser.id,
  };
}

function fuelError<T>(operation: () => Promise<T>) {
  return operation().catch((error: unknown) => {
    if (error instanceof FuelServiceError) {
      throw new TRPCError({ code: error.code, message: error.message });
    }
    throw error;
  });
}

const fuelReadProcedure = businessProcedure.use(({ ctx, next }) => {
  const role = ctx.businessMembership.role;
  if (!["owner", "manager", "attendant", "finance_viewer"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode consultar o módulo de combustíveis." });
  }
  return next();
});

const fuelOperatorProcedure = businessProcedure.use(({ ctx, next }) => {
  const role = ctx.businessMembership.role;
  if (!["owner", "manager", "attendant"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode registrar esta operação." });
  }
  return next();
});

export const fuelRouter = router({
  configuration: fuelReadProcedure.query(({ ctx }) =>
    fuelError(() =>
      listFuelConfiguration(
        scopeFrom(ctx),
        ctx.businessMembership.role === "owner" || ctx.businessMembership.role === "manager",
      ),
    ),
  ),
  dashboard: fuelReadProcedure
    .input(
      z.object({
        fromDate: dateOnly,
        toDate: dateOnly,
        productId: id.optional(),
        tankId: id.optional(),
        pumpId: id.optional(),
      }),
    )
    .query(({ ctx, input }) =>
      fuelError(() =>
        getFuelDashboard(
          scopeFrom(ctx),
          input,
          ctx.businessLocation.timezone,
        ),
      ),
    ),

  createProduct: businessManagerProcedure
    .input(z.object({ code, name }))
    .mutation(({ ctx, input }) =>
      fuelError(() => createFuelProduct(scopeFrom(ctx), input)),
    ),
  setProductActive: businessManagerProcedure
    .input(z.object({ productId: id, active: z.boolean() }))
    .mutation(({ ctx, input }) =>
      fuelError(() => setFuelProductActive(scopeFrom(ctx), input)),
    ),
  createTank: businessManagerProcedure
    .input(
      z.object({
        productId: id,
        code,
        name,
        capacityLiters: liters.nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      fuelError(() => createFuelTank(scopeFrom(ctx), input)),
    ),
  setTankActive: businessManagerProcedure
    .input(z.object({ tankId: id, active: z.boolean() }))
    .mutation(({ ctx, input }) =>
      fuelError(() => setFuelTankActive(scopeFrom(ctx), input)),
    ),
  createPump: businessManagerProcedure
    .input(z.object({ code, name }))
    .mutation(({ ctx, input }) =>
      fuelError(() => createFuelPump(scopeFrom(ctx), input)),
    ),
  setPumpActive: businessManagerProcedure
    .input(z.object({ pumpId: id, active: z.boolean() }))
    .mutation(({ ctx, input }) =>
      fuelError(() => setFuelPumpActive(scopeFrom(ctx), input)),
    ),
  createNozzle: businessManagerProcedure
    .input(
      z.object({
        pumpId: id,
        tankId: id,
        productId: id,
        code,
        name,
      }),
    )
    .mutation(({ ctx, input }) =>
      fuelError(() => createFuelNozzle(scopeFrom(ctx), input)),
    ),
  setNozzleActive: businessManagerProcedure
    .input(z.object({ nozzleId: id, active: z.boolean() }))
    .mutation(({ ctx, input }) =>
      fuelError(() => setFuelNozzleActive(scopeFrom(ctx), input)),
    ),
  createPrice: businessManagerProcedure
    .input(z.object({ productId: id, price: money, effectiveAt: dateTime }))
    .mutation(({ ctx, input }) =>
      fuelError(() => createFuelPrice(scopeFrom(ctx), input)),
    ),
  createReceipt: businessManagerProcedure
    .input(
      z.object({
        productId: id,
        tankId: id,
        supplier: z.string().trim().min(2).max(160),
        documentReference: z.string().trim().max(120).nullable(),
        quantityLiters: liters,
        unitCostPerLiter: money,
        receivedAt: dateTime,
      }),
    )
    .mutation(({ ctx, input }) =>
      fuelError(() => createFuelReceipt(scopeFrom(ctx), input)),
    ),
  recordBaseline: fuelOperatorProcedure
    .input(z.object({ nozzleId: id, counterLiters: liters, measuredAt: dateTime }))
    .mutation(({ ctx, input }) =>
      fuelError(() => recordFuelBaseline(scopeFrom(ctx), input)),
    ),
  recordInterval: fuelOperatorProcedure
    .input(
      z.object({
        nozzleId: id,
        previousCounterLiters: liters,
        finalCounterLiters: liters,
        measuredAt: dateTime,
      }),
    )
    .mutation(({ ctx, input }) =>
      fuelError(() => recordFuelInterval(scopeFrom(ctx), input)),
    ),
  resetMeter: businessManagerProcedure
    .input(
      z.object({
        nozzleId: id,
        counterLiters: liters,
        measuredAt: dateTime,
        reason,
      }),
    )
    .mutation(({ ctx, input }) =>
      fuelError(() => resetFuelMeter(scopeFrom(ctx), input)),
    ),
  recordTankMeasurement: fuelOperatorProcedure
    .input(
      z.object({
        tankId: id,
        expectedTheoreticalLiters: z.string().trim().min(1).max(24),
        measuredLiters: liters,
        measuredAt: dateTime,
        reason: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      fuelError(() => recordFuelTankMeasurement(scopeFrom(ctx), input)),
    ),
  createAdjustment: businessManagerProcedure
    .input(
      z.object({
        tankId: id,
        direction: z.enum(["add", "remove"]),
        quantityLiters: liters,
        unitCostPerLiter: money.nullable(),
        reason,
        recordedAt: dateTime,
      }),
    )
    .mutation(({ ctx, input }) =>
      fuelError(() => createFuelAdjustment(scopeFrom(ctx), input)),
    ),
});
