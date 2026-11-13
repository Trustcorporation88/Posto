import {
  and,
  desc,
  eq,
  gte,
  gt,
  inArray,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import {
  businessAudit,
  businessUsers,
  businessFuelAdjustments,
  businessFuelCostStates,
  businessFuelInventoryMovements,
  businessFuelNozzles,
  businessFuelPrices,
  businessFuelProducts,
  businessFuelPumps,
  businessFuelReadings,
  businessFuelReceipts,
  businessFuelTankInventoryStates,
  businessFuelTankMeasurements,
  businessFuelTanks,
} from "../../drizzle/schema";
import {
  applyMovingAverageDelta,
  doesFuelTankTheoreticalBalanceMatch,
  FuelDomainError,
  isTimestampAtOrBefore,
  isMovementTimestampAtOrAfter,
  isTimestampStrictlyAfter,
  litersAtPriceToCents,
  litersToMilliLiters,
  meterInterval,
  milliLitersToDecimal,
  moneyToCents,
  signedLitersToMilliLiters,
  tankVariance,
} from "../../lib/business/fuel-domain";
import {
  countPendingCurrentFuelTankDifferences,
  filterCurrentFuelTankSnapshots,
} from "../../lib/business/fuel-dashboard";
import { getDb } from "../db";

type FuelDb = Exclude<Awaited<ReturnType<typeof getDb>>, null>;
type FuelTx = Parameters<Parameters<FuelDb["transaction"]>[0]>[0];

export type FuelScope = {
  organizationId: number;
  locationId: number;
  actorId: number;
};

export type FuelServiceErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "CONFLICT"
  | "FORBIDDEN"
  | "SERVICE_UNAVAILABLE";

export class FuelServiceError extends Error {
  constructor(
    readonly code: FuelServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FuelServiceError";
  }
}

const unavailable = () =>
  new FuelServiceError(
    "SERVICE_UNAVAILABLE",
    "O serviço de combustível está temporariamente indisponível.",
  );
const badRequest = (message: string): never => {
  throw new FuelServiceError("BAD_REQUEST", message);
};
const notFound = (): never => {
  throw new FuelServiceError("NOT_FOUND", "Registro não encontrado nesta unidade.");
};

function duplicateKey(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062;
}

function normalizeCode(value: string) {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(code)) {
    badRequest("Use um código de 1 a 32 caracteres: letras, números, ponto, hífen ou sublinhado.");
  }
  return code;
}

function normalizeName(value: string) {
  const name = value.trim();
  if (name.length < 1 || name.length > 120) {
    badRequest("Informe um nome de 1 a 120 caracteres.");
  }
  return name;
}

function normalizeReason(value: string | undefined) {
  const reason = value?.trim() ?? "";
  if (reason.length < 3 || reason.length > 500) {
    badRequest("A justificativa deve ter de 3 a 500 caracteres.");
  }
  return reason;
}

function parseLiters(raw: string, allowZero = false) {
  try {
    return litersToMilliLiters(raw, allowZero);
  } catch (error) {
    if (error instanceof FuelDomainError) badRequest(error.message);
    throw error;
  }
}

function parseMoney(raw: string, allowZero = false) {
  try {
    return moneyToCents(raw, allowZero);
  } catch (error) {
    if (error instanceof FuelDomainError) badRequest(error.message);
    throw error;
  }
}

function dateValue(value: string, allowFuture = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    badRequest("Informe data e hora válidas, incluindo o fuso horário.");
  }
  date.setMilliseconds(0);
  if (!allowFuture && date.getTime() > Date.now() + 5 * 60 * 1000) {
    badRequest("Não é possível registrar uma operação com horário futuro.");
  }
  return date;
}

const asDate = (value: string) => dateValue(value);

function addLocalDays(day: string, amount: number) {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + amount));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function localMidnightUtc(day: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    badRequest("Informe o período no formato de data AAAA-MM-DD.");
  }
  const [year, month, date] = day.split("-").map(Number);
  const nominal = Date.UTC(year, month - 1, date);
  const check = new Date(nominal);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== date
  ) {
    badRequest("A data do filtro não é válida.");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date(nominal))
    .reduce<Record<string, number>>((result, part) => {
      if (part.type !== "literal") result[part.type] = Number(part.value);
      return result;
    }, {});
  const localAtNominal = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return new Date(nominal - (localAtNominal - nominal));
}

function period(input: { fromDate: string; toDate: string }, timeZone: string) {
  const from = localMidnightUtc(input.fromDate, timeZone);
  const toExclusive = localMidnightUtc(addLocalDays(input.toDate, 1), timeZone);
  if (toExclusive <= from) badRequest("A data final deve ser igual ou posterior à inicial.");
  if (toExclusive.getTime() - from.getTime() > 367 * 24 * 60 * 60 * 1000) {
    badRequest("O período máximo para consulta é de 366 dias.");
  }
  return { from, toExclusive };
}

function bigIntValue(value: string | number | bigint | null | undefined) {
  return BigInt(String(value ?? "0"));
}

function safePriceCents(raw: string) {
  const cents = parseMoney(raw);
  if (cents > 2_147_483_647) badRequest("O custo/preço por litro excede o limite permitido.");
  return cents;
}

function requireScopeRows<T>(rows: T[]) {
  if (!rows.length) notFound();
  return rows[0];
}

async function currentProduct(tx: FuelTx, scope: FuelScope, productId: number) {
  const rows = await tx
    .select()
    .from(businessFuelProducts)
    .where(
      and(
        eq(businessFuelProducts.id, productId),
        eq(businessFuelProducts.organizationId, scope.organizationId),
        eq(businessFuelProducts.locationId, scope.locationId),
        eq(businessFuelProducts.active, true),
      ),
    )
    .limit(1);
  return requireScopeRows(rows);
}

async function currentTank(tx: FuelTx, scope: FuelScope, tankId: number) {
  const rows = await tx
    .select()
    .from(businessFuelTanks)
    .where(
      and(
        eq(businessFuelTanks.id, tankId),
        eq(businessFuelTanks.organizationId, scope.organizationId),
        eq(businessFuelTanks.locationId, scope.locationId),
        eq(businessFuelTanks.active, true),
      ),
    )
    .limit(1);
  return requireScopeRows(rows);
}

async function currentNozzle(
  tx: FuelTx,
  scope: FuelScope,
  nozzleId: number,
  lock = false,
) {
  let query = tx
    .select()
    .from(businessFuelNozzles)
    .where(
      and(
        eq(businessFuelNozzles.id, nozzleId),
        eq(businessFuelNozzles.organizationId, scope.organizationId),
        eq(businessFuelNozzles.locationId, scope.locationId),
        eq(businessFuelNozzles.active, true),
      ),
    )
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  return requireScopeRows(await query);
}

async function inventoryStates(
  tx: FuelTx,
  scope: FuelScope,
  tankId: number,
  productId: number,
) {
  const costRows = await tx
    .select()
    .from(businessFuelCostStates)
    .where(
      and(
        eq(businessFuelCostStates.organizationId, scope.organizationId),
        eq(businessFuelCostStates.locationId, scope.locationId),
        eq(businessFuelCostStates.productId, productId),
      ),
    )
    .limit(1)
    .for("update");
  const tankRows = await tx
    .select()
    .from(businessFuelTankInventoryStates)
    .where(
      and(
        eq(businessFuelTankInventoryStates.organizationId, scope.organizationId),
        eq(businessFuelTankInventoryStates.locationId, scope.locationId),
        eq(businessFuelTankInventoryStates.tankId, tankId),
      ),
    )
    .limit(1)
    .for("update");
  return {
    cost: requireScopeRows(costRows),
    tank: requireScopeRows(tankRows),
  };
}

async function latestMovementAt(
  tx: FuelTx,
  scope: FuelScope,
  productId: number,
  tankId?: number,
) {
  const conditions = [
    eq(businessFuelInventoryMovements.organizationId, scope.organizationId),
    eq(businessFuelInventoryMovements.locationId, scope.locationId),
    eq(businessFuelInventoryMovements.productId, productId),
  ];
  if (tankId !== undefined) {
    conditions.push(eq(businessFuelInventoryMovements.tankId, tankId));
  }
  const rows = await tx
    .select({ occurredAt: businessFuelInventoryMovements.occurredAt })
    .from(businessFuelInventoryMovements)
    .where(and(...conditions))
    .orderBy(desc(businessFuelInventoryMovements.occurredAt))
    .limit(1)
    .for("update");
  return rows[0]?.occurredAt ?? null;
}

