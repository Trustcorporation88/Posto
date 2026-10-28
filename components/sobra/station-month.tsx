import React from "react";
import { Pressable, Text, View } from "react-native";
import {
  getCalendarMonth,
  getScheduleForDate,
  STATION_CALENDAR_META,
  StationDaySchedule,
} from "@/lib/station-calendar";
import { Body, C, F, Icon } from "./ui";

export function stationDateLabel(date: string, short = false): string {
  return new Intl.DateTimeFormat("pt-BR", {
    ...(short
      ? { day: "2-digit", month: "short" }
      : {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function scheduleLabel(schedule: StationDaySchedule): string {
  return schedule.kind === "feriado"
    ? "Feriado"
    : schedule.kind === "domingo"
      ? "Domingo"
      : "Dia normal";
}

function moveMonth(month: string, step: number): string {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + step, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function StationMonth({
  month,
  selectedDate,
  today,
  onSelect,
  onMonthChange,
}: {
  month: string;
  selectedDate: string;
  today: string;
  onSelect: (date: string) => void;
  onMonthChange: (month: string) => void;
}) {
  const calendar = getCalendarMonth(month);
  const selected = getScheduleForDate(selectedDate);
  const rows: (StationDaySchedule | null)[][] = [];
  for (let i = 0; i < calendar.cells.length; i += 7)
    rows.push(calendar.cells.slice(i, i + 7));
  const change = (step: number) => {
    const target = moveMonth(month, step);
    onMonthChange(target);
    onSelect(`${target}-01`);
  };
  const atStart = month === `${STATION_CALENDAR_META.minYear}-01`;
  const atEnd = month === `${STATION_CALENDAR_META.maxYear}-12`;

  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text
          accessibilityRole="header"
          style={{
            flex: 1,
            fontFamily: F.heading,
            fontSize: 19,
            color: C.ink,
            textTransform: "capitalize",
          }}
        >
          {calendar.title}
        </Text>
        {[-1, 1].map((step) => {
          const disabled = step === -1 ? atStart : atEnd;
          return (
            <Pressable
              key={step}
              accessibilityRole="button"
              accessibilityLabel={step === -1 ? "Mês anterior" : "Próximo mês"}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => change(step)}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: 12,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: pressed ? C.line : C.light,
                opacity: disabled ? 0.35 : 1,
              })}
            >
              <Icon
                name={step === -1 ? "chevron-left" : "chevron-right"}
                size={18}
                color={C.green}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={{ gap: 5 }}>
        <View style={{ flexDirection: "row", marginBottom: 5 }}>
          {["D", "S", "T", "Q", "Q", "S", "S"].map((label, index) => (
            <Text
              key={index}
              style={{
                flex: 1,
                textAlign: "center",
                fontFamily: F.bold,
                fontSize: 11,
                color: C.muted,
              }}
            >
              {label}
            </Text>
          ))}
        </View>
        {rows.map((row, index) => (
          <View key={index} style={{ flexDirection: "row", gap: 3 }}>
            {row.map((day, column) => {
              if (!day)
                return (
                  <View
                    key={`empty-${column}`}
                    style={{ flex: 1, minHeight: 44 }}
                  />
                );
              const isSelected = day.date === selectedDate;
              const isToday = day.date === today;
              const color = isSelected
                ? C.white
                : day.kind === "feriado"
                  ? C.orange
                  : C.ink;
              const backgroundColor = isSelected
                ? C.green
                : day.kind === "feriado"
                  ? C.orangeBg
                  : day.kind === "domingo"
                    ? C.light
                    : "transparent";
              return (
                <Pressable
                  key={day.date}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${stationDateLabel(day.date)}. ${scheduleLabel(day)}. ${day.shifts.map((shift) => `${shift.label}, ${shift.start} a ${shift.end}`).join(". ")}${isToday ? ". Hoje" : ""}`}
                  onPress={() => onSelect(day.date)}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 46,
                    borderRadius: 11,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor,
                    borderWidth: 1,
                    borderColor: isToday ? C.green : "transparent",
                    opacity: pressed ? 0.65 : 1,
                    gap: 3,
                  })}
                >
                  <Text style={{ fontFamily: F.bold, fontSize: 14, color }}>
                    {Number(day.date.slice(-2))}
                  </Text>
                  <View
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor:
                        day.kind === "feriado" ? color : "transparent",
                    }}
                  />
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        {[
          { title: "Feriado", color: C.orange },
          { title: "Domingo", color: C.green },
        ].map((item) => (
          <View
            key={item.title}
            style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: item.color,
              }}
            />
            <Body size={11}>{item.title}</Body>
          </View>
        ))}
        <Body size={11}>Hoje: contorno verde</Body>
      </View>
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: C.line,
          paddingTop: 18,
          gap: 12,
        }}
      >
        <View style={{ gap: 5 }}>
          <Text
            style={{
              fontFamily: F.bold,
              color: C.ink,
              fontSize: 14,
              textTransform: "capitalize",
            }}
          >
            {stationDateLabel(selectedDate)}
          </Text>
          <Body
            color={selected.kind === "feriado" ? C.orange : C.green}
            size={12}
          >
            {selected.holidays.length > 0
              ? selected.holidays.map((holiday) => holiday.name).join(" · ")
              : selected.kind === "domingo"
                ? "Domingo · horário reduzido"
                : "Dia normal · horário completo"}
          </Body>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {selected.shifts.map((shift) => (
            <View
              key={shift.id}
              style={{
                flex: 1,
                minWidth: 115,
                backgroundColor: C.light,
                borderRadius: 12,
                padding: 14,
                gap: 6,
              }}
            >
              <Text
                style={{ fontFamily: F.medium, color: C.muted, fontSize: 12 }}
              >
                {shift.label}
              </Text>
              <Text
                style={{ fontFamily: F.heading, color: C.green, fontSize: 17 }}
              >
                {shift.start}–{shift.end}
              </Text>
            </View>
          ))}
        </View>
        {selected.holidays.some((holiday) => holiday.note) && (
          <Body size={10}>
            {selected.holidays
              .filter((holiday) => holiday.note)
              .map((holiday) => holiday.note)
              .join(" ")}
          </Body>
        )}
      </View>
    </View>
  );
}
