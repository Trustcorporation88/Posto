import {
  getScheduleForDate,
  getScheduledShift,
  getStationNow,
  type StationShift,
} from "../station-calendar";

export type { StationShift };

export type CashOpening = {
  id: number;
  registerId: number;
  operatorId: number;
  operator: string;
  openingFloat: number;
  operationDate: string;
  shift: StationShift;
  openedAt: string;
};

export type CashPosition = {
  revision: number;
  serverNow: string;
  operationDate: string;
  scheduledShift: StationShift | null;
  activeOpening: CashOpening | null;
};

export type CashOpenInput = {
  intentId: string;
  expectedRevision: number;
  operationDate: string;
  shiftId: "turno-1" | "turno-2";
  openingFloat: number;
};

export type CashOpenResult = {
  opening: CashOpening;
  revision: number;
  replayed: boolean;
};

export type CashDomainErrorCode =
  | "INVALID_INTENT_ID"
  | "INVALID_REVISION"
  | "INVALID_OPERATION_DATE"
  | "INVALID_SHIFT"
  | "INVALID_OPENING_FLOAT";

export class CashDomainError extends Error {
  constructor(
    readonly code: CashDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CashDomainError";
  }
}

const READ_ROLES = new Set([
  "owner",
  "manager",
  "cashier",
  "finance_viewer",
]);
const OPEN_ROLES = new Set(["owner", "manager", "cashier"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function canReadCash(role: string): boolean {
  return READ_ROLES.has(role);
}

export function canOpenCash(role: string): boolean {
  return OPEN_ROLES.has(role);
}

export function cashClockAt(now: Date): {
  serverNow: string;
  operationDate: string;
  scheduledShift: StationShift | null;
} {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Instante inválido para o relógio do caixa.");
  }
  const { date, time } = getStationNow(now);
  return {
    serverNow: now.toISOString(),
    operationDate: date,
    scheduledShift: getScheduledShift(date, time),
  };
}

export function validateCashOpenInput(input: CashOpenInput): CashOpenInput {
  if (typeof input.intentId !== "string" || !UUID_PATTERN.test(input.intentId)) {
    throw new CashDomainError(
      "INVALID_INTENT_ID",
      "A confirmação precisa de um identificador de intenção UUID válido.",
    );
  }
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  ) {
    throw new CashDomainError(
      "INVALID_REVISION",
      "A revisão esperada precisa ser um inteiro seguro não negativo.",
    );
  }
  if (typeof input.operationDate !== "string") {
    throw new CashDomainError(
      "INVALID_OPERATION_DATE",
      "Informe a data operacional em formato AAAA-MM-DD.",
    );
  }
  try {
    getScheduleForDate(input.operationDate);
  } catch {
    throw new CashDomainError(
      "INVALID_OPERATION_DATE",
      "A data operacional é inválida ou está fora do calendário suportado.",
    );
  }
  if (input.shiftId !== "turno-1" && input.shiftId !== "turno-2") {
    throw new CashDomainError(
      "INVALID_SHIFT",
      "Selecione um turno válido.",
    );
  }
  if (!Number.isSafeInteger(input.openingFloat) || input.openingFloat < 0) {
    throw new CashDomainError(
      "INVALID_OPENING_FLOAT",
      "O fundo de troco deve ser um inteiro seguro não negativo em centavos; zero é permitido.",
    );
  }
  return {
    ...input,
    intentId: input.intentId.toLowerCase(),
  };
}

export function getCashShiftForDate(
  operationDate: string,
  shiftId: CashOpenInput["shiftId"],
): StationShift {
  const shift = getScheduleForDate(operationDate).shifts.find(
    (candidate) => candidate.id === shiftId,
  );
  if (!shift) {
    throw new CashDomainError(
      "INVALID_SHIFT",
      "O turno não pertence à escala desta data operacional.",
    );
  }
  return { ...shift };
}

/** Stable canonical input used as the server-side idempotency payload digest. */
export function cashOpenPayloadCanonical(
  actorId: number,
  input: CashOpenInput,
): string {
  return JSON.stringify({
    actorId,
    input: {
      intentId: input.intentId.toLowerCase(),
      expectedRevision: input.expectedRevision,
      operationDate: input.operationDate,
      shiftId: input.shiftId,
      openingFloat: input.openingFloat,
    },
  });
}