async function latestTankMeasurementAt(
  tx: FuelTx,
  scope: FuelScope,
  tankId: number,
) {
  const rows = await tx
    .select({ measuredAt: businessFuelTankMeasurements.measuredAt })
    .from(businessFuelTankMeasurements)
    .where(
      and(
        eq(businessFuelTankMeasurements.organizationId, scope.organizationId),
        eq(businessFuelTankMeasurements.locationId, scope.locationId),
        eq(businessFuelTankMeasurements.tankId, tankId),
      ),
    )
    .orderBy(desc(businessFuelTankMeasurements.measuredAt), desc(businessFuelTankMeasurements.id))
    .limit(1)
    .for("update");
  return rows[0]?.measuredAt ?? null;
}

function assertChronological(
  at: Date,
  lastAt: Date | null,
  allowEqual = true,
) {
  const candidateAt = at.getTime();
  const latestAt = lastAt?.getTime() ?? null;
  const invalidOrder = lastAt && (allowEqual
    ? !isMovementTimestampAtOrAfter(candidateAt, latestAt)
    : !isTimestampStrictlyAfter(candidateAt, latestAt));
  if (invalidOrder) {
    badRequest(
      allowEqual
        ? "Não é permitido registrar um movimento anterior ao último evento do combustível."
        : "A vigência do preço precisa ser posterior ao último movimento do combustível.",
    );
  }
}

function assertStrictlyAfterTimestamp(
  at: Date,
  lastAt: Date | null,
  message: string,
) {
  if (lastAt && !isTimestampStrictlyAfter(at.getTime(), lastAt.getTime())) {
    badRequest(message);
  }
}

function assertNotFutureTimestamp(at: Date, message: string) {
  if (!isTimestampAtOrBefore(at.getTime(), Date.now())) badRequest(message);
}

function movingAverageInput(state: typeof businessFuelCostStates.$inferSelect) {
  return {
    quantityMilliLiters: signedLitersToMilliLiters(state.quantityLiters).toString(),
    inventoryValueCents: state.inventoryValueCents?.toString() ?? null,
    costKnown: state.costKnown,
  };
}

function capacityWarning(nextMilliLiters: bigint, capacityLiters: string | null) {
  if (!capacityLiters) return false;
  const capacity = litersToMilliLiters(capacityLiters, true);
  return nextMilliLiters > capacity;
}

async function writeAudit(
  tx: FuelTx,
  scope: FuelScope,
  event: string,
  targetId: number,
  metadata?: Record<string, string | number | boolean | null>,
) {
  await tx.insert(businessAudit).values({
    organizationId: scope.organizationId,
    locationId: scope.locationId,
    actorUserId: scope.actorId,
    event,
    targetId,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
}

export async function listFuelConfiguration(
  scope: FuelScope,
  includeInactive: boolean,
) {
  const db = await getDb();
  if (!db) throw unavailable();
  const [products, tanks, pumps, nozzles, prices, costStates, tankStates] =
    await Promise.all([
      db
        .select()
        .from(businessFuelProducts)
        .where(
          and(
            eq(businessFuelProducts.organizationId, scope.organizationId),
            eq(businessFuelProducts.locationId, scope.locationId),
            ...(includeInactive ? [] : [eq(businessFuelProducts.active, true)]),
          ),
        )
        .orderBy(businessFuelProducts.name)
        .limit(300),
      db
        .select()
        .from(businessFuelTanks)
        .where(
          and(
            eq(businessFuelTanks.organizationId, scope.organizationId),
            eq(businessFuelTanks.locationId, scope.locationId),
            ...(includeInactive ? [] : [eq(businessFuelTanks.active, true)]),
          ),
        )
        .orderBy(businessFuelTanks.name)
        .limit(300),
      db
        .select()
        .from(businessFuelPumps)
        .where(
          and(
            eq(businessFuelPumps.organizationId, scope.organizationId),
            eq(businessFuelPumps.locationId, scope.locationId),
            ...(includeInactive ? [] : [eq(businessFuelPumps.active, true)]),
          ),
        )
        .orderBy(businessFuelPumps.name)
        .limit(300),
      db
        .select()
        .from(businessFuelNozzles)
        .where(
          and(
            eq(businessFuelNozzles.organizationId, scope.organizationId),
            eq(businessFuelNozzles.locationId, scope.locationId),
            ...(includeInactive ? [] : [eq(businessFuelNozzles.active, true)]),
          ),
        )
        .orderBy(businessFuelNozzles.name)
        .limit(500),
      db
        .select()
        .from(businessFuelPrices)
        .where(
          and(
            eq(businessFuelPrices.organizationId, scope.organizationId),
            eq(businessFuelPrices.locationId, scope.locationId),
          ),
        )
        .orderBy(desc(businessFuelPrices.effectiveAt))
        .limit(300),
      db
        .select()
        .from(businessFuelCostStates)
        .where(
          and(
            eq(businessFuelCostStates.organizationId, scope.organizationId),
            eq(businessFuelCostStates.locationId, scope.locationId),
          ),
        )
        .limit(300),
      db
        .select()
        .from(businessFuelTankInventoryStates)
        .where(
          and(
            eq(businessFuelTankInventoryStates.organizationId, scope.organizationId),
            eq(businessFuelTankInventoryStates.locationId, scope.locationId),
          ),
        )
        .limit(500),
    ]);
  const latestReadingIds = nozzles.length
    ? await db
        .select({
          id: sql<number>`max(${businessFuelReadings.id})`,
          nozzleId: businessFuelReadings.nozzleId,
        })
        .from(businessFuelReadings)
        .where(
          and(
            eq(businessFuelReadings.organizationId, scope.organizationId),
            eq(businessFuelReadings.locationId, scope.locationId),
            inArray(businessFuelReadings.nozzleId, nozzles.map((nozzle) => nozzle.id)),
          ),
        )
        .groupBy(businessFuelReadings.nozzleId)
        .limit(500)
    : [];
  const lastReadings = latestReadingIds.length
    ? await db
        .select()
        .from(businessFuelReadings)
        .where(
          and(
            eq(businessFuelReadings.organizationId, scope.organizationId),
            eq(businessFuelReadings.locationId, scope.locationId),
            inArray(businessFuelReadings.id, latestReadingIds.map((row) => row.id)),
          ),
        )
        .limit(500)
    : [];
  const latestPriceByProduct = new Map<number, (typeof prices)[number]>();
  const now = Date.now();
  for (const price of prices) {
    if (
      price.effectiveAt.getTime() <= now &&
      !latestPriceByProduct.has(price.productId)
    ) {
      latestPriceByProduct.set(price.productId, price);
    }
  }
  const priceAuthorIds = [...new Set(prices.map((price) => price.createdBy))];
  const priceAuthors = priceAuthorIds.length
    ? await db
        .select({ id: businessUsers.id, name: businessUsers.name })
        .from(businessUsers)
        .where(inArray(businessUsers.id, priceAuthorIds))
        .limit(500)
    : [];
  const priceAuthorNameById = new Map(priceAuthors.map((author) => [author.id, author.name]));
  const costStateByProduct = new Map(costStates.map((state) => [state.productId, state]));
  const tankStateByTank = new Map(tankStates.map((state) => [state.tankId, state]));
  return {
    products,
    tanks: tanks.map((tank) => ({
      ...tank,
      theoreticalLiters:
        tankStateByTank.get(tank.id)?.quantityLiters ?? "0.000",
    })),
    pumps,
    nozzles,
    lastReadings,
    prices: prices.slice(0, 100).map((price) => ({
      ...price,
      authorName: priceAuthorNameById.get(price.createdBy) ?? "Conta não disponível",
    })),
    latestPriceByProduct: products.map((product) => ({
      productId: product.id,
      price: latestPriceByProduct.get(product.id) ?? null,
    })),
    costStates: products.map((product) => {
      const state = costStateByProduct.get(product.id);
      return {
        productId: product.id,
        quantityLiters: state?.quantityLiters ?? "0.000",
        inventoryValueCents: state?.inventoryValueCents ?? null,
        costKnown: state?.costKnown ?? true,
      };
    }),
  };
}

export async function createFuelProduct(
  scope: FuelScope,
  input: { code: string; name: string },
) {
  const db = await getDb();
  if (!db) throw unavailable();
  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(businessFuelProducts)
        .values({
          organizationId: scope.organizationId,
          locationId: scope.locationId,
          code: normalizeCode(input.code),
          name: normalizeName(input.name),
          createdBy: scope.actorId,
        })
        .$returningId();
      await tx.insert(businessFuelCostStates).values({
        organizationId: scope.organizationId,
        locationId: scope.locationId,
        productId: created.id,
        quantityLiters: "0.000",
        inventoryValueCents: 0n,
        costKnown: true,
      });
      await writeAudit(tx, scope, "fuel.product.created", created.id, {
        code: normalizeCode(input.code),
        name: normalizeName(input.name),
      });
      return { id: created.id };
    });
  } catch (error) {
    if (duplicateKey(error)) {
      throw new FuelServiceError("CONFLICT", "Já existe um produto com esse código nesta unidade.");
    }
    throw error;
  }
}

