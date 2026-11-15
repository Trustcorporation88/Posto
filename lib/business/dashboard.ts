/**
 * Pure helpers for the management dashboard and reports. No database or UI imports,
 * so the aggregation rules are verified by unit tests.
 */

export type DailyFuelPoint = {
  date: string;
  quantityLiters: string;
  revenueCents: bigint;
  /** null when at least one sale of the day has an unknown cost basis. */
  marginCents: bigint | null;
  readingCount: number;
};

export type FuelSaleRow = {
  measuredAt: Date;
  quantityLiters: string;
  revenueCents: bigint | null;
  costCents: bigint | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Civil date (YYYY-MM-DD) of an instant in the station time zone. */
export function localDateKey(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The `count` civil dates ending at `lastDate`, oldest first. */
export function trailingDates(lastDate: string, count: number): string[] {
  if (!DATE_RE.test(lastDate) || !Number.isInteger(count) || count < 1 || count > 366) {
    throw new Error("INVALID_DATE_RANGE");
  }
  const [year, month, day] = lastDate.split("-").map(Number);
  const dates: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month - 1, day - offset));
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

/** Exact decimal liters (up to 3 places) to integer milliliters. */
export function litersToMilli(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match) throw new Error("INVALID_LITERS");
  const [, sign, whole, fraction = ""] = match;
  const milli = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  return sign ? -milli : milli;
}

export function milliToLiters(milli: bigint): string {
  const negative = milli < 0n;
  const abs = negative ? -milli : milli;
  const whole = abs / 1000n;
  const fraction = (abs % 1000n).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Groups interval sales by station-local day; every requested day appears, zeros included. */
export function aggregateDailyFuel(
  rows: readonly FuelSaleRow[],
  dates: readonly string[],
  timeZone: string,
): DailyFuelPoint[] {
  const buckets = new Map(
    dates.map((date) => [
      date,
      { milli: 0n, revenue: 0n, cost: 0n, costKnown: true, count: 0 },
    ]),
  );
  for (const row of rows) {
    const bucket = buckets.get(localDateKey(row.measuredAt, timeZone));
    if (!bucket) continue;
    bucket.milli += litersToMilli(row.quantityLiters);
    bucket.revenue += row.revenueCents ?? 0n;
    if (row.costCents === null) bucket.costKnown = false;
    else bucket.cost += row.costCents;
    bucket.count += 1;
  }
  return dates.map((date) => {
    const bucket = buckets.get(date)!;
    return {
      date,
      quantityLiters: milliToLiters(bucket.milli),
      revenueCents: bucket.revenue,
      marginCents: bucket.count === 0 ? 0n : bucket.costKnown ? bucket.revenue - bucket.cost : null,
      readingCount: bucket.count,
    };
  });
}

export type SetupStepId =
  | "products"
  | "tanks"
  | "nozzles"
  | "prices"
  | "baselines"
  | "measurements"
  | "team"
  | "cash";

export type SetupStep = {
  id: SetupStepId;
  title: string;
  detail: string;
  done: boolean;
  href: "/gestao/pista" | "/gestao/equipe" | "/gestao/caixa";
};

export type SetupFacts = {
  products: number;
  productsWithPrice: number;
  tanks: number;
  tanksMeasured: number;
  nozzles: number;
  nozzlesWithBaseline: number;
  teamMembers: number;
  pendingInvites: number;
  cashTurns: number;
};

/** First-use checklist in the order the configuration depends on itself. */
export function setupSteps(facts: SetupFacts): SetupStep[] {
  const allOf = (done: number, total: number) => total > 0 && done >= total;
  return [
    {
      id: "products",
      title: "Cadastrar os combustíveis",
      detail: facts.products ? `${facts.products} cadastrado(s)` : "Gasolina, etanol, diesel…",
      done: facts.products > 0,
      href: "/gestao/pista",
    },
    {
      id: "tanks",
      title: "Cadastrar os tanques",
      detail: facts.tanks ? `${facts.tanks} cadastrado(s)` : "Cada tanque ligado a um combustível",
      done: facts.tanks > 0,
      href: "/gestao/pista",
    },
    {
      id: "nozzles",
      title: "Cadastrar bombas e bicos",
      detail: facts.nozzles ? `${facts.nozzles} bico(s)` : "Cada bico ligado à bomba e ao tanque",
      done: facts.nozzles > 0,
      href: "/gestao/pista",
    },
    {
      id: "prices",
      title: "Registrar o preço de venda",
      detail: `${facts.productsWithPrice} de ${facts.products} combustível(is) com preço vigente`,
      done: allOf(facts.productsWithPrice, facts.products),
      href: "/gestao/pista",
    },
    {
      id: "baselines",
      title: "Anotar o encerrante inicial dos bicos",
      detail: `${facts.nozzlesWithBaseline} de ${facts.nozzles} bico(s)`,
      done: allOf(facts.nozzlesWithBaseline, facts.nozzles),
      href: "/gestao/pista",
    },
    {
      id: "measurements",
      title: "Medir os tanques",
      detail: `${facts.tanksMeasured} de ${facts.tanks} tanque(s) com medição física`,
      done: allOf(facts.tanksMeasured, facts.tanks),
      href: "/gestao/pista",
    },
    {
      id: "team",
      title: "Convidar a equipe",
      detail:
        facts.teamMembers > 1 || facts.pendingInvites > 0
          ? `${facts.teamMembers} membro(s), ${facts.pendingInvites} convite(s) pendente(s)`
          : "Gerente, caixa e frentistas",
      done: facts.teamMembers > 1 || facts.pendingInvites > 0,
      href: "/gestao/equipe",
    },
    {
      id: "cash",
      title: "Abrir o primeiro turno de caixa",
      detail: facts.cashTurns ? `${facts.cashTurns} turno(s) registrado(s)` : "Fundo de troco contado",
      done: facts.cashTurns > 0,
      href: "/gestao/caixa",
    },
  ];
}

export type ClosingReportRow = {
  status: "fechado" | "diferenca-pendente";
  differenceByMethod: Record<"dinheiro" | "pix" | "debito" | "credito", number>;
  countedByMethod: Record<"dinheiro" | "pix" | "debito" | "credito", number>;
};

export type ClosingReportTotals = {
  turns: number;
  pending: number;
  countedByMethod: Record<"dinheiro" | "pix" | "debito" | "credito", number>;
  differenceByMethod: Record<"dinheiro" | "pix" | "debito" | "credito", number>;
};

const METHODS = ["dinheiro", "pix", "debito", "credito"] as const;

/** Sums closings exactly (integers in cents); throws instead of losing precision. */
export function summarizeClosings(rows: readonly ClosingReportRow[]): ClosingReportTotals {
  const zero = () => ({ dinheiro: 0, pix: 0, debito: 0, credito: 0 });
  const counted = zero();
  const difference = zero();
  let pending = 0;
  for (const row of rows) {
    if (row.status === "diferenca-pendente") pending += 1;
    for (const method of METHODS) {
      counted[method] += row.countedByMethod[method];
      difference[method] += row.differenceByMethod[method];
      if (!Number.isSafeInteger(counted[method]) || !Number.isSafeInteger(difference[method])) {
        throw new Error("UNSAFE_TOTAL");
      }
    }
  }
  return { turns: rows.length, pending, countedByMethod: counted, differenceByMethod: difference };
}
