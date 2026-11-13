export const FUEL_VOLUME_SCALE = 1_000n;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_DECIMAL_INTEGER_DIGITS = 15;

export type FuelDomainErrorCode =
  | "INVALID_LITERS"
  | "INVALID_MONEY"
  | "INVALID_PRICE"
  | "METER_COUNTER_REVERSED"
  | "METER_VALUE_UNSAFE"
  | "CAPACITY_EXCEEDED"
  | "STOCK_INSUFFICIENT"
  | "INVALID_COST_EVENT";

export class FuelDomainError extends Error {
  readonly code: FuelDomainErrorCode;

  constructor(code: FuelDomainErrorCode, message: string) {
    super(message);
    this.name = "FuelDomainError";
    this.code = code;
  }
}

function normalizeVolumeInput(raw: string) {
  const value = raw.trim();
  if (value.includes(",") && value.includes(".")) {
    throw new FuelDomainError(
      "INVALID_LITERS",
      "Use vírgula ou ponto decimal, sem separador de milhar.",
    );
  }
  return value.replace(",", ".");
}

/** Parse litros with exact 0.001 L scale. UI accepts Brazilian comma or decimal point, not grouping. */
export function litersToMilliLiters(raw: string, allowZero = false): bigint {
  const value = normalizeVolumeInput(raw);
  const pattern = new RegExp(
    `^\\d{1,${MAX_DECIMAL_INTEGER_DIGITS}}(?:\\.\\d{1,3})?$`,
  );
  if (!pattern.test(value)) {
    throw new FuelDomainError(
      "INVALID_LITERS",
      "Informe litros com até três casas decimais.",
    );
  }
  const [whole, fraction = ""] = value.split(".");
  const scaled =
    BigInt(whole) * FUEL_VOLUME_SCALE + BigInt(fraction.padEnd(3, "0") || "0");
  if ((!allowZero && scaled <= 0n) || scaled > MAX_SAFE_BIGINT) {
    throw new FuelDomainError(
      "INVALID_LITERS",
      "O volume deve ser positivo e estar dentro do limite seguro.",
    );
  }
  return scaled;
}

export function signedLitersToMilliLiters(raw: string): bigint {
  const value = normalizeVolumeInput(raw);
  if (!value.startsWith("-")) return litersToMilliLiters(value, true);
  const absolute = value.slice(1);
  if (!absolute) {
    throw new FuelDomainError("INVALID_LITERS", "Informe um volume válido.");
  }
  return -litersToMilliLiters(absolute, true);
}

export function doesFuelTankTheoreticalBalanceMatch(
  expectedLiters: string,
  currentLiters: string,
) {
  try {
    return (
      signedLitersToMilliLiters(expectedLiters) ===
      signedLitersToMilliLiters(currentLiters)
    );
  } catch {
    return false;
  }
}

function groupedInteger(value: bigint) {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function milliLitersToDecimal(value: bigint | number): string {
  const scaled = typeof value === "bigint" ? value : BigInt(value);
  const negative = scaled < 0n;
  const absolute = negative ? -scaled : scaled;
  const whole = absolute / FUEL_VOLUME_SCALE;
  const fraction = (absolute % FUEL_VOLUME_SCALE).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Equal MySQL-second timestamps follow the numeric append ID assigned under the cost-state lock. */
export function isMovementTimestampAtOrAfter(
  candidateAtMs: number,
  latestAtMs: number | null,
) {
  return latestAtMs === null || candidateAtMs >= latestAtMs;
}

export function isTimestampStrictlyAfter(
  candidateAtMs: number,
  latestAtMs: number | null,
) {
  return latestAtMs === null || candidateAtMs > latestAtMs;
}

export function isTimestampAtOrBefore(
  candidateAtMs: number,
  referenceAtMs: number,
) {
  return candidateAtMs <= referenceAtMs;
}

export function formatMilliLiters(value: bigint | number): string {
  const decimal = milliLitersToDecimal(value);
  const [whole, fraction] = decimal.split(".");
  const trimmedFraction = fraction.replace(/0+$/, "");
  const groupedWhole = groupedInteger(BigInt(whole));
  return `${groupedWhole}${trimmedFraction ? `,${trimmedFraction}` : ""}`;
}

function parseMoneyWholeAndFraction(raw: string) {
  let value = raw
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "");
  if (!value || value.startsWith("-") || value.startsWith("+")) return null;

  if (value.includes(",")) {
    if (
      !/^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$/.test(value) &&
      !/^\d+(?:,\d{1,2})?$/.test(value)
    )
      return null;
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) {
    value = value.replace(/\./g, "");
  } else if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    return null;
  }

  const [whole, fraction = ""] = value.split(".");
  if (whole.length > MAX_DECIMAL_INTEGER_DIGITS) return null;
  return { whole, fraction };
}