export async function setFuelProductActive(
  scope: FuelScope,
  input: { productId: number; active: boolean },
) {
  const db = await getDb();
  if (!db) throw unavailable();
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select()
      .from(businessFuelProducts)
      .where(
        and(
          eq(businessFuelProducts.id, input.productId),
          eq(businessFuelProducts.organizationId, scope.organizationId),
          eq(businessFuelProducts.locationId, scope.locationId),
        ),
      )
      .limit(1)
      .for("update");
    if (!product) notFound();
    if (product.active === input.active) return { success: true };
    if (!input.active) {
      const [dependent] = await tx
        .select({ id: businessFuelTanks.id })
        .from(businessFuelTanks)
        .where(
          and(
            eq(businessFuelTanks.organizationId, scope.organizationId),
            eq(businessFuelTanks.locationId, scope.locationId),
            eq(businessFuelTanks.productId, input.productId),
            eq(businessFuelTanks.active, true),
          ),
        )
        .limit(1);
      if (dependent) {
        throw new FuelServiceError(
          "CONFLICT",
          "Desative primeiro os tanques vinculados a este combustível.",
        );
      }
    }
    await tx
      .update(businessFuelProducts)
      .set({ active: input.active })
      .where(eq(businessFuelProducts.id, input.productId));
    await writeAudit(tx, scope, input.active ? "fuel.product.activated" : "fuel.product.deactivated", input.productId);
    return { success: true };
  });
}

export async function createFuelTank(
  scope: FuelScope,
  input: { productId: number; code: string; name: string; capacityLiters: string | null },
) {
  const db = await getDb();
  if (!db) throw unavailable();
  const capacity = input.capacityLiters?.trim() || null;
  if (capacity !== null) parseLiters(capacity);
  try {
    return await db.transaction(async (tx) => {
      await currentProduct(tx, scope, input.productId);
      const [tank] = await tx
        .insert(businessFuelTanks)
        .values({
          organizationId: scope.organizationId,
          locationId: scope.locationId,
          productId: input.productId,
          code: normalizeCode(input.code),
          name: normalizeName(input.name),
          capacityLiters: capacity,
          createdBy: scope.actorId,
        })
        .$returningId();
      await tx.insert(businessFuelTankInventoryStates).values({
        organizationId: scope.organizationId,
        locationId: scope.locationId,
        tankId: tank.id,
        quantityLiters: "0.000",
      });
      await writeAudit(tx, scope, "fuel.tank.created", tank.id, {
        productId: input.productId,
        code: normalizeCode(input.code),
        capacityLiters: capacity,
      });
      return { id: tank.id };
    });
  } catch (error) {
    if (duplicateKey(error)) {
      throw new FuelServiceError("CONFLICT", "Já existe um tanque com esse código nesta unidade.");
    }
    throw error;
  }
}

export async function setFuelTankActive(
  scope: FuelScope,
  input: { tankId: number; active: boolean },
) {
  const db = await getDb();
  if (!db) throw unavailable();
  return db.transaction(async (tx) => {
    const [tank] = await tx
      .select()
      .from(businessFuelTanks)
      .where(
        and(
          eq(businessFuelTanks.id, input.tankId),
          eq(businessFuelTanks.organizationId, scope.organizationId),
          eq(businessFuelTanks.locationId, scope.locationId),
        ),
      )
      .limit(1)
      .for("update");
    if (!tank) notFound();
    if (tank.active === input.active) return { success: true };
    if (!input.active) {
      const [dependent] = await tx
        .select({ id: businessFuelNozzles.id })
        .from(businessFuelNozzles)
        .where(
          and(
            eq(businessFuelNozzles.organizationId, scope.organizationId),
            eq(businessFuelNozzles.locationId, scope.locationId),
            eq(businessFuelNozzles.tankId, input.tankId),
            eq(businessFuelNozzles.active, true),
          ),
        )
        .limit(1);
      if (dependent) {
        throw new FuelServiceError("CONFLICT", "Desative primeiro os bicos vinculados a este tanque.");
      }
      const [inventory] = await tx
        .select({ quantityLiters: businessFuelTankInventoryStates.quantityLiters })
        .from(businessFuelTankInventoryStates)
        .where(
          and(
            eq(businessFuelTankInventoryStates.organizationId, scope.organizationId),
            eq(businessFuelTankInventoryStates.locationId, scope.locationId),
            eq(businessFuelTankInventoryStates.tankId, input.tankId),
          ),
        )
        .limit(1)
        .for("update");
      if (
        !inventory ||
        signedLitersToMilliLiters(inventory.quantityLiters) !== 0n
      ) {
        throw new FuelServiceError(
          "CONFLICT",
          "Zere e investigue o saldo teórico do tanque antes de desativá-lo.",
        );
      }
    } else {
      await currentProduct(tx, scope, tank.productId);
    }
    await tx.update(businessFuelTanks).set({ active: input.active }).where(eq(businessFuelTanks.id, input.tankId));
    await writeAudit(tx, scope, input.active ? "fuel.tank.activated" : "fuel.tank.deactivated", input.tankId);
    return { success: true };
  });
}

export async function createFuelPump(
  scope: FuelScope,
  input: { code: string; name: string },
) {
  const db = await getDb();
  if (!db) throw unavailable();
  try {
    return await db.transaction(async (tx) => {
      const [pump] = await tx
        .insert(businessFuelPumps)
        .values({
          organizationId: scope.organizationId,
          locationId: scope.locationId,
          code: normalizeCode(input.code),
          name: normalizeName(input.name),
          createdBy: scope.actorId,
        })
        .$returningId();
      await writeAudit(tx, scope, "fuel.pump.created", pump.id, {
        code: normalizeCode(input.code),
        name: normalizeName(input.name),
      });
      return { id: pump.id };
    });
  } catch (error) {
    if (duplicateKey(error)) {
      throw new FuelServiceError("CONFLICT", "Já existe uma bomba com esse código nesta unidade.");
    }
    throw error;
  }
}

export async function setFuelPumpActive(
  scope: FuelScope,
  input: { pumpId: number; active: boolean },
) {
  const db = await getDb();
  if (!db) throw unavailable();
  return db.transaction(async (tx) => {
    const [pump] = await tx
      .select()
      .from(businessFuelPumps)
      .where(
        and(
          eq(businessFuelPumps.id, input.pumpId),
          eq(businessFuelPumps.organizationId, scope.organizationId),
          eq(businessFuelPumps.locationId, scope.locationId),
        ),
      )
      .limit(1)
      .for("update");
    if (!pump) notFound();
    if (pump.active === input.active) return { success: true };
    if (!input.active) {
      const [dependent] = await tx
        .select({ id: businessFuelNozzles.id })
        .from(businessFuelNozzles)
        .where(
          and(
            eq(businessFuelNozzles.organizationId, scope.organizationId),
            eq(businessFuelNozzles.locationId, scope.locationId),
            eq(businessFuelNozzles.pumpId, input.pumpId),
            eq(businessFuelNozzles.active, true),
          ),
        )
        .limit(1);
      if (dependent) {
        throw new FuelServiceError("CONFLICT", "Desative primeiro os bicos vinculados a esta bomba.");
      }
    }
    await tx.update(businessFuelPumps).set({ active: input.active }).where(eq(businessFuelPumps.id, input.pumpId));
    await writeAudit(tx, scope, input.active ? "fuel.pump.activated" : "fuel.pump.deactivated", input.pumpId);
    return { success: true };
  });
}

export async function createFuelNozzle(
  scope: FuelScope,
  input: { pumpId: number; tankId: number; productId: number; code: string; name: string },
) {
  const db = await getDb();
  if (!db) throw unavailable();
  try {
    return await db.transaction(async (tx) => {
      const [pumpRows, tankRows] = await Promise.all([
        tx
          .select({ id: businessFuelPumps.id, active: businessFuelPumps.active })
          .from(businessFuelPumps)
          .where(
            and(
              eq(businessFuelPumps.id, input.pumpId),
              eq(businessFuelPumps.organizationId, scope.organizationId),
              eq(businessFuelPumps.locationId, scope.locationId),
            ),
          )
          .limit(1),
        tx
          .select()
          .from(businessFuelTanks)
          .where(
            and(
              eq(businessFuelTanks.id, input.tankId),
              eq(businessFuelTanks.organizationId, scope.organizationId),
              eq(businessFuelTanks.locationId, scope.locationId),
            ),
          )
          .limit(1),
      ]);
      const pump = requireScopeRows(pumpRows);
      const tank = requireScopeRows(tankRows);
      if (!pump.active || !tank.active || tank.productId !== input.productId) {
        throw new FuelServiceError("BAD_REQUEST", "Bomba, tanque e combustível precisam estar ativos e relacionados corretamente.");
      }
      await currentProduct(tx, scope, input.productId);
      const [nozzle] = await tx
        .insert(businessFuelNozzles)
        .values({
          organizationId: scope.organizationId,
          locationId: scope.locationId,
          pumpId: input.pumpId,
          tankId: input.tankId,
          productId: input.productId,
          code: normalizeCode(input.code),
          name: normalizeName(input.name),
          createdBy: scope.actorId,
        })
        .$returningId();
      await writeAudit(tx, scope, "fuel.nozzle.created", nozzle.id, {
        pumpId: input.pumpId,
        tankId: input.tankId,
        productId: input.productId,
        code: normalizeCode(input.code),
      });
      return { id: nozzle.id };
    });
  } catch (error) {
    if (duplicateKey(error)) {
      throw new FuelServiceError("CONFLICT", "Já existe um bico com esse código nesta bomba.");
    }
    throw error;
  }
}

