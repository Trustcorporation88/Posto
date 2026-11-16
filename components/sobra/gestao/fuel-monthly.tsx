import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { Body, C, Card, F, Label, Notice, SectionTitle } from "@/components/sobra/ui";
import { BarChart, Metric, SERIES_COLORS, StackedBarChart } from "@/components/sobra/gestao/dashboard-charts";
import { formatCents, formatMilliLiters } from "@/lib/business/fuel-domain";
import { litersToMilli, milliToLiters } from "@/lib/business/dashboard";
import { coverageDays, percentChange } from "@/lib/business/fuel-analytics";
import { trpc } from "@/lib/trpc";

type Monthly = inferRouterOutputs<AppRouter>["dashboard"]["fuelMonthly"];

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthShort = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]}/${month.slice(2, 4)}`;
const monthLong = (month: string) => MONTHS_LONG[Number(month.slice(5, 7)) - 1];

/** Whole liters for monthly aggregates (exact value rounded only for display). */
function liters(value: string | null) {
  if (value === null) return "—";
  const milli = litersToMilli(value);
  return `${formatMilliLiters(((milli + 500n) / 1000n) * 1000n)} L`;
}
const litersNumber = (value: string) => Number(litersToMilli(value)) / 1000;
const cents = (value: bigint | null) => (value === null ? "—" : formatCents(value));
function perLiter(totalCents: bigint, totalLiters: string) {
  const milli = litersToMilli(totalLiters);
  return milli > 0n ? `${formatCents((totalCents * 1000n) / milli)}/L` : "—";
}
function delta(value: number | null) {
  if (value === null) return "sem base de comparação";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
const deltaTone = (value: number | null) => (value === null ? C.muted : value >= 0 ? C.green : C.orange);

export function FuelMonthly() {
  const query = trpc.dashboard.fuelMonthly.useQuery(undefined, { refetchInterval: 120_000 });
  if (query.isLoading) {
    return (
      <Card style={{ alignItems: "center", gap: 10 }}>
        <ActivityIndicator color={C.green} />
        <Body>Calculando o mês e a projeção…</Body>
      </Card>
    );
  }
  if (query.error || !query.data) {
    return <Notice warning>Não foi possível carregar a análise mensal da pista.</Notice>;
  }
  const data = query.data;
  if (data.products.length === 0) return null;
  return (
    <View style={{ gap: 24 }}>
      <MonthToDate data={data} />
      <Projection data={data} />
      <TwelveMonths data={data} />
      <DailyOfMonth data={data} />
      <Coverage data={data} />
    </View>
  );
}

function MonthToDate({ data }: { data: Monthly }) {
  const { current } = data;
  const day = Number(data.today.slice(8, 10));
  const litersChange = percentChange(litersToMilli(current.completed.liters), litersToMilli(current.previousSamePeriod.liters));
  const revenueChange = percentChange(current.completed.revenueCents, current.previousSamePeriod.revenueCents);
  const dailyAverage =
    current.completedDays > 0
      ? `${formatMilliLiters(((litersToMilli(current.completed.liters) / BigInt(current.completedDays) + 500n) / 1000n) * 1000n)} L/dia`
      : "—";
  const comparison = `vs ${current.completedDays} primeiros dias de ${monthLong(current.previousSamePeriod.month)}`;
  return (
    <View style={{ gap: 12 }}>
      <SectionTitle title={`Mês de ${monthLong(current.month)}`} eyebrow={`DIA ${day} DE ${current.daysInMonth} · ${current.completedDays} DIAS FECHADOS`} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Metric label="Galonagem no mês" value={liters(current.liters)} detail={`${delta(litersChange)} ${comparison}`} />
        <Metric label="Faturamento estimado" value={cents(current.revenueCents)} detail={`${delta(revenueChange)} ${comparison}`} />
        <Metric
          label="Margem estimada"
          value={cents(current.marginCents)}
          detail={current.marginCents === null ? "Falta custo de compra em alguma venda" : `${perLiter(current.marginCents, current.liters)} de margem`}
        />
        <Metric label="Preço médio" value={perLiter(current.revenueCents, current.liters)} detail="Faturamento ÷ litros do mês" />
        <Metric label="Média diária" value={dailyAverage} detail="Dias fechados do mês" />
      </View>
    </View>
  );
}

function Projection({ data }: { data: Monthly }) {
  const { current, average12 } = data;
  const names = new Map(data.products.map((product) => [product.productId, product.productName]));
  if (current.projectedLiters === null || current.projectedRevenueCents === null) {
    return (
      <Notice>A projeção de fechamento aparece a partir do 2º dia do mês, quando há ao menos um dia fechado.</Notice>
    );
  }
  const vsAverageLiters = average12 ? percentChange(litersToMilli(current.projectedLiters), litersToMilli(average12.liters)) : null;
  const vsAverageRevenue = average12 ? percentChange(current.projectedRevenueCents, average12.revenueCents) : null;
  return (
    <Card style={{ gap: 16, borderWidth: 2, borderColor: C.lime }}>
      <View style={{ gap: 4 }}>
        <Label>SIMULAÇÃO DE FECHAMENTO DO MÊS</Label>
        <Text style={{ color: C.ink, fontFamily: F.heading, fontSize: 20 }}>
          Se o ritmo continuar, {monthLong(current.month)} fecha em {liters(current.projectedLiters)}
        </Text>
        <Body size={12}>
          Ritmo dos {current.completedDays} dias fechados × {current.daysInMonth} dias do mês.
          {average12
            ? ` Média mensal dos últimos 12 meses: ${liters(average12.liters)} e ${formatCents(average12.revenueCents)} (${average12.monthsWithData} ${average12.monthsWithData === 1 ? "mês" : "meses"} com dados).`
            : " Ainda não há meses fechados para comparar."}
        </Body>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Metric label="Galonagem projetada" value={liters(current.projectedLiters)} detail={`${delta(vsAverageLiters)} vs média 12 meses`} tone="good" />
        <Metric label="Faturamento projetado" value={formatCents(current.projectedRevenueCents)} detail={`${delta(vsAverageRevenue)} vs média 12 meses`} tone="good" />
        <Metric
          label="Margem projetada"
          value={cents(current.projectedMarginCents)}
          detail={current.projectedMarginCents === null ? "Indisponível sem custo conhecido" : "Pelo mesmo ritmo"}
        />
      </View>
      <View style={{ gap: 0, borderWidth: 1, borderColor: C.line, borderRadius: 12, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", backgroundColor: C.light, paddingVertical: 8, paddingHorizontal: 12 }}>
          {["Combustível", "Realizado", "Projeção", "Média 12 m", "vs média"].map((head, index) => (
            <Text
              key={head}
              style={{ flex: index === 0 ? 1.4 : 1, color: C.muted, fontFamily: F.bold, fontSize: 10, textAlign: index === 0 ? "left" : "right" }}
            >
              {head.toUpperCase()}
            </Text>
          ))}
        </View>
        {current.byProduct.map((product, index) => {
          const change =
            product.projectedLiters && product.average12Liters
              ? percentChange(litersToMilli(product.projectedLiters), litersToMilli(product.average12Liters))
              : null;
          return (
            <View
              key={product.productId}
              style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: C.line }}
            >
              <View style={{ flex: 1.4, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} />
                <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 13, flexShrink: 1 }}>{names.get(product.productId)}</Text>
              </View>
              <Cell>{liters(product.liters)}</Cell>
              <Cell bold>{liters(product.projectedLiters)}</Cell>
              <Cell>{liters(product.average12Liters)}</Cell>
              <Cell color={deltaTone(change)}>{delta(change)}</Cell>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function Cell({ children, bold, color }: { children: string; bold?: boolean; color?: string }) {
  return (
    <Text style={{ flex: 1, textAlign: "right", color: color ?? C.ink, fontFamily: bold ? F.bold : F.regular, fontSize: 12 }}>
      {children}
    </Text>
  );
}

function TwelveMonths({ data }: { data: Monthly }) {
  const names = data.products.map((product) => product.productName);
  const ids = data.products.map((product) => product.productId);
  const total = data.months.reduce(
    (sum, month) => ({ milli: sum.milli + litersToMilli(month.liters), revenue: sum.revenue + month.revenueCents }),
    { milli: 0n, revenue: 0n },
  );
  const currentByProduct = new Map(data.current.byProduct.map((product) => [product.productId, product.liters]));
  const points = [
    ...data.months.map((month) => ({
      key: month.month,
      label: monthShort(month.month),
      values: ids.map((id) => (month.byProduct[id] ? litersNumber(month.byProduct[id].liters) : 0)),
      display: liters(month.liters),
    })),
    {
      key: data.current.month,
      label: `${monthShort(data.current.month)}*`,
      values: ids.map((id) => litersNumber(currentByProduct.get(id) ?? "0")),
      display: `${liters(data.current.liters)} até hoje`,
    },
  ];
  const best = data.months.reduce<(typeof data.months)[number] | null>(
    (top, month) => (month.readingCount && (!top || litersToMilli(month.liters) > litersToMilli(top.liters)) ? month : top),
    null,
  );
  return (
    <View style={{ gap: 12 }}>
      <SectionTitle title="Últimos 12 meses" eyebrow="GALONAGEM E FATURAMENTO" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Metric label="Galonagem em 12 meses" value={liters(milliToLiters(total.milli))} />
        <Metric label="Faturamento em 12 meses" value={formatCents(total.revenue)} />
        <Metric
          label="Média mensal"
          value={data.average12 ? liters(data.average12.liters) : "—"}
          detail={data.average12 ? `${formatCents(data.average12.revenueCents)} por mês` : "Sem meses fechados"}
        />
        <Metric label="Melhor mês" value={best ? monthShort(best.month) : "—"} detail={best ? liters(best.liters) : undefined} />
      </View>
      <Card style={{ gap: 12 }}>
        <Label>GALONAGEM POR MÊS E COMBUSTÍVEL</Label>
        <StackedBarChart points={points} series={names} highlightLast />
        <Body size={11}>* Mês atual até hoje, ainda não fechado.</Body>
      </Card>
      <Card style={{ gap: 12 }}>
        <Label>FATURAMENTO ESTIMADO POR MÊS</Label>
        <BarChart
          height={150}
          color={C.blue}
          points={data.months.map((month) => ({
            key: month.month,
            label: monthShort(month.month),
            value: Number(month.revenueCents),
            display: formatCents(month.revenueCents),
          }))}
        />
      </Card>
    </View>
  );
}

function DailyOfMonth({ data }: { data: Monthly }) {
  const { daily } = data.current;
  return (
    <Card style={{ gap: 12 }}>
      <Label>{`GALONAGEM POR DIA · ${monthLong(data.current.month).toUpperCase()}`}</Label>
      <BarChart
        height={140}
        emptyText="Ainda não há leituras neste mês."
        points={daily.map((point) => ({
          key: point.date,
          label: point.date.slice(8, 10),
          value: litersNumber(point.liters),
          display: liters(point.liters),
        }))}
      />
      <Body size={11}>A última barra é o dia de hoje, ainda em andamento.</Body>
    </Card>
  );
}

function Coverage({ data }: { data: Monthly }) {
  const byProduct = data.products.map((product) => {
    const tanks = data.coverage.filter((tank) => tank.productId === product.productId);
    const stockMilli = tanks.reduce((sum, tank) => sum + litersToMilli(tank.theoreticalLiters), 0n);
    const stock = milliToLiters(stockMilli);
    const daily = tanks[0]?.dailyAverageLiters ?? "0.000";
    return { product, stock, daily, days: coverageDays(stock, daily), tanks: tanks.length };
  });
  return (
    <Card style={{ gap: 12 }}>
      <Label>COBERTURA DE ESTOQUE</Label>
      <Body size={12}>Estoque teórico ÷ consumo médio diário dos últimos 30 dias, por combustível.</Body>
      {byProduct.map(({ product, stock, daily, days, tanks }) => (
        <View key={product.productId} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <View style={{ flexShrink: 1 }}>
            <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 13 }}>{product.productName}</Text>
            <Text style={{ color: C.muted, fontFamily: F.regular, fontSize: 12 }}>
              {liters(stock)} em {tanks} tanque(s) · consumo {liters(daily)}/dia
            </Text>
          </View>
          <Text
            style={{
              color: days !== null && days < 3 ? C.orange : C.green,
              fontFamily: F.heading,
              fontSize: 18,
            }}
          >
            {days === null ? "—" : `${days.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`}
          </Text>
        </View>
      ))}
    </Card>
  );
}
