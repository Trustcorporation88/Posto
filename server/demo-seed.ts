/**
 * Demonstration data for the separate DEMO deployment (DEMO_MODE=true). Never runs against
 * a database that already has an organization, so it cannot touch real station data.
 *
 * Every record goes through the same services the screens use, in chronological order, so
 * ledgers, average costs, cash revisions and audit trails stay consistent. Cash services get
 * a simulated clock; fuel services accept past event timestamps by design.
 */
import { randomUUID } from "node:crypto";
import { like } from "drizzle-orm";
import { businessUsers } from "../drizzle/schema";
import { DEMO_ACCOUNTS, DEMO_EMAIL_DOMAIN, DEMO_PASSWORD } from "../shared/demo";
import { hashPassword } from "./auth/security";
import { getDb } from "./db";
import { getScheduleForDate } from "../lib/station-calendar";
import { acceptInvitation, bootstrap, createInvitation, issueSession, organizationExists, resolveSession } from "./auth/service";
import { serviceWithDatabase as cashOpenService } from "./modules/cash-service";
import { serviceWithDatabase as cashMovementService } from "./modules/cash-movement-service";
import { serviceWithDatabase as cashClosingService } from "./modules/cash-closing-service";
import {
  createFuelNozzle,
  createFuelPrice,
  createFuelProduct,
  createFuelPump,
  createFuelReceipt,
  createFuelTank,
  recordFuelBaseline,
  recordFuelInterval,
  recordFuelTankMeasurement,
} from "./modules/fuel-service";

const FUEL_DAYS = 365;
/** Monthly demand profile (January first): weaker February, stronger December. */
const SEASON = [0.94, 0.88, 0.97, 0.98, 1.0, 0.97, 1.04, 1.02, 0.99, 1.01, 1.03, 1.12];
const CASH_DAYS = 14;
const DOMAIN = DEMO_EMAIL_DOMAIN;