export async function setFuelNozzleActive(
  scope: FuelScope,
  input: { nozzleId: number; active: boolean },
) {
  const db = await getDb();
  if (!db) throw unavailable();
  return db.transaction(async (tx) => {
    const [nozzle] = await tx
      .select()
      .from(businessFuelNozzles)
      .where(
        and(
          eq(businessFuelNozzles.id, input.nozzleId),
          eq(businessFuelNozzles.organizationId, scope.organizationId),
          eq(businessFuelNozzles.locationId, scope.locationId),
        ),
      )
      .limit(1)
      .for("update");
    if (!nozzle) notFound();
    if (nozzle.active === input.active) return { success: true };
    if (input.active) {
      const [pumpRows, tankRows] = await Promise.all([
        tx.select({ active: businessFuelPumps.active }).from(businessFuelPumps).where(and(eq(businessFuelPumps.id, nozzle.pumpId), eq(businessFuelPumps.organizationId, scope.organizationId), eq(businessFuelPumps.locationId, scope.locationId))).limit(1),
        tx.select({ active: businessFuelTanks.active, productId: businessFuelTanks.productId }).from(businessFuelTanks).where(and(eq(businessFuelTanks.id, nozzle.tankId), eq(businessFuelTanks.organizationId, scope.organizationId), eq(businessFuelTanks.locationId, scope.locationId))).limit(1),
      ]);
      if (!pumpRows[0]?.active || !tankRows[0]?.active || tankRows[0].productId !== nozzle.productId) {
        throw new FuelServiceError("CONFLICT", "Ative primeiro a bomba e o tanque compatíveis.");
      }
      await currentProduct(tx, scope, nozzle.productId);
    }
    await tx.update(businessFuelNozzles).set({ active: input.active }).where(eq(businessFuelNozzles.id, input.nozzleId));
    await writeAudit(tx, scope, input.active ? "fuel.nozzle.activated" : "fuel.nozzle.deactivated", input.nozzleId);
    return { success: true };
  });
}

export async function createFuelPrice(
  scope: FuelScope,
  input: { productId: number; price: string; effectiveAt: string },
) {
  const db = await getDb();
  if (!db) throw unavailable();
  const priceCentsPerLiter = safePriceCents(input.price);
  const effectiveAt = dateValue(input.effectiveAt, true);
  try {
    return await db.transaction(async (tx) => {
      const costStateRows = await tx
        .select({ id: businessFuelCostStates.id })
        .from(businessFuelCostStates)
        .where(
          and(
            eq(businessFuelCostStates.organizationId, scope.organizationId),
            eq(businessFuelCostStates.locationId, scope.locationId),
            eq(businessFuelCostStates.productId, input.productId),
          ),
        )
        .limit(1)
        .for("update");
      if (!costStateRows[0]) notFound();
      await currentProduct(tx, scope, input.productId);
      const lastAt = await latestMovementAt(tx, scope, input.productId);
      assertChronological(effectiveAt, lastAt, false);
      const [existing] = await tx
        .select({ id: businessFuelPrices.id })
        .from(businessFuelPrices)
        .where(
          and(
            eq(businessFuelPrices.organizationId, scope.organizationId),
            eq(businessFuelPrices.locationId, scope.locationId),
            eq(businessFuelPrices.productId, input.productId),
            eq(businessFuelPrices.effectiveAt, effectiveAt),
          ),
        )
        .limit(1)
        .for("update");
      if (existing) throw new FuelServiceError("CONFLICT", "Já existe um preço com esta vigência.");
      const [created] = await tx
        .insert(businessFuelPrices)
        .values({
          organizationId: scope.organizationId,
          locationId: scope.locationId,
          productId: input.productId,
          priceCentsPerLiter,
          effectiveAt,
          createdBy: scope.actorId,
        })
        .$returningId();
      await writeAudit(tx, scope, "fuel.price.created", created.id, {
        productId: input.productId,
        priceCentsPerLiter,
        effectiveAt: effectiveAt.toISOString(),
      });
      return { id: created.id };
    });
  } catch (error) {
    if (duplicateKey(error)) throw new FuelServiceError("CONFLICT", "Já existe um preço com esta vigência.");
    throw error;
  }
}

export async function createFuelReceipt(
  scope: FuelScope,
  input: {
    productId: number;
    tankId: number;
    supplier: string;
    documentReference: string | null;
    quantityLiters: string;
    unitCostPerLiter: string;
    receivedAt: string;
  },
) {
  const db = await getDb();
  if (!db) throw unavailable();
  const quantity = parseLiters(input.quantityLiters);
  const unitCost = safePriceCents(input.unitCostPerLiter);
  const totalCostCents = BigInt(litersAtPriceToCents(quantity, unitCost));
  const supplier = input.supplier.trim();
  const reference = input.documentReference?.trim() || null;
  if (supplier.length < 2 || supplier.length > 160) badRequest("Informe o fornecedor (2 a 160 caracteres).");
  if (reference && reference.length > 120) badRequest("A referência documental aceita até 120 caracteres.");
  const receivedAt = asDate(input.receivedAt);
  assertNotFutureTimestamp(receivedAt, "O recebimento não pode ter data/hora futura.");

  return db.transaction(async (tx) => {
    await currentProduct(tx, scope, input.productId);
    const tank = await currentTank(tx, scope, input.tankId);
    if (tank.productId !== input.productId) badRequest("O tanque selecionado pertence a outro combustível.");
    const states = await inventoryStates(tx, scope, input.tankId, input.productId);
    assertStrictlyAfterTimestamp(
      receivedAt,
      await latestTankMeasurementAt(tx, scope, tank.id),
      "O recebimento precisa ser posterior à última medição física do tanque.",
    );
    assertChronological(receivedAt, await latestMovementAt(tx, scope, input.productId));
    assertChronological(receivedAt, await latestMovementAt(tx, scope, input.productId, input.tankId));

    const oldTankMilliLiters = signedLitersToMilliLiters(states.tank.quantityLiters);
    const nextTankMilliLiters = oldTankMilliLiters + quantity;
    const capWarning = capacityWarning(nextTankMilliLiters, tank.capacityLiters);
    const nextCost = applyMovingAverageDelta(
      movingAverageInput(states.cost),
      quantity,
      totalCostCents,
    );
    const [receipt] = await tx
      .insert(businessFuelReceipts)
      .values({
        organizationId: scope.organizationId,
        locationId: scope.locationId,
        productId: input.productId,
        tankId: input.tankId,
        supplier,
        documentReference: reference,
        quantityLiters: milliLitersToDecimal(quantity),
        unitCostCentsPerLiter: unitCost,
        totalCostCents,
        receivedAt,
        createdBy: scope.actorId,
      })
      .$returningId();
    await tx.insert(businessFuelInventoryMovements).values({
      organizationId: scope.organizationId,
      locationId: scope.locationId,
      productId: input.productId,
      tankId: input.tankId,
      movementType: "receipt",
      quantityLiters: milliLitersToDecimal(quantity),
      movementCostCents: totalCostCents,
      sourceType: "receipt",
      sourceId: receipt.id,
      occurredAt: receivedAt,
      createdBy: scope.actorId,
    });
    await tx
      .update(businessFuelTankInventoryStates)
      .set({ quantityLiters: milliLitersToDecimal(nextTankMilliLiters) })
      .where(eq(businessFuelTankInventoryStates.id, states.tank.id));
    await tx
      .update(businessFuelCostStates)
      .set({
        quantityLiters: milliLitersToDecimal(BigInt(nextCost.state.quantityMilliLiters)),
        inventoryValueCents:
          nextCost.state.inventoryValueCents === null
            ? null
            : BigInt(nextCost.state.inventoryValueCents),
        costKnown: nextCost.state.costKnown,
      })
      .where(eq(businessFuelCostStates.id, states.cost.id));
    await writeAudit(tx, scope, "fuel.receipt.created", receipt.id, {
      productId: input.productId,
      tankId: input.tankId,
      quantityLiters: milliLitersToDecimal(quantity),
      totalCostCents: totalCostCents.toString(),
    });
    return {
      id: receipt.id,
      totalCostCents,
      capacityWarning: capWarning,
      quantityLiters: milliLitersToDecimal(quantity),
    };
  });
}

