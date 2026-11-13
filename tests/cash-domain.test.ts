import { describe, expect, it } from "vitest";
import {
  canOpenCash,
  canReadCash,
  cashClockAt,
  cashOpenPayloadCanonical,
  getCashShiftForDate,
  validateCashOpenInput,
  type CashOpenInput,
} from "../lib/business/cash-domain";

const validInput: CashOpenInput = {
  intentId: "123e4567-e89b-42d3-a456-426614174000",
  expectedRevision: 0,
  operationDate: "2026-01-01",
  shiftId: "turno-1",
  openingFloat: 0,
};

describe("domínio da abertura central de caixa", () => {
  it("permite leitura apenas aos papéis de caixa e consulta financeira", () => {
    expect(canReadCash("owner")).toBe(true);
    expect(canReadCash("manager")).toBe(true);
    expect(canReadCash("cashier")).toBe(true);
    expect(canReadCash("finance_viewer")).toBe(true);
    expect(canReadCash("attendant")).toBe(false);
    expect(canReadCash("oil_technician")).toBe(false);
    expect(canReadCash("admin")).toBe(false);
  });

  it("permite abertura somente ao proprietário, gerente e caixa", () => {
    expect(canOpenCash("owner")).toBe(true);
    expect(canOpenCash("manager")).toBe(true);
    expect(canOpenCash("cashier")).toBe(true);
    expect(canOpenCash("finance_viewer")).toBe(false);
    expect(canOpenCash("attendant")).toBe(false);
    expect(canOpenCash("oil_technician")).toBe(false);
  });

  it("deriva instante, data e turno em Bauru com milissegundos no serverNow", () => {
    expect(cashClockAt(new Date("2026-11-13T09:00:00.123Z"))).toEqual({
      serverNow: "2026-11-13T09:00:00.123Z",
      operationDate: "2026-11-13",
      scheduledShift: {
        id: "turno-1",
        label: "Turno 1",
        start: "06:00",
        end: "14:00",
      },
    });
    expect(cashClockAt(new Date("2026-11-13T17:00:00.987Z"))).toMatchObject({
      operationDate: "2026-11-13",
      scheduledShift: { id: "turno-2", start: "14:00", end: "22:00" },
    });
  });

  it("aplica a escala reduzida em feriados oficiais mesmo em dia de semana", () => {
    expect(cashClockAt(new Date("2026-01-01T10:00:00.000Z"))).toMatchObject({
      operationDate: "2026-01-01",
      scheduledShift: { id: "turno-1", start: "07:00", end: "13:00" },
    });
    expect(cashClockAt(new Date("2026-01-01T16:00:00.000Z"))).toMatchObject({
      scheduledShift: { id: "turno-2", start: "13:00", end: "19:00" },
    });
    expect(cashClockAt(new Date("2026-01-01T22:00:00.000Z")).scheduledShift).toBeNull();
    expect(cashClockAt(new Date("2026-04-03T10:00:00.000Z")).scheduledShift).toMatchObject({
      id: "turno-1",
      start: "07:00",
    });
  });

  it("respeita domingo e as fronteiras inclusiva/exclusiva em America/Sao_Paulo", () => {
    expect(cashClockAt(new Date("2026-11-15T10:00:00.000Z")).scheduledShift).toMatchObject({
      id: "turno-1",
      start: "07:00",
      end: "13:00",
    });
    expect(cashClockAt(new Date("2026-11-13T09:00:00.000Z")).scheduledShift?.id).toBe("turno-1");
    expect(cashClockAt(new Date("2026-11-13T17:00:00.000Z")).scheduledShift?.id).toBe("turno-2");
    expect(cashClockAt(new Date("2026-11-13T01:00:00.000Z"))).toMatchObject({
      operationDate: "2026-11-12",
      scheduledShift: null,
    });
    expect(cashClockAt(new Date("2026-11-13T01:00:00.000Z")).serverNow).toBe(
      "2026-11-13T01:00:00.000Z",
    );
  });

  it("aceita fundo explicitamente zero e preserva snapshot de turno aprovado", () => {
    expect(validateCashOpenInput(validInput)).toEqual(validInput);
    expect(getCashShiftForDate("2026-01-01", "turno-1")).toEqual({
      id: "turno-1",
      label: "Turno 1",
      start: "07:00",
      end: "13:00",
    });
  });

  it("rejeita fundo negativo, decimal, overflow e revisão insegura", () => {
    expect(() => validateCashOpenInput({ ...validInput, openingFloat: -1 })).toThrow(
      /centavos/,
    );
    expect(() => validateCashOpenInput({ ...validInput, openingFloat: 1.5 })).toThrow(
      /centavos/,
    );
    expect(() =>
      validateCashOpenInput({ ...validInput, openingFloat: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow(/centavos/);
    expect(() =>
      validateCashOpenInput({ ...validInput, expectedRevision: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow(/revisão/);
    expect(() => validateCashOpenInput({ ...validInput, expectedRevision: -1 })).toThrow(
      /revisão/,
    );
  });

  it("rejeita UUID, data civil, ano e turno inválidos", () => {
    expect(() => validateCashOpenInput({ ...validInput, intentId: "not-a-uuid" })).toThrow(
      /UUID/,
    );
    expect(() =>
      validateCashOpenInput({ ...validInput, operationDate: "2026-02-30" }),
    ).toThrow(/data operacional/i);
    expect(() =>
      validateCashOpenInput({ ...validInput, operationDate: "2025-12-31" }),
    ).toThrow(/calendário suportado/i);
    expect(() =>
      validateCashOpenInput({ ...validInput, shiftId: "fora" as CashOpenInput["shiftId"] }),
    ).toThrow(/turno/i);
  });

  it("normaliza UUID para evitar duplicidade por caixa de letras e fixa digest canônico", () => {
    const upper = { ...validInput, intentId: validInput.intentId.toUpperCase() };
    expect(validateCashOpenInput(upper).intentId).toBe(validInput.intentId);
    expect(cashOpenPayloadCanonical(5, validInput)).toBe(
      cashOpenPayloadCanonical(5, upper),
    );
    expect(cashOpenPayloadCanonical(5, validInput)).not.toBe(
      cashOpenPayloadCanonical(6, validInput),
    );
    expect(
      cashOpenPayloadCanonical(5, validInput),
    ).toContain('"openingFloat":0');
  });
});
