import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  decimal,
  foreignKey,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const businessUsers = mysqlTable(
  "business_users",
  {
    id: int("id").autoincrement().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
    disabledAt: timestamp("disabledAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("business_users_email_uq").on(t.email)],
);
export const businessOrganizations = mysqlTable("business_organizations", {
  id: int("id").autoincrement().primaryKey(),
  singletonKey: varchar("singletonKey", { length: 16 })
    .notNull()
    .default("primary")
    .unique(),
  name: varchar("name", { length: 160 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export const businessLocations = mysqlTable(
  "business_locations",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    city: varchar("city", { length: 100 }).notNull().default("Bauru"),
    state: varchar("state", { length: 2 }).notNull().default("SP"),
    timezone: varchar("timezone", { length: 64 })
      .notNull()
      .default("America/Sao_Paulo"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("business_location_org_name_uq").on(t.organizationId, t.name),
    uniqueIndex("business_location_scope_id_uq").on(t.organizationId, t.id),
    index("business_location_org_idx").on(t.organizationId),
  ],
);
export const businessMemberships = mysqlTable(
  "business_memberships",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    role: mysqlEnum("role", [
      "owner",
      "manager",
      "cashier",
      "attendant",
      "oil_technician",
      "finance_viewer",
    ]).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("business_membership_user_location_uq").on(
      t.userId,
      t.locationId,
    ),
    index("business_membership_scope_idx").on(
      t.organizationId,
      t.locationId,
      t.userId,
    ),
    index("business_membership_user_active_idx").on(t.userId, t.active),
    uniqueIndex("business_membership_scope_user_uq").on(
      t.organizationId,
      t.locationId,
      t.userId,
    ),
  ],
);
export const businessInvitations = mysqlTable(
  "business_invitations",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    role: mysqlEnum("role", [
      "manager",
      "cashier",
      "attendant",
      "oil_technician",
      "finance_viewer",
    ]).notNull(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    acceptedAt: timestamp("acceptedAt"),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("business_invitation_token_uq").on(t.tokenHash),
    index("business_invitation_scope_idx").on(
      t.organizationId,
      t.locationId,
      t.acceptedAt,
    ),
    index("business_invitation_email_idx").on(t.email),
  ],
);
export const businessPasswordResets = mysqlTable(
  "business_password_resets",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    usedAt: timestamp("usedAt"),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("business_password_reset_token_uq").on(t.tokenHash),
    index("business_password_reset_user_state_idx").on(
      t.userId,
      t.usedAt,
      t.expiresAt,
    ),
  ],
);
export const businessSessions = mysqlTable(
  "business_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    userId: int("userId").notNull(),
    csrfHash: varchar("csrfHash", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("business_session_token_uq").on(t.tokenHash),
    index("business_session_user_state_idx").on(
      t.userId,
      t.revokedAt,
      t.expiresAt,
    ),
  ],
);
export const businessFuelProducts = mysqlTable(
  "business_fuel_products",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    uniqueIndex("fuel_product_scope_code_uq").on(
      t.organizationId,
      t.locationId,
      t.code,
    ),
    index("fuel_product_scope_active_idx").on(
      t.organizationId,
      t.locationId,
      t.active,
    ),
    uniqueIndex("fuel_product_scope_id_uq").on(
      t.organizationId,
      t.locationId,
      t.id,
    ),
    foreignKey({
      name: "fuel_product_location_fk",
      columns: [t.organizationId, t.locationId],
      foreignColumns: [businessLocations.organizationId, businessLocations.id],
    }),
    foreignKey({
      name: "fuel_product_author_fk",
      columns: [t.createdBy],
      foreignColumns: [businessUsers.id],
    }),
  ],
);
export const businessFuelTanks = mysqlTable(
  "business_fuel_tanks",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    productId: int("productId").notNull(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    capacityLiters: decimal("capacityLiters", {
      precision: 18,
      scale: 3,
      mode: "string",
    }),
    active: boolean("active").notNull().default(true),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    uniqueIndex("fuel_tank_scope_code_uq").on(
      t.organizationId,
      t.locationId,
      t.code,
    ),
    index("fuel_tank_scope_product_idx").on(
      t.organizationId,
      t.locationId,
      t.productId,
      t.active,
    ),
    uniqueIndex("fuel_tank_scope_id_product_uq").on(
      t.organizationId,
      t.locationId,
      t.id,
      t.productId,
    ),
    // Exact key for fuel_tank_inventory_tank_fk: MySQL 8.4+ rejects foreign keys whose
    // referenced columns are not a whole unique key (TiDB accepted it).
    uniqueIndex("fuel_tank_scope_id_uq").on(t.organizationId, t.locationId, t.id),
    foreignKey({
      name: "fuel_tank_location_fk",
      columns: [t.organizationId, t.locationId],
      foreignColumns: [businessLocations.organizationId, businessLocations.id],
    }),
    foreignKey({
      name: "fuel_tank_product_fk",
      columns: [t.organizationId, t.locationId, t.productId],
      foreignColumns: [businessFuelProducts.organizationId, businessFuelProducts.locationId, businessFuelProducts.id],
    }),
    foreignKey({
      name: "fuel_tank_author_fk",
      columns: [t.createdBy],
      foreignColumns: [businessUsers.id],
    }),
  ],
);
export const businessFuelPumps = mysqlTable(
  "business_fuel_pumps",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    uniqueIndex("fuel_pump_scope_code_uq").on(
      t.organizationId,
      t.locationId,
      t.code,
    ),
    index("fuel_pump_scope_active_idx").on(
      t.organizationId,
      t.locationId,
      t.active,
    ),
    uniqueIndex("fuel_pump_scope_id_uq").on(
      t.organizationId,
      t.locationId,
      t.id,
    ),
    foreignKey({
      name: "fuel_pump_location_fk",
      columns: [t.organizationId, t.locationId],
      foreignColumns: [businessLocations.organizationId, businessLocations.id],
    }),
    foreignKey({
      name: "fuel_pump_author_fk",
      columns: [t.createdBy],
      foreignColumns: [businessUsers.id],
    }),
  ],
);
export const businessFuelNozzles = mysqlTable(
  "business_fuel_nozzles",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    pumpId: int("pumpId").notNull(),
    tankId: int("tankId").notNull(),
    productId: int("productId").notNull(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    uniqueIndex("fuel_nozzle_scope_pump_code_uq").on(
      t.organizationId,
      t.locationId,
      t.pumpId,
      t.code,
    ),
    index("fuel_nozzle_scope_tank_idx").on(
      t.organizationId,
      t.locationId,
      t.tankId,
      t.active,
    ),
    index("fuel_nozzle_scope_product_idx").on(
      t.organizationId,
      t.locationId,
      t.productId,
      t.active,
    ),
    uniqueIndex("fuel_nozzle_scope_relation_uq").on(
      t.organizationId,
      t.locationId,
      t.id,
      t.pumpId,
      t.tankId,
      t.productId,
    ),
    foreignKey({
      name: "fuel_nozzle_location_fk",
      columns: [t.organizationId, t.locationId],
      foreignColumns: [businessLocations.organizationId, businessLocations.id],
    }),
    foreignKey({
      name: "fuel_nozzle_pump_fk",
      columns: [t.organizationId, t.locationId, t.pumpId],
      foreignColumns: [businessFuelPumps.organizationId, businessFuelPumps.locationId, businessFuelPumps.id],
    }),
    foreignKey({
      name: "fuel_nozzle_tank_product_fk",
      columns: [t.organizationId, t.locationId, t.tankId, t.productId],
      foreignColumns: [businessFuelTanks.organizationId, businessFuelTanks.locationId, businessFuelTanks.id, businessFuelTanks.productId],
    }),
    foreignKey({
      name: "fuel_nozzle_author_fk",
      columns: [t.createdBy],
      foreignColumns: [businessUsers.id],
    }),
  ],
);
export const businessFuelPrices = mysqlTable(
  "business_fuel_prices",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    productId: int("productId").notNull(),
    priceCentsPerLiter: int("priceCentsPerLiter").notNull(),
    effectiveAt: timestamp("effectiveAt").notNull(),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("fuel_price_scope_product_effective_uq").on(
      t.organizationId,
      t.locationId,
      t.productId,
      t.effectiveAt,
    ),
    uniqueIndex("fuel_price_scope_id_product_uq").on(
      t.organizationId,
      t.locationId,
      t.id,
      t.productId,
    ),
    foreignKey({
      name: "fuel_price_location_fk",
      columns: [t.organizationId, t.locationId],
      foreignColumns: [businessLocations.organizationId, businessLocations.id],
    }),
    foreignKey({
      name: "fuel_price_product_fk",
      columns: [t.organizationId, t.locationId, t.productId],
      foreignColumns: [businessFuelProducts.organizationId, businessFuelProducts.locationId, businessFuelProducts.id],
    }),
    foreignKey({
      name: "fuel_price_author_fk",
      columns: [t.createdBy],
      foreignColumns: [businessUsers.id],
    }),
  ],
);
export const businessFuelReceipts = mysqlTable(
  "business_fuel_receipts",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    productId: int("productId").notNull(),
    tankId: int("tankId").notNull(),
    supplier: varchar("supplier", { length: 160 }).notNull(),
    documentReference: varchar("documentReference", { length: 120 }),
    quantityLiters: decimal("quantityLiters", {
      precision: 18,
      scale: 3,
      mode: "string",
    }).notNull(),
    unitCostCentsPerLiter: int("unitCostCentsPerLiter").notNull(),
    totalCostCents: bigint("totalCostCents", { mode: "bigint" }).notNull(),
    receivedAt: timestamp("receivedAt").notNull(),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("fuel_receipt_scope_time_idx").on(
      t.organizationId,
      t.locationId,
      t.receivedAt,
    ),
    index("fuel_receipt_scope_product_idx").on(
      t.organizationId,
      t.locationId,
      t.productId,
      t.receivedAt,
    ),
    foreignKey({
      name: "fuel_receipt_location_fk",
      columns: [t.organizationId, t.locationId],
      foreignColumns: [businessLocations.organizationId, businessLocations.id],
    }),
    foreignKey({
      name: "fuel_receipt_tank_product_fk",
      columns: [t.organizationId, t.locationId, t.tankId, t.productId],
      foreignColumns: [businessFuelTanks.organizationId, businessFuelTanks.locationId, businessFuelTanks.id, businessFuelTanks.productId],
    }),
    foreignKey({
      name: "fuel_receipt_author_fk",
      columns: [t.createdBy],
      foreignColumns: [businessUsers.id],
    }),
  ],
);
export const businessFuelReadings = mysqlTable(
  "business_fuel_readings",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    nozzleId: int("nozzleId").notNull(),
    pumpId: int("pumpId").notNull(),
    tankId: int("tankId").notNull(),
    productId: int("productId").notNull(),
    kind: mysqlEnum("kind", ["baseline", "interval", "reset"]).notNull(),
    previousCounterLiters: decimal("previousCounterLiters", {
      precision: 18,
      scale: 3,
      mode: "string",
    }),
    counterLiters: decimal("counterLiters", {
      precision: 18,
      scale: 3,
      mode: "string",
    }).notNull(),
    quantityLiters: decimal("quantityLiters", {
      precision: 18,
      scale: 3,
      mode: "string",
    }).notNull(),
    priceId: int("priceId"),
    priceCentsPerLiter: int("priceCentsPerLiter"),
    revenueCents: bigint("revenueCents", { mode: "bigint" }),
    costCents: bigint("costCents", { mode: "bigint" }),
    reason: varchar("reason", { length: 500 }),
    measuredAt: timestamp("measuredAt").notNull(),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("fuel_reading_scope_nozzle_time_idx").on(
      t.organizationId,
      t.locationId,
      t.nozzleId,
      t.measuredAt,
    ),
    index("fuel_reading_scope_period_idx").on(
      t.organizationId,
      t.locationId,
      t.measuredAt,
    ),
    index("fuel_reading_scope_product_idx").on(
      t.organizationId,
      t.locationId,
      t.productId,
      t.measuredAt,
    ),
    foreignKey({
      name: "fuel_reading_location_fk",
      columns: [t.organizationId, t.locationId],
      foreignColumns: [businessLocations.organizationId, businessLocations.id],
    }),
    foreignKey({
      name: "fuel_reading_nozzle_relation_fk",
      columns: [t.organizationId, t.locationId, t.nozzleId, t.pumpId, t.tankId, t.productId],
      foreignColumns: [businessFuelNozzles.organizationId, businessFuelNozzles.locationId, businessFuelNozzles.id, businessFuelNozzles.pumpId, businessFuelNozzles.tankId, businessFuelNozzles.productId],
    }),
    foreignKey({
      name: "fuel_reading_price_product_fk",
      columns: [t.organizationId, t.locationId, t.priceId, t.productId],
      foreignColumns: [businessFuelPrices.organizationId, businessFuelPrices.locationId, businessFuelPrices.id, businessFuelPrices.productId],
    }),
    foreignKey({
      name: "fuel_reading_author_fk",
      columns: [t.createdBy],
      foreignColumns: [businessUsers.id],
    }),
  ],
);
export const businessFuelTankMeasurements = mysqlTable(
  "business_fuel_tank_measurements",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    tankId: int("tankId").notNull(),
    productId: int("productId").notNull(),
    measuredLiters: decimal("measuredLiters", {
      precision: 18,
      scale: 3,
      mode: "string",
    }).notNull(),
    theoreticalLiters: decimal("theoreticalLiters", {
      precision: 18,
      scale: 3,
      mode: "string",
    }).notNull(),
    varianceLiters: decimal("varianceLiters", {
      precision: 18,
      scale: 3,
      mode: "string",
    }).notNull(),
    status: mysqlEnum("status", ["matched", "pending"]).notNull(),
    reason: varchar("reason", { length: 500 }),
    measuredAt: timestamp("measuredAt").notNull(),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("fuel_tank_measure_scope_tank_time_idx").on(
      t.organizationId,
      t.locationId,
      t.tankId,
      t.measuredAt,
    ),
    index("fuel_tank_measure_scope_period_idx").on(
      t.organizationId,
      t.locationId,
      t.measuredAt,
    ),
    foreignKey({
      name: "fuel_tank_measure_location_fk",
      columns: [t.organizationId, t.locationId],
      foreignColumns: [businessLocations.organizationId, businessLocations.id],
    }),
    foreignKey({
      name: "fuel_tank_measure_tank_product_fk",
      columns: [t.organizationId, t.locationId, t.tankId, t.productId],
      foreignColumns: [businessFuelTanks.organizationId, businessFuelTanks.locationId, businessFuelTanks.id, businessFuelTanks.productId],
    }),
    foreignKey({
      name: "fuel_tank_measure_author_fk",
      columns: [t.createdBy],
      foreignColumns: [businessUsers.id],
    }),
  ],
);
export const businessFuelAdjustments = mysqlTable(
  "business_fuel_adjustments",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    tankId: int("tankId").notNull(),
    productId: int("productId").notNull(),
    direction: mysqlEnum("direction", ["add", "remove"]).notNull(),
    quantityLiters: decimal("quantityLiters", {
      precision: 18,
      scale: 3,
      mode: "string",
    }).notNull(),
    unitCostCentsPerLiter: int("unitCostCentsPerLiter"),
    reason: varchar("reason", { length: 500 }).notNull(),
    recordedAt: timestamp("recordedAt").notNull(),
    authorizedBy: int("authorizedBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("fuel_adjustment_scope_tank_time_idx").on(
      t.organizationId,
      t.locationId,
      t.tankId,
      t.recordedAt,
    ),
    foreignKey({
      name: "fuel_adjustment_location_fk",
      columns: [t.organizationId, t.locationId],
      foreignColumns: [businessLocations.organizationId, businessLocations.id],
    }),
    foreignKey({
      name: "fuel_adjustment_tank_product_fk",
      columns: [t.organizationId, t.locationId, t.tankId, t.productId],
      foreignColumns: [businessFuelTanks.organizationId, businessFuelTanks.locationId, businessFuelTanks.id, businessFuelTanks.productId],
    }),
    foreignKey({
      name: "fuel_adjustment_author_fk",
      columns: [t.authorizedBy],
      foreignColumns: [businessUsers.id],
    }),
  ],
);
export const businessFuelInventoryMovements = mysqlTable(
  "business_fuel_inventory_movements",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    productId: int("productId").notNull(),
    tankId: int("tankId").notNull(),
    movementType: mysqlEnum("movementType", [
      "receipt",
      "nozzle_sale",
      "adjustment_add",
      "adjustment_remove",
    ]).notNull(),
    quantityLiters: decimal("quantityLiters", {
      precision: 18,
      scale: 3,
      mode: "string",
    }).notNull(),
    movementCostCents: bigint("movementCostCents", { mode: "bigint" }),
    sourceType: varchar("sourceType", { length: 32 }).notNull(),
    sourceId: int("sourceId").notNull(),
    occurredAt: timestamp("occurredAt").notNull(),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("fuel_movement_source_uq").on(
      t.organizationId,
      t.locationId,
      t.sourceType,
      t.sourceId,
    ),
    index("fuel_movement_scope_product_time_idx").on(
      t.organizationId,
      t.locationId,
      t.productId,
      t.occurredAt,
    ),
    index("fuel_movement_scope_tank_time_idx").on(
      t.organizationId,
      t.locationId,
      t.tankId,
      t.occurredAt,
    ),
    foreignKey({
      name: "fuel_movement_location_fk",
      columns: [t.organizationId, t.locationId],
      foreignColumns: [businessLocations.organizationId, businessLocations.id],
    }),
    foreignKey({
      name: "fuel_movement_tank_product_fk",
      columns: [t.organizationId, t.locationId, t.tankId, t.productId],
      foreignColumns: [businessFuelTanks.organizationId, businessFuelTanks.locationId, businessFuelTanks.id, businessFuelTanks.productId],
    }),
    foreignKey({
      name: "fuel_movement_author_fk",
      columns: [t.createdBy],
      foreignColumns: [businessUsers.id],
    }),
  ],
);
export const businessFuelTankInventoryStates = mysqlTable(
  "business_fuel_tank_inventory_states",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    tankId: int("tankId").notNull(),
    quantityLiters: decimal("quantityLiters", {
      precision: 18,
      scale: 3,
      mode: "string",
    }).notNull().default("0.000"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    uniqueIndex("fuel_tank_inventory_tank_uq").on(
      t.organizationId,
      t.locationId,
      t.tankId,
    ),
    foreignKey({
      name: "fuel_tank_inventory_location_fk",
      columns: [t.organizationId, t.locationId],
      foreignColumns: [businessLocations.organizationId, businessLocations.id],
    }),
    foreignKey({
      name: "fuel_tank_inventory_tank_fk",
      columns: [t.organizationId, t.locationId, t.tankId],
      foreignColumns: [businessFuelTanks.organizationId, businessFuelTanks.locationId, businessFuelTanks.id],
    }),
  ],
);
export const businessFuelCostStates = mysqlTable(
  "business_fuel_cost_states",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    productId: int("productId").notNull(),
    quantityLiters: decimal("quantityLiters", {
      precision: 18,
      scale: 3,
      mode: "string",
    }).notNull().default("0.000"),
    inventoryValueCents: bigint("inventoryValueCents", { mode: "bigint" }),
    costKnown: boolean("costKnown").notNull().default(true),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    uniqueIndex("fuel_cost_state_product_uq").on(
      t.organizationId,
      t.locationId,
      t.productId,
    ),
    foreignKey({
      name: "fuel_cost_state_location_fk",
      columns: [t.organizationId, t.locationId],
      foreignColumns: [businessLocations.organizationId, businessLocations.id],
    }),
    foreignKey({
      name: "fuel_cost_state_product_fk",
      columns: [t.organizationId, t.locationId, t.productId],
      foreignColumns: [businessFuelProducts.organizationId, businessFuelProducts.locationId, businessFuelProducts.id],
    }),
  ],
);
export const businessAudit = mysqlTable(
  "business_audit",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    actorUserId: int("actorUserId"),
    event: varchar("event", { length: 80 }).notNull(),
    targetId: int("targetId"),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("business_audit_scope_time_idx").on(
      t.organizationId,
      t.locationId,
      t.createdAt,
    ),
    index("business_audit_actor_idx").on(t.actorUserId, t.createdAt),
  ],
);

