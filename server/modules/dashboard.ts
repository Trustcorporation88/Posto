import { TRPCError } from "@trpc/server";
import { and, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { businessFuelReadings } from "../../drizzle/schema";
import { canReadCash } from "../../lib/business/cash-domain";
import {
  aggregateDailyFuel,
  localDateKey,
  setupSteps,
  summarizeClosings,
  trailingDates,
} from "../../lib/business/dashboard";
import { analyticsStart, fuelAnalytics } from "../../lib/business/fuel-analytics";
import { businessProcedure, router } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db";
import { listInvitations, listMembers } from "../auth/service";
import { getCashClosingHistory } from "./cash-closing-service";
import { getCashTurnSnapshot } from "./cash-movement-service";
import { FuelServiceError, getFuelDashboard } from "./fuel-service";

const FUEL_READERS = ["owner", "manager", "attendant", "finance_viewer"];
const MANAGERS = ["owner", "manager"];
const MAX_CLOSINGS = 100;

function scopes(ctx: TrpcContext) {
  if (!ctx.businessUser || !ctx.businessMembership || !ctx.businessSession || !ctx.businessLocation) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão comercial inválida." });
  }
  const base = {
    organizationId: ctx.businessMembership.organizationId,
    locationId: ctx.businessMembership.locationId,
    actorId: ctx.businessUser.id,
  };
  return {
    role: ctx.businessMembership.role,
    timeZone: ctx.businessLocation.timezone,
    fuel: base,
    cash: { ...base, sessionId: ctx.businessSession.id },
  };
}

function fuelError(error: unknown): never {
  if (error instanceof FuelServiceError) {
    throw new TRPCError({ code: error.code, message: error.message });
  }
  throw error;
}

async function dailyFuelSeries(
  scope: { organizationId: number; locationId: number },
  dates: string[],
  timeZone: string,
) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  // A 36 h margin on both sides covers any UTC offset; rows are then bucketed by local date.
  const from = new Date(`${dates[0]}T00:00:00Z`);
  from.setUTCHours(from.getUTCHours() - 36);
  const to = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
  to.setUTCHours(to.getUTCHours() + 60);
  const rows = await db
    .select({
      measuredAt: businessFuelReadings.measuredAt,
      quantityLiters: businessFuelReadings.quantityLiters,
      revenueCents: businessFuelReadings.revenueCents,
      costCents: businessFuelReadings.costCents,
    })
    .from(businessFuelReadings)
    .where(
      and(
        eq(businessFuelReadings.organizationId, scope.organizationId),
        eq(businessFuelReadings.locationId, scope.locationId),
        eq(businessFuelReadings.kind, "interval"),
        gte(businessFuelReadings.measuredAt, from),
        lt(businessFuelReadings.measuredAt, to),
      ),
    );
  return aggregateDailyFuel(rows, dates, timeZone);
}

async function analyticsRows(scope: { organizationId: number; locationId: number }, today: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const from = new Date(`${analyticsStart(today)}T00:00:00Z`);
  from.setUTCHours(from.getUTCHours() - 36);
  return db
    .select({
      measuredAt: businessFuelReadings.measuredAt,
      productId: businessFuelReadings.productId,
      quantityLiters: businessFuelReadings.quantityLiters,
      revenueCents: businessFuelReadings.revenueCents,
      costCents: businessFuelReadings.costCents,
    })
    .from(businessFuelReadings)
    .where(
      and(
        eq(businessFuelReadings.organizationId, scope.organizationId),
        eq(businessFuelReadings.locationId, scope.locationId),
        eq(businessFuelReadings.kind, "interval"),
        gte(businessFuelReadings.measuredAt, from),
      ),
    );
}

async function nozzlesWithBaseline(scope: { organizationId: number; locationId: number }) {
  const db = await getDb();
  if (!db) return new Set<number>();
  const rows = await db
    .selectDistinct({ nozzleId: businessFuelReadings.nozzleId })
    .from(businessFuelReadings)
    .where(
      and(
        eq(businessFuelReadings.organizationId, scope.organizationId),
        eq(businessFuelReadings.locationId, scope.locationId),
      ),
    );
  return new Set(rows.map((row) => row.nozzleId));
}

async function recentClosings(scope: Parameters<typeof getCashClosingHistory>[0]) {
  const page = await getCashClosingHistory(scope, { limit: MAX_CLOSINGS });
  return { items: page.items, totalCount: page.totalCount };
}

