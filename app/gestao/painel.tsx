import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { Body, Button, C, Card, F, Icon, Label, Notice, SectionTitle } from "@/components/sobra/ui";
import { GestaoShell, useMe } from "@/components/sobra/gestao/gestao-shell";
import { BarChart, Metric, ShareBars } from "@/components/sobra/gestao/dashboard-charts";
import { FuelMonthly } from "@/components/sobra/gestao/fuel-monthly";
import { formatCents, formatMilliLiters } from "@/lib/business/fuel-domain";
import { litersToMilli } from "@/lib/business/dashboard";
import { trpc } from "@/lib/trpc";

type Overview = inferRouterOutputs<AppRouter>["dashboard"]["overview"];

const liters = (value: string) => `${formatMilliLiters(litersToMilli(value))} L`;
const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const longDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

export default function Painel() {
  const session = useMe();
  const overview = trpc.dashboard.overview.useQuery(undefined, {
    enabled: Boolean(session.data),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const name = (session.data as { name?: string } | null | undefined)?.name ?? "";

  return (
    <GestaoShell
      title={name ? `Olá, ${name.split(" ")[0]}` : "Painel"}
      subtitle={overview.data ? `Resumo de ${longDate(overview.data.today)}` : "Resumo do posto"}
    >
      {overview.isLoading ? (
        <Card style={{ alignItems: "center", gap: 10 }}>
          <ActivityIndicator color={C.green} />
          <Body>Carregando o resumo do posto…</Body>
        </Card>
      ) : overview.error || !overview.data ? (
        <Notice warning>
          Não foi possível carregar o painel. Verifique a conexão e tente de novo.
        </Notice>
      ) : (
        <PainelContent data={overview.data} />
      )}
    </GestaoShell>
  );
}

function PainelContent({ data }: { data: Overview }) {
  const router = useRouter();
  return (
    <View style={{ gap: 24 }}>
      {data.setup ? <SetupChecklist steps={data.setup} /> : null}
      {data.cash ? <CashToday cash={data.cash} /> : null}
      {data.fuel ? <FuelToday fuel={data.fuel} /> : null}
      {data.fuel ? <FuelMonthly /> : null}
      {data.cash || data.fuel ? (
        <Button variant="secondary" icon="bar-chart-2" onPress={() => router.push("/gestao/relatorios" as never)}>
          Ver relatórios do período
        </Button>
      ) : (
        <Notice>Seu perfil ainda não tem módulos disponíveis no painel.</Notice>
      )}
    </View>
  );
}

function SetupChecklist({ steps }: { steps: NonNullable<Overview["setup"]> }) {
  const router = useRouter();
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;
  const next = steps.find((step) => !step.done);
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <View style={{ gap: 4, flexShrink: 1 }}>
          <Label>PRIMEIROS PASSOS</Label>
          <Text style={{ color: C.ink, fontFamily: F.heading, fontSize: 20 }}>
            Configure o posto ({done} de {steps.length})
          </Text>
        </View>
        <Text style={{ color: C.green, fontFamily: F.heading, fontSize: 22 }}>
          {Math.round((done / steps.length) * 100)}%
        </Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: C.light, overflow: "hidden" }}>
        <View style={{ width: `${(done / steps.length) * 100}%`, height: 8, backgroundColor: C.green }} />
      </View>
      <Button
        compact
        variant="ghost"
        icon="book-open"
        onPress={() => router.push("/gestao/ajuda?secao=primeiros-passos" as never)}
      >
        Ver o passo a passo explicado
      </Button>
      <View style={{ gap: 2 }}>
        {steps.map((step) => (
          <Pressable
            key={step.id}
            accessibilityRole="link"
            accessibilityLabel={`${step.title}: ${step.done ? "concluído" : "pendente"}`}
            onPress={() => router.push(step.href as never)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 10,
              paddingHorizontal: 8,
              borderRadius: 10,
              backgroundColor: step.id === next?.id ? C.light : "transparent",
            }}
          >
            <Icon name={step.done ? "check-circle" : "circle"} color={step.done ? C.green : C.muted} size={18} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  color: step.done ? C.muted : C.ink,
                  fontFamily: F.medium,
                  fontSize: 14,
                  textDecorationLine: step.done ? "line-through" : "none",
                }}
              >
                {step.title}
              </Text>
              <Text style={{ color: C.muted, fontFamily: F.regular, fontSize: 12 }}>{step.detail}</Text>
            </View>
            {!step.done ? <Icon name="chevron-right" color={C.muted} size={16} /> : null}
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

function CashToday({ cash }: { cash: NonNullable<Overview["cash"]> }) {
  const router = useRouter();
  const { snapshot, recentClosings } = cash;
  const opening = snapshot.activeOpening;
  const summary = snapshot.summary;
  return (
    <View style={{ gap: 12 }}>
      <SectionTitle title="Caixa" eyebrow="TURNO" action="Ir ao caixa" onAction={() => router.push("/gestao/caixa" as never)} />
      {opening && summary ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <Metric
              label="Dinheiro esperado na gaveta"
              value={formatCents(summary.cashExpected)}
              detail={`Fundo ${formatCents(summary.openingFloat)} · ${opening.shift.label} · ${opening.operator}`}
              tone="good"
            />
            <Metric label="Pix" value={formatCents(summary.receiptsByMethod.pix)} />
            <Metric label="Débito" value={formatCents(summary.receiptsByMethod.debito)} />
            <Metric label="Crédito" value={formatCents(summary.receiptsByMethod.credito)} />
          </View>
          <Body size={12}>
            {summary.count} movimento(s) no turno · vendas {formatCents(summary.sales)} · contas anteriores{" "}
            {formatCents(summary.previousReceipts)} · sangrias {formatCents(summary.withdrawals)}. Valores
            esperados, não conferidos.
          </Body>
        </>
      ) : (
        <Card style={{ gap: 6 }}>
          <Text style={{ color: C.ink, fontFamily: F.heading, fontSize: 18 }}>Nenhum turno aberto</Text>
          <Body>
            {snapshot.scheduledShift
              ? `Turno previsto agora: ${snapshot.scheduledShift.label} (${snapshot.scheduledShift.start}–${snapshot.scheduledShift.end}).`
              : "Fora do horário de funcionamento do posto."}
          </Body>
        </Card>
      )}
      {recentClosings.length ? (
        <Card style={{ gap: 10 }}>
          <Label>ÚLTIMOS FECHAMENTOS</Label>
          {recentClosings.map((closing) => {
            const totalDifference =
              closing.totals.differenceByMethod.dinheiro +
              closing.totals.differenceByMethod.pix +
              closing.totals.differenceByMethod.debito +
              closing.totals.differenceByMethod.credito;
            const pending = closing.status === "diferenca-pendente";
            return (
              <View
                key={closing.id}
                style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}
              >
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ color: C.ink, fontFamily: F.medium, fontSize: 13 }}>
                    {shortDate(closing.opening.operationDate)} · {closing.opening.shift.label}
                  </Text>
                  <Text style={{ color: C.muted, fontFamily: F.regular, fontSize: 12 }}>
                    Fechado por {closing.closedBy}
                  </Text>
                </View>
                <Text
                  style={{
                    color: pending ? C.orange : C.green,
                    fontFamily: F.bold,
                    fontSize: 12,
                    textAlign: "right",
                  }}
                >
                  {pending ? `Diferença ${formatCents(totalDifference)}` : "Sem diferença"}
                </Text>
              </View>
            );
          })}
        </Card>
      ) : null}
    </View>
  );
}

