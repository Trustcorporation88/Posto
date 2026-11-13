import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../drizzle/0006_silly_selene.sql", import.meta.url),
  "utf8",
);
const previous = JSON.parse(
  readFileSync(
    new URL("../drizzle/meta/0005_snapshot.json", import.meta.url),
    "utf8",
  ),
);
const current = JSON.parse(
  readFileSync(
    new URL("../drizzle/meta/0006_snapshot.json", import.meta.url),
    "utf8",
  ),
);

describe("migração aditiva de movimentos centrais", () => {
  it("preserva todas as tabelas e colunas do snapshot anterior", () => {
    for (const [table, definition] of Object.entries(previous.tables)) {
      expect(current.tables[table]).toEqual(definition);
    }
    expect(
      Object.keys(current.tables)
        .filter((name) => !(name in previous.tables))
        .sort(),
    ).toEqual(["business_cash_movement_audits", "business_cash_movements"]);
  });

  it("não contém DML comercial, seeds ou comandos destrutivos", () => {
    expect(migration).not.toMatch(
      /\b(DROP|TRUNCATE|DELETE|INSERT|UPDATE)\b(?!\s+no action)/i,
    );
    expect(migration).toContain("DEFAULT CURRENT_TIMESTAMP(3)");
    expect(migration).not.toMatch(/timestamp\(3\).*DEFAULT \(now\(\)\)/i);
  });

  it("mantém unicidade de referência e vínculos tenant/unidade/abertura/autor", () => {
    expect(migration).toContain(
      "UNIQUE(`organizationId`,`locationId`,`openingId`,`paymentMethod`,`referenceDigest`)",
    );
    expect(migration).toContain("cash_movement_intent_scope_uq");
    expect(migration).toContain("cash_movement_opening_fk");
    expect(migration).toContain("cash_movement_author_membership_fk");
    expect(migration).toContain("cash_movement_audit_movement_fk");
  });
});