export const businessCashRegisters = mysqlTable(
  "business_cash_registers",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    revision: int("revision").notNull().default(0),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt", { fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  (t) => [
    uniqueIndex("cash_register_location_uq").on(
      t.organizationId,
      t.locationId,
    ),
    uniqueIndex("cash_register_scope_id_uq").on(
      t.organizationId,
      t.locationId,
      t.id,
    ),
    index("cash_register_creator_idx").on(t.createdBy, t.createdAt),
    foreignKey({
      name: "cash_register_location_fk",
      columns: [t.organizationId, t.locationId],
      foreignColumns: [businessLocations.organizationId, businessLocations.id],
    }),
    foreignKey({
      name: "cash_register_creator_membership_fk",
      columns: [t.organizationId, t.locationId, t.createdBy],
      foreignColumns: [
        businessMemberships.organizationId,
        businessMemberships.locationId,
        businessMemberships.userId,
      ],
    }),
  ],
);

export const businessCashOpenings = mysqlTable(
  "business_cash_openings",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    registerId: int("registerId").notNull(),
    operatorId: int("operatorId").notNull(),
    operator: varchar("operator", { length: 120 }).notNull(),
    openingFloatCents: bigint("openingFloatCents", { mode: "bigint" }).notNull(),
    operationDate: date("operationDate", { mode: "string" }).notNull(),
    timeZone: varchar("timeZone", { length: 64 })
      .notNull()
      .default("America/Sao_Paulo"),
    shiftId: mysqlEnum("shiftId", ["turno-1", "turno-2"]).notNull(),
    shiftLabel: varchar("shiftLabel", { length: 40 }).notNull(),
    shiftStart: varchar("shiftStart", { length: 5 }).notNull(),
    shiftEnd: varchar("shiftEnd", { length: 5 }).notNull(),
    openedAt: timestamp("openedAt", { fsp: 3 }).notNull(),
    activeSlot: varchar("activeSlot", { length: 16 }).default("active"),
    intentId: varchar("intentId", { length: 36 }).notNull(),
    payloadDigest: varchar("payloadDigest", { length: 64 }).notNull(),
    resultRevision: int("resultRevision").notNull(),
  },
  (t) => [
    uniqueIndex("cash_opening_intent_scope_uq").on(
      t.organizationId,
      t.locationId,
      t.intentId,
    ),
    uniqueIndex("cash_opening_active_slot_uq").on(
      t.organizationId,
      t.locationId,
      t.registerId,
      t.activeSlot,
    ),
    uniqueIndex("cash_opening_scope_id_uq").on(
      t.organizationId,
      t.locationId,
      t.id,
    ),
    index("cash_opening_operator_time_idx").on(
      t.organizationId,
      t.locationId,
      t.operatorId,
      t.openedAt,
    ),
    index("cash_opening_register_time_idx").on(
      t.organizationId,
      t.locationId,
      t.registerId,
      t.openedAt,
    ),
    foreignKey({
      name: "cash_opening_register_fk",
      columns: [t.organizationId, t.locationId, t.registerId],
      foreignColumns: [
        businessCashRegisters.organizationId,
        businessCashRegisters.locationId,
        businessCashRegisters.id,
      ],
    }),
    foreignKey({
      name: "cash_opening_operator_membership_fk",
      columns: [t.organizationId, t.locationId, t.operatorId],
      foreignColumns: [
        businessMemberships.organizationId,
        businessMemberships.locationId,
        businessMemberships.userId,
      ],
    }),
  ],
);

