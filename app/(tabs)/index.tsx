import React from "react";
import { View, Text, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useBudget } from "@/hooks/use-budget";
import { getSummary, getInsights, money } from "@/lib/budget";
import { Page } from "@/components/sobra/shell";
import {
  C,
  F,
  Card,
  Label,
  Body,
  Button,
  Icon,
  SectionTitle,
  Empty,
} from "@/components/sobra/ui";
import { CategoryChart, TrendChart } from "@/components/sobra/charts";
import { TransactionRow } from "@/components/sobra/transaction-row";

export default function Dashboard() {
  const { data, month, startDemo, demo, openEditor, loadError } = useBudget();
  const { width } = useWindowDimensions();
  const wide = width >= 800;
  const summary = getSummary(data, month);
  const insights = getInsights(data, month);
  const recent = data.transactions
    .filter((t) => t.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const noData = data.transactions.length === 0;
  const unbudgeted = summary.expenses - summary.spentBudgeted;
  const usage =
    summary.budgetTotal > 0
      ? (summary.spentBudgeted / summary.budgetTotal) * 100
      : 0;
  return (
    <Page
      title="Seu mês, em perspectiva."
      subtitle="Veja para onde foi. Escolha o que vem a seguir."
    >
      <View style={{ flexDirection: wide ? "row" : "column", gap: 15 }}>
        <View
          style={{
            flex: wide ? 1.5 : undefined,
            backgroundColor: C.green,
            borderRadius: 20,
            padding: 26,
            minHeight: 178,
            justifyContent: "space-between",
            overflow: "hidden",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Label color="#D3DEC9">SALDO DO MÊS</Label>
            <View
              style={{
                width: 29,
                height: 29,
                borderRadius: 9,
                backgroundColor: "#FFFFFF12",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="arrow-up-right" color={C.lime} size={17} />
            </View>
          </View>
          <Text
            style={{
              fontFamily: F.extra,
              color: C.lime,
              fontSize: width < 400 ? 34 : 39,
              letterSpacing: -1.8,
              fontVariant: ["tabular-nums"],
              marginTop: 13,
            }}
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            {money(summary.balance)}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              marginTop: 12,
            }}
          >
            <View
              style={{
                width: 5,
                height: 5,
                backgroundColor: C.lime,
                borderRadius: 3,
              }}
            />
            <Text
              style={{ color: "#CBD8CF", fontFamily: F.regular, fontSize: 11 }}
            >
              Receitas menos despesas deste mês
            </Text>
          </View>
        </View>
        <View
          style={{ flex: wide ? 2 : undefined, flexDirection: "row", gap: 15 }}
        >
          {[
            {
              title: "RECEITAS",
              amount: summary.income,
              icon: "arrow-down-left",
              color: C.green,
              sub: "O dinheiro que entrou",
            },
            {
              title: "DESPESAS",
              amount: summary.expenses,
              icon: "arrow-up-right",
              color: C.orange,
              sub: "O dinheiro que saiu",
            },
          ].map((item) => (
            <Card
              key={item.title}
              style={{
                flex: 1,
                minHeight: 178,
                justifyContent: "space-between",
                padding: wide ? 23 : 17,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Label>{item.title}</Label>
                <Icon name={item.icon} size={17} color={item.color} />
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  fontFamily: F.heading,
                  color: C.ink,
                  fontSize: wide ? 27 : 22,
                  letterSpacing: -1,
                  marginTop: 20,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {money(item.amount)}
              </Text>
              <Text
                style={{
                  fontFamily: F.regular,
                  color: C.muted,
                  fontSize: 11,
                  marginTop: 13,
                }}
              >
                {item.sub}
              </Text>
            </Card>
          ))}
        </View>
      </View>
      {noData && !demo && !loadError && (
        <View
          style={{
            backgroundColor: C.light,
            borderWidth: 1,
            borderColor: "#D9E2CE",
            borderRadius: 17,
            padding: 22,
            flexDirection: wide ? "row" : "column",
            alignItems: wide ? "center" : "stretch",
            gap: 18,
          }}
        >
          <View style={{ flex: 1, gap: 7 }}>
            <Text
              style={{ fontFamily: F.heading, color: C.green, fontSize: 17 }}
            >
              Tudo começa com um registro.
            </Text>
            <Body color={C.green} size={12}>
              Seu painel está pronto. Adicione uma receita ou despesa, ou
              explore um exemplo sem alterar seus dados.
            </Body>
          </View>
          <Button compact variant="secondary" icon="play" onPress={startDemo}>
            Explorar demonstração
          </Button>
        </View>
      )}
      <View
        style={{
          flexDirection: wide ? "row" : "column",
          gap: 22,
          alignItems: "stretch",
        }}
      >
        <View style={{ flex: wide ? 1.55 : undefined, gap: 22 }}>
          <Card>
            <SectionTitle
              title="A direção do seu dinheiro"
              eyebrow="MÊS A MÊS"
            />
            <TrendChart data={data} month={month} />
          </Card>
          <Card>
            <SectionTitle
              title="Últimos lançamentos"
              action="Ver todos"
              onAction={() => router.push("/transactions")}
            />
            {recent.length ? (
              recent.map((t, i) => (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  last={i === recent.length - 1}
                />
              ))
            ) : (
              <Empty
                title="Um novo mês pela frente"
                text="Registre o que entra e o que sai. Seus lançamentos aparecerão aqui."
                action="Adicionar lançamento"
                onPress={() => openEditor()}
                icon="edit-3"
              />
            )}
          </Card>
        </View>
        <View style={{ flex: wide ? 1 : undefined, gap: 22 }}>
          <Card>
            <SectionTitle
              title="Para onde foi?"
              eyebrow="DESPESAS POR CATEGORIA"
            />
            <CategoryChart data={data} month={month} />
          </Card>
          <Card style={{ backgroundColor: "#F0F1E8", borderColor: "#E0E4D5" }}>
            <SectionTitle
              title="Dentro do planejado"
              action="Ajustar"
              onAction={() => router.push("/budgets")}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontFamily: F.heading,
                  fontSize: 25,
                  color: summary.budgetRemaining < 0 ? C.orange : C.green,
                  letterSpacing: -1,
                }}
              >
                {money(summary.budgetRemaining)}
              </Text>
              <Text
                style={{ fontFamily: F.bold, fontSize: 11, color: C.muted }}
              >
                {summary.budgetTotal > 0
                  ? `${Math.round(usage)}% usado`
                  : "Sem limites"}
              </Text>
            </View>
            <View
              style={{
                height: 7,
                borderRadius: 5,
                backgroundColor: "#DCE2D1",
                overflow: "hidden",
                marginBottom: 13,
              }}
            >
              <View
                style={{
                  width: `${Math.min(100, Math.max(0, usage))}%`,
                  height: 7,
                  borderRadius: 5,
                  backgroundColor: usage > 100 ? C.orange : C.green,
                }}
              />
            </View>
            <Body size={11}>
              {summary.budgetTotal > 0
                ? `${summary.budgetRemaining >= 0 ? "Disponível" : "Excedido"} nas categorias com limite. Limite total: ${money(summary.budgetTotal)}.`
                : "Defina limites por categoria para acompanhar o que ainda pode usar."}
            </Body>
            {unbudgeted > 0 && (
              <Text
                style={{
                  fontFamily: F.medium,
                  fontSize: 11,
                  lineHeight: 17,
                  color: C.orange,
                  marginTop: 10,
                }}
              >
                {money(unbudgeted)} em despesas sem orçamento definido.
              </Text>
            )}
          </Card>
        </View>
      </View>
      <Card>
        <SectionTitle
          title="Pequenas leituras. Boas decisões."
          eyebrow="SEU MÊS EM PALAVRAS"
        />
        <View style={{ flexDirection: wide ? "row" : "column", gap: 13 }}>
          {insights.length ? (
            insights.slice(0, 3).map((insight) => (
              <View
                key={insight.id}
                style={{
                  flex: 1,
                  backgroundColor:
                    insight.tone === "warning" ? C.orangeBg : C.bg,
                  borderRadius: 14,
                  padding: 19,
                  gap: 12,
                }}
              >
                <Icon
                  name={
                    insight.tone === "warning"
                      ? "alert-circle"
                      : insight.tone === "positive"
                        ? "trending-up"
                        : "compass"
                  }
                  size={21}
                  color={insight.tone === "warning" ? C.orange : C.green}
                />
                <Text
                  style={{
                    fontFamily: F.bold,
                    fontSize: 14,
                    lineHeight: 21,
                    color: C.ink,
                  }}
                >
                  {insight.title}
                </Text>
                <Body size={12}>{insight.message}</Body>
              </View>
            ))
          ) : (
            <Body>
              As análises aparecem com os seus registros. Sem palpites, apenas
              os números do seu mês.
            </Body>
          )}
        </View>
        <Text
          style={{
            color: C.muted,
            fontFamily: F.regular,
            fontSize: 10,
            marginTop: 18,
          }}
        >
          Calculado aqui, com seus dados. Nenhuma informação enviada para IA.
        </Text>
      </Card>
    </Page>
  );
}
