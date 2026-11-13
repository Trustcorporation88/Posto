import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../drizzle/0005_cash_opening.sql", import.meta.url),
  "utf8",
);
const snapshot = JSON.parse(
  readFileSync(
    new URL("../drizzle/meta/0005_snapshot.json", import.meta.url),
    "utf8",
  ),
);

describe("migração aditiva do caixa", () => {
  it("mantém default e precisão do timestamp compatíveis entre SQL e snapshot", () => {
    expect(migration).toContain(
      "`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    );
    expect(migration).not.toMatch(/timestamp\(3\).*DEFAULT \(now\(\)\)/i);
    expect(
      snapshot.tables.business_cash_registers.columns.createdAt.default,
    ).toBe("CURRENT_TIMESTAMP(3)");
  });

  it("não contém seeds ou alterações destrutivas de dados existentes", () => {
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|DELETE|INSERT|UPDATE)\b(?!\s+no action)/i);
    expect(migration).toContain("cash_opening_active_slot_uq");
    expect(migration).toContain("cash_opening_operator_membership_fk");
  });
});
