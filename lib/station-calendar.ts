export const STATION_CALENDAR_META = {
  city: "Bauru",
  state: "SP",
  timeZone: "America/Sao_Paulo",
  verifiedOn: "2026-10-28",
  sourceUrl: "https://www2.bauru.sp.gov.br/feriados.aspx",
  minYear: 2026,
  maxYear: 2100,
} as const;

export type StationHoliday = {
  date: string;
  name: string;
  scope: "nacional" | "estadual" | "municipal";
  note?: string;
};

export type StationShift = {
  id: "turno-1" | "turno-2";
  label: string;
  start: string;
  end: string;
};

export type StationDaySchedule = {
  date: string;
  weekday: number;
  kind: "normal" | "domingo" | "feriado";
  holidays: StationHoliday[];
  shifts: StationShift[];
};

type CivilDate = {
  year: number;
  month: number;
  day: number;
};

const WEEKDAY_COUNT = 7;
const MONTH_NAMES_PT_BR = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

const NATIONAL_GOOD_FRIDAY_NOTE =
  "Classificação como nacional conforme a tabela da Prefeitura de Bauru consultada em 2026; isso não constitui conclusão sobre fundamento legal federal.";

const NORMAL_SHIFTS: readonly StationShift[] = [
  { id: "turno-1", label: "Turno 1", start: "06:00", end: "14:00" },
  { id: "turno-2", label: "Turno 2", start: "14:00", end: "22:00" },
];

const REDUCED_SHIFTS: readonly StationShift[] = [
  { id: "turno-1", label: "Turno 1", start: "07:00", end: "13:00" },
  { id: "turno-2", label: "Turno 2", start: "13:00", end: "19:00" },
];