async function readLockedNozzle(
  tx: FuelTx,
  scope: FuelScope,
  nozzleId: number,
) {
  const nozzle = await currentNozzle(tx, scope, nozzleId, true);
  const [pumpRows, tankRows] = await Promise.all([
    tx
      .select({ id: businessFuelPumps.id, active: businessFuelPumps.active })
      .from(businessFuelPumps)
      .where(
        and(
          eq(businessFuelPumps.id, nozzle.pumpId),
          eq(businessFuelPumps.organizationId, scope.organizationId),
          eq(businessFuelPumps.locationId, scope.locationId),
        ),
      )
      .limit(1),
    tx
      .select({ id: businessFuelTanks.id, productId: businessFuelTanks.productId, active: businessFuelTanks.active })
      .from(businessFuelTanks)
      .where(
        and(
          eq(businessFuelTanks.id, nozzle.tankId),
          eq(businessFuelTanks.organizationId, scope.organizationId),
          eq(businessFuelTanks.locationId, scope.locationId),
        ),
      )
      .limit(1),
  ]);
  if (!pumpRows[0]?.active || !tankRows[0]?.active || tankRows[0].productId !== nozzle.productId) {
    throw new FuelServiceError("CONFLICT", "O bico está ligado a uma configuração inativa ou incompatível.");
  }
  return nozzle;
}

async function latestNozzleReading(
  tx: FuelTx,
  scope: FuelScope,
  nozzleId: number,
) {
  const rows = await tx
    .select()
    .from(businessFuelReadings)
    .where(
      and(
        eq(businessFuelReadings.organizationId, scope.organizationId),
        eq(businessFuelReadings.locationId, scope.locationId),
        eq(businessFuelReadings.nozzleId, nozzleId),
      ),
    )
    .orderBy(desc(businessFuelReadings.measuredAt), desc(businessFuelReadings.id))
    .limit(1)
    .for("update");
  return rows[0] ?? null;
}

function assertNextReadingAt(at: Date, previousAt: Date | null) {
  if (previousAt && at.getTime() <= previousAt.getTime()) {
    badRequest("A leitura precisa ocorrer depois da leitura anterior do bico.");
  }
}

export async function recordFuelBaseline(
  scope: FuelScope,
  input: { nozzleId: number; counterLiters: string; measuredAt: string },
) {
  const db = await getDb();
  if (!db) throw unavailable();
  const counter = parseLiters(input.counterLiters, true);
  const measuredAt = asDate(input.measuredAt);
  assertNotFutureTimestamp(measuredAt, "A leitura de base não pode ter data/hora futura.");
  return db.transaction(async (tx) => {
    const nozzle = await readLockedNozzle(tx, scope, input.nozzleId);
    const previous = await latestNozzleReading(tx, scope, nozzle.id);
    if (previous) throw new FuelServiceError("CONFLICT", "Este bico já possui um encerrante inicial. Use uma leitura de intervalo ou registre troca/reset autorizado.");
    const [created] = await tx
      .insert(businessFuelReadings)
      .values({
        organizationId: scope.organizationId,
        locationId: scope.locationId,
        nozzleId: nozzle.id,
        pumpId: nozzle.pumpId,
        tankId: nozzle.tankId,
        productId: nozzle.productId,
        kind: "baseline",
        previousCounterLiters: null,
        counterLiters: milliLitersToDecimal(counter),
        quantityLiters: "0.000",
        measuredAt,
        createdBy: scope.actorId,
      })
      .$returningId();
    await writeAudit(tx, scope, "fuel.meter.baseline", created.id, {
      nozzleId: nozzle.id,
      counterLiters: milliLitersToDecimal(counter),
    });
    return { id: created.id };
  });
}

export async function recordFuelInterval(
  scope: FuelScope,
  input: {
    nozzleId: number;
    previousCounterLiters: string;
    finalCounterLiters: string;
    measuredAt: string;
  },
) {
  const db = await getDb();
  if (!db) throw unavailable();
  const previousCounter = parseLiters(input.previousCounterLiters, true);
  const finalCounter = parseLiters(input.finalCounterLiters, true);
  const measuredAt = asDate(input.measuredAt);
  assertNotFutureTimestamp(measuredAt, "A leitura do bico não pode ter data/hora futura.");
  return db.transaction(async (tx) => {
    const nozzleForLock = await currentNozzle(tx, scope, input.nozzleId, true);
    const states = await inventoryStates(
      tx,
      scope,
      nozzleForLock.tankId,
      nozzleForLock.productId,
    );
    const nozzle = await readLockedNozzle(tx, scope, input.nozzleId);
    const previous = await latestNozzleReading(tx, scope, nozzle.id);
    if (!previous) throw new FuelServiceError("CONFLICT", "Registre primeiro o encerrante inicial deste bico.");
    assertNextReadingAt(measuredAt, previous.measuredAt);
    const storedCounter = parseLiters(previous.counterLiters, true);
    if (previousCounter !== storedCounter) {
      throw new FuelServiceError("CONFLICT", "O encerrante inicial informado está desatualizado. Atualize a tela e revise os valores.");
    }
    let volume: bigint;
    try {
      volume = meterInterval({
        previousCounterLiters: previous.counterLiters,
        finalCounterLiters: milliLitersToDecimal(finalCounter),
        centsPerLiter: 1,
      }).volumeMilliLiters;
    } catch (error) {
      if (error instanceof FuelDomainError) badRequest(error.message);
      throw error;
    }
    if (volume > 0n) {
      assertChronological(measuredAt, await latestMovementAt(tx, scope, nozzle.productId));
      assertChronological(measuredAt, await latestMovementAt(tx, scope, nozzle.productId, nozzle.tankId));
      assertStrictlyAfterTimestamp(
        measuredAt,
        await latestTankMeasurementAt(tx, scope, nozzle.tankId),
        "A leitura de venda precisa ser posterior à última medição física do tanque.",
      );
    }
    const boundaryChanges = await tx
      .select({ id: businessFuelPrices.id })
      .from(businessFuelPrices)
      .where(
        and(
          eq(businessFuelPrices.organizationId, scope.organizationId),
          eq(businessFuelPrices.locationId, scope.locationId),
          eq(businessFuelPrices.productId, nozzle.productId),
          gt(businessFuelPrices.effectiveAt, previous.measuredAt),
          lt(businessFuelPrices.effectiveAt, measuredAt),
        ),
      )
      .limit(1);
    if (boundaryChanges.length) {
      throw new FuelServiceError(
        "CONFLICT",
        "O intervalo atravessa uma mudança de preço. Registre uma leitura de fronteira para cada bico ou divida o intervalo em leituras revisadas.",
      );
    }
    const prices = await tx
      .select()
      .from(businessFuelPrices)
      .where(
        and(
          eq(businessFuelPrices.organizationId, scope.organizationId),
          eq(businessFuelPrices.locationId, scope.locationId),
          eq(businessFuelPrices.productId, nozzle.productId),
          lte(businessFuelPrices.effectiveAt, previous.measuredAt),
        ),
      )
      .orderBy(desc(businessFuelPrices.effectiveAt), desc(businessFuelPrices.id))
      .limit(1);
    const price = prices[0];
    if (!price) badRequest("Não há preço vigente no início deste intervalo. Cadastre um preço antes da leitura.");
    const revenueCents = BigInt(litersAtPriceToCents(volume, price.priceCentsPerLiter));

    let issueCostCents: bigint | null = volume === 0n ? 0n : null;
    let capacityAlert = false;
    let costStateNext: ReturnType<typeof applyMovingAverageDelta>["state"] | null = null;
    let tankStateNext: string | null = null;
    let costStateId: number | null = null;
    let tankStateId: number | null = null;
    if (volume > 0n) {
      const average = applyMovingAverageDelta(movingAverageInput(states.cost), -volume, null);
      issueCostCents = average.issueCostCents;
      costStateNext = average.state;
      costStateId = states.cost.id;
      const currentTankMl = signedLitersToMilliLiters(states.tank.quantityLiters);
      const updatedTankMl = currentTankMl - volume;
      tankStateNext = milliLitersToDecimal(updatedTankMl);
      tankStateId = states.tank.id;
      const [tank] = await tx
        .select({ capacityLiters: businessFuelTanks.capacityLiters })
        .from(businessFuelTanks)
        .where(
          and(
            eq(businessFuelTanks.id, nozzle.tankId),
            eq(businessFuelTanks.organizationId, scope.organizationId),
            eq(businessFuelTanks.locationId, scope.locationId),
          ),
        )
        .limit(1);
      capacityAlert = Boolean(
        tank && capacityWarning(updatedTankMl, tank.capacityLiters),
      );
    }

    const [reading] = await tx
      .insert(businessFuelReadings)
      .values({
        organizationId: scope.organizationId,
        locationId: scope.locationId,
        nozzleId: nozzle.id,
        pumpId: nozzle.pumpId,
        tankId: nozzle.tankId,
        productId: nozzle.productId,
        kind: "interval",
        previousCounterLiters: previous.counterLiters,
        counterLiters: milliLitersToDecimal(finalCounter),
        quantityLiters: milliLitersToDecimal(volume),
        priceId: price.id,
        priceCentsPerLiter: price.priceCentsPerLiter,
        revenueCents,
        costCents: issueCostCents,
        measuredAt,
        createdBy: scope.actorId,
      })
      .$returningId();
    if (volume > 0n) {
      await tx.insert(businessFuelInventoryMovements).values({
        organizationId: scope.organizationId,
        locationId: scope.locationId,
        productId: nozzle.productId,
        tankId: nozzle.tankId,
        movementType: "nozzle_sale",
        quantityLiters: milliLitersToDecimal(-volume),
        movementCostCents: issueCostCents,
        sourceType: "nozzle_reading",
        sourceId: reading.id,
        occurredAt: measuredAt,
        createdBy: scope.actorId,
      });
      await tx
        .update(businessFuelTankInventoryStates)
        .set({ quantityLiters: tankStateNext! })
        .where(eq(businessFuelTankInventoryStates.id, tankStateId!));
      await tx
        .update(businessFuelCostStates)
        .set({
          quantityLiters: milliLitersToDecimal(BigInt(costStateNext!.quantityMilliLiters)),
          inventoryValueCents:
            costStateNext!.inventoryValueCents === null
              ? null
              : BigInt(costStateNext!.inventoryValueCents),
          costKnown: costStateNext!.costKnown,
        })
        .where(eq(businessFuelCostStates.id, costStateId!));
    }
    await writeAudit(tx, scope, "fuel.meter.interval", reading.id, {
      nozzleId: nozzle.id,
      quantityLiters: milliLitersToDecimal(volume),
      revenueCents: revenueCents.toString(),
      costCents: issueCostCents?.toString() ?? null,
    });
    return {
      id: reading.id,
      quantityLiters: milliLitersToDecimal(volume),
      revenueCents,
      costCents: issueCostCents,
      marginCents: issueCostCents === null ? null : revenueCents - issueCostCents,
      priceCentsPerLiter: price.priceCentsPerLiter,
      capacityWarning: capacityAlert,
    };
  });
}