export const businessCashOpeningAudits = mysqlTable(
  "business_cash_opening_audits",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    registerId: int("registerId").notNull(),
    openingId: int("openingId").notNull(),
    actorId: int("actorId").notNull(),
    event: varchar("event", { length: 80 }).notNull(),
    revision: int("revision").notNull(),
    payloadDigest: varchar("payloadDigest", { length: 64 }).notNull(),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt", { fsp: 3 }).notNull(),
  },
  (t) => [
    uniqueIndex("cash_opening_audit_event_uq").on(
      t.organizationId,
      t.locationId,
      t.openingId,
      t.event,
    ),
    index("cash_opening_audit_scope_time_idx").on(
      t.organizationId,
      t.locationId,
      t.createdAt,
    ),
    foreignKey({
      name: "cash_opening_audit_opening_fk",
      columns: [t.organizationId, t.locationId, t.openingId],
      foreignColumns: [
        businessCashOpenings.organizationId,
        businessCashOpenings.locationId,
        businessCashOpenings.id,
      ],
    }),
    foreignKey({
      name: "cash_opening_audit_register_fk",
      columns: [t.organizationId, t.locationId, t.registerId],
      foreignColumns: [
        businessCashRegisters.organizationId,
        businessCashRegisters.locationId,
        businessCashRegisters.id,
      ],
    }),
    foreignKey({
      name: "cash_opening_audit_actor_membership_fk",
      columns: [t.organizationId, t.locationId, t.actorId],
      foreignColumns: [
        businessMemberships.organizationId,
        businessMemberships.locationId,
        businessMemberships.userId,
      ],
    }),
  ],
);

