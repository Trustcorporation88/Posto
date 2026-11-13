import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../drizzle/0007_cash_closing.sql", import.meta.url),
  "utf8",
);
const previous = JSON.parse(
  readFileSync(
    new URL("../drizzle/meta/0006_snapshot.json", import.meta.url),
    "utf8",
  ),
) as { tables: Record<string, unknown> };
const snapshot = JSON.parse(
  readFileSync(
    new URL("../drizzle/meta/0007_snapshot.json", import.meta.url),
    "utf8",
  ),
) as {
  tables: Record<
    string,
    {
      columns: Record<string, { default: string | null }>;
      indexes: Record<string, unknown>;
      foreignKeys: Record<string, unknown>;
    }
  >;
};

describe("migration aditiva 0007 de fechamento", () => {
  it("cria somente as duas tabelas novas sem seeds ou mutação de dados", () => {
    expect(migration.match(/CREATE TABLE `/g)).toHaveLength(2);
    expect(migration).toContain("CREATE TABLE `business_cash_closings`");
    expect(migration).toContain("CREATE TABLE `business_cash_closing_audits`");
    expect(migration).not.toMatch(
      /\b(DROP|TRUNCATE|DELETE|INSERT|UPDATE)\b(?!\s+no action)/i,
    );
    expect(migration).not.toContain("CREATE TABLE `business_cash_movements`");
    expect(migration).not.toContain("CREATE TABLE `business_cash_openings`");
    expect(migration).not.toContain("ALTER TABLE `business_cash_movements`");
    expect(migration).not.toContain("ALTER TABLE `business_cash_openings`");
  });

  it("preserva sem diferenças todas as tabelas do snapshot 0006", () => {
    for (const [table, schema] of Object.entries(previous.tables)) {
      expect(snapshot.tables[table], `tabela preservada: ${table}`).toEqual(
        schema,
      );
    }
  });

  it("mantém defaults exatos CURRENT_TIMESTAMP(3) e unicidade por unidade/abertura/intenção", () => {
    expect(migration).toContain(
      "`closedAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    );
    expect(migration).toContain(
      "`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    );
    expect(
      snapshot.tables.business_cash_closings.columns.closedAt.default,
    ).toBe("CURRENT_TIMESTAMP(3)");
    expect(
      snapshot.tables.business_cash_closing_audits.columns.createdAt.default,
    ).toBe("CURRENT_TIMESTAMP(3)");
    expect(snapshot.tables.business_cash_closings.indexes).toHaveProperty(
      "cash_closing_opening_uq",
    );
    expect(snapshot.tables.business_cash_closings.indexes).toHaveProperty(
      "cash_closing_intent_scope_uq",
    );
  });

  it("usa FKs compostas tenant-scoped e congela apenas corte/contagem, sem array de ledger", () => {
    expect(snapshot.tables.business_cash_closings.foreignKeys).toHaveProperty(
      "cash_closing_actor_membership_fk",
    );
    expect(snapshot.tables.business_cash_closings.foreignKeys).toHaveProperty(
      "cash_closing_last_movement_fk",
    );
    expect(
      snapshot.tables.business_cash_closing_audits.foreignKeys,
    ).toHaveProperty("cash_closing_audit_closure_fk");
    expect(migration).toContain("`lastMovementId` int");
    expect(migration).toContain("`movementCount` bigint NOT NULL");
    expect(migration).not.toContain("`movements` json");
    expect(migration).not.toContain("`movements` text");
  });
});
