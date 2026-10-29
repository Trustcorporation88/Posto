import {
  applyShiftOpening,
  createEmptyOpeningData,
  prepareShiftOpening,
  validateOpeningData,
  validateShiftOpeningReview,
} from "./shift-opening";
import type {
  ShiftOpening,
  ShiftOpeningData,
  ShiftOpeningReview,
} from "./shift-opening";
import {
  applyShiftMovement,
  createEmptyMovementData,
  getMovementSummary,
  prepareShiftMovement,
  validateMovementData,
} from "./shift-movements";
import type {
  MovementSummary,
  PaymentMethod,
  ShiftMovement,
  ShiftMovementData,
  ShiftMovementDraft,
  ShiftMovementReview,
} from "./shift-movements";
import { getScheduleForDate, getStationNow } from "./station-calendar";

export type MethodTotals = Record<PaymentMethod, number>;
export type ShiftClosureTotals = {
  expectedByMethod: MethodTotals;
  countedByMethod: MethodTotals;
  differenceByMethod: MethodTotals;
  openingFloat: number;
  sales: number;
  previousReceipts: number;
  supplies: number;
  withdrawals: number;
  movementCount: number;
};
export type ShiftClosureStatus = "fechado" | "diferenca-pendente";
export type ShiftClosure = {
  id: string;
  openingId: string;
  opening: ShiftOpening;
  movements: ShiftMovement[];
  closedAt: string;
  closingOperator: string;
  confirmer: string;
  varianceReason: string;
  totals: ShiftClosureTotals;
  status: ShiftClosureStatus;
};
export type StationRegisterData = {
  version: 1;
  revision: number;
  openingRevision: number;
  opening: ShiftOpening | null;
  movements: ShiftMovement[];
  closures: ShiftClosure[];
};
export type StationOpeningReview = ShiftOpeningReview & {
  id: string;
  expectedRegisterRevision: number;
  expectedOpeningRevision: number;
};
export type ShiftClosureDraft = {
  closingOperator: string;
  confirmer: string;
  countedByMethod: MethodTotals;
  varianceReason: string;
};
export type ShiftClosureReview = ShiftClosureDraft & {
  id: string;
  openingId: string;
  expectedRegisterRevision: number;
  closedAt: string;
  expectedByMethod: MethodTotals;
  differenceByMethod: MethodTotals;
};