export const businessCashMovements = mysqlTable(
  "business_cash_movements",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    registerId: int("registerId").notNull(),
    openingId: int("openingId").notNull(),
    responsibleId: int("responsibleId").notNull(),
    responsible: varchar("responsible", { length: 120 }).notNull(),
    type: mysqlEnum("type", ["recebimento", "sangria", "suprimento"]).notNull(),
    paymentMethod: mysqlEnum("paymentMethod", ["dinheiro", "pix", "debito", "credito"]).notNull(),
    receiptNature: mysqlEnum("receiptNature", ["venda", "conta-anterior"]),
    amountCents: bigint("amountCents", { mode: "bigint" }).notNull(),
    description: varchar("description", { length: 200 }).notNull(),
    reference: varchar("reference", { length: 120 }).notNull().default(""),
    referenceDigest: varchar("referenceDigest", { length: 64 }),
    counterparty: varchar("counterparty", { length: 120 }).notNull().default(""),
    intentId: varchar("intentId", { length: 36 }).notNull(),
    payloadDigest: varchar("payloadDigest", { length: 64 }).notNull(),
    resultRevision: int("resultRevision").notNull(),
    recordedAt: timestamp("recordedAt", { fsp: 3 }).notNull(),
    createdAt: timestamp("createdAt", { fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  (t) => [
    uniqueIndex("cash_movement_scope_id_uq").on(t.organizationId, t.locationId, t.id),
    uniqueIndex("cash_movement_intent_scope_uq").on(t.organizationId, t.locationId, t.intentId),
    uniqueIndex("cash_movement_reference_scope_uq").on(
      t.organizationId,
      t.locationId,
      t.openingId,
      t.paymentMethod,
      t.referenceDigest,
    ),
    index("cash_movement_opening_id_idx").on(t.organizationId, t.locationId, t.openingId, t.id),
    index("cash_movement_opening_time_idx").on(t.organizationId, t.locationId, t.openingId, t.recordedAt),
    foreignKey({
      name: "cash_movement_location_fk",
      columns: [t.organizationId, t.locationId],
      foreignColumns: [businessLocations.organizationId, businessLocations.id],
    }),
    foreignKey({
      name: "cash_movement_register_fk",
      columns: [t.organizationId, t.locationId, t.registerId],
      foreignColumns: [businessCashRegisters.organizationId, businessCashRegisters.locationId, businessCashRegisters.id],
    }),
    foreignKey({
      name: "cash_movement_opening_fk",
      columns: [t.organizationId, t.locationId, t.openingId],
      foreignColumns: [businessCashOpenings.organizationId, businessCashOpenings.locationId, businessCashOpenings.id],
    }),
    foreignKey({
      name: "cash_movement_author_membership_fk",
      columns: [t.organizationId, t.locationId, t.responsibleId],
      foreignColumns: [businessMemberships.organizationId, businessMemberships.locationId, businessMemberships.userId],
    }),
  ],
);

export const businessCashMovementAudits = mysqlTable(
  "business_cash_movement_audits",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    registerId: int("registerId").notNull(),
    openingId: int("openingId").notNull(),
    movementId: int("movementId").notNull(),
    actorId: int("actorId").notNull(),
    event: varchar("event", { length: 80 }).notNull(),
    revision: int("revision").notNull(),
    payloadDigest: varchar("payloadDigest", { length: 64 }).notNull(),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt", { fsp: 3 }).notNull(),
  },
  (t) => [
    uniqueIndex("cash_movement_audit_event_uq").on(t.organizationId, t.locationId, t.movementId, t.event),
    index("cash_movement_audit_scope_time_idx").on(t.organizationId, t.locationId, t.createdAt),
    foreignKey({
      name: "cash_movement_audit_location_fk",
      columns: [t.organizationId, t.locationId],
      foreignColumns: [businessLocations.organizationId, businessLocations.id],
    }),
    foreignKey({
      name: "cash_movement_audit_register_fk",
      columns: [t.organizationId, t.locationId, t.registerId],
      foreignColumns: [businessCashRegisters.organizationId, businessCashRegisters.locationId, businessCashRegisters.id],
    }),
    foreignKey({
      name: "cash_movement_audit_opening_fk",
      columns: [t.organizationId, t.locationId, t.openingId],
      foreignColumns: [businessCashOpenings.organizationId, businessCashOpenings.locationId, businessCashOpenings.id],
    }),
    foreignKey({
      name: "cash_movement_audit_movement_fk",
      columns: [t.organizationId, t.locationId, t.movementId],
      foreignColumns: [businessCashMovements.organizationId, businessCashMovements.locationId, businessCashMovements.id],
    }),
    foreignKey({
      name: "cash_movement_audit_actor_fk",
      columns: [t.organizationId, t.locationId, t.actorId],
      foreignColumns: [businessMemberships.organizationId, businessMemberships.locationId, businessMemberships.userId],
    }),
  ],
);

export const businessCashClosings = mysqlTable(
  "business_cash_closings",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    registerId: int("registerId").notNull(),
    openingId: int("openingId").notNull(),
    closedById: int("closedById").notNull(),
    closedBy: varchar("closedBy", { length: 120 }).notNull(),
    closedAt: timestamp("closedAt", { fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
    openingSnapshot: text("openingSnapshot").notNull(),
    summarySnapshot: text("summarySnapshot").notNull(),
    totalsSnapshot: text("totalsSnapshot").notNull(),
    varianceReason: varchar("varianceReason", { length: 500 }).notNull(),
    status: mysqlEnum("status", ["fechado", "diferenca-pendente"]).notNull(),
    lastMovementId: int("lastMovementId"),
    movementCount: bigint("movementCount", { mode: "bigint" }).notNull(),
    revision: int("revision").notNull(),
    intentId: varchar("intentId", { length: 36 }).notNull(),
    payloadDigest: varchar("payloadDigest", { length: 64 }).notNull(),
  },
  (t) => [
    uniqueIndex("cash_closing_scope_id_uq").on(
      t.organizationId,
      t.locationId,
      t.id,
    ),
    uniqueIndex("cash_closing_opening_uq").on(
      t.organizationId,
      t.locationId,
      t.openingId,
    ),
    uniqueIndex("cash_closing_intent_scope_uq").on(
      t.organizationId,
      t.locationId,
      t.intentId,
    ),
    index("cash_closing_scope_time_idx").on(
      t.organizationId,
      t.locationId,
      t.id,
    ),
    foreignKey({
      name: "cash_closing_register_fk",
      columns: [t.organizationId, t.locationId, t.registerId],
      foreignColumns: [
        businessCashRegisters.organizationId,
        businessCashRegisters.locationId,
        businessCashRegisters.id,
      ],
    }),
    foreignKey({
      name: "cash_closing_opening_fk",
      columns: [t.organizationId, t.locationId, t.openingId],
      foreignColumns: [
        businessCashOpenings.organizationId,
        businessCashOpenings.locationId,
        businessCashOpenings.id,
      ],
    }),
    foreignKey({
      name: "cash_closing_actor_membership_fk",
      columns: [t.organizationId, t.locationId, t.closedById],
      foreignColumns: [
        businessMemberships.organizationId,
        businessMemberships.locationId,
        businessMemberships.userId,
      ],
    }),
    foreignKey({
      name: "cash_closing_last_movement_fk",
      columns: [t.organizationId, t.locationId, t.lastMovementId],
      foreignColumns: [
        businessCashMovements.organizationId,
        businessCashMovements.locationId,
        businessCashMovements.id,
      ],
    }),
  ],
);

export const businessCashClosingAudits = mysqlTable(
  "business_cash_closing_audits",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    locationId: int("locationId").notNull(),
    registerId: int("registerId").notNull(),
    openingId: int("openingId").notNull(),
    closingId: int("closingId").notNull(),
    actorId: int("actorId").notNull(),
    event: varchar("event", { length: 80 }).notNull(),
    revision: int("revision").notNull(),
    payloadDigest: varchar("payloadDigest", { length: 64 }).notNull(),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt", { fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  (t) => [
    uniqueIndex("cash_closing_audit_event_uq").on(
      t.organizationId,
      t.locationId,
      t.closingId,
      t.event,
    ),
    index("cash_closing_audit_scope_time_idx").on(
      t.organizationId,
      t.locationId,
      t.createdAt,
    ),
    foreignKey({
      name: "cash_closing_audit_location_fk",
      columns: [t.organizationId, t.locationId],
      foreignColumns: [businessLocations.organizationId, businessLocations.id],
    }),
    foreignKey({
      name: "cash_closing_audit_register_fk",
      columns: [t.organizationId, t.locationId, t.registerId],
      foreignColumns: [
        businessCashRegisters.organizationId,
        businessCashRegisters.locationId,
        businessCashRegisters.id,
      ],
    }),
    foreignKey({
      name: "cash_closing_audit_opening_fk",
      columns: [t.organizationId, t.locationId, t.openingId],
      foreignColumns: [
        businessCashOpenings.organizationId,
        businessCashOpenings.locationId,
        businessCashOpenings.id,
      ],
    }),
    foreignKey({
      name: "cash_closing_audit_closure_fk",
      columns: [t.organizationId, t.locationId, t.closingId],
      foreignColumns: [
        businessCashClosings.organizationId,
        businessCashClosings.locationId,
        businessCashClosings.id,
      ],
    }),
    foreignKey({
      name: "cash_closing_audit_actor_membership_fk",
      columns: [t.organizationId, t.locationId, t.actorId],
      foreignColumns: [
        businessMemberships.organizationId,
        businessMemberships.locationId,
        businessMemberships.userId,
      ],
    }),
  ],
);