/** Parse BRL into integer cents; accepts e.g. 7,15, 7.15 and 1.234,56. */
export function moneyToCents(raw: string, allowZero = false): number {
  const parts = parseMoneyWholeAndFraction(raw);
  if (!parts)
    throw new FuelDomainError(
      "INVALID_MONEY",
      "Informe um valor monetário válido com até duas casas decimais.",
    );
  const cents =
    BigInt(parts.whole) * 100n + BigInt(parts.fraction.padEnd(2, "0") || "0");
  if ((!allowZero && cents <= 0n) || cents > MAX_SAFE_BIGINT) {
    throw new FuelDomainError(
      "INVALID_MONEY",
      "O valor deve ser positivo e estar dentro do limite seguro.",
    );
  }
  return Number(cents);
}

export function formatCents(cents: number | bigint): string {
  const integer = typeof cents === "bigint" ? cents : BigInt(cents);
  const negative = integer < 0n;
  const absolute = negative ? -integer : integer;
  const value = `${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
  const [whole, fraction] = value.split(".");
  const formatted = groupedInteger(BigInt(whole));
  return `${negative ? "-" : ""}R$ ${formatted},${fraction}`;
}

function roundedRatio(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n)
    throw new FuelDomainError(
      "INVALID_COST_EVENT",
      "Base de cálculo do estoque inválida.",
    );
  return (numerator + denominator / 2n) / denominator;
}

function toSafeInteger(
  value: bigint,
  code: FuelDomainErrorCode,
  message: string,
) {
  if (value < 0n || value > MAX_SAFE_BIGINT)
    throw new FuelDomainError(code, message);
  return Number(value);
}

export function litersAtPriceToCents(
  volumeMilliLiters: bigint,
  centsPerLiter: number,
): number {
  if (
    volumeMilliLiters < 0n ||
    !Number.isSafeInteger(centsPerLiter) ||
    centsPerLiter < 0
  ) {
    throw new FuelDomainError("INVALID_PRICE", "Preço ou volume inválido.");
  }
  return toSafeInteger(
    roundedRatio(volumeMilliLiters * BigInt(centsPerLiter), FUEL_VOLUME_SCALE),
    "METER_VALUE_UNSAFE",
    "O valor calculado excede o limite monetário seguro.",
  );
}

export function meterInterval(input: {
  previousCounterLiters: string;
  finalCounterLiters: string;
  centsPerLiter: number;
}) {
  const previous = litersToMilliLiters(input.previousCounterLiters, true);
  const final = litersToMilliLiters(input.finalCounterLiters, true);
  if (final < previous) {
    throw new FuelDomainError(
      "METER_COUNTER_REVERSED",
      "O encerrante final não pode ser menor que o inicial. Registre uma troca/reset autorizado do medidor.",
    );
  }
  if (!Number.isSafeInteger(input.centsPerLiter) || input.centsPerLiter <= 0) {
    throw new FuelDomainError(
      "INVALID_PRICE",
      "Defina um preço positivo por litro antes de registrar a leitura.",
    );
  }
  const volumeMilliLiters = final - previous;
  return {
    previousCounterMilliLiters: previous,
    finalCounterMilliLiters: final,
    volumeMilliLiters,
    volumeLiters: milliLitersToDecimal(volumeMilliLiters),
    estimatedRevenueCents: litersAtPriceToCents(
      volumeMilliLiters,
      input.centsPerLiter,
    ),
  };
}

export function tankVariance(
  theoreticalLiters: string,
  measuredLiters: string,
) {
  const theoretical = litersToMilliLiters(theoreticalLiters, true);
  const measured = litersToMilliLiters(measuredLiters, true);
  const difference = measured - theoretical;
  return {
    theoreticalMilliLiters: theoretical,
    measuredMilliLiters: measured,
    differenceMilliLiters: difference,
    differenceLiters: milliLitersToDecimal(difference),
    hasDifference: difference !== 0n,
  };
}

export function assertWithinTankCapacity(input: {
  nextTheoreticalLiters: string;
  capacityLiters: string | null;
}) {
  const next = litersToMilliLiters(input.nextTheoreticalLiters, true);
  if (input.capacityLiters === null) return;
  const capacity = litersToMilliLiters(input.capacityLiters, true);
  if (next > capacity) {
    throw new FuelDomainError(
      "CAPACITY_EXCEEDED",
      "O movimento excede a capacidade cadastrada do tanque.",
    );
  }
}

export type MovingAverageState = {
  quantityMilliLiters: string;
  inventoryValueCents: string | null;
  costKnown: boolean;
};

export function applyMovingAverageDelta(
  state: MovingAverageState,
  quantityDeltaMilliLiters: bigint,
  incomingValueCents: bigint | null,
) {
  if (quantityDeltaMilliLiters === 0n) {
    throw new FuelDomainError(
      "INVALID_COST_EVENT",
      "O movimento de estoque deve ter volume diferente de zero.",
    );
  }

  let quantity = BigInt(state.quantityMilliLiters);
  let value = state.inventoryValueCents === null
    ? null
    : BigInt(state.inventoryValueCents);
  if (
    (quantity < 0n && value !== null) ||
    (value !== null && value < 0n)
  ) {
    throw new FuelDomainError(
      "INVALID_COST_EVENT",
      "O saldo de custo médio armazenado é inválido.",
    );
  }
  if (state.costKnown !== (value !== null)) {
    throw new FuelDomainError(
      "INVALID_COST_EVENT",
      "O estado de custo médio está inconsistente.",
    );
  }

  let issueCostCents: bigint | null = null;
  if (quantityDeltaMilliLiters > 0n) {
    if (incomingValueCents !== null && incomingValueCents < 0n) {
      throw new FuelDomainError(
        "INVALID_COST_EVENT",
        "O valor de entrada do estoque não pode ser negativo.",
      );
    }
    const previous = quantity;
    quantity += quantityDeltaMilliLiters;
    if (previous < 0n) {
      value = quantity === 0n
        ? 0n
        : quantity > 0n && incomingValueCents !== null
          ? roundedRatio(
              incomingValueCents * quantity,
              quantityDeltaMilliLiters,
            )
          : null;
    } else if (previous === 0n) {
      value = incomingValueCents;
    } else if (value !== null && incomingValueCents !== null) {
      value += incomingValueCents;
    } else {
      value = quantity === 0n ? 0n : null;
    }
  } else {
    const issued = -quantityDeltaMilliLiters;
    if (quantity > 0n && value !== null && issued <= quantity) {
      issueCostCents = roundedRatio(value * issued, quantity);
      value -= issueCostCents;
    } else {
      value = null;
    }
    quantity -= issued;
    if (quantity === 0n) value = 0n;
  }

  return {
    state: {
      quantityMilliLiters: quantity.toString(),
      inventoryValueCents: value?.toString() ?? null,
      costKnown: value !== null,
    } satisfies MovingAverageState,
    issueCostCents,
  };
}

export type FuelCostEvent = {
  id: string;
  occurredAt: number;
  quantityMilliLiters: string;
  /** Positive cents entering inventory; null means the value basis is unknown. */
  valueCents: string | null;
};

export type FuelCostSnapshot = {
  quantityMilliLiters: bigint;
  inventoryValueCents: bigint | null;
  averageUnitCostCentsPerLiter: number | null;
  issueCostCents: number | null;
};

function compareMovementIds(left: string, right: string) {
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    const leftId = BigInt(left);
    const rightId = BigInt(right);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  }
  return left.localeCompare(right);
}

/**
 * Replays an append-only quantity/value ledger using moving weighted-average cost.
 * Equal MySQL timestamps follow the append ID assigned under the product cost-state lock.
 * Unknown opening/adjustment value stays unknown until that unvalued stock is depleted.
 */
export function movingAverageCost(events: FuelCostEvent[]) {
  const ordered = [...events].sort(
    (a, b) => a.occurredAt - b.occurredAt || compareMovementIds(a.id, b.id),
  );
  let quantity = 0n;
  let value: bigint | null = 0n;
  const snapshots = new Map<string, FuelCostSnapshot>();

  for (const event of ordered) {
    const delta = BigInt(event.quantityMilliLiters);
    const beforeQuantity = quantity;
    let issueCostCents: number | null = null;

    if (delta > 0n) {
      const incomingValue =
        event.valueCents === null ? null : BigInt(event.valueCents);
      if (incomingValue !== null && incomingValue < 0n) {
        throw new FuelDomainError(
          "INVALID_COST_EVENT",
          "O valor de entrada do estoque não pode ser negativo.",
        );
      }
      quantity += delta;
      if (beforeQuantity < 0n) {
        if (quantity < 0n) value = null;
        else if (quantity === 0n) value = 0n;
        else if (incomingValue !== null)
          value = roundedRatio(incomingValue * quantity, delta);
        else value = null;
      } else if (value !== null && incomingValue !== null) {
        value += incomingValue;
      } else if (quantity === 0n) {
        value = 0n;
      } else {
        value = null;
      }
    } else if (delta < 0n) {
      const issued = -delta;
      if (beforeQuantity > 0n && value !== null && issued <= beforeQuantity) {
        const allocated = roundedRatio(value * issued, beforeQuantity);
        issueCostCents = toSafeInteger(
          allocated,
          "INVALID_COST_EVENT",
          "O custo alocado excede o limite seguro.",
        );
        value -= allocated;
      } else {
        value = null;
      }
      quantity += delta;
      if (quantity === 0n) value = 0n;
    }

    const average =
      quantity > 0n && value !== null
        ? toSafeInteger(
            roundedRatio(value * FUEL_VOLUME_SCALE, quantity),
            "INVALID_COST_EVENT",
            "O custo médio excede o limite seguro.",
          )
        : null;
    snapshots.set(event.id, {
      quantityMilliLiters: quantity,
      inventoryValueCents: value,
      averageUnitCostCentsPerLiter: average,
      issueCostCents,
    });
  }

  return snapshots;
}
