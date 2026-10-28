import {
  getScheduleForDate,
  getScheduledShift,
  getStationNow,
  STATION_CALENDAR_META,
} from "./station-calendar";
import type { StationDaySchedule, StationShift } from "./station-calendar";

export type ShiftOpening = {
  id: string;
  status: "aberto";
  registerId: "caixa-principal";
  operator: string;
  openingFloat: number;
  operationDate: string;
  shift: StationShift;
  scheduleKind: StationDaySchedule["kind"];
  holidayNames: string[];
  calendarVerifiedOn: string;
  timeZone: "America/Sao_Paulo";
  openedAt: string;
};

export type ShiftOpeningData = {
  version: 1;
  revision: number;
  opening: ShiftOpening | null;
};

export type ShiftOpeningReview = {
  operator: string;
  openingFloat: number;
  operationDate: string;
  shift: StationShift;
  expectedRevision: number;
};

const OPENING_KEYS = [
  "id",
  "status",
  "registerId",
  "operator",
  "openingFloat",
  "operationDate",
  "shift",
  "scheduleKind",
  "holidayNames",
  "calendarVerifiedOn",
  "timeZone",
  "openedAt",
] as const;

const SHIFT_KEYS = ["id", "label", "start", "end"] as const;
const DATA_KEYS = ["version", "revision", "opening"] as const;
const REVIEW_KEYS = [
  "operator",
  "openingFloat",
  "operationDate",
  "shift",
  "expectedRevision",
] as const;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const EXACT_ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_ID_LENGTH = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} contém campos inesperados ou ausentes.`);
  }
}

function cloneShift(shift: StationShift): StationShift {
  return { ...shift };
}

function cloneOpening(opening: ShiftOpening): ShiftOpening {
  return {
    ...opening,
    shift: cloneShift(opening.shift),
    holidayNames: [...opening.holidayNames],
  };
}

function cloneData(data: ShiftOpeningData): ShiftOpeningData {
  return {
    version: 1,
    revision: data.revision,
    opening: data.opening === null ? null : cloneOpening(data.opening),
  };
}

function cloneReview(review: ShiftOpeningReview): ShiftOpeningReview {
  return { ...review, shift: cloneShift(review.shift) };
}

function assertFiniteDate(now: Date, label = "Instante"): void {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error(`${label} inválido.`);
  }
}

function normalizeOperator(operator: unknown): string {
  if (typeof operator !== "string") {
    throw new Error("Operador deve ser um texto.");
  }
  if (CONTROL_CHARACTERS.test(operator)) {
    throw new Error("Operador não pode conter caracteres de controle.");
  }
  const normalized = operator.trim();
  if (normalized.length < 2 || normalized.length > 80) {
    throw new Error("Operador deve ter de 2 a 80 caracteres.");
  }
  return normalized;
}

function normalizeOpeningFloat(openingFloat: unknown): number {
  if (!Number.isSafeInteger(openingFloat) || (openingFloat as number) < 0) {
    throw new Error(
      "Fundo de troco deve ser um inteiro seguro em centavos não negativo.",
    );
  }
  return openingFloat === 0 ? 0 : (openingFloat as number);
}

function normalizeRevision(revision: unknown): number {
  if (!Number.isSafeInteger(revision) || (revision as number) < 0) {
    throw new Error("Revisão deve ser um inteiro seguro não negativo.");
  }
  return revision as number;
}

function normalizeId(id: unknown): string {
  if (typeof id !== "string") {
    throw new Error("Identificador da abertura deve ser um texto.");
  }
  if (
    id.trim().length === 0 ||
    id.length > MAX_ID_LENGTH ||
    CONTROL_CHARACTERS.test(id)
  ) {
    throw new Error(
      "Identificador da abertura vazio, inválido ou grande demais.",
    );
  }
  return id;
}

function parseExactIsoInstant(openedAt: unknown): Date {
  if (typeof openedAt !== "string" || !EXACT_ISO_INSTANT.test(openedAt)) {
    throw new Error("openedAt deve ser um instante ISO UTC exato.");
  }
  const parsed = new Date(openedAt);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== openedAt) {
    throw new Error("openedAt deve ser um instante ISO UTC finito e exato.");
  }
  return parsed;
}

function assertStrictDate(date: unknown): asserts date is string {
  if (typeof date !== "string") {
    throw new Error("Data operacional deve ser um texto.");
  }
  try {
    getScheduleForDate(date);
  } catch (error) {
    throw new Error(
      `Data operacional inválida: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} inválido.`);
  }
}

function assertShiftShape(
  value: unknown,
  label: string,
): asserts value is StationShift {
  if (!isRecord(value)) {
    throw new Error(`${label} inválido.`);
  }
  assertExactKeys(value, SHIFT_KEYS, label);
  if (value.id !== "turno-1" && value.id !== "turno-2") {
    throw new Error(`${label}.id inválido.`);
  }
  assertString(value.label, `${label}.label`);
  assertString(value.start, `${label}.start`);
  assertString(value.end, `${label}.end`);
  if (
    !/^\d{2}:\d{2}$/u.test(value.start) ||
    !/^\d{2}:\d{2}$/u.test(value.end)
  ) {
    throw new Error(`${label} contém horários inválidos.`);
  }
}

function shiftsEqual(left: StationShift, right: StationShift): boolean {
  return (
    left.id === right.id &&
    left.label === right.label &&
    left.start === right.start &&
    left.end === right.end
  );
}

function shiftWindowForDate(
  operationDate: string,
  shift: StationShift,
): { schedule: StationDaySchedule; currentShift: StationShift } {
  const schedule = getScheduleForDate(operationDate);
  const currentShift = schedule.shifts.find(
    (candidate) => candidate.id === shift.id,
  );
  if (currentShift === undefined || !shiftsEqual(currentShift, shift)) {
    throw new Error("Turno incompatível com a escala da data operacional.");
  }
  return { schedule, currentShift: cloneShift(currentShift) };
}

function validateReview(input: unknown): ShiftOpeningReview {
  if (!isRecord(input)) {
    throw new Error("Revisão de abertura inválida.");
  }
  assertExactKeys(input, REVIEW_KEYS, "Revisão de abertura");
  const operator = normalizeOperator(input.operator);
  const openingFloat = normalizeOpeningFloat(input.openingFloat);
  assertStrictDate(input.operationDate);
  assertShiftShape(input.shift, "Revisão de abertura.shift");
  const { currentShift } = shiftWindowForDate(input.operationDate, input.shift);
  const expectedRevision = normalizeRevision(input.expectedRevision);
  return {
    operator,
    openingFloat,
    operationDate: input.operationDate,
    shift: currentShift,
    expectedRevision,
  };
}

function validateOpening(input: unknown): ShiftOpening {
  if (!isRecord(input)) {
    throw new Error("Registro de abertura inválido.");
  }
  assertExactKeys(input, OPENING_KEYS, "Registro de abertura");
  if (input.status !== "aberto") {
    throw new Error("Status da abertura deve ser aberto.");
  }
  if (input.registerId !== "caixa-principal") {
    throw new Error("Abertura deve pertencer ao caixa principal.");
  }
  const id = normalizeId(input.id);
  const operator = normalizeOperator(input.operator);
  const openingFloat = normalizeOpeningFloat(input.openingFloat);
  assertStrictDate(input.operationDate);
  assertShiftShape(input.shift, "Registro de abertura.shift");
  const { schedule, currentShift } = shiftWindowForDate(
    input.operationDate,
    input.shift,
  );
  if (input.scheduleKind !== schedule.kind) {
    throw new Error("Tipo de escala incompatível com a data operacional.");
  }
  if (!Array.isArray(input.holidayNames)) {
    throw new Error("Nomes de feriados devem ser uma lista.");
  }
  if (
    input.holidayNames.length !== schedule.holidays.length ||
    input.holidayNames.some(
      (name, index) => name !== schedule.holidays[index]?.name,
    )
  ) {
    throw new Error("Nomes de feriados incompatíveis com o calendário atual.");
  }
  for (const name of input.holidayNames) {
    if (typeof name !== "string" || CONTROL_CHARACTERS.test(name)) {
      throw new Error("Nome de feriado inválido.");
    }
  }
  if (input.calendarVerifiedOn !== STATION_CALENDAR_META.verifiedOn) {
    throw new Error("Metadados do calendário estão desatualizados.");
  }
  if (input.timeZone !== STATION_CALENDAR_META.timeZone) {
    throw new Error("Fuso horário da abertura inválido.");
  }
  const openedAt = parseExactIsoInstant(input.openedAt);
  const stationNow = getStationNow(openedAt);
  if (stationNow.date !== input.operationDate) {
    throw new Error(
      "openedAt não corresponde à data operacional em São Paulo.",
    );
  }
  const openedShift = getScheduledShift(stationNow.date, stationNow.time);
  if (openedShift === null || !shiftsEqual(openedShift, currentShift)) {
    throw new Error("openedAt não corresponde ao turno previsto em São Paulo.");
  }
  return {
    id,
    status: "aberto",
    registerId: "caixa-principal",
    operator,
    openingFloat,
    operationDate: input.operationDate,
    shift: currentShift,
    scheduleKind: schedule.kind,
    holidayNames: schedule.holidays.map((holiday) => holiday.name),
    calendarVerifiedOn: STATION_CALENDAR_META.verifiedOn,
    timeZone: STATION_CALENDAR_META.timeZone,
    openedAt: openedAt.toISOString(),
  };
}

export function createEmptyOpeningData(): ShiftOpeningData {
  return { version: 1, revision: 0, opening: null };
}

export function validateOpeningData(input: unknown): ShiftOpeningData {
  if (!isRecord(input)) {
    throw new Error("Dados de abertura inválidos.");
  }
  assertExactKeys(input, DATA_KEYS, "Dados de abertura");
  if (input.version !== 1) {
    throw new Error("Versão de abertura incompatível.");
  }
  const revision = normalizeRevision(input.revision);
  if (input.opening === null) {
    if (revision !== 0) {
      throw new Error("Dados sem abertura devem ter revisão zero.");
    }
    return createEmptyOpeningData();
  }
  if (revision === 0) {
    throw new Error("Dados com abertura devem ter revisão positiva.");
  }
  const opening = validateOpening(input.opening);
  return { version: 1, revision, opening: cloneOpening(opening) };
}

function getCurrentWindow(now: Date): {
  date: string;
  shift: StationShift;
  schedule: StationDaySchedule;
} {
  assertFiniteDate(now, "Instante de abertura");
  const stationNow = getStationNow(now);
  const schedule = getScheduleForDate(stationNow.date);
  const shift = getScheduledShift(stationNow.date, stationNow.time);
  if (shift === null) {
    throw new Error("Abertura permitida somente dentro de um turno vigente.");
  }
  return { date: stationNow.date, shift, schedule };
}

export function prepareShiftOpening(
  data: ShiftOpeningData,
  operator: string,
  openingFloat: number,
  now: Date,
): ShiftOpeningReview {
  const current = validateOpeningData(data);
  if (current.opening !== null) {
    throw new Error("Já existe uma abertura ativa no caixa principal.");
  }
  const window = getCurrentWindow(now);
  return {
    operator: normalizeOperator(operator),
    openingFloat: normalizeOpeningFloat(openingFloat),
    operationDate: window.date,
    shift: cloneShift(window.shift),
    expectedRevision: current.revision,
  };
}

export function applyShiftOpening(
  data: ShiftOpeningData,
  review: ShiftOpeningReview,
  now: Date,
  id: string,
): ShiftOpeningData {
  const current = validateOpeningData(data);
  const normalizedReview = validateReview(review);
  if (normalizedReview.expectedRevision !== current.revision) {
    throw new Error("Revisão da abertura está desatualizada; releia o caixa.");
  }
  if (current.opening !== null) {
    throw new Error("Já existe uma abertura ativa no caixa principal.");
  }
  const window = getCurrentWindow(now);
  if (
    normalizedReview.operationDate !== window.date ||
    !shiftsEqual(normalizedReview.shift, window.shift)
  ) {
    throw new Error("O turno ou a data mudaram; confirme uma nova abertura.");
  }
  if (current.revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error("Revisão máxima atingida; não é possível abrir o caixa.");
  }
  const openingId = normalizeId(id);
  const openedAt = now.toISOString();
  const opening: ShiftOpening = {
    id: openingId,
    status: "aberto",
    registerId: "caixa-principal",
    operator: normalizedReview.operator,
    openingFloat: normalizedReview.openingFloat,
    operationDate: window.date,
    shift: cloneShift(window.shift),
    scheduleKind: window.schedule.kind,
    holidayNames: window.schedule.holidays.map((holiday) => holiday.name),
    calendarVerifiedOn: STATION_CALENDAR_META.verifiedOn,
    timeZone: STATION_CALENDAR_META.timeZone,
    openedAt,
  };
  return {
    version: 1,
    revision: current.revision + 1,
    opening: cloneOpening(opening),
  };
}

export type { StationDaySchedule, StationShift };

export function validateShiftOpeningReview(input: unknown): ShiftOpeningReview {
  return cloneReview(validateReview(input));
}

export function validateShiftOpeningId(id: unknown): string {
  return normalizeId(id);
}