/** Deterministic PRNG so every demo database looks the same. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(20261115);
const between = (min: number, max: number) => min + (max - min) * random();
const int = (min: number, max: number) => Math.round(between(min, max));

const toLiters = (milli: bigint) => `${milli / 1000n}.${(milli % 1000n).toString().padStart(3, "0")}`;
const money = (cents: number) => `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
/** Bauru has no daylight saving time since 2019: local time is UTC-3. */
const at = (date: string, time: string) => new Date(`${date}T${time}:00-03:00`);
const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);
function localDate(instant: Date) {
  return new Date(instant.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}
function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

type Log = (line: string) => void;

export async function seedDemo(log: Log = console.log) {
  if (process.env.DEMO_MODE !== "true") {
    throw new Error("seed-demo só roda com DEMO_MODE=true (ambiente de demonstração).");
  }
  if (await organizationExists()) {
    throw new Error("Este banco já tem uma empresa. A demonstração só é criada em banco vazio.");
  }
  const password = DEMO_PASSWORD;
  const now = new Date();
  const today = localDate(now);

  // People ---------------------------------------------------------------------------------
  const owner = await bootstrap({
    organizationName: "Posto Exemplo Ltda (DEMO)",
    locationName: "Posto Exemplo · Bauru",
    ownerName: "Ana Proprietária",
    email: `proprietario@${DOMAIN}`,
    password,
  });
  const { organizationId, locationId } = owner;
  const people: Record<string, number> = { owner: owner.userId };
  for (const [key, role, name] of [
    ["manager", "manager", "Bruno Gerente"],
    ["cashier", "cashier", "Carla Caixa"],
    ["attendant", "attendant", "Diego Frentista"],
    ["finance", "finance_viewer", "Elisa Financeiro"],
  ] as const) {
    const token = await createInvitation(owner.userId, organizationId, locationId, `${key}@${DOMAIN}`, role);
    const userId = await acceptInvitation(token, name, password);
    if (!userId) throw new Error(`Falha ao criar ${name}.`);
    people[key] = userId;
  }
  const fuelScope = (actorId: number) => ({ organizationId, locationId, actorId });
  async function cashScope(actorId: number) {
    const issued = await issueSession(actorId);
    const resolved = issued ? await resolveSession(issued.token) : null;
    if (!resolved) throw new Error("Falha ao criar sessão de demonstração.");
    return { organizationId, locationId, actorId, sessionId: resolved.session.id };
  }
  log("Equipe criada.");

  // Station structure -----------------------------------------------------------------------
  const manager = fuelScope(people.manager);
  // Prices and costs in cents per liter at the start of the history; both drift month to month.
  const products = [
    { code: "GC", name: "Gasolina comum", price: 609, cost: 541, capacity: 30_000, start: 24_000, daily: 3_200 },
    { code: "ET", name: "Etanol hidratado", price: 419, cost: 362, capacity: 20_000, start: 15_000, daily: 1_700 },
    { code: "S10", name: "Diesel S10", price: 589, cost: 523, capacity: 20_000, start: 14_000, daily: 1_800 },
  ];
  const prices = products.map((product) => product.price);
  const costs = products.map((product) => product.cost);
  const tanks: { id: number; productIndex: number; theoretical: bigint }[] = [];
  const productIds: number[] = [];
  for (const [index, product] of products.entries()) {
    const { id } = await createFuelProduct(manager, { code: product.code, name: product.name });
    productIds.push(id);
    const tank = await createFuelTank(manager, {
      productId: id,
      code: `T${index + 1}`,
      name: `Tanque ${index + 1} · ${product.name}`,
      capacityLiters: `${product.capacity}.000`,
    });
    tanks.push({ id: tank.id, productIndex: index, theoretical: 0n });
  }
  const pumps = [
    (await createFuelPump(manager, { code: "B1", name: "Bomba 1" })).id,
    (await createFuelPump(manager, { code: "B2", name: "Bomba 2" })).id,
  ];
  // [pump, product index, share of the product's daily volume]
  const layout: [number, number, number][] = [
    [0, 0, 0.5],
    [0, 1, 0.5],
    [1, 0, 0.5],
    [1, 1, 0.5],
    [1, 2, 1],
  ];
  const nozzles: { id: number; productIndex: number; tankIndex: number; share: number; counter: bigint }[] = [];
  for (const [index, [pumpIndex, productIndex, share]] of layout.entries()) {
    const { id } = await createFuelNozzle(manager, {
      pumpId: pumps[pumpIndex],
      tankId: tanks[productIndex].id,
      productId: productIds[productIndex],
      code: `${index + 1}`,
      name: `Bico ${index + 1}`,
    });
    nozzles.push({ id, productIndex, tankIndex: productIndex, share, counter: BigInt(int(150_000, 900_000)) * 1000n });
  }
  log("Pista cadastrada: 3 combustíveis, 3 tanques, 2 bombas, 5 bicos.");

  // Opening day: prices, first loads and meter baselines --------------------------------------
  const firstDay = shiftDate(today, -FUEL_DAYS);
  const start = at(firstDay, "05:00");
  for (const [index, product] of products.entries()) {
    await createFuelPrice(manager, {
      productId: productIds[index],
      price: money(prices[index]),
      effectiveAt: start.toISOString(),
    });
  }
  const suppliers = ["Distribuidora Rota Paulista (DEMO)", "Combustíveis Interior SP (DEMO)"];
  let documentNumber = 48_210;
  async function receive(tankIndex: number, quantity: number, when: Date) {
    const cost = Math.round(costs[tankIndex] * between(0.98, 1.02));
    await createFuelReceipt(manager, {
      productId: productIds[tankIndex],
      tankId: tanks[tankIndex].id,
      supplier: suppliers[tankIndex % 2],
      documentReference: `NF ${documentNumber++}`,
      quantityLiters: `${quantity}.000`,
      unitCostPerLiter: money(cost),
      receivedAt: when.toISOString(),
    });
    tanks[tankIndex].theoretical += BigInt(quantity) * 1000n;
  }
  for (const [index, product] of products.entries()) {
    await receive(index, product.start, addMinutes(start, 5 + index));
  }
  const attendant = fuelScope(people.attendant);
  for (const nozzle of nozzles) {
    await recordFuelBaseline(attendant, {
      nozzleId: nozzle.id,
      counterLiters: toLiters(nozzle.counter),
      measuredAt: addMinutes(start, 20).toISOString(),
    });
  }
  log(`Abertura da demonstração em ${firstDay}: preços, cargas iniciais e encerrantes.`);

  // Day by day -------------------------------------------------------------------------------
  let readings = 0;
  let priceChanges = 0;
  for (let day = 0; day <= FUEL_DAYS; day += 1) {
    const date = shiftDate(firstDay, day);
    const schedule = getScheduleForDate(date);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const season = SEASON[Number(date.slice(5, 7)) - 1];
    const growth = 0.94 + 0.06 * (day / FUEL_DAYS);
    const weekdayFactor = weekday === 5 ? 1.08 : weekday === 6 ? 1.05 : 1;

    // Weekly physical measurement on Mondays, before the station opens.
    if (weekday === 1 && day > 0) {
      for (const tank of tanks) {
        const differenceMilli = BigInt(int(-45, 12)) * 1000n;
        const measured = tank.theoretical + differenceMilli;
        await recordFuelTankMeasurement(attendant, {
          tankId: tank.id,
          expectedTheoreticalLiters: toLiters(tank.theoretical),
          measuredLiters: toLiters(measured),
          measuredAt: at(date, "05:40").toISOString(),
          reason:
            differenceMilli === 0n
              ? undefined
              : "Medição com régua antes da abertura; diferença registrada para análise (DEMO).",
        });
      }
    }

    for (const shift of schedule.shifts) {
      const end = at(date, shift.end);
      if (end.getTime() > now.getTime() - 60_000) continue;
      const dayFactor = (schedule.kind === "normal" ? 1 : 0.65) * season * growth * weekdayFactor;

      // Monthly repricing on the 1st. The change takes effect exactly at this shift-end reading,
      // which is the boundary of every nozzle, so no interval crosses two prices.
      if (day > 0 && date.endsWith("-01") && shift.id === "turno-1") {
        for (const index of products.keys()) {
          prices[index] = Math.round(prices[index] * between(0.985, 1.03));
          costs[index] = Math.round(prices[index] * between(0.865, 0.895));
          await createFuelPrice(manager, {
            productId: productIds[index],
            price: money(prices[index]),
            effectiveAt: end.toISOString(),
          });
          priceChanges += 1;
        }
      }
      for (const nozzle of nozzles) {
        const product = products[nozzle.productIndex];
        const liters = Math.max(0, product.daily * nozzle.share * 0.5 * dayFactor * between(0.85, 1.15));
        const milli = BigInt(Math.round(liters * 1000));
        const previous = nozzle.counter;
        nozzle.counter += milli;
        tanks[nozzle.tankIndex].theoretical -= milli;
        await recordFuelInterval(attendant, {
          nozzleId: nozzle.id,
          previousCounterLiters: toLiters(previous),
          finalCounterLiters: toLiters(nozzle.counter),
          measuredAt: end.toISOString(),
        });
        readings += 1;
      }
      // Refill a tank when it drops under 40% of its capacity, shortly after the shift.
      for (const [index, tank] of tanks.entries()) {
        const capacity = BigInt(products[index].capacity) * 1000n;
        if (tank.theoretical * 10n < capacity * 4n) {
          const room = Number((capacity - tank.theoretical) / 1000n);
          const load = Math.min(room - 500, index === 0 ? 15_000 : 10_000);
          if (load > 1_000) await receive(index, load, addMinutes(end, 20 + index));
        }
      }
    }
  }
  log(`${readings} leituras de bico e ${priceChanges} reajustes de preço registrados.`);

  // Cash: last CASH_DAYS days, every shift opened, moved and closed ---------------------------
  const cashier = await cashScope(people.cashier);
  const managerCash = await cashScope(people.manager);
  let turns = 0;
  let movementsTotal = 0;
  for (let day = CASH_DAYS; day >= 0; day -= 1) {
    const date = shiftDate(today, -day);
    for (const shift of getScheduleForDate(date).shifts) {
      const shiftStart = at(date, shift.start);
      const shiftEnd = at(date, shift.end);
      if (shiftStart.getTime() > now.getTime() - 5 * 60_000) continue;
      const current = shiftEnd.getTime() > now.getTime();
      let clock = addMinutes(shiftStart, 4);
      const tick = () => new Date(clock.getTime());

      const open = await cashOpenService(tick);
      const position = await open.position(cashier);
      const opened = await open.open(cashier, {
        intentId: randomUUID(),
        expectedRevision: position.revision,
        operationDate: position.operationDate,
        shiftId: shift.id,
        openingFloat: [20_000, 25_000, 30_000][int(0, 2)],
      });
      let revision = opened.revision;
      const openingId = opened.opening.id;

      const movements = await cashMovementService(tick);
      const span = (current ? now.getTime() - 10 * 60_000 : shiftEnd.getTime()) - clock.getTime();
      const count = current ? int(3, 6) : int(9, 14);
      let nsu = int(100_000, 800_000);
      let cashSoFar = opened.opening.openingFloat;
      for (let index = 0; index < count; index += 1) {
        clock = new Date(clock.getTime() + Math.max(60_000, span / (count + 2)));
        if (current && clock.getTime() > now.getTime() - 60_000) break;
        const roll = random();
        const method = roll < 0.25 ? "dinheiro" : roll < 0.6 ? "pix" : roll < 0.8 ? "debito" : "credito";
        const previousAccount = random() < 0.08;
        const amount = int(40, 320) * 100 + int(0, 99);
        const result = await movements.record(cashier, {
          intentId: randomUUID(),
          expectedRevision: revision,
          expectedActorId: cashier.actorId,
          openingId,
          operationDate: opened.opening.operationDate,
          shiftId: shift.id,
          type: "recebimento",
          paymentMethod: method,
          receiptNature: previousAccount ? "conta-anterior" : "venda",
          amount,
          description: previousAccount ? "Quitação de conta de cliente (DEMO)" : "Venda de combustível na pista (DEMO)",
          reference:
            method === "dinheiro" && !previousAccount
              ? ""
              : previousAccount
                ? `Nota ${int(1_000, 9_999)}`
                : `NSU ${nsu++}`,
          counterparty: "",
        });
        revision = result.revision;
        if (method === "dinheiro") cashSoFar += amount;
        movementsTotal += 1;
        // Mid-shift withdrawal to the safe once the drawer gets full.
        if (!current && index === Math.floor(count / 2) && cashSoFar > 60_000) {
          clock = addMinutes(clock, 3);
          const withdrawal = Math.min(cashSoFar - 20_000, 50_000);
          const result = await movements.record(managerCash, {
            intentId: randomUUID(),
            expectedRevision: revision,
            expectedActorId: managerCash.actorId,
            openingId,
            operationDate: opened.opening.operationDate,
            shiftId: shift.id,
            type: "sangria",
            paymentMethod: "dinheiro",
            receiptNature: null,
            amount: withdrawal,
            description: "Sangria para o cofre (DEMO)",
            reference: "",
            counterparty: "Cofre da gerência",
          });
          revision = result.revision;
          cashSoFar -= withdrawal;
          movementsTotal += 1;
        }
      }
      if (current) {
        log(`Turno atual (${shift.label}) deixado aberto para teste.`);
        turns += 1;
        continue;
      }

      // Close right after the shift ends and before the next one opens (only one active turn).
      clock = addMinutes(shiftEnd, 2);
      const snapshot = await movements.turnSnapshot(cashier);
      const summary = snapshot.summary;
      if (!summary) throw new Error("Resumo do turno indisponível.");
      const withDifference = random() < 0.18;
      const cashDifference = withDifference ? [-750, -1_000, -250, 300][int(0, 3)] : 0;
      const closer = random() < 0.3 ? managerCash : cashier;
      const closing = await cashClosingService(tick);
      await closing.close(closer, {
        intentId: randomUUID(),
        expectedRevision: revision,
        expectedActorId: closer.actorId,
        openingId,
        operationDate: opened.opening.operationDate,
        shiftId: shift.id,
        countedByMethod: {
          dinheiro: summary.cashExpected + cashDifference,
          pix: summary.receiptsByMethod.pix,
          debito: summary.receiptsByMethod.debito,
          credito: summary.receiptsByMethod.credito,
        },
        varianceReason: withDifference ? "Diferença na contagem de moedas; conferir com a fita do PDV (DEMO)." : "",
      });
      turns += 1;
    }
  }
  log(`${turns} turnos de caixa e ${movementsTotal} movimentos registrados.`);

  return { password, accounts: DEMO_ACCOUNTS };
}

/** Sets the public demo password on every demo account (DEMO_MODE only). */
export async function resetDemoPasswords() {
  if (process.env.DEMO_MODE !== "true") {
    throw new Error("demo-password só roda com DEMO_MODE=true (ambiente de demonstração).");
  }
  const db = await getDb();
  if (!db) throw new Error("SERVICE_UNAVAILABLE");
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const [result] = await db
    .update(businessUsers)
    .set({ passwordHash })
    .where(like(businessUsers.email, `%@${DEMO_EMAIL_DOMAIN}`));
  return { password: DEMO_PASSWORD, updated: (result as { affectedRows?: number }).affectedRows ?? 0 };
}
