import React from "react";
import { Text, View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";
import { C, F } from "@/components/sobra/ui";

export type BarPoint = {
  key: string;
  label: string;
  /** Height basis only; the exact amount is shown as text via `display`. */
  value: number;
  display: string;
};

/**
 * Vertical bar chart. Every bar also carries its exact value as text, so the chart
 * never is the only place a number appears (accessibility and exactness).
 */
export function BarChart({
  points,
  height = 150,
  color = C.green,
  emptyText = "Sem dados no período.",
}: {
  points: BarPoint[];
  height?: number;
  color?: string;
  emptyText?: string;
}) {
  const max = Math.max(0, ...points.map((point) => point.value));
  if (points.length === 0 || max <= 0) {
    return (
      <View style={{ height, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: C.muted, fontFamily: F.regular, fontSize: 13 }}>{emptyText}</Text>
      </View>
    );
  }
  const width = 100;
  const gap = points.length > 20 ? 0.6 : 2;
  const barWidth = (width - gap * (points.length - 1)) / points.length;
  const showEveryLabel = points.length <= 10;
  return (
    <View
      accessible
      accessibilityLabel={points.map((point) => `${point.label}: ${point.display}`).join("; ")}
      style={{ gap: 6 }}
    >
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Line x1={0} y1={height - 0.5} x2={width} y2={height - 0.5} stroke={C.line} strokeWidth={1} />
        {points.map((point, index) => {
          const barHeight = point.value > 0 ? Math.max(2, (point.value / max) * (height - 8)) : 0;
          return (
            <Rect
              key={point.key}
              x={index * (barWidth + gap)}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              rx={Math.min(1.5, barWidth / 3)}
              fill={index === points.length - 1 ? color : `${color}B3`}
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: "row" }}>
        {points.map((point, index) => (
          <Text
            key={point.key}
            numberOfLines={1}
            style={{
              flex: 1,
              textAlign: "center",
              color: C.muted,
              fontFamily: F.medium,
              fontSize: 10,
            }}
          >
            {showEveryLabel || index % Math.ceil(points.length / 8) === 0 || index === points.length - 1
              ? point.label
              : ""}
          </Text>
        ))}
      </View>
    </View>
  );
}

export const SERIES_COLORS = [C.green, "#D59A34", C.blue, C.orange, "#8BAA5B", "#5C6F68"];
const SHARE_COLORS = SERIES_COLORS;

export type StackedPoint = {
  key: string;
  label: string;
  /** Height basis per series, same order as `series`. */
  values: number[];
  display: string;
};

/** Stacked vertical bars (e.g. liters per month split by fuel) with a text legend. */
export function StackedBarChart({
  points,
  series,
  height = 170,
  highlightLast = false,
}: {
  points: StackedPoint[];
  series: string[];
  height?: number;
  highlightLast?: boolean;
}) {
  const totals = points.map((point) => point.values.reduce((sum, value) => sum + Math.max(0, value), 0));
  const max = Math.max(0, ...totals);
  if (points.length === 0 || max <= 0) {
    return (
      <View style={{ height, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: C.muted, fontFamily: F.regular, fontSize: 13 }}>Sem dados no período.</Text>
      </View>
    );
  }
  const width = 100;
  const gap = 1.6;
  const barWidth = (width - gap * (points.length - 1)) / points.length;
  return (
    <View
      accessible
      accessibilityLabel={points.map((point) => `${point.label}: ${point.display}`).join("; ")}
      style={{ gap: 8 }}
    >
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Line x1={0} y1={height - 0.5} x2={width} y2={height - 0.5} stroke={C.line} strokeWidth={1} />
        {points.map((point, index) => {
          let y = height;
          const faded = highlightLast && index === points.length - 1;
          return point.values.map((value, serie) => {
            const segment = value > 0 ? (value / max) * (height - 8) : 0;
            y -= segment;
            return (
              <Rect
                key={`${point.key}-${serie}`}
                x={index * (barWidth + gap)}
                y={y}
                width={barWidth}
                height={segment}
                fill={SERIES_COLORS[serie % SERIES_COLORS.length]}
                opacity={faded ? 0.45 : 1}
              />
            );
          });
        })}
      </Svg>
      <View style={{ flexDirection: "row" }}>
        {points.map((point) => (
          <Text
            key={point.key}
            numberOfLines={1}
            style={{ flex: 1, textAlign: "center", color: C.muted, fontFamily: F.medium, fontSize: 10 }}
          >
            {point.label}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        {series.map((name, serie) => (
          <View key={name} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: SERIES_COLORS[serie % SERIES_COLORS.length] }} />
            <Text style={{ color: C.ink, fontFamily: F.medium, fontSize: 12 }}>{name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Horizontal share bars with name, percent and exact value: readable on any screen size. */
export function ShareBars({
  rows,
}: {
  rows: { key: string; label: string; value: number; display: string }[];
}) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.value), 0);
  if (total <= 0) {
    return (
      <Text style={{ color: C.muted, fontFamily: F.regular, fontSize: 13 }}>
        Sem vendas registradas no período.
      </Text>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      {rows.map((row, index) => {
        const share = Math.max(0, row.value) / total;
        const color = SHARE_COLORS[index % SHARE_COLORS.length];
        return (
          <View key={row.key} style={{ gap: 5 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <Text style={{ color: C.ink, fontFamily: F.medium, fontSize: 13, flexShrink: 1 }}>
                {row.label}
              </Text>
              <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 13 }}>
                {row.display} · {Math.round(share * 100)}%
              </Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: C.light, overflow: "hidden" }}>
              <View style={{ width: `${share * 100}%`, height: 8, backgroundColor: color }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function Metric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "warning" | "good";
}) {
  const background = tone === "warning" ? C.orangeBg : tone === "good" ? C.lime : C.light;
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: 200,
        backgroundColor: background,
        borderRadius: 16,
        padding: 16,
        gap: 6,
      }}
    >
      <Text style={{ color: C.muted, fontFamily: F.bold, fontSize: 10, letterSpacing: 0.8 }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ color: tone === "warning" ? C.orange : C.ink, fontFamily: F.heading, fontSize: 22 }}>
        {value}
      </Text>
      {detail ? (
        <Text style={{ color: C.muted, fontFamily: F.regular, fontSize: 12 }}>{detail}</Text>
      ) : null}
    </View>
  );
}