export async function resetFuelMeter(
  scope: FuelScope,
  input: { nozzleId: number; counterLiters: string; measuredAt: string; reason: string },
) {
  const db = await getDb();
  if (!db) throw unavailable();
  const counter = parseLiters(input.counterLiters, true);
  const reason = normalizeReason(input.reason);
  const measuredAt = asDate(input.measuredAt);
  assertNotFutureTimestamp(measuredAt, "O reset do medidor não pode ter data/hora futura.");
  return db.transaction(async (tx) => {
    const nozzle = await readLockedNozzle(tx, scope, input.nozzleId);
    const previous = await latestNozzleReading(tx, scope, nozzle.id);
    if (!previous) throw new FuelServiceError("CONFLICT", "Registre o encerrante inicial antes do reset.");
    assertNextReadingAt(measuredAt, previous.measuredAt);
    const [reading] = await tx
      .insert(businessFuelReadings)
      .values({
        organizationId: scope.organizationId,
        locationId: scope.locationId,
        nozzleId: nozzle.id,
        pumpId: nozzle.pumpId,
        tankId: nozzle.tankId,
        productId: nozzle.productId,
        kind: "reset",
        previousCounterLiters: previous.counterLiters,
        counterLiters: milliLitersToDecimal(counter),
        quantityLiters: "0.000",
        reason,
        measuredAt,
        createdBy: scope.actorId,
      })
      .$returningId();
    await writeAudit(tx, scope, "fuel.meter.reset", reading.id, {
      nozzleId: nozzle.id,
      previousCounterLiters: previous.counterLiters,
      counterLiters: milliLitersToDecimal(counter),
      reason,
    });
    return { id: reading.id };
  });
}

export async function recordFuelTankMeasurement(
  scope: FuelScope,
  input: {
    tankId: number;
    expectedTheoreticalLiters: string;
    measuredLiters: string;
    measuredAt: string;
    reason?: string;
  },
) {
  const db = await getDb();
  if (!db) throw unavailable();
  const measured = parseLiters(input.measuredLiters, true);
  const measuredAt = asDate(input.measuredAt);
  assertNotFutureTimestamp(measuredAt, "A medição física não pode ter data/hora futura.");
  return db.transaction(async (tx) => {
    const tank = await currentTank(tx, scope, input.tankId);
    const states = await inventoryStates(tx, scope, tank.id, tank.productId);
    if (
      !doesFuelTankTheoreticalBalanceMatch(
        input.expectedTheoreticalLiters,
        states.tank.quantityLiters,
      )
    ) {
      throw new FuelServiceError(
        "CONFLICT",
        "O estoque teórico mudou desde a conferência. Atualize os dados, revise a nova diferença e confirme novamente.",
      );
    }
    assertStrictlyAfterTimestamp(
      measuredAt,
      await latestTankMeasurementAt(tx, scope, tank.id),
      "A medição precisa ser posterior à medição anterior do tanque.",
    );
    assertStrictlyAfterTimestamp(
      measuredAt,
      await latestMovementAt(tx, scope, tank.productId, tank.id),
      "A medição física precisa ser posterior ao último movimento registrado no tanque.",
    );
    const theoretical = signedLitersToMilliLiters(states.tank.quantityLiters);
    const variance = tankVariance(
      milliLitersToDecimal(theoretical),
      milliLitersToDecimal(measured),
    );
    const reason = variance.hasDifference ? normalizeReason(input.reason) : input.reason?.trim() || null;
    if (reason && reason.length > 500) badRequest("A justificativa aceita até 500 caracteres.");
    const [measurement] = await tx
      .insert(businessFuelTankMeasurements)
      .values({
        organizationId: scope.organizationId,
        locationId: scope.locationId,
        tankId: tank.id,
        productId: tank.productId,
        measuredLiters: milliLitersToDecimal(measured),
        theoreticalLiters: milliLitersToDecimal(theoretical),
        varianceLiters: variance.differenceLiters,
        status: variance.hasDifference ? "pending" : "matched",
        reason,
        measuredAt,
        createdBy: scope.actorId,
      })
      .$returningId();
    await writeAudit(tx, scope, "fuel.tank.measured", measurement.id, {
      tankId: tank.id,
      measuredLiters: milliLitersToDecimal(measured),
      theoreticalLiters: milliLitersToDecimal(theoretical),
      varianceLiters: variance.differenceLiters,
      reason,
    });
    return {
      id: measurement.id,
      theoreticalLiters: milliLitersToDecimal(theoretical),
      measuredLiters: milliLitersToDecimal(measured),
      varianceLiters: variance.differenceLiters,
      pending: variance.hasDifference,
    };
  });
}