export const dashboardRouter = router({
  /** Month-to-date, month-end projection, last 12 closed months and stock coverage. */
  fuelMonthly: businessProcedure.query(async ({ ctx }) => {
    const s = scopes(ctx);
    if (!FUEL_READERS.includes(s.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode consultar o módulo de combustíveis." });
    }
    const today = localDateKey(new Date(), s.timeZone);
    const [snapshot, rows] = await Promise.all([
      getFuelDashboard(s.fuel, { fromDate: today, toDate: today }, s.timeZone).catch(fuelError),
      analyticsRows(s.fuel, today),
    ]);
    const products = snapshot.products.map((product) => ({
      productId: product.productId,
      productName: product.productName,
      currentPriceCentsPerLiter: product.currentPriceCentsPerLiter,
      currentAverageCostCentsPerLiter: product.currentAverageCostCentsPerLiter,
    }));
    const analytics = fuelAnalytics({
      rows,
      today,
      timeZone: s.timeZone,
      productIds: products.map((product) => product.productId),
    });
    const dailyByProduct = new Map(
      analytics.current.byProduct.map((product) => [product.productId, product.dailyAverageLiters30]),
    );
    return {
      today,
      products,
      ...analytics,
      coverage: snapshot.tanks.map((tank) => ({
        tankId: tank.id,
        tankName: tank.name,
        productId: tank.productId,
        theoreticalLiters: tank.theoreticalLiters,
        capacityLiters: tank.capacityLiters,
        dailyAverageLiters: dailyByProduct.get(tank.productId) ?? "0.000",
      })),
    };
  }),

  /** Home screen: today's numbers, a 7-day trend and the first-use checklist. */
  overview: businessProcedure.query(async ({ ctx }) => {
    const s = scopes(ctx);
    const today = localDateKey(new Date(), s.timeZone);
    const canFuel = FUEL_READERS.includes(s.role);
    const canCash = canReadCash(s.role);

    const [fuelToday, fuelTrend, cash, closings] = await Promise.all([
      canFuel
        ? getFuelDashboard(s.fuel, { fromDate: today, toDate: today }, s.timeZone).catch(fuelError)
        : null,
      canFuel ? dailyFuelSeries(s.fuel, trailingDates(today, 7), s.timeZone) : null,
      canCash ? getCashTurnSnapshot(s.cash) : null,
      canCash ? recentClosings(s.cash) : null,
    ]);

    let setup = null;
    if (MANAGERS.includes(s.role) && fuelToday) {
      const [members, invitations, baselines] = await Promise.all([
        listMembers(s.fuel.organizationId, s.fuel.locationId),
        listInvitations(s.fuel.organizationId, s.fuel.locationId),
        nozzlesWithBaseline(s.fuel),
      ]);
      const activeNozzles = fuelToday.nozzles.filter((nozzle) => nozzle.active);
      setup = setupSteps({
        products: fuelToday.products.length,
        productsWithPrice: fuelToday.products.filter((p) => p.currentPriceCentsPerLiter !== null).length,
        tanks: fuelToday.tanks.length,
        tanksMeasured: fuelToday.tanks.filter((t) => t.latestMeasurement !== null).length,
        nozzles: activeNozzles.length,
        nozzlesWithBaseline: activeNozzles.filter((n) => baselines.has(n.id)).length,
        teamMembers: members.length,
        pendingInvites: invitations.length,
        cashTurns: (closings?.totalCount ?? 0) + (cash?.activeOpening ? 1 : 0),
      });
    }

    return {
      role: s.role,
      today,
      setup,
      fuel: fuelToday
        ? {
            products: fuelToday.products,
            tanks: fuelToday.tanks,
            pendingTankDifferences: fuelToday.pendingTankDifferences,
            totalRevenueCents: fuelToday.totalRevenueCents,
            totalMarginCents: fuelToday.totalMarginCents,
            receipts: fuelToday.receipts.slice(0, 5),
            trend: fuelTrend ?? [],
          }
        : null,
      cash: cash
        ? {
            snapshot: cash,
            recentClosings: (closings?.items ?? []).slice(0, 5),
          }
        : null,
    };
  }),

  /** Period report: fuel by product and by day, plus cash closings and their differences. */
  report: businessProcedure
    .input(z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]) }))
    .query(async ({ ctx, input }) => {
      const s = scopes(ctx);
      const today = localDateKey(new Date(), s.timeZone);
      const dates = trailingDates(today, input.days);
      const canFuel = FUEL_READERS.includes(s.role);
      const canCash = canReadCash(s.role);

      const [fuelPeriod, daily, closings] = await Promise.all([
        canFuel
          ? getFuelDashboard(s.fuel, { fromDate: dates[0], toDate: today }, s.timeZone).catch(fuelError)
          : null,
        canFuel ? dailyFuelSeries(s.fuel, dates, s.timeZone) : null,
        canCash ? recentClosings(s.cash) : null,
      ]);

      const periodClosings = (closings?.items ?? []).filter(
        (closing) => closing.opening.operationDate >= dates[0] && closing.opening.operationDate <= today,
      );
      return {
        from: dates[0],
        to: today,
        fuel: fuelPeriod
          ? {
              products: fuelPeriod.products,
              totalRevenueCents: fuelPeriod.totalRevenueCents,
              totalMarginCents: fuelPeriod.totalMarginCents,
              receipts: fuelPeriod.receipts,
              daily: daily ?? [],
            }
          : null,
        cash: closings
          ? {
              closings: periodClosings,
              totals: summarizeClosings(
                periodClosings.map((closing) => ({
                  status: closing.status,
                  countedByMethod: closing.totals.countedByMethod,
                  differenceByMethod: closing.totals.differenceByMethod,
                })),
              ),
              // History holds at most the latest MAX_CLOSINGS turns.
              truncated: closings.totalCount > MAX_CLOSINGS,
            }
          : null,
      };
    }),
});
