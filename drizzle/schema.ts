import {
  boolean,
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