export async function createFuelAdjustment(
  scope: FuelScope,
  input: {
    tankId: number;
    direction: "add" | "remove";
    quantityLiters: string;
    unitCostPerLiter: string | null;
    reason: string;
    recordedAt: string;
  },
) {
  const db = await getDb();
  if (!db) throw unavailable();
  const quantity = parseLiters(input.quantityLiters);
  const reason = normalizeReason(input.reason);
  const recordedAt = asDate(input.recordedAt);
  assertNotFutureTimestamp(recordedAt, "O ajuste não pode ter data/hora futura.");
  const unitCost = input.direction === "add"
    ? input.unitCostPerLiter
      ? safePriceCents(input.unitCostPerLiter)
      : badRequest("Informe o custo por litro de um ajuste positivo.")
    : null;
  const inputValue = unitCost === null ? null : BigInt(litersAtPriceToCents(quantity, unitCost));

  return db.transaction(async (tx) => {
    const tank = await currentTank(tx, scope, input.tankId);
    const states = await inventoryStates(tx, scope, tank.id, tank.productId);
    assertStrictlyAfterTimestamp(
      recordedAt,
      await latestTankMeasurementAt(tx, scope, tank.id),
      "O ajuste precisa ser posterior à última medição física do tanque.",
    );
    assertChronological(recordedAt, await latestMovementAt(tx, scope, tank.productId));
    assertChronological(recordedAt, await latestMovementAt(tx, scope, tank.productId, tank.id));
    const direction = input.direction === "add" ? 1n : -1n;
    const quantityDelta = quantity * direction;
    const cost = applyMovingAverageDelta(
      movingAverageInput(states.cost),
      quantityDelta,
      inputValue,
    );
    const oldTankMilliLiters = signedLitersToMilliLiters(states.tank.quantityLiters);
    const nextTankMilliLiters = oldTankMilliLiters + quantityDelta;
    const capWarning = capacityWarning(nextTankMilliLiters, tank.capacityLiters);
    const [adjustment] = await tx
      .insert(businessFuelAdjustments)
      .values({
        organizationId: scope.organizationId,
        locationId: scope.locationId,
        tankId: tank.id,
        productId: tank.productId,
        direction: input.direction,
        quantityLiters: milliLitersToDecimal(quantity),
        unitCostCentsPerLiter: unitCost,
        reason,
        recordedAt,
        authorizedBy: scope.actorId,
      })
      .$returningId();
    await tx.insert(businessFuelInventoryMovements).values({
      organizationId: scope.organizationId,
      locationId: scope.locationId,
      productId: tank.productId,
      tankId: tank.id,
      movementType: input.direction === "add" ? "adjustment_add" : "adjustment_remove",
      quantityLiters: milliLitersToDecimal(quantityDelta),
      movementCostCents: input.direction === "add" ? inputValue : cost.issueCostCents,
      sourceType: "adjustment",
      sourceId: adjustment.id,
      occurredAt: recordedAt,
      createdBy: scope.actorId,
    });
    await tx
      .update(businessFuelTankInventoryStates)
      .set({ quantityLiters: milliLitersToDecimal(nextTankMilliLiters) })
      .where(eq(businessFuelTankInventoryStates.id, states.tank.id));
    await tx
      .update(businessFuelCostStates)
      .set({
        quantityLiters: milliLitersToDecimal(BigInt(cost.state.quantityMilliLiters)),
        inventoryValueCents:
          cost.state.inventoryValueCents === null
            ? null
            : BigInt(cost.state.inventoryValueCents),
        costKnown: cost.state.costKnown,
      })
      .where(eq(businessFuelCostStates.id, states.cost.id));
    await writeAudit(tx, scope, "fuel.inventory.adjusted", adjustment.id, {
      tankId: tank.id,
      direction: input.direction,
      quantityLiters: milliLitersToDecimal(quantity),
      reason,
      movementCostCents:
        (input.direction === "add" ? inputValue : cost.issueCostCents)?.toString() ?? null,
    });
    return {
      id: adjustment.id,
      capacityWarning: capWarning,
      issueCostCents: cost.issueCostCents,
      quantityLiters: milliLitersToDecimal(quantity),
    };
  });
}

function averageUnitCostCentsPerLiter(
  quantityMilliLiters: bigint,
  inventoryValueCents: bigint | null,
  costKnown: boolean,
) {
  if (quantityMilliLiters <= 0n || inventoryValueCents === null || !costKnown) return null;
  return Number(
    (inventoryValueCents * 1_000n + quantityMilliLiters / 2n) /
      quantityMilliLiters,
  );
}

