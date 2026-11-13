import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CASH_WRITE_TRANSACTION_CONFIG } from "../server/modules/cash-transactions";

describe("isolamento das transações escritoras do caixa", () => {
  it("usa READ COMMITTED imutável somente como configuração da próxima transação", () => {
    expect(CASH_WRITE_TRANSACTION_CONFIG).toEqual({
      isolationLevel: "read committed",
    });
    expect(Object.isFrozen(CASH_WRITE_TRANSACTION_CONFIG)).toBe(true);
  });

  it.each([
    "cash-service.ts",
    "cash-movement-service.ts",
    "cash-closing-service.ts",
  ])("o escritor %s aplica a configuração compartilhada", (filename) => {
    const source = readFileSync(
      new URL(`../server/modules/${filename}`, import.meta.url),
      "utf8",
    );
    const transactionStart = Math.max(
      source.lastIndexOf("transaction<T>"),
      source.lastIndexOf("transaction(operation)"),
    );
    expect(transactionStart).toBeGreaterThan(0);
    const writer = source.slice(transactionStart);
    expect(writer).toContain("CASH_WRITE_TRANSACTION_CONFIG");
    expect(source).not.toMatch(/SET\s+(GLOBAL|SESSION)\s/iu);
    expect(source.split("CASH_WRITE_TRANSACTION_CONFIG")).toHaveLength(3);
  });
});
