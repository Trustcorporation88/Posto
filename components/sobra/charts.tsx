import React from "react";
import { View, Text } from "react-native";
import Svg, {
  Circle,
  Line,
  Path,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import { AppData, getSummary, getTrend, money } from "@/lib/budget";
import { C, F, Body, Label, Icon } from "./ui";
export function CategoryChart({
  data,
  month,
}: {
  data: AppData;
  month: string;
}) {
  const summary = getSummary(data, month);
  const items = summary.categorySpending.filter((c) => c.spent > 0);
  const radius = 77,
    circumference = 2 * Math.PI * radius;
  return (
    <View style={{ gap: 24 }}>
      <View style={{ alignItems: "center" }}>
        <View
          style={{ width: 210, height: 210 }}
          accessibilityLabel={`Despesas por categoria: ${money(summary.expenses)}`}
        >
          <Svg width={210} height={210} viewBox="0 0 210 210">
            <Circle
              cx={105}
              cy={105}
              r={radius}
              fill="none"
              stroke={C.light}
              strokeWidth={23}
            />
            {items.map((item, index) => {
              const length = (item.spent / summary.expenses) * circumference;
              const offset = items
                .slice(0, index)
                .reduce(
                  (sum, previous) =>
                    sum + (previous.spent / summary.expenses) * circumference,
                  0,
                );
              return (
                <Circle
                  key={item.category.id}
                  cx={105}
                  cy={105}
                  r={radius}
                  fill="none"
                  stroke={item.category.color}
                  strokeWidth={23}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  rotation={-90}
                  origin="105, 105"
                />
              );
            })}
          </Svg>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: "center",
              alignItems: "center",
              gap: 7,
            }}
          >
            <Label>GASTOS DO MÊS</Label>
            <Text
              style={{
                fontFamily: F.heading,
                color: C.ink,
                fontSize: 23,
                letterSpacing: -1,
              }}
            >
              {money(summary.expenses)}
            </Text>
            <Text
              style={{ fontFamily: F.regular, color: C.muted, fontSize: 11 }}
            >
              {items.length} {items.length === 1 ? "categoria" : "categorias"}
            </Text>
          </View>
        </View>
      </View>
      {!items.length ? (
        <Body>
          Suas categorias aparecerão aqui quando você registrar uma despesa.
        </Body>
      ) : (
        <View style={{ gap: 15 }}>
          {items.map((item) => (
            <View
              key={item.category.id}
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <View
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 3,
                  backgroundColor: item.category.color,
                }}
              />
              <Text
                style={{
                  flex: 1,
                  fontFamily: F.medium,
                  fontSize: 12,
                  color: C.ink,
                }}
              >
                {item.category.name}
              </Text>
              <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.ink }}>
                {money(item.spent)}
              </Text>
              <Text
                style={{
                  minWidth: 35,
                  textAlign: "right",
                  fontFamily: F.regular,
                  fontSize: 11,
                  color: C.muted,
                }}
              >
                {Math.round((item.spent / summary.expenses) * 100)}%
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
function compactMoney(cents: number) {
  const value = cents / 100;
  return value >= 1000
    ? `${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
    : value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
export function TrendChart({ data, month }: { data: AppData; month: string }) {
  const series = getTrend(data, month);
  const max =
    Math.max(...series.flatMap((s) => [s.income, s.expenses]), 10000) * 1.15;
  const x = (i: number) => 52 + i * 91;
  const y = (v: number) => 180 - (v / max) * 148;
  const path = (key: "income" | "expenses") =>
    series.map((s, i) => `${i ? "L" : "M"} ${x(i)} ${y(s[key])}`).join(" ");
  return (
    <View style={{ gap: 13 }}>
      <View style={{ flexDirection: "row", gap: 20 }}>
        <View style={{ flexDirection: "row", gap: 7, alignItems: "center" }}>
          <View
            style={{
              width: 15,
              height: 3,
              borderRadius: 2,
              backgroundColor: C.green,
            }}
          />
          <Body size={11}>Receitas</Body>
        </View>
        <View style={{ flexDirection: "row", gap: 7, alignItems: "center" }}>
          <View
            style={{
              width: 15,
              height: 3,
              borderRadius: 2,
              backgroundColor: C.orange,
            }}
          />
          <Body size={11}>Despesas</Body>
        </View>
      </View>
      <Svg
        viewBox="0 0 540 220"
        width="100%"
        height={220}
        accessibilityLabel="Tendência de receitas e despesas dos últimos seis meses"
      >
        <Defs>
          <LinearGradient id="income-fill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.lime} stopOpacity={0.7} />
            <Stop offset="1" stopColor={C.lime} stopOpacity={0.05} />
          </LinearGradient>
        </Defs>
        {[0, 0.5, 1].map((p) => (
          <React.Fragment key={p}>
            <Line
              x1={50}
              x2={514}
              y1={y(max * p)}
              y2={y(max * p)}
              stroke={C.line}
              strokeDasharray="4 5"
            />
            <SvgText
              x={42}
              y={y(max * p) + 4}
              fill={C.muted}
              fontSize={10}
              textAnchor="end"
            >
              {compactMoney(max * p)}
            </SvgText>
          </React.Fragment>
        ))}
        <Path
          d={`${path("income")} L ${x(5)} 180 L ${x(0)} 180 Z`}
          fill="url(#income-fill)"
        />
        <Path
          d={path("income")}
          fill="none"
          stroke={C.green}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        <Path
          d={path("expenses")}
          fill="none"
          stroke={C.orange}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {series.map((s, i) => (
          <React.Fragment key={s.month}>
            <Circle
              cx={x(i)}
              cy={y(s.income)}
              r={4}
              fill={C.green}
              stroke={C.white}
              strokeWidth={2}
            />
            <Circle
              cx={x(i)}
              cy={y(s.expenses)}
              r={4}
              fill={C.orange}
              stroke={C.white}
              strokeWidth={2}
            />
            <SvgText
              x={x(i)}
              y={207}
              fill={C.muted}
              fontSize={11}
              textAnchor="middle"
            >
              {s.label.split(" ")[0].slice(0, 3)}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name="info" color={C.muted} size={12} />
        <Body size={11}>
          Valores em R$. Os meses sem registros aparecem com zero.
        </Body>
      </View>
      <View
        accessibilityLabel="Valores mensais do gráfico"
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
      >
        {series.map((s) => (
          <View
            key={s.month}
            style={{
              backgroundColor: C.bg,
              borderRadius: 8,
              padding: 8,
              flexGrow: 1,
              minWidth: 120,
            }}
          >
            <Text style={{ fontFamily: F.bold, color: C.ink, fontSize: 10 }}>
              {s.label}
            </Text>
            <Text
              style={{
                fontFamily: F.regular,
                color: C.green,
                fontSize: 10,
                marginTop: 4,
              }}
            >
              Receitas {money(s.income)}
            </Text>
            <Text
              style={{ fontFamily: F.regular, color: C.orange, fontSize: 10 }}
            >
              Despesas {money(s.expenses)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