export async function getFuelDashboard(
  scope: FuelScope,
  input: {
    fromDate: string;
    toDate: string;
    productId?: number;
    tankId?: number;
    pumpId?: number;
  },
  timeZone: string,
) {
  const db = await getDb();
  if (!db) throw unavailable();
  const { from, toExclusive } = period(input, timeZone);
  if (input.productId) {
    const [product] = await db
      .select({ id: businessFuelProducts.id })
      .from(businessFuelProducts)
      .where(and(eq(businessFuelProducts.id, input.productId), eq(businessFuelProducts.organizationId, scope.organizationId), eq(businessFuelProducts.locationId, scope.locationId)))
      .limit(1);
    if (!product) notFound();
  }
  if (input.tankId) {
    const [tank] = await db
      .select({ id: businessFuelTanks.id })
      .from(businessFuelTanks)
      .where(and(eq(businessFuelTanks.id, input.tankId), eq(businessFuelTanks.organizationId, scope.organizationId), eq(businessFuelTanks.locationId, scope.locationId)))
      .limit(1);
    if (!tank) notFound();
  }
  if (input.pumpId) {
    const [pump] = await db
      .select({ id: businessFuelPumps.id })
      .from(businessFuelPumps)
      .where(and(eq(businessFuelPumps.id, input.pumpId), eq(businessFuelPumps.organizationId, scope.organizationId), eq(businessFuelPumps.locationId, scope.locationId)))
      .limit(1);
    if (!pump) notFound();
  }
  const pumpTankIds = input.pumpId
    ? (
        await db
          .select({ tankId: businessFuelNozzles.tankId })
          .from(businessFuelNozzles)
          .where(
            and(
              eq(businessFuelNozzles.organizationId, scope.organizationId),
              eq(businessFuelNozzles.locationId, scope.locationId),
              eq(businessFuelNozzles.pumpId, input.pumpId),
              ...(input.productId
                ? [eq(businessFuelNozzles.productId, input.productId)]
                : []),
              ...(input.tankId
                ? [eq(businessFuelNozzles.tankId, input.tankId)]
                : []),
            ),
          )
          .groupBy(businessFuelNozzles.tankId)
          .limit(500)
      ).map((row) => row.tankId)
    : null;
  const readingFilters = [
    eq(businessFuelReadings.organizationId, scope.organizationId),
    eq(businessFuelReadings.locationId, scope.locationId),
    eq(businessFuelReadings.kind, "interval" as const),
    gte(businessFuelReadings.measuredAt, from),
    lt(businessFuelReadings.measuredAt, toExclusive),
  ];
  const meterHistoryFilters = [
    eq(businessFuelReadings.organizationId, scope.organizationId),
    eq(businessFuelReadings.locationId, scope.locationId),
    gte(businessFuelReadings.measuredAt, from),
    lt(businessFuelReadings.measuredAt, toExclusive),
  ];
  const receiptFilters = [
    eq(businessFuelReceipts.organizationId, scope.organizationId),
    eq(businessFuelReceipts.locationId, scope.locationId),
    gte(businessFuelReceipts.receivedAt, from),
    lt(businessFuelReceipts.receivedAt, toExclusive),
  ];
  const adjustmentFilters = [
    eq(businessFuelAdjustments.organizationId, scope.organizationId),
    eq(businessFuelAdjustments.locationId, scope.locationId),
    gte(businessFuelAdjustments.recordedAt, from),
    lt(businessFuelAdjustments.recordedAt, toExclusive),
  ];
  if (input.productId) {
    readingFilters.push(eq(businessFuelReadings.productId, input.productId));
    meterHistoryFilters.push(eq(businessFuelReadings.productId, input.productId));
    receiptFilters.push(eq(businessFuelReceipts.productId, input.productId));
    adjustmentFilters.push(eq(businessFuelAdjustments.productId, input.productId));
  }
  if (input.tankId) {
    readingFilters.push(eq(businessFuelReadings.tankId, input.tankId));
    meterHistoryFilters.push(eq(businessFuelReadings.tankId, input.tankId));
    receiptFilters.push(eq(businessFuelReceipts.tankId, input.tankId));
    adjustmentFilters.push(eq(businessFuelAdjustments.tankId, input.tankId));
  }
  if (input.pumpId) {
    readingFilters.push(eq(businessFuelReadings.pumpId, input.pumpId));
    meterHistoryFilters.push(eq(businessFuelReadings.pumpId, input.pumpId));
    if (pumpTankIds?.length) {
      receiptFilters.push(inArray(businessFuelReceipts.tankId, pumpTankIds));
      adjustmentFilters.push(inArray(businessFuelAdjustments.tankId, pumpTankIds));
    } else {
      receiptFilters.push(sql`1 = 0`);
      adjustmentFilters.push(sql`1 = 0`);
    }
  }

  const [products, tanks, pumps, nozzles, totals, costStates, tankStates, prices, receipts, recentReadings, adjustments, measureIds] = await Promise.all([
    db.select().from(businessFuelProducts).where(and(eq(businessFuelProducts.organizationId, scope.organizationId), eq(businessFuelProducts.locationId, scope.locationId), eq(businessFuelProducts.active, true))).orderBy(businessFuelProducts.name).limit(300),
    db.select().from(businessFuelTanks).where(and(eq(businessFuelTanks.organizationId, scope.organizationId), eq(businessFuelTanks.locationId, scope.locationId), eq(businessFuelTanks.active, true), ...(input.productId ? [eq(businessFuelTanks.productId, input.productId)] : []), ...(input.tankId ? [eq(businessFuelTanks.id, input.tankId)] : []))).orderBy(businessFuelTanks.name).limit(300),
    db.select().from(businessFuelPumps).where(and(eq(businessFuelPumps.organizationId, scope.organizationId), eq(businessFuelPumps.locationId, scope.locationId), eq(businessFuelPumps.active, true))).orderBy(businessFuelPumps.name).limit(300),
    db.select().from(businessFuelNozzles).where(and(eq(businessFuelNozzles.organizationId, scope.organizationId), eq(businessFuelNozzles.locationId, scope.locationId), eq(businessFuelNozzles.active, true))).orderBy(businessFuelNozzles.name).limit(500),
    db.select({
      productId: businessFuelReadings.productId,
      quantityLiters: sql<string>`coalesce(sum(${businessFuelReadings.quantityLiters}), 0)`,
      revenueCents: sql<string>`coalesce(sum(${businessFuelReadings.revenueCents}), 0)`,
      costCents: sql<string>`coalesce(sum(${businessFuelReadings.costCents}), 0)`,
      readingCount: sql<number>`count(*)`,
      knownCostCount: sql<number>`sum(case when ${businessFuelReadings.costCents} is not null then 1 else 0 end)`,
    }).from(businessFuelReadings).where(and(...readingFilters)).groupBy(businessFuelReadings.productId).limit(300),
    db.select().from(businessFuelCostStates).where(and(eq(businessFuelCostStates.organizationId, scope.organizationId), eq(businessFuelCostStates.locationId, scope.locationId), ...(input.productId ? [eq(businessFuelCostStates.productId, input.productId)] : []))).limit(300),
    db.select().from(businessFuelTankInventoryStates).where(and(eq(businessFuelTankInventoryStates.organizationId, scope.organizationId), eq(businessFuelTankInventoryStates.locationId, scope.locationId), ...(input.tankId ? [eq(businessFuelTankInventoryStates.tankId, input.tankId)] : []))).limit(500),
    db.select().from(businessFuelPrices).where(and(eq(businessFuelPrices.organizationId, scope.organizationId), eq(businessFuelPrices.locationId, scope.locationId), lte(businessFuelPrices.effectiveAt, new Date()))).orderBy(desc(businessFuelPrices.effectiveAt), desc(businessFuelPrices.id)).limit(500),
    db.select().from(businessFuelReceipts).where(and(...receiptFilters)).orderBy(desc(businessFuelReceipts.receivedAt), desc(businessFuelReceipts.id)).limit(20),
    db.select().from(businessFuelReadings).where(and(...meterHistoryFilters)).orderBy(desc(businessFuelReadings.measuredAt), desc(businessFuelReadings.id)).limit(20),
    db.select().from(businessFuelAdjustments).where(and(...adjustmentFilters)).orderBy(desc(businessFuelAdjustments.recordedAt), desc(businessFuelAdjustments.id)).limit(20),
    db.select({ id: sql<number>`max(${businessFuelTankMeasurements.id})` }).from(businessFuelTankMeasurements).where(and(eq(businessFuelTankMeasurements.organizationId, scope.organizationId), eq(businessFuelTankMeasurements.locationId, scope.locationId), ...(input.productId ? [eq(businessFuelTankMeasurements.productId, input.productId)] : []), ...(input.tankId ? [eq(businessFuelTankMeasurements.tankId, input.tankId)] : []))).groupBy(businessFuelTankMeasurements.tankId).limit(500),
  ]);
  const measurementRows = measureIds.length
    ? await db
        .select()
        .from(businessFuelTankMeasurements)
        .where(
          and(
            eq(businessFuelTankMeasurements.organizationId, scope.organizationId),
            eq(businessFuelTankMeasurements.locationId, scope.locationId),
            inArray(businessFuelTankMeasurements.id, measureIds.map((row) => row.id)),
          ),
        )
        .limit(500)
    : [];
  const actorIds = [...new Set([
    ...measurementRows.map((row) => row.createdBy),
    ...receipts.map((row) => row.createdBy),
    ...recentReadings.map((row) => row.createdBy),
    ...adjustments.map((row) => row.authorizedBy),
  ])];
  const authors = actorIds.length
    ? await db
        .select({ id: businessUsers.id, name: businessUsers.name })
        .from(businessUsers)
        .where(inArray(businessUsers.id, actorIds))
        .limit(500)
    : [];
  const authorNameById = new Map(authors.map((author) => [author.id, author.name]));
  const namedMeasurements = measurementRows.map((measurement) => ({
    ...measurement,
    authorName: authorNameById.get(measurement.createdBy) ?? "Conta não disponível",
  }));
  const currentPrices = new Map<number, (typeof prices)[number]>();
  for (const price of prices) {
    if (!currentPrices.has(price.productId)) currentPrices.set(price.productId, price);
  }
  const costStateByProduct = new Map(costStates.map((state) => [state.productId, state]));
  const summaryByProduct = new Map(totals.map((row) => [row.productId, row]));
  const productSummaries = products
    .filter((product) => !input.productId || product.id === input.productId)
    .map((product) => {
      const row = summaryByProduct.get(product.id);
      const volume = litersToMilliLiters(String(row?.quantityLiters ?? "0"), true);
      const revenue = bigIntValue(row?.revenueCents);
      const rowCount = Number(row?.readingCount ?? 0);
      const knownCount = Number(row?.knownCostCount ?? 0);
      const costKnown = rowCount === knownCount;
      const cost = costKnown ? bigIntValue(row?.costCents) : null;
      const margin = cost === null ? null : revenue - cost;
      const currentState = costStateByProduct.get(product.id);
      const currentQuantity = currentState
        ? signedLitersToMilliLiters(currentState.quantityLiters)
        : 0n;
      return {
        productId: product.id,
        productName: product.name,
        quantityLiters: milliLitersToDecimal(volume),
        revenueCents: revenue,
        costCents: cost,
        marginCents: margin,
        costKnown,
        readingCount: rowCount,
        currentStockLiters: milliLitersToDecimal(currentQuantity),
        currentCostKnown: currentState?.costKnown ?? true,
        currentAverageCostCentsPerLiter: currentState
          ? averageUnitCostCentsPerLiter(
              currentQuantity,
              currentState.inventoryValueCents,
              currentState.costKnown,
            )
          : null,
        currentPriceCentsPerLiter:
          currentPrices.get(product.id)?.priceCentsPerLiter ?? null,
      };
    });
  const tankStateByTank = new Map(tankStates.map((state) => [state.tankId, state]));
  const measureByTank = new Map(namedMeasurements.map((measurement) => [measurement.tankId, measurement]));
  const currentTankRows = tanks.map((tank) => ({
      id: tank.id,
      name: tank.name,
      code: tank.code,
      productId: tank.productId,
      capacityLiters: tank.capacityLiters,
      theoreticalLiters: tankStateByTank.get(tank.id)?.quantityLiters ?? "0.000",
      latestMeasurement: measureByTank.get(tank.id) ?? null,
    }));
  const tankIdsForSelectedPump = input.pumpId
    ? new Set(nozzles.filter((nozzle) => nozzle.pumpId === input.pumpId).map((nozzle) => nozzle.tankId))
    : undefined;
  const tankRows = filterCurrentFuelTankSnapshots(currentTankRows, {
    productId: input.productId,
    tankId: input.tankId,
    pumpId: input.pumpId,
    tankIdsForSelectedPump,
  });
  const pendingTankDifferences = countPendingCurrentFuelTankDifferences(tankRows);

  return {
    period: { from: input.fromDate, to: input.toDate },
    products: productSummaries,
    tanks: tankRows,
    pumps: pumps.filter((pump) => !input.pumpId || pump.id === input.pumpId),
    nozzles: nozzles.filter((nozzle) =>
      (!input.productId || nozzle.productId === input.productId) &&
      (!input.tankId || nozzle.tankId === input.tankId) &&
      (!input.pumpId || nozzle.pumpId === input.pumpId),
    ),
    priceHistory: prices.slice(0, 100),
    receipts: receipts.map((receipt) => ({
      ...receipt,
      authorName: authorNameById.get(receipt.createdBy) ?? "Conta não disponível",
    })),
    recentReadings: recentReadings.map((reading) => ({
      ...reading,
      authorName: authorNameById.get(reading.createdBy) ?? "Conta não disponível",
    })),
    adjustments: adjustments.map((adjustment) => ({
      ...adjustment,
      authorName: authorNameById.get(adjustment.authorizedBy) ?? "Conta não disponível",
    })),
    pendingTankDifferences,
    totalRevenueCents: productSummaries.reduce((sum, row) => sum + row.revenueCents, 0n),
    totalMarginCents: productSummaries.every((row) => row.marginCents !== null)
      ? productSummaries.reduce((sum, row) => sum + (row.marginCents ?? 0n), 0n)
      : null,
  };
}
