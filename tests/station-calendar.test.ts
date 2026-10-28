import { describe, expect, it } from "vitest";
import {
  getCalendarMonth,
  getScheduleForDate,
  getScheduledShift,
  getStationNow,
  getYearHolidays,
  STATION_CALENDAR_META,
} from "../lib/station-calendar";

describe("calendário de turnos de Bauru", () => {
  it("expõe metadados da fonte e as 13 datas oficiais de 2026 em ordem", () => {
    expect(STATION_CALENDAR_META).toEqual({
      city: "Bauru",
      state: "SP",
      timeZone: "America/Sao_Paulo",
      verifiedOn: "2026-10-28",
      sourceUrl: "https://www2.bauru.sp.gov.br/feriados.aspx",
      minYear: 2026,
      maxYear: 2100,
    });

    const holidays = getYearHolidays(2026);
    expect(holidays.map((holiday) => holiday.date)).toEqual([
      "2026-01-01",
      "2026-04-03",
      "2026-04-21",
      "2026-05-01",
      "2026-06-04",
      "2026-07-09",
      "2026-08-01",
      "2026-09-07",
      "2026-10-12",
      "2026-11-02",
      "2026-11-15",
      "2026-11-20",
      "2026-12-25",
    ]);
    expect(holidays.map((holiday) => holiday.date)).toHaveLength(13);
    expect(
      holidays.find((holiday) => holiday.date === "2026-04-03"),
    ).toMatchObject({
      name: "Paixão de Cristo",
      scope: "nacional",
      note: expect.stringContaining("tabela da Prefeitura"),
    });
    expect(
      holidays.find((holiday) => holiday.date === "2026-06-04"),
    ).toMatchObject({
      name: "Corpus Christi",
      scope: "municipal",
    });
    expect(
      holidays.find((holiday) => holiday.date === "2026-07-09"),
    ).toMatchObject({
      scope: "estadual",
    });
    expect(
      holidays.find((holiday) => holiday.date === "2026-08-01"),
    ).toMatchObject({
      scope: "municipal",
    });
  });

  it("calcula Paixão de Cristo e Corpus Christi em ano futuro", () => {
    const holidays = getYearHolidays(2027);
    expect(holidays.map((holiday) => holiday.date)).toContain("2027-03-26");
    expect(holidays.map((holiday) => holiday.date)).toContain("2027-05-27");
    expect(
      holidays.filter((holiday) =>
        ["2027-03-26", "2027-05-27"].includes(holiday.date),
      ),
    ).toMatchObject([
      { date: "2027-03-26", name: "Paixão de Cristo" },
      { date: "2027-05-27", name: "Corpus Christi" },
    ]);
  });

  it("classifica domingo, sábado normal, sábado feriado e feriado no domingo", () => {
    expect(getScheduleForDate("2026-01-04")).toMatchObject({
      weekday: 0,
      kind: "domingo",
      holidays: [],
      shifts: [
        { id: "turno-1", start: "07:00", end: "13:00" },
        { id: "turno-2", start: "13:00", end: "19:00" },
      ],
    });
    expect(getScheduleForDate("2026-01-03")).toMatchObject({
      weekday: 6,
      kind: "normal",
      holidays: [],
      shifts: [
        { id: "turno-1", start: "06:00", end: "14:00" },
        { id: "turno-2", start: "14:00", end: "22:00" },
      ],
    });
    expect(getScheduleForDate("2026-08-01")).toMatchObject({
      weekday: 6,
      kind: "feriado",
      holidays: [{ date: "2026-08-01", scope: "municipal" }],
      shifts: [
        { id: "turno-1", start: "07:00", end: "13:00" },
        { id: "turno-2", start: "13:00", end: "19:00" },
      ],
    });
    expect(getScheduleForDate("2026-11-15")).toMatchObject({
      weekday: 0,
      kind: "feriado",
      holidays: [{ date: "2026-11-15" }],
    });
  });

  it("aplica início inclusivo e fim exclusivo nas duas escalas", () => {
    const normal = "2026-10-26";
    expect(getScheduledShift(normal, "05:59")).toBeNull();
    expect(getScheduledShift(normal, "06:00")).toMatchObject({ id: "turno-1" });
    expect(getScheduledShift(normal, "13:59")).toMatchObject({ id: "turno-1" });
    expect(getScheduledShift(normal, "14:00")).toMatchObject({ id: "turno-2" });
    expect(getScheduledShift(normal, "21:59")).toMatchObject({ id: "turno-2" });
    expect(getScheduledShift(normal, "22:00")).toBeNull();

    const reduced = "2026-10-25";
    expect(getScheduledShift(reduced, "06:59")).toBeNull();
    expect(getScheduledShift(reduced, "07:00")).toMatchObject({
      id: "turno-1",
    });
    expect(getScheduledShift(reduced, "12:59")).toMatchObject({
      id: "turno-1",
    });
    expect(getScheduledShift(reduced, "13:00")).toMatchObject({
      id: "turno-2",
    });
    expect(getScheduledShift(reduced, "18:59")).toMatchObject({
      id: "turno-2",
    });
    expect(getScheduledShift(reduced, "19:00")).toBeNull();
  });

  it("rejeita datas, meses, horários e anos inválidos, preservando bissextos reais", () => {
    expect(getScheduleForDate("2028-02-29").date).toBe("2028-02-29");
    for (const date of [
      "2026-02-29",
      "2100-02-29",
      "2026-04-31",
      "2026-1-01",
      "2026-01-01T00:00:00.000Z",
    ]) {
      expect(() => getScheduleForDate(date)).toThrow();
    }
    for (const year of [2025, 2101, 2026.5, Number.NaN]) {
      expect(() => getYearHolidays(year)).toThrow();
    }
    for (const month of ["2025-12", "2026-00", "2026-13", "2026-2"]) {
      expect(() => getCalendarMonth(month)).toThrow();
    }
    for (const time of ["5:59", "24:00", "12:60", "12:00:00", "ab:cd"]) {
      expect(() => getScheduledShift("2026-10-26", time)).toThrow();
    }
    expect(() => getStationNow(new Date("invalid"))).toThrow();
  });

  it("calcula o instante no fuso de São Paulo mesmo com mudança de dia UTC", () => {
    expect(getStationNow(new Date("2026-01-02T02:30:00.000Z"))).toEqual({
      date: "2026-01-01",
      time: "23:30",
    });
    expect(getStationNow(new Date("2026-01-01T03:00:00.000Z"))).toEqual({
      date: "2026-01-01",
      time: "00:00",
    });
  });

  it("monta grades mensais completas sem perder ou duplicar dias", () => {
    const december = getCalendarMonth("2026-12");
    expect(december.title).toBe("dezembro de 2026");
    expect(december.cells).toHaveLength(35);
    expect(december.cells.slice(0, 2)).toEqual([null, null]);
    expect(december.cells.slice(-2)).toEqual([null, null]);
    const dates = december.cells
      .filter((cell): cell is NonNullable<typeof cell> => cell !== null)
      .map((cell) => cell.date);
    expect(dates).toEqual(
      Array.from(
        { length: 31 },
        (_, index) => `2026-12-${String(index + 1).padStart(2, "0")}`,
      ),
    );
    expect(new Set(dates).size).toBe(31);

    const leapFebruary = getCalendarMonth("2028-02");
    expect(leapFebruary.cells).toHaveLength(35);
    expect(leapFebruary.cells.filter((cell) => cell !== null)).toHaveLength(29);
    expect(
      leapFebruary.cells.find((cell) => cell?.date === "2028-02-29"),
    ).toBeDefined();
  });

  it("não compartilha referências mutáveis entre chamadas", () => {
    const firstHolidays = getYearHolidays(2026);
    firstHolidays[0]!.name = "alterado";
    firstHolidays[0]!.note = "nota alterada";
    expect(getYearHolidays(2026)[0]).not.toMatchObject({
      name: "alterado",
      note: "nota alterada",
    });

    const firstSchedule = getScheduleForDate("2026-08-01");
    firstSchedule.holidays[0]!.name = "alterado";
    firstSchedule.shifts[0]!.start = "00:00";
    const secondSchedule = getScheduleForDate("2026-08-01");
    expect(secondSchedule.holidays[0]).toMatchObject({
      name: "Aniversário de Bauru",
    });
    expect(secondSchedule.shifts[0]).toMatchObject({ start: "07:00" });

    const firstMonth = getCalendarMonth("2026-12");
    const firstRealCell = firstMonth.cells.find((cell) => cell !== null);
    if (!firstRealCell) throw new Error("grade sem dia real");
    firstRealCell.shifts[0]!.label = "alterado";
    expect(getCalendarMonth("2026-12").cells[2]?.shifts[0]?.label).toBe(
      "Turno 1",
    );

    const returnedShift = getScheduledShift("2026-08-01", "07:00");
    if (!returnedShift) throw new Error("turno esperado ausente");
    returnedShift.label = "alterado";
    expect(getScheduledShift("2026-08-01", "07:00")?.label).toBe("Turno 1");
  });
});