function FuelToday({ fuel }: { fuel: NonNullable<Overview["fuel"]> }) {
  const router = useRouter();
  const totalLiters = fuel.products.reduce((sum, product) => sum + litersToMilli(product.quantityLiters), 0n);
  const trendHasData = fuel.trend.some((point) => point.readingCount > 0);
  return (
    <View style={{ gap: 12 }}>
      <SectionTitle title="Pista hoje" eyebrow="COMBUSTÍVEIS" action="Ir à pista" onAction={() => router.push("/gestao/pista" as never)} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Metric label="Litros vendidos" value={`${formatMilliLiters(totalLiters)} L`} detail="Pelas leituras de encerrante" />
        <Metric label="Venda estimada" value={formatCents(fuel.totalRevenueCents)} detail="Litros × preço vigente" />
        <Metric
          label="Margem estimada"
          value={fuel.totalMarginCents === null ? "Indisponível" : formatCents(fuel.totalMarginCents)}
          detail={fuel.totalMarginCents === null ? "Falta custo de compra em alguma venda" : "Venda menos custo médio"}
        />
        <Metric
          label="Pendências de medição"
          value={String(fuel.pendingTankDifferences)}
          detail="Tanques com diferença a investigar"
          tone={fuel.pendingTankDifferences > 0 ? "warning" : "default"}
        />
      </View>
      <Card style={{ gap: 12 }}>
        <Label>VENDA ESTIMADA · ÚLTIMOS 7 DIAS</Label>
        <BarChart
          emptyText="Ainda não há leituras de venda nos últimos 7 dias."
          points={
            trendHasData
              ? fuel.trend.map((point) => ({
                  key: point.date,
                  label: shortDate(point.date),
                  value: Number(point.revenueCents),
                  display: formatCents(point.revenueCents),
                }))
              : []
          }
        />
        {trendHasData ? (
          <Body size={12}>
            Hoje: {formatCents(fuel.trend[fuel.trend.length - 1].revenueCents)} em{" "}
            {liters(fuel.trend[fuel.trend.length - 1].quantityLiters)}.
          </Body>
        ) : null}
      </Card>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Card style={{ flexGrow: 1, flexBasis: 300, gap: 12 }}>
          <Label>LITROS POR COMBUSTÍVEL · HOJE</Label>
          <ShareBars
            rows={fuel.products.map((product) => ({
              key: String(product.productId),
              label: product.productName,
              value: Number(litersToMilli(product.quantityLiters)),
              display: liters(product.quantityLiters),
            }))}
          />
        </Card>
        <Card style={{ flexGrow: 1, flexBasis: 300, gap: 12 }}>
          <Label>ESTOQUE TEÓRICO DOS TANQUES</Label>
          {fuel.tanks.length ? (
            fuel.tanks.map((tank) => {
              const current = litersToMilli(tank.theoreticalLiters);
              const capacity = tank.capacityLiters ? litersToMilli(tank.capacityLiters) : 0n;
              const ratio = capacity > 0n ? Math.min(1, Math.max(0, Number(current) / Number(capacity))) : null;
              return (
                <View key={tank.id} style={{ gap: 5 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ color: C.ink, fontFamily: F.medium, fontSize: 13, flexShrink: 1 }}>{tank.name}</Text>
                    <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 13 }}>
                      {liters(tank.theoreticalLiters)}
                      {ratio !== null ? ` · ${Math.round(ratio * 100)}%` : ""}
                    </Text>
                  </View>
                  {ratio !== null ? (
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: C.light, overflow: "hidden" }}>
                      <View
                        style={{
                          width: `${ratio * 100}%`,
                          height: 8,
                          backgroundColor: ratio < 0.2 ? C.orange : C.blue,
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })
          ) : (
            <Body>Nenhum tanque cadastrado.</Body>
          )}
        </Card>
      </View>
    </View>
  );
}