const METHODS: PaymentMethod[] = ["dinheiro", "pix", "debito", "credito"];
const MAX = Number.MAX_SAFE_INTEGER;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const REGISTER_KEYS = [
  "version",
  "revision",
  "openingRevision",
  "opening",
  "movements",
  "closures",
];
const CLOSURE_KEYS = [
  "id",
  "openingId",
  "opening",
  "movements",
  "closedAt",
  "closingOperator",
  "confirmer",
  "varianceReason",
  "totals",
  "status",
];
const TOTALS_KEYS = [
  "expectedByMethod",
  "countedByMethod",
  "differenceByMethod",
  "openingFloat",
  "sales",
  "previousReceipts",
  "supplies",
  "withdrawals",
  "movementCount",
];
const REVIEW_KEYS = [
  "closingOperator",
  "confirmer",
  "countedByMethod",
  "varianceReason",
  "id",
  "openingId",
  "expectedRegisterRevision",
  "closedAt",
  "expectedByMethod",
  "differenceByMethod",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(
  value: Record<string, unknown>,
  keys: string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, i) => key !== expected[i])
  )
    throw new Error(`${label}: campos ausentes ou inesperados.`);
}
function safeCount(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error(
      `${label} deve ser um inteiro não negativo em centavos seguros.`,
    );
  return value as number;
}
function safeRevision(value: unknown, label: string): number {
  return safeCount(value, label);
}
function cleanText(
  value: unknown,
  min: number,
  max: number,
  label: string,
  optional = false,
): string {
  if (typeof value !== "string" || CONTROL.test(value))
    throw new Error(`${label} inválido.`);
  const normalized = value.trim();
  if (
    (optional && normalized.length <= max) ||
    (normalized.length >= min && normalized.length <= max)
  )
    return normalized;
  throw new Error(
    optional
      ? `${label} deve ter até ${max} caracteres.`
      : `${label} deve ter de ${min} a ${max} caracteres.`,
  );
}
function cleanId(value: unknown, label: string): string {
  return cleanText(value, 1, 128, label);
}
function exactInstant(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  )
    throw new Error(`${label} deve ser um instante ISO UTC exato.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value)
    throw new Error(`${label} inválido.`);
  return value;
}
function normalizeOpening(value: unknown): ShiftOpening {
  const data = {
    version: 1,
    revision: 1,
    opening: value,
  };
  const opening = validateOpeningData(data).opening;
  if (!opening) throw new Error("Abertura ausente no registro do turno.");
  return opening;
}
function cloneMovementData(
  opening: ShiftOpening,
  movements: unknown,
): ShiftMovementData {
  if (!Array.isArray(movements))
    throw new Error("Histórico do turno inválido.");
  return validateMovementData({
    version: 1,
    revision: movements.length,
    opening,
    movements,
  });
}
function openingEqual(a: ShiftOpening, b: ShiftOpening): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function checkedDifference(counted: number, expected: number): number {
  const diff = BigInt(counted) - BigInt(expected);
  if (diff > BigInt(MAX) || diff < -BigInt(MAX))
    throw new RangeError("Diferença excede a precisão monetária segura.");
  return Number(diff);
}
function normalizeMethodTotals(input: unknown, label: string): MethodTotals {
  if (!isRecord(input)) throw new Error(`${label} inválido.`);
  exact(input, METHODS, label);
  return Object.fromEntries(
    METHODS.map((method) => [
      method,
      safeCount(input[method], `${label}.${method}`),
    ]),
  ) as MethodTotals;
}
function totalsFromSummary(
  summary: MovementSummary,
  countedByMethod: MethodTotals,
): ShiftClosureTotals {
  const expectedByMethod: MethodTotals = {
    dinheiro: summary.cashExpected,
    pix: summary.receiptsByMethod.pix,
    debito: summary.receiptsByMethod.debito,
    credito: summary.receiptsByMethod.credito,
  };
  const differenceByMethod = Object.fromEntries(
    METHODS.map((method) => [
      method,
      checkedDifference(countedByMethod[method], expectedByMethod[method]),
    ]),
  ) as MethodTotals;
  return {
    expectedByMethod,
    countedByMethod,
    differenceByMethod,
    openingFloat: summary.openingFloat,
    sales: summary.sales,
    previousReceipts: summary.previousReceipts,
    supplies: summary.supplies,
    withdrawals: summary.withdrawals,
    movementCount: summary.count,
  };
}
function totalsEqual(a: ShiftClosureTotals, b: ShiftClosureTotals): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function hasDifference(totals: ShiftClosureTotals): boolean {
  return METHODS.some((method) => totals.differenceByMethod[method] !== 0);
}
function normalizeTotals(input: unknown): ShiftClosureTotals {
  if (!isRecord(input)) throw new Error("Resumo de fechamento inválido.");
  exact(input, TOTALS_KEYS, "Resumo de fechamento");
  const totals: ShiftClosureTotals = {
    expectedByMethod: normalizeMethodTotals(
      input.expectedByMethod,
      "Valores esperados",
    ),
    countedByMethod: normalizeMethodTotals(
      input.countedByMethod,
      "Valores contados/conferidos",
    ),
    differenceByMethod: normalizeDifferenceTotals(input.differenceByMethod),
    openingFloat: safeCount(input.openingFloat, "Fundo inicial"),
    sales: safeCount(input.sales, "Vendas registradas"),
    previousReceipts: safeCount(
      input.previousReceipts,
      "Recebimentos de contas anteriores",
    ),
    supplies: safeCount(input.supplies, "Suprimentos"),
    withdrawals: safeCount(input.withdrawals, "Sangrias"),
    movementCount: safeCount(input.movementCount, "Quantidade de movimentos"),
  };
  METHODS.forEach((method) => {
    if (
      checkedDifference(
        totals.countedByMethod[method],
        totals.expectedByMethod[method],
      ) !== totals.differenceByMethod[method]
    )
      throw new Error(
        "Diferença registrada incompatível com os valores esperados e conferidos.",
      );
  });
  return totals;
}
function normalizeDifferenceTotals(input: unknown): MethodTotals {
  if (!isRecord(input))
    throw new Error("Diferenças por meio de pagamento inválidas.");
  exact(input, METHODS, "Diferenças por meio de pagamento");
  const result = Object.fromEntries(
    METHODS.map((method) => {
      const value = input[method];
      if (!Number.isSafeInteger(value))
        throw new Error(`Diferença ${method} inválida.`);
      return [method, value as number];
    }),
  ) as MethodTotals;
  return result;
}
function normalizeClosure(input: unknown): ShiftClosure {
  if (!isRecord(input)) throw new Error("Fechamento inválido.");
  exact(input, CLOSURE_KEYS, "Fechamento");
  const opening = normalizeOpening(input.opening);
  const movements = cloneMovementData(opening, input.movements).movements;
  const id = cleanId(input.id, "Identificador do fechamento");
  const openingId = cleanId(input.openingId, "Vínculo da abertura");
  if (openingId !== opening.id)
    throw new Error("Fechamento vinculado a outra abertura.");
  const closedAt = exactInstant(input.closedAt, "Horário de fechamento");
  if (Date.parse(closedAt) < Date.parse(opening.openedAt))
    throw new Error("O fechamento não pode anteceder a abertura.");
  if (
    movements.length > 0 &&
    Date.parse(closedAt) <
      Date.parse(movements[movements.length - 1]!.recordedAt)
  )
    throw new Error("O fechamento não pode anteceder o último movimento.");
  const closingOperator = cleanText(
    input.closingOperator,
    2,
    80,
    "Responsável pelo fechamento",
  );
  const confirmer = cleanText(input.confirmer, 2, 80, "Conferente declarado");
  const varianceReason = cleanText(
    input.varianceReason,
    0,
    500,
    "Justificativa",
    true,
  );
  const totals = normalizeTotals(input.totals);
  const expected = totalsFromSummary(
    getMovementSummary(opening, {
      version: 1,
      revision: movements.length,
      opening,
      movements,
    }),
    totals.countedByMethod,
  );
  if (!totalsEqual(totals, expected))
    throw new Error(
      "Resumo de fechamento não corresponde à abertura e aos movimentos congelados.",
    );
  const differs = hasDifference(totals);
  if (differs && varianceReason.length < 3)
    throw new Error("Uma diferença exige justificativa de 3 a 500 caracteres.");
  const status: ShiftClosureStatus = differs ? "diferenca-pendente" : "fechado";
  if (input.status !== status)
    throw new Error("Situação incompatível com as diferenças do fechamento.");
  return {
    id,
    openingId,
    opening,
    movements,
    closedAt,
    closingOperator,
    confirmer,
    varianceReason,
    totals,
    status,
  };
}
export function createEmptyStationRegister(): StationRegisterData {
  return {
    version: 1,
    revision: 0,
    openingRevision: 0,
    opening: null,
    movements: [],
    closures: [],
  };
}
export function validateStationRegister(input: unknown): StationRegisterData {
  if (!isRecord(input)) throw new Error("Registro local de turnos inválido.");
  exact(input, REGISTER_KEYS, "Registro local de turnos");
  if (input.version !== 1)
    throw new Error("Versão do registro de turnos incompatível.");
  const revision = safeRevision(input.revision, "Revisão do registro");
  const openingRevision = safeRevision(
    input.openingRevision,
    "Revisão das aberturas",
  );
  if (!Array.isArray(input.closures))
    throw new Error("Histórico de fechamentos inválido.");
  const closures = input.closures.map(normalizeClosure);
  const closedOpeningIds = new Set<string>();
  const closureIds = new Set<string>();
  let previousCloseAt = "";
  let movementCount = 0;
  for (const closure of closures) {
    if (closedOpeningIds.has(closure.openingId) || closureIds.has(closure.id))
      throw new Error(
        "Abertura ou identificador de fechamento duplicado no histórico.",
      );
    if (
      previousCloseAt &&
      Date.parse(closure.opening.openedAt) < Date.parse(previousCloseAt)
    )
      throw new Error(
        "Os turnos fechados estão fora de ordem ou se sobrepõem.",
      );
    closedOpeningIds.add(closure.openingId);
    closureIds.add(closure.id);
    previousCloseAt = closure.closedAt;
    movementCount += closure.movements.length;
    if (!Number.isSafeInteger(movementCount))
      throw new RangeError("Histórico excede a capacidade segura.");
  }
  let opening: ShiftOpening | null = null;
  let movements: ShiftMovement[] = [];
  if (input.opening !== null) {
    opening = normalizeOpening(input.opening);
    if (closedOpeningIds.has(opening.id))
      throw new Error("O mesmo turno consta aberto e fechado.");
    if (
      previousCloseAt &&
      Date.parse(opening.openedAt) < Date.parse(previousCloseAt)
    )
      throw new Error("A nova abertura antecede o último fechamento.");
    movements = cloneMovementData(opening, input.movements).movements;
  } else {
    if (!Array.isArray(input.movements) || input.movements.length)
      throw new Error("Movimentações abertas sem uma abertura ativa.");
  }
  if (openingRevision < closures.length + (opening ? 1 : 0))
    throw new Error(
      "Revisão insuficiente para a quantidade de turnos registrados.",
    );
  if (openingRevision === 0 && (closures.length || opening))
    throw new Error("Turnos registrados sem revisão de abertura.");
  movementCount += movements.length;
  if (!Number.isSafeInteger(movementCount))
    throw new RangeError("Histórico excede a capacidade segura.");
  const expectedRevision = openingRevision + closures.length + movementCount;
  if (!Number.isSafeInteger(expectedRevision) || revision !== expectedRevision)
    throw new Error(
      "Revisão incompatível com aberturas, movimentos e fechamentos.",
    );
  return {
    version: 1,
    revision,
    openingRevision,
    opening,
    movements,
    closures,
  };
}
export function openingDataForRegister(
  dataInput: StationRegisterData,
): ShiftOpeningData {
  const data = validateStationRegister(dataInput);
  return data.opening
    ? {
        version: 1,
        revision: Math.max(1, data.openingRevision),
        opening: data.opening,
      }
    : createEmptyOpeningData();
}
export function movementDataForRegister(
  dataInput: StationRegisterData,
): ShiftMovementData {
  const data = validateStationRegister(dataInput);
  return data.opening
    ? validateMovementData({
        version: 1,
        revision: data.movements.length,
        opening: data.opening,
        movements: data.movements,
      })
    : createEmptyMovementData();
}
export function prepareStationOpening(
  registerInput: StationRegisterData,
  operator: string,
  openingFloat: number,
  now: Date,
): StationOpeningReview {
  const register = validateStationRegister(registerInput);
  if (register.opening)
    throw new Error("Feche o turno atual antes de abrir o próximo.");
  const previous = register.closures[register.closures.length - 1];
  if (previous && now.getTime() < Date.parse(previous.closedAt))
    throw new Error(
      "A nova abertura não pode anteceder o fechamento anterior.",
    );
  return {
    ...prepareShiftOpening(
      createEmptyOpeningData(),
      operator,
      openingFloat,
      now,
    ),
    id: createStationOpeningId(),
    expectedRegisterRevision: register.revision,
    expectedOpeningRevision: register.openingRevision,
  };
}
export function createStationOpeningId(): string {
  const id = globalThis.crypto?.randomUUID?.();
  return id && id.length <= 128
    ? id
    : `opening-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
export function validateStationOpeningReview(
  input: unknown,
): StationOpeningReview {
  if (!isRecord(input)) throw new Error("Revisão da abertura inválida.");
  const keys = [
    "operator",
    "openingFloat",
    "operationDate",
    "shift",
    "expectedRevision",
    "id",
    "expectedRegisterRevision",
    "expectedOpeningRevision",
  ];
  exact(input, keys, "Revisão da abertura");
  const base = validateShiftOpeningReview({
    operator: input.operator,
    openingFloat: input.openingFloat,
    operationDate: input.operationDate,
    shift: input.shift,
    expectedRevision: input.expectedRevision,
  });
  return {
    ...base,
    id: cleanId(input.id, "Identificador da abertura"),
    expectedRegisterRevision: safeRevision(
      input.expectedRegisterRevision,
      "Revisão esperada do registro",
    ),
    expectedOpeningRevision: safeRevision(
      input.expectedOpeningRevision,
      "Revisão esperada das aberturas",
    ),
  };
}
export function applyStationOpening(
  registerInput: StationRegisterData,
  reviewInput: StationOpeningReview,
  now: Date,
  id: string,
): StationRegisterData {
  const register = validateStationRegister(registerInput);
  const review = validateStationOpeningReview(reviewInput);
  if (id !== review.id)
    throw new Error("Identificador da abertura diverge da revisão.");
  if (register.opening) throw new Error("Já existe um turno aberto.");
  if (
    review.expectedRegisterRevision !== register.revision ||
    review.expectedOpeningRevision !== register.openingRevision
  )
    throw new Error("O histórico mudou; releia antes de abrir o turno.");
  const previous = register.closures[register.closures.length - 1];
  if (previous && now.getTime() < Date.parse(previous.closedAt))
    throw new Error("O relógio está antes do último fechamento.");
  const base: ShiftOpeningReview = {
    operator: review.operator,
    openingFloat: review.openingFloat,
    operationDate: review.operationDate,
    shift: review.shift,
    expectedRevision: 0,
  };
  const opened = applyShiftOpening(
    createEmptyOpeningData(),
    base,
    now,
    id,
  ).opening;
  if (!opened) throw new Error("Abertura aplicada sem registro.");
  if (register.revision >= MAX || register.openingRevision >= MAX)
    throw new Error("Revisão máxima atingida; não é possível abrir o turno.");
  return validateStationRegister({
    ...register,
    revision: register.revision + 1,
    openingRevision: register.openingRevision + 1,
    opening: opened,
    movements: [],
  });
}
export function prepareStationMovement(
  registerInput: StationRegisterData,
  draft: ShiftMovementDraft,
  now: Date,
  id?: string,
): ShiftMovementReview {
  const register = validateStationRegister(registerInput);
  if (!register.opening)
    throw new Error("Não há turno aberto para receber movimentos.");
  const movementData = movementDataForRegister(register);
  return prepareShiftMovement(movementData, register.opening, draft, now, id);
}
export function applyStationMovement(
  registerInput: StationRegisterData,
  review: ShiftMovementReview,
  now: Date,
): StationRegisterData {
  const register = validateStationRegister(registerInput);
  if (!register.opening)
    throw new Error("O turno já está fechado; não aceite novos movimentos.");
  const nextMovements = applyShiftMovement(
    movementDataForRegister(register),
    register.opening,
    review,
    now,
  );
  if (register.revision >= MAX)
    throw new Error("Revisão máxima atingida; movimento não gravado.");
  return validateStationRegister({
    ...register,
    revision: register.revision + 1,
    movements: nextMovements.movements,
  });
}
export function createStationClosureId(): string {
  const id = globalThis.crypto?.randomUUID?.();
  return id && id.length <= 128
    ? id
    : `closure-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function expectedForRegister(data: StationRegisterData): MethodTotals {
  if (!data.opening) throw new Error("Abra o caixa antes de fechar o turno.");
  const summary = getMovementSummary(
    data.opening,
    movementDataForRegister(data),
  );
  return {
    dinheiro: summary.cashExpected,
    pix: summary.receiptsByMethod.pix,
    debito: summary.receiptsByMethod.debito,
    credito: summary.receiptsByMethod.credito,
  };
}
export function prepareStationClosure(
  registerInput: StationRegisterData,
  draftInput: ShiftClosureDraft,
  now: Date,
  id = createStationClosureId(),
): ShiftClosureReview {
  const register = validateStationRegister(registerInput);
  if (!register.opening) throw new Error("Não há turno aberto para fechar.");
  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    now.getTime() < Date.parse(register.opening.openedAt)
  )
    throw new Error("Horário de fechamento inválido ou anterior à abertura.");
  const stationNow = getStationNow(now);
  getScheduleForDate(stationNow.date);
  if (
    register.movements.length > 0 &&
    now.getTime() <
      Date.parse(register.movements[register.movements.length - 1]!.recordedAt)
  )
    throw new Error(
      "O relógio não pode retroceder em relação ao último movimento.",
    );
  if (!isRecord(draftInput))
    throw new Error("Conferência do fechamento inválida.");
  exact(
    draftInput,
    ["closingOperator", "confirmer", "countedByMethod", "varianceReason"],
    "Conferência do fechamento",
  );
  const closingOperator = cleanText(
    draftInput.closingOperator,
    2,
    80,
    "Responsável pelo fechamento",
  );
  const confirmer = cleanText(
    draftInput.confirmer,
    2,
    80,
    "Conferente declarado",
  );
  const countedByMethod = normalizeMethodTotals(
    draftInput.countedByMethod,
    "Valores contados/conferidos",
  );
  const varianceReason = cleanText(
    draftInput.varianceReason,
    0,
    500,
    "Justificativa",
    true,
  );
  const expectedByMethod = expectedForRegister(register);
  const differenceByMethod = Object.fromEntries(
    METHODS.map((method) => [
      method,
      checkedDifference(countedByMethod[method], expectedByMethod[method]),
    ]),
  ) as MethodTotals;
  if (
    METHODS.some((method) => differenceByMethod[method] !== 0) &&
    varianceReason.length < 3
  )
    throw new Error(
      "Registre uma justificativa de 3 a 500 caracteres para as diferenças.",
    );
  return {
    closingOperator,
    confirmer,
    countedByMethod,
    varianceReason,
    id: cleanId(id, "Identificador de intenção do fechamento"),
    openingId: register.opening.id,
    expectedRegisterRevision: register.revision,
    closedAt: now.toISOString(),
    expectedByMethod,
    differenceByMethod,
  };
}
export function validateStationClosureReview(
  input: unknown,
): ShiftClosureReview {
  if (!isRecord(input)) throw new Error("Revisão de fechamento inválida.");
  exact(input, REVIEW_KEYS, "Revisão de fechamento");
  const closingOperator = cleanText(
    input.closingOperator,
    2,
    80,
    "Responsável pelo fechamento",
  );
  const confirmer = cleanText(input.confirmer, 2, 80, "Conferente declarado");
  const countedByMethod = normalizeMethodTotals(
    input.countedByMethod,
    "Valores contados/conferidos",
  );
  const expectedByMethod = normalizeMethodTotals(
    input.expectedByMethod,
    "Valores esperados",
  );
  const differenceByMethod = normalizeDifferenceTotals(
    input.differenceByMethod,
  );
  METHODS.forEach((method) => {
    if (
      checkedDifference(countedByMethod[method], expectedByMethod[method]) !==
      differenceByMethod[method]
    )
      throw new Error(
        "Diferença da revisão incompatível com os valores informados.",
      );
  });
  const varianceReason = cleanText(
    input.varianceReason,
    0,
    500,
    "Justificativa",
    true,
  );
  if (
    METHODS.some((method) => differenceByMethod[method] !== 0) &&
    varianceReason.length < 3
  )
    throw new Error("Uma diferença exige justificativa de 3 a 500 caracteres.");
  return {
    closingOperator,
    confirmer,
    countedByMethod,
    varianceReason,
    id: cleanId(input.id, "Identificador de intenção do fechamento"),
    openingId: cleanId(input.openingId, "Vínculo da abertura"),
    expectedRegisterRevision: safeRevision(
      input.expectedRegisterRevision,
      "Revisão esperada do registro",
    ),
    closedAt: exactInstant(input.closedAt, "Horário da revisão"),
    expectedByMethod,
    differenceByMethod,
  };
}
function closureMatchesReview(
  closure: ShiftClosure,
  review: ShiftClosureReview,
): boolean {
  return (
    closure.id === review.id &&
    closure.openingId === review.openingId &&
    closure.closedAt === review.closedAt &&
    closure.closingOperator === review.closingOperator &&
    closure.confirmer === review.confirmer &&
    closure.varianceReason === review.varianceReason &&
    JSON.stringify(closure.totals.countedByMethod) ===
      JSON.stringify(review.countedByMethod) &&
    JSON.stringify(closure.totals.expectedByMethod) ===
      JSON.stringify(review.expectedByMethod) &&
    JSON.stringify(closure.totals.differenceByMethod) ===
      JSON.stringify(review.differenceByMethod)
  );
}
export function applyStationClosure(
  registerInput: StationRegisterData,
  reviewInput: ShiftClosureReview,
  now: Date,
): StationRegisterData {
  const register = validateStationRegister(registerInput);
  const review = validateStationClosureReview(reviewInput);
  const existing = register.closures.find(
    (closure) => closure.id === review.id,
  );
  if (existing) {
    if (closureMatchesReview(existing, review)) return register;
    throw new Error(
      "Identificador de fechamento já usado com dados diferentes.",
    );
  }
  if (!register.opening) throw new Error("Não há turno aberto para fechar.");
  if (review.expectedRegisterRevision !== register.revision)
    throw new Error("O registro do turno mudou; atualize e revise novamente.");
  if (review.openingId !== register.opening.id)
    throw new Error("A revisão não corresponde à abertura atual.");
  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    now.getTime() < Date.parse(review.closedAt)
  )
    throw new Error("O relógio retrocedeu depois da revisão do fechamento.");
  if (Date.parse(review.closedAt) < Date.parse(register.opening.openedAt))
    throw new Error("O fechamento não pode anteceder a abertura.");
  const expectedByMethod = expectedForRegister(register);
  const totals = totalsFromSummary(
    getMovementSummary(register.opening, movementDataForRegister(register)),
    review.countedByMethod,
  );
  if (
    JSON.stringify(expectedByMethod) !==
      JSON.stringify(review.expectedByMethod) ||
    JSON.stringify(totals.differenceByMethod) !==
      JSON.stringify(review.differenceByMethod)
  )
    throw new Error(
      "Os valores esperados mudaram; releia e revise o fechamento.",
    );
  if (register.revision >= MAX)
    throw new Error("Revisão máxima atingida; turno não fechado.");
  const closure: ShiftClosure = {
    id: review.id,
    openingId: register.opening.id,
    opening: register.opening,
    movements: register.movements,
    closedAt: review.closedAt,
    closingOperator: review.closingOperator,
    confirmer: review.confirmer,
    varianceReason: review.varianceReason,
    totals,
    status: hasDifference(totals) ? "diferenca-pendente" : "fechado",
  };
  return validateStationRegister({
    ...register,
    revision: register.revision + 1,
    opening: null,
    movements: [],
    closures: [...register.closures, closure],
  });
}
export function movementSummaryForClosure(
  closure: ShiftClosure,
): MovementSummary {
  const normalized = normalizeClosure(closure);
  return getMovementSummary(normalized.opening, {
    version: 1,
    revision: normalized.movements.length,
    opening: normalized.opening,
    movements: normalized.movements,
  });
}
export function getClosureTotalsForCounts(
  opening: ShiftOpening,
  movements: ShiftMovement[],
  countedByMethod: MethodTotals,
): ShiftClosureTotals {
  const normalizedOpening = normalizeOpening(opening);
  const normalizedMovements = cloneMovementData(normalizedOpening, movements);
  return totalsFromSummary(
    getMovementSummary(normalizedOpening, normalizedMovements),
    normalizeMethodTotals(countedByMethod, "Valores contados/conferidos"),
  );
}
export function isStationClosure(value: ShiftClosure): boolean {
  return normalizeClosure(value).status === "fechado";
}
export function stationRegisterFromLegacy(
  openingRaw: string | null,
  movementsRaw: string | null,
): StationRegisterData {
  let openingData: ShiftOpeningData;
  let movementData: ShiftMovementData;
  try {
    openingData =
      openingRaw === null
        ? createEmptyOpeningData()
        : validateOpeningData(JSON.parse(openingRaw) as unknown);
  } catch (error) {
    throw new Error(
      `Falha ao migrar abertura local: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    movementData =
      movementsRaw === null
        ? createEmptyMovementData()
        : validateMovementData(JSON.parse(movementsRaw) as unknown);
  } catch (error) {
    throw new Error(
      `Falha ao migrar movimentos locais: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const opening = openingData.opening;
  if (movementData.movements.length && !opening)
    throw new Error(
      "Há movimentos sem uma abertura válida; nenhuma migração foi gravada.",
    );
  if (
    movementData.opening &&
    (!opening || !openingEqual(movementData.opening, opening))
  )
    throw new Error(
      "A abertura não corresponde ao histórico de movimentos; nenhuma migração foi gravada.",
    );
  const movements = opening ? movementData.movements : [];
  const openingRevision = openingData.revision;
  const revision = openingRevision + movements.length;
  return validateStationRegister({
    version: 1,
    revision,
    openingRevision,
    opening,
    movements,
    closures: [],
  });
}
export { METHODS as PAYMENT_METHODS };