function assertSupportedYear(year: number): void {
  if (
    !Number.isInteger(year) ||
    year < STATION_CALENDAR_META.minYear ||
    year > STATION_CALENDAR_META.maxYear
  ) {
    throw new Error(
      `Ano fora do intervalo suportado (${STATION_CALENDAR_META.minYear}-${STATION_CALENDAR_META.maxYear}).`,
    );
  }
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseStrictDate(date: string): CivilDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Data deve estar no formato ISO estrito AAAA-MM-DD.");
  }

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  assertSupportedYear(year);

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Data civil inválida: ${date}.`);
  }

  return { year, month, day };
}

function parseStrictMonth(month: string): { year: number; month: number } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Mês deve estar no formato ISO estrito AAAA-MM.");
  }

  const year = Number(month.slice(0, 4));
  assertSupportedYear(year);
  return { year, month: Number(month.slice(5, 7)) };
}

function civilToUtcDate({ year, month, day }: CivilDate): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function dateToIso(date: Date): string {
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

function addCivilDays(date: CivilDate, days: number): CivilDate {
  const result = civilToUtcDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return {
    year: result.getUTCFullYear(),
    month: result.getUTCMonth() + 1,
    day: result.getUTCDate(),
  };
}

function easterSunday(year: number): CivilDate {
  // Meeus/Jones/Butcher Gregorian computus. All operations stay in civil-date
  // space; UTC is used only as a neutral arithmetic calendar below.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function cloneHoliday(holiday: StationHoliday): StationHoliday {
  return { ...holiday };
}

function cloneShift(shift: StationShift): StationShift {
  return { ...shift };
}

function makeHoliday(
  date: CivilDate,
  name: string,
  scope: StationHoliday["scope"],
  note?: string,
): StationHoliday {
  const holiday: StationHoliday = {
    date: dateToIso(civilToUtcDate(date)),
    name,
    scope,
  };
  if (note !== undefined) holiday.note = note;
  return holiday;
}

function holidayTemplates(year: number): StationHoliday[] {
  const easter = easterSunday(year);
  return [
    makeHoliday(
      { year, month: 1, day: 1 },
      "Confraternização Universal",
      "nacional",
    ),
    makeHoliday(
      addCivilDays(easter, -2),
      "Paixão de Cristo",
      "nacional",
      NATIONAL_GOOD_FRIDAY_NOTE,
    ),
    makeHoliday({ year, month: 4, day: 21 }, "Tiradentes", "nacional"),
    makeHoliday({ year, month: 5, day: 1 }, "Dia do Trabalho", "nacional"),
    makeHoliday(addCivilDays(easter, 60), "Corpus Christi", "municipal"),
    makeHoliday(
      { year, month: 7, day: 9 },
      "Revolução Constitucionalista de 1932",
      "estadual",
    ),
    makeHoliday(
      { year, month: 8, day: 1 },
      "Aniversário de Bauru",
      "municipal",
    ),
    makeHoliday(
      { year, month: 9, day: 7 },
      "Independência do Brasil",
      "nacional",
    ),
    makeHoliday(
      { year, month: 10, day: 12 },
      "Nossa Senhora Aparecida",
      "nacional",
    ),
    makeHoliday({ year, month: 11, day: 2 }, "Finados", "nacional"),
    makeHoliday(
      { year, month: 11, day: 15 },
      "Proclamação da República",
      "nacional",
    ),
    makeHoliday(
      { year, month: 11, day: 20 },
      "Zumbi e Consciência Negra",
      "nacional",
    ),
    makeHoliday({ year, month: 12, day: 25 }, "Natal", "nacional"),
  ].sort((left, right) =>
    left.date === right.date
      ? left.name.localeCompare(right.name, "pt-BR")
      : left.date.localeCompare(right.date),
  );
}

function getShiftsForKind(kind: StationDaySchedule["kind"]): StationShift[] {
  const source = kind === "normal" ? NORMAL_SHIFTS : REDUCED_SHIFTS;
  return source.map(cloneShift);
}

function getStationHolidaysForDate(date: string): StationHoliday[] {
  return getYearHolidays(Number(date.slice(0, 4)))
    .filter((holiday) => holiday.date === date)
    .map(cloneHoliday);
}

export function getYearHolidays(year: number): StationHoliday[] {
  assertSupportedYear(year);
  return holidayTemplates(year).map(cloneHoliday);
}

export function getScheduleForDate(date: string): StationDaySchedule {
  const civilDate = parseStrictDate(date);
  const weekday = civilToUtcDate(civilDate).getUTCDay();
  const holidays = getStationHolidaysForDate(date);
  const kind: StationDaySchedule["kind"] =
    holidays.length > 0 ? "feriado" : weekday === 0 ? "domingo" : "normal";

  return {
    date,
    weekday,
    kind,
    holidays,
    shifts: getShiftsForKind(kind),
  };
}

function parseStrictTime(time: string): void {
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("Horário deve estar no formato estrito HH:mm.");
  }
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));
  if (hour > 23 || minute > 59) {
    throw new Error(`Horário inválido: ${time}.`);
  }
}

export function getScheduledShift(
  date: string,
  time: string,
): StationShift | null {
  parseStrictDate(date);
  parseStrictTime(time);
  const shift = getScheduleForDate(date).shifts.find(
    (candidate) => time >= candidate.start && time < candidate.end,
  );
  return shift === undefined ? null : cloneShift(shift);
}

function getDateTimeParts(now: Date): { date: string; time: string } {
  if (Number.isNaN(now.getTime())) {
    throw new Error("Instante inválido.");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STATION_CALENDAR_META.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

export function getStationNow(now: Date = new Date()): {
  date: string;
  time: string;
} {
  return getDateTimeParts(now);
}

export function getCalendarMonth(month: string): {
  title: string;
  cells: (StationDaySchedule | null)[];
} {
  const parsed = parseStrictMonth(month);
  const firstDate = { year: parsed.year, month: parsed.month, day: 1 };
  const firstWeekday = civilToUtcDate(firstDate).getUTCDay();
  const dayCount = daysInMonth(parsed.year, parsed.month);
  const cellCount =
    Math.ceil((firstWeekday + dayCount) / WEEKDAY_COUNT) * WEEKDAY_COUNT;
  const cells: (StationDaySchedule | null)[] = [];

  for (let index = 0; index < cellCount; index += 1) {
    const day = index - firstWeekday + 1;
    cells.push(
      day < 1 || day > dayCount
        ? null
        : getScheduleForDate(
            `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          ),
    );
  }

  return {
    title: `${MONTH_NAMES_PT_BR[parsed.month - 1]} de ${parsed.year}`,
    cells,
  };
}
