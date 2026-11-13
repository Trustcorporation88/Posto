import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Text, View } from "react-native";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import {
  Body,
  Button,
  C,
  Card,
  Chip,
  Empty,
  Field,
  F,
  Label,
  Notice,
  SectionTitle,
} from "@/components/sobra/ui";
import { GestaoShell, useMe } from "@/components/sobra/gestao/gestao-shell";
import { FuelFormSheet, type FuelFormKey } from "@/components/sobra/gestao/fuel-form-sheet";
import { formatCents, formatMilliLiters, litersToMilliLiters, signedLitersToMilliLiters } from "@/lib/business/fuel-domain";
import { trpc } from "@/lib/trpc";

type FuelConfiguration = inferRouterOutputs<AppRouter>["fuel"]["configuration"];
type FuelDashboard = inferRouterOutputs<AppRouter>["fuel"]["dashboard"];
type FuelValues = Record<string, string>;
type Choice = { value: string; label: string };

function partsForTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
}

function localDay(date: Date, timeZone: string) {
  const parts = partsForTimeZone(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDay(day: string, amount: number) {
  const [year, month, date] = day.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + amount));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function localDateTimeValue(timeZone: string) {
  const parts = partsForTimeZone(new Date(), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function localDateTimeToIso(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Use data e hora no formato AAAA-MM-DDTHH:mm.");
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const nominal = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(nominal);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  ) {
    throw new Error("Data ou hora inválida.");
  }
  const local = partsForTimeZone(new Date(nominal), timeZone);
  const localAtNominal = Date.UTC(
    Number(local.year),
    Number(local.month) - 1,
    Number(local.day),
    Number(local.hour),
    Number(local.minute),
    Number(local.second),
  );
  return new Date(nominal - (localAtNominal - nominal)).toISOString();
}

function volumeLabel(value: string | null | undefined) {
  if (value === null || value === undefined) return "—";
  try {
    return `${formatMilliLiters(signedLitersToMilliLiters(value))} L`;
  } catch {
    return `${value} L`;
  }
}

function averageCentsPerLiter(totalCents: bigint, volumeMilliLiters: bigint) {
  const numerator = totalCents * 1_000n;
  const half = volumeMilliLiters / 2n;
  return numerator >= 0n
    ? (numerator + half) / volumeMilliLiters
    : (numerator - half) / volumeMilliLiters;
}

function dateLabel(value: Date | string, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function FilterChoices({
  label,
  value,
  choices,
  onSelect,
}: {
  label: string;
  value: string;
  choices: Choice[];
  onSelect: (value: string) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Label>{label}</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {[{ value: "", label: "Todos" }, ...choices].map((choice) => (
          <Chip
            key={choice.value || "all"}
            selected={choice.value === value}
            onPress={() => onSelect(choice.value)}
          >
            {choice.label}
          </Chip>
        ))}
      </View>
    </View>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 190, minWidth: 150, padding: 16, borderRadius: 16, backgroundColor: C.light, gap: 7 }}>
      <Label>{label}</Label>
      <Text style={{ color: C.ink, fontFamily: F.heading, fontSize: 21 }}>{value}</Text>
      <Body size={11}>{hint}</Body>
    </View>
  );
}

function HistoryRow({ title, detail, value }: { title: string; detail: string; value?: string }) {
  return (
    <View style={{ borderTopWidth: 1, borderColor: C.line, paddingTop: 13, gap: 5 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <Text style={{ flex: 1, color: C.ink, fontFamily: F.bold, fontSize: 13 }}>{title}</Text>
        {value ? <Text style={{ color: C.green, fontFamily: F.bold, fontSize: 13 }}>{value}</Text> : null}
      </View>
      <Body size={11}>{detail}</Body>
    </View>
  );
}

function confirmation(message: string, action: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(message)) action();
    return;
  }
  Alert.alert("Confirmar alteração", message, [
    { text: "Cancelar", style: "cancel" },
    { text: "Confirmar", style: "destructive", onPress: action },
  ]);
}

function parseId(values: FuelValues, key: string) {
  const value = Number(values[key]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Selecione uma opção válida antes de continuar.");
  }
  return value;
}

function entityName(
  entities: { id: number; name: string; code: string }[],
  id: number,
) {
  const entity = entities.find((item) => item.id === id);
  return entity ? `${entity.name} · ${entity.code}` : "Cadastro não encontrado";
}

export function FuelManagementScreen() {
  const profile = useMe();
  const role = profile.data?.role ?? "";
  const canRead = ["owner", "manager", "attendant", "finance_viewer"].includes(role);
  const canOperate = ["owner", "manager", "attendant"].includes(role);
  const isManager = role === "owner" || role === "manager";
  const timeZone = profile.data?.location?.timezone ?? "America/Sao_Paulo";
  const today = useMemo(() => localDay(new Date(), timeZone), [timeZone]);
  const [fromDate, setFromDate] = useState(() => shiftDay(today, -29));
  const [toDate, setToDate] = useState(today);
  const [productFilter, setProductFilter] = useState("");
  const [tankFilter, setTankFilter] = useState("");
  const [pumpFilter, setPumpFilter] = useState("");
  const [form, setForm] = useState<FuelFormKey | null>(null);
  const [values, setValues] = useState<FuelValues>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [catalogKind, setCatalogKind] = useState<"product" | "tank" | "pump" | "nozzle">("product");

  const configuration = trpc.fuel.configuration.useQuery(undefined, {
    enabled: canRead,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const queryInput = {
    fromDate,
    toDate,
    ...(productFilter ? { productId: Number(productFilter) } : {}),
    ...(tankFilter ? { tankId: Number(tankFilter) } : {}),
    ...(pumpFilter ? { pumpId: Number(pumpFilter) } : {}),
  };
  const dashboard = trpc.fuel.dashboard.useQuery(queryInput, {
    enabled: canRead && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) && /^\d{4}-\d{2}-\d{2}$/.test(toDate),
    retry: false,
    refetchOnWindowFocus: true,
  });
  const refresh = () => {
    void configuration.refetch();
    void dashboard.refetch();
  };
  const saved = (result: unknown) => {
    const hasCapacityWarning = Boolean(
      result && typeof result === "object" && "capacityWarning" in result &&
        (result as { capacityWarning?: boolean }).capacityWarning,
    );
    setForm(null);
    setError("");
    setNotice(
      hasCapacityWarning
        ? "Registro salvo e auditado. O saldo teórico supera a capacidade informada para o tanque, confira os dados."
        : "Registro salvo e auditado na unidade.",
    );
    refresh();
  };
  const failed = (failure: { message: string }) => {
    setError(failure.message || "Não foi possível registrar. Revise os campos e tente novamente.");
    refresh();
  };

  const createProduct = trpc.fuel.createProduct.useMutation({ onSuccess: saved, onError: failed });
  const createTank = trpc.fuel.createTank.useMutation({ onSuccess: saved, onError: failed });
  const createPump = trpc.fuel.createPump.useMutation({ onSuccess: saved, onError: failed });
  const createNozzle = trpc.fuel.createNozzle.useMutation({ onSuccess: saved, onError: failed });
  const createPrice = trpc.fuel.createPrice.useMutation({ onSuccess: saved, onError: failed });
  const createReceipt = trpc.fuel.createReceipt.useMutation({ onSuccess: saved, onError: failed });
  const recordBaseline = trpc.fuel.recordBaseline.useMutation({ onSuccess: saved, onError: failed });
  const recordInterval = trpc.fuel.recordInterval.useMutation({ onSuccess: saved, onError: failed });
  const resetMeter = trpc.fuel.resetMeter.useMutation({ onSuccess: saved, onError: failed });
  const recordMeasurement = trpc.fuel.recordTankMeasurement.useMutation({ onSuccess: saved, onError: failed });
  const createAdjustment = trpc.fuel.createAdjustment.useMutation({ onSuccess: saved, onError: failed });
  const setProductActive = trpc.fuel.setProductActive.useMutation({ onSuccess: saved, onError: failed });
  const setTankActive = trpc.fuel.setTankActive.useMutation({ onSuccess: saved, onError: failed });
  const setPumpActive = trpc.fuel.setPumpActive.useMutation({ onSuccess: saved, onError: failed });
  const setNozzleActive = trpc.fuel.setNozzleActive.useMutation({ onSuccess: saved, onError: failed });
  const isPending = [
    createProduct, createTank, createPump, createNozzle, createPrice, createReceipt,
    recordBaseline, recordInterval, resetMeter, recordMeasurement, createAdjustment,
    setProductActive, setTankActive, setPumpActive, setNozzleActive,
  ].some((mutation) => mutation.isPending);

  const config = configuration.data as FuelConfiguration | undefined;
  const data = dashboard.data as FuelDashboard | undefined;
  const activeProducts = (config?.products ?? []).filter((item) => item.active);
  const activeTanks = (config?.tanks ?? []).filter((item) => item.active);
  const activePumps = (config?.pumps ?? []).filter((item) => item.active);
  const activeNozzles = (config?.nozzles ?? []).filter((item) => item.active);
  const tankNames = config?.tanks ?? [];
  const productNames = config?.products ?? [];
  const pumpNames = config?.pumps ?? [];
  const nozzleNames = config?.nozzles ?? [];
  const readingsByNozzle = new Map((config?.lastReadings ?? []).map((reading) => [reading.nozzleId, reading]));
  const productChoices = activeProducts.map((item) => ({ value: String(item.id), label: `${item.name} · ${item.code}` }));
  const tankChoices = activeTanks.map((item) => ({ value: String(item.id), label: `${item.name} · ${item.code}` }));
  const pumpChoices = activePumps.map((item) => ({ value: String(item.id), label: `${item.name} · ${item.code}` }));
  const priceByProduct = new Map((config?.latestPriceByProduct ?? []).map((entry) => [entry.productId, entry.price]));

  function openForm(nextForm: FuelFormKey, preferredId?: number) {
    const dateNow = localDateTimeValue(timeZone);
    const firstProductId = activeProducts[0]?.id ? String(activeProducts[0].id) : "";
    const firstTank = activeTanks.find((item) => !firstProductId || item.productId === Number(firstProductId));
    const firstNozzle = activeNozzles.find((item) => !preferredId || item.id === preferredId) ?? activeNozzles[0];
    const firstPump = activePumps[0];
    setValues({
      code: "",
      name: "",
      productId: firstProductId,
      tankId: String(firstTank?.id ?? ""),
      pumpId: String(firstPump?.id ?? ""),
      nozzleId: String(firstNozzle?.id ?? ""),
      capacityLiters: "",
      price: "",
      effectiveAt: dateNow,
      supplier: "",
      documentReference: "",
      quantityLiters: "",
      unitCostPerLiter: "",
      receivedAt: dateNow,
      counterLiters: "",
      finalCounterLiters: "",
      measuredAt: dateNow,
      measuredLiters: "",
      reason: "",
      direction: "add",
      recordedAt: dateNow,
    });
    setError("");
    setForm(nextForm);
  }

  function changeValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function submit() {
    if (!form) return;
    setError("");
    try {
      switch (form) {
        case "product":
          createProduct.mutate({ code: values.code ?? "", name: values.name ?? "" });
          break;
        case "tank":
          createTank.mutate({
            productId: parseId(values, "productId"),
            code: values.code ?? "",
            name: values.name ?? "",
            capacityLiters: values.capacityLiters?.trim() || null,
          });
          break;
        case "pump":
          createPump.mutate({ code: values.code ?? "", name: values.name ?? "" });
          break;
        case "nozzle":
          createNozzle.mutate({
            pumpId: parseId(values, "pumpId"),
            tankId: parseId(values, "tankId"),
            productId: parseId(values, "productId"),
            code: values.code ?? "",
            name: values.name ?? "",
          });
          break;
        case "price":
          createPrice.mutate({
            productId: parseId(values, "productId"),
            price: values.price ?? "",
            effectiveAt: localDateTimeToIso(values.effectiveAt ?? "", timeZone),
          });
          break;
        case "receipt":
          createReceipt.mutate({
            productId: parseId(values, "productId"),
            tankId: parseId(values, "tankId"),
            supplier: values.supplier ?? "",
            documentReference: values.documentReference?.trim() || null,
            quantityLiters: values.quantityLiters ?? "",
            unitCostPerLiter: values.unitCostPerLiter ?? "",
            receivedAt: localDateTimeToIso(values.receivedAt ?? "", timeZone),
          });
          break;
        case "baseline":
          recordBaseline.mutate({
            nozzleId: parseId(values, "nozzleId"),
            counterLiters: values.counterLiters ?? "",
            measuredAt: localDateTimeToIso(values.measuredAt ?? "", timeZone),
          });
          break;
        case "interval": {
          const nozzleId = parseId(values, "nozzleId");
          const previousReading = readingsByNozzle.get(nozzleId);
          if (!previousReading) throw new Error("Registre o encerrante inicial deste bico antes do intervalo.");
          recordInterval.mutate({
            nozzleId,
            previousCounterLiters: previousReading.counterLiters,
            finalCounterLiters: values.finalCounterLiters ?? "",
            measuredAt: localDateTimeToIso(values.measuredAt ?? "", timeZone),
          });
          break;
        }
        case "reset":
          resetMeter.mutate({
            nozzleId: parseId(values, "nozzleId"),
            counterLiters: values.counterLiters ?? "",
            measuredAt: localDateTimeToIso(values.measuredAt ?? "", timeZone),
            reason: values.reason ?? "",
          });
          break;
        case "measurement": {
          const tankId = parseId(values, "tankId");
          const selectedTank = config?.tanks.find((tank) => tank.id === tankId);
          if (!selectedTank) {
            throw new Error("Atualize os dados da pista antes de conferir a medição.");
          }
          recordMeasurement.mutate({
            tankId,
            expectedTheoreticalLiters: selectedTank.theoreticalLiters,
            measuredLiters: values.measuredLiters ?? "",
            measuredAt: localDateTimeToIso(values.measuredAt ?? "", timeZone),
            ...(values.reason?.trim() ? { reason: values.reason.trim() } : {}),
          });
          break;
        }
        case "adjustment":
          createAdjustment.mutate({
            tankId: parseId(values, "tankId"),
            direction: values.direction === "remove" ? "remove" : "add",
            quantityLiters: values.quantityLiters ?? "",
            unitCostPerLiter: values.direction === "remove" || !values.unitCostPerLiter?.trim() ? null : values.unitCostPerLiter,
            reason: values.reason ?? "",
            recordedAt: localDateTimeToIso(values.recordedAt ?? "", timeZone),
          });
          break;
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Revise os campos antes de continuar.");
    }
  }

  function toggleActive(kind: "product" | "tank" | "pump" | "nozzle", id: number, name: string, active: boolean) {
    const action = () => {
      setError("");
      if (kind === "product") setProductActive.mutate({ productId: id, active: !active });
      if (kind === "tank") setTankActive.mutate({ tankId: id, active: !active });
      if (kind === "pump") setPumpActive.mutate({ pumpId: id, active: !active });
      if (kind === "nozzle") setNozzleActive.mutate({ nozzleId: id, active: !active });
    };
    confirmation(`${active ? "Desativar" : "Reativar"} ${name}? O histórico existente será preservado.`, action);
  }

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(fromDate) && /^\d{4}-\d{2}-\d{2}$/.test(toDate);
  const reportError = configuration.error || dashboard.error;
  const mutationLoading = isPending;
  const productMap = new Map((config?.products ?? []).map((item) => [item.id, item]));
  const tankMap = new Map((config?.tanks ?? []).map((item) => [item.id, item]));
  const pumpMap = new Map((config?.pumps ?? []).map((item) => [item.id, item]));
  const intervalCount = data?.products.reduce((sum, item) => sum + item.readingCount, 0) ?? 0;

  const catalogLists: Record<typeof catalogKind, { id: number; name: string; code: string; active: boolean; detail: string }[]> = {
    product: (config?.products ?? []).map((item) => ({ ...item, detail: `Estoque teórico: ${volumeLabel(config?.costStates.find((state) => state.productId === item.id)?.quantityLiters)}` })),
    tank: (config?.tanks ?? []).map((item) => ({ ...item, detail: `${productMap.get(item.productId)?.name ?? "Combustível"} · capacidade ${item.capacityLiters ? volumeLabel(item.capacityLiters) : "não informada"}` })),
    pump: (config?.pumps ?? []).map((item) => ({ ...item, detail: `${(config?.nozzles ?? []).filter((nozzle) => nozzle.pumpId === item.id && nozzle.active).length} bicos ativos` })),
    nozzle: (config?.nozzles ?? []).map((item) => ({ ...item, detail: `${pumpMap.get(item.pumpId)?.name ?? "Bomba"} · ${tankMap.get(item.tankId)?.name ?? "Tanque"} · ${productMap.get(item.productId)?.name ?? "Combustível"}` })),
  };
  const catalogTitle = {
    product: "Combustíveis",
    tank: "Tanques",
    pump: "Bombas",
    nozzle: "Bicos",
  }[catalogKind];
  const catalogForm: Record<typeof catalogKind, FuelFormKey> = {
    product: "product",
    tank: "tank",
    pump: "pump",
    nozzle: "nozzle",
  };

  if (!canRead && profile.data) {
    return (
      <GestaoShell title="Combustíveis" subtitle="Operação de pista e estoque do posto.">
        <Notice warning>Seu papel não permite consultar o módulo de combustíveis.</Notice>
      </GestaoShell>
    );
  }

  return (
    <GestaoShell title="Combustíveis" subtitle="Pista, estoque teórico, medições e margem operacional estimada.">
      {notice ? <Notice>{notice}</Notice> : null}
      {!dateValid ? <Notice warning>Informe as datas no formato AAAA-MM-DD. A consulta não foi enviada.</Notice> : null}
      {reportError ? (
        <Notice warning>
          Não foi possível carregar os dados da unidade. Verifique sua sessão e tente atualizar. A tela não substituiu falhas por dados de demonstração.
        </Notice>
      ) : null}
      {configuration.isLoading || (canRead && dashboard.isLoading) ? (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <ActivityIndicator color={C.green} />
          <Body>Carregando registros reais da unidade…</Body>
        </Card>
      ) : null}

      {canRead ? (
        <>
          <Card style={{ gap: 18 }}>
            <SectionTitle title="Período e filtros" eyebrow="CONSULTA OPERACIONAL" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <View style={{ flexGrow: 1, flexBasis: 190 }}>
                <Field label="De (AAAA-MM-DD)" value={fromDate} onChangeText={setFromDate} autoCapitalize="none" />
              </View>
              <View style={{ flexGrow: 1, flexBasis: 190 }}>
                <Field label="Até (AAAA-MM-DD)" value={toDate} onChangeText={setToDate} autoCapitalize="none" />
              </View>
            </View>
            <FilterChoices label="Combustível" value={productFilter} choices={productChoices} onSelect={setProductFilter} />
            <FilterChoices label="Tanque" value={tankFilter} choices={tankChoices} onSelect={setTankFilter} />
            <FilterChoices label="Bomba" value={pumpFilter} choices={pumpChoices} onSelect={setPumpFilter} />
            <Button variant="secondary" icon="refresh-cw" onPress={refresh}>Atualizar dados</Button>
          </Card>

          {data ? (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                <Stat
                  label="VOLUME APURADO"
                  value={volumeLabel(formatMilliLiters(data.products.reduce((sum, item) => sum + litersToMilliLiters(item.quantityLiters, true), 0n)))}
                  hint="Diferença entre encerrantes no período filtrado."
                />
                <Stat
                  label="VENDA ESTIMADA"
                  value={intervalCount ? formatCents(data.totalRevenueCents) : "Sem vendas"}
                  hint={intervalCount ? `${intervalCount} intervalos com preço vigente aplicado.` : "Nenhuma leitura de venda no período selecionado."}
                />
                <Stat
                  label="MARGEM OPERACIONAL"
                  value={!intervalCount ? "Sem vendas" : data.totalMarginCents === null ? "Indisponível" : formatCents(data.totalMarginCents)}
                  hint={!intervalCount ? "Ainda não há margem a apurar no período." : data.totalMarginCents === null ? "Algum volume está sem base de custo conhecida." : "Margem estimada, não é lucro contábil."}
                />
                <Stat
                  label="PENDÊNCIAS DE MEDIÇÃO"
                  value={String(data.pendingTankDifferences)}
                  hint="Última medição dos tanques filtrados; fora do período. A diferença compara teórico e físico no instante registrado."
                />
              </View>

              <Card style={{ gap: 15 }}>
                <SectionTitle title="Vendas estimadas por combustível" eyebrow="LEITURAS DE BICO" />
                {data.products.length ? data.products.map((item) => {
                  const product = productMap.get(item.productId);
                  const volumeMilliLiters = litersToMilliLiters(item.quantityLiters, true);
                  const averageMargin = item.marginCents !== null && volumeMilliLiters > 0n
                    ? formatCents(averageCentsPerLiter(item.marginCents, volumeMilliLiters))
                    : null;
                  return (
                    <View key={item.productId} style={{ borderTopWidth: 1, borderColor: C.line, paddingTop: 15, gap: 7 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                        <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 15 }}>{item.productName}{product ? ` · ${product.code}` : ""}</Text>
                        <Text style={{ color: C.green, fontFamily: F.bold }}>{volumeLabel(item.quantityLiters)}</Text>
                      </View>
                      <Body>
                        {item.readingCount === 0 ? "Sem leituras de venda no período" : `Venda ${formatCents(item.revenueCents)}`} · Preço vigente {item.currentPriceCentsPerLiter === null ? "não cadastrado" : `${formatCents(item.currentPriceCentsPerLiter)}/L`}
                      </Body>
                      <Body>
                        {item.readingCount === 0 ? "Margem não apurada neste período" : `Margem no período ${item.marginCents === null ? "indisponível por falta de custo conhecido" : `${formatCents(item.marginCents)}${averageMargin ? ` · ${averageMargin}/L` : ""}`}`}
                      </Body>
                      <Body>
                        Estoque teórico do produto {volumeLabel(item.currentStockLiters)} · custo médio atual {item.currentAverageCostCentsPerLiter === null ? "desconhecido" : `${formatCents(item.currentAverageCostCentsPerLiter)}/L`}
                      </Body>
                    </View>
                  );
                }) : <Empty title="Nenhum combustível ativo" text="Cadastre o combustível real da unidade para começar. Não há produtos fictícios." />}
                {data.products.some((item) => item.marginCents === null) ? (
                  <Notice warning>Há saídas sem base de custo conhecida. A margem correspondente permanece indisponível, sem custo presumido.</Notice>
                ) : null}
              </Card>

              <Card style={{ gap: 14 }}>
                <SectionTitle title="Histórico de preços" eyebrow="VIGÊNCIAS REGISTRADAS" />
                {config?.prices.length ? config.prices.slice(0, 12).map((price) => (
                  <HistoryRow
                    key={price.id}
                    title={`${entityName(productNames, price.productId)} · ${formatCents(price.priceCentsPerLiter)}/L`}
                    detail={`Vigência em ${dateLabel(price.effectiveAt, timeZone)} · cadastrado por ${price.authorName}`}
                  />
                )) : <Body>Nenhum preço registrado. Margem de venda ficará indisponível até cadastrar um preço com vigência compatível.</Body>}
              </Card>

              <Card style={{ gap: 15 }}>
                <SectionTitle title="Posição atual e última medição" eyebrow="FOTOGRAFIA ATUAL" />
                <Body>O período filtra vendas e movimentos históricos. O saldo teórico é atual, e a última medição mostra a comparação registrada naquele horário. Combustível, tanque e bomba restringem os tanques exibidos.</Body>
                {data.tanks.length ? data.tanks.map((tank) => {
                  const latest = tank.latestMeasurement;
                  const product = productMap.get(tank.productId);
                  return (
                    <View key={tank.id} style={{ borderTopWidth: 1, borderColor: C.line, paddingTop: 14, gap: 6 }}>
                      <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 14 }}>{tank.name} · {tank.code}</Text>
                      <Body>{product?.name ?? "Combustível"} · estoque teórico atual {volumeLabel(tank.theoreticalLiters)}{tank.capacityLiters ? ` · capacidade ${volumeLabel(tank.capacityLiters)}` : " · capacidade não informada"}</Body>
                      {latest ? (
                        <>
                          <Body>Às {dateLabel(latest.measuredAt, timeZone)} · teórico na medição {volumeLabel(latest.theoreticalLiters)} · físico {volumeLabel(latest.measuredLiters)} · diferença física − teórica {volumeLabel(latest.varianceLiters)}</Body>
                          <Body>Registrada por {latest.authorName} · {latest.status === "pending" ? "Diferença pendente de investigação" : "Sem diferença nesta medição"}{latest.reason ? ` · ${latest.reason}` : ""}</Body>
                        </>
                      ) : <Body>Nenhuma medição física registrada.</Body>}
                    </View>
                  );
                }) : <Empty title="Nenhum tanque relacionado aos filtros" text="Revise os filtros de combustível, tanque ou bomba, ou cadastre os tanques reais da unidade." />}
              </Card>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
                <Card style={{ flexGrow: 1, flexBasis: 320, gap: 14 }}>
                  <SectionTitle title="Recebimentos recentes" eyebrow="ENTRADAS DE ESTOQUE" />
                  {data.receipts.length ? data.receipts.map((receipt) => (
                    <HistoryRow
                      key={receipt.id}
                      title={`${entityName(productNames, receipt.productId)} · ${volumeLabel(receipt.quantityLiters)}`}
                      detail={`${receipt.supplier}${receipt.documentReference ? ` · ${receipt.documentReference}` : ""} · ${dateLabel(receipt.receivedAt, timeZone)} · lançado por ${receipt.authorName}`}
                      value={formatCents(receipt.totalCostCents)}
                    />
                  )) : <Body>Nenhum recebimento no período selecionado.</Body>}
                </Card>
                <Card style={{ flexGrow: 1, flexBasis: 320, gap: 14 }}>
                  <SectionTitle title="Leituras recentes" eyebrow="ENCERRANTES" />
                  {data.recentReadings.length ? data.recentReadings.map((reading) => (
                    <HistoryRow
                      key={reading.id}
                      title={`${entityName(nozzleNames, reading.nozzleId)} · ${reading.kind === "baseline" ? "Encerrante inicial" : reading.kind === "reset" ? "Troca/reset autorizado" : `Venda estimada ${volumeLabel(reading.quantityLiters)}`}`}
                      detail={`${dateLabel(reading.measuredAt, timeZone)} · por ${reading.authorName} · ${entityName(pumpNames, reading.pumpId)}${reading.priceCentsPerLiter === null ? "" : ` · preço ${formatCents(reading.priceCentsPerLiter)}/L`}${reading.previousCounterLiters === null ? "" : ` · anterior ${volumeLabel(reading.previousCounterLiters)}`} · encerrante ${volumeLabel(reading.counterLiters)}`}
                      value={reading.revenueCents === null ? "—" : formatCents(reading.revenueCents)}
                    />
                  )) : <Body>Nenhuma leitura ou alteração de medidor no período selecionado.</Body>}
                </Card>
              </View>

              {data.adjustments.length ? (
                <Card style={{ gap: 13 }}>
                  <SectionTitle title="Ajustes autorizados recentes" eyebrow="TRILHA DE ESTOQUE" />
                  {data.adjustments.map((adjustment) => (
                    <HistoryRow
                      key={adjustment.id}
                      title={`${adjustment.direction === "add" ? "Entrada" : "Retirada"} · ${entityName(tankNames, adjustment.tankId)} · ${volumeLabel(adjustment.quantityLiters)}`}
                      detail={`${adjustment.reason} · ${dateLabel(adjustment.recordedAt, timeZone)} · autorizado por ${adjustment.authorName}`}
                    />
                  ))}
                </Card>
              ) : null}
            </>
          ) : !dashboard.isLoading && !reportError ? (
            <Empty title="Nenhum dado operacional carregado" text="Cadastros e registros começam vazios. As métricas aparecerão depois que a equipe registrar operações reais." />
          ) : null}

          {isManager ? (
            <Card style={{ gap: 16 }}>
              <SectionTitle title="Estrutura da pista" eyebrow="CADASTROS DA UNIDADE" />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                {([
                  ["product", "Combustíveis"],
                  ["tank", "Tanques"],
                  ["pump", "Bombas"],
                  ["nozzle", "Bicos"],
                ] as const).map(([kind, label]) => (
                  <Chip key={kind} selected={catalogKind === kind} onPress={() => setCatalogKind(kind)}>{label}</Chip>
                ))}
              </View>
              <Button compact onPress={() => openForm(catalogForm[catalogKind])}>{`Adicionar ${catalogKind === "product" ? "combustível" : catalogTitle.slice(0, -1).toLocaleLowerCase("pt-BR")}`}</Button>
              {catalogLists[catalogKind].length ? catalogLists[catalogKind].map((item) => (
                <View key={item.id} style={{ borderTopWidth: 1, borderColor: C.line, paddingTop: 12, gap: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ color: C.ink, fontFamily: F.bold }}>{item.name} · {item.code}</Text>
                      <Body size={11}>{item.detail}</Body>
                    </View>
                    <Text style={{ color: item.active ? C.green : C.orange, fontFamily: F.bold, fontSize: 11 }}>{item.active ? "Ativo" : "Inativo"}</Text>
                  </View>
                  <Button
                    compact
                    variant={item.active ? "secondary" : "ghost"}
                    disabled={mutationLoading}
                    onPress={() => toggleActive(catalogKind, item.id, item.name, item.active)}
                  >
                    {item.active ? "Desativar sem apagar histórico" : "Reativar cadastro"}
                  </Button>
                </View>
              )) : <Body>Nenhum cadastro nesta categoria.</Body>}
              <Notice>Cadastros desativados preservam referências históricas. Para corrigir um código ou nome, mantenha o identificador e solicite ajuste administrativo do cadastro.</Notice>
            </Card>
          ) : null}

          {canOperate ? (
            <Card style={{ gap: 16 }}>
              <SectionTitle title="Registrar operação" eyebrow="AÇÕES DA PISTA" />
              <Body>Os formulários respeitam o papel da pessoa. Leituras e medições são permitidas ao frentista; cadastro, preço, custo, recebimento, reset e ajuste exigem proprietário ou gerente.</Body>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
                {isManager ? (
                  <>
                    <Button compact variant="secondary" onPress={() => openForm("price")}>Registrar preço</Button>
                    <Button compact variant="secondary" onPress={() => openForm("receipt")}>Receber combustível</Button>
                    <Button compact variant="secondary" onPress={() => openForm("adjustment")}>Ajustar estoque</Button>
                    {activeNozzles.some((nozzle) => readingsByNozzle.has(nozzle.id)) ? (
                      <Button compact variant="secondary" onPress={() => openForm("reset")}>Troca/reset de medidor</Button>
                    ) : null}
                  </>
                ) : null}
                {activeNozzles.some((nozzle) => !readingsByNozzle.has(nozzle.id)) ? (
                  <Button compact onPress={() => openForm("baseline")}>Registrar encerrante inicial</Button>
                ) : null}
                {activeNozzles.some((nozzle) => readingsByNozzle.has(nozzle.id)) ? (
                  <Button compact onPress={() => openForm("interval")}>Registrar leitura de pista</Button>
                ) : null}
                {activeTanks.length ? (
                  <Button compact variant="secondary" onPress={() => openForm("measurement")}>Medir tanque fisicamente</Button>
                ) : null}
              </View>
              {isManager && activeProducts.length && activeTanks.length && activePumps.length && activeNozzles.length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <Button compact variant="ghost" onPress={() => openForm("price")}>{`Preço vigente ${priceByProduct.size}/${activeProducts.length}`}</Button>
                </View>
              ) : null}
              {!activeNozzles.length ? <Notice>Cadastre primeiro combustível, tanque, bomba e bico. Nenhuma venda será criada automaticamente.</Notice> : null}
            </Card>
          ) : null}
        </>
      ) : null}

      <FuelFormSheet
        key={`${form ?? "closed"}:${error ? "error" : "ready"}`}
        visible={Boolean(form)}
        form={form}
        values={values}
        configuration={config}
        timeZone={timeZone}
        loading={isPending}
        error={error}
        onChange={changeValue}
        onClose={() => { setForm(null); setError(""); }}
        onSubmit={submit}
      />
    </GestaoShell>
  );
}
