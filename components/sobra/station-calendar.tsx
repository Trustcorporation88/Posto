import React, { useState } from "react";
import {
  Linking,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useStationClock } from "@/hooks/use-station-clock";
import {
  getScheduleForDate,
  getScheduledShift,
  getStationNow,
  getYearHolidays,
  STATION_CALENDAR_META,
} from "@/lib/station-calendar";
import { stationDateLabel, StationMonth } from "./station-month";
import { Body, Button, C, Card, F, Icon, Label, Notice } from "./ui";

function initialCalendarDate(): string {
  const date = getStationNow().date;
  const year = Number(date.slice(0, 4));
  if (year < STATION_CALENDAR_META.minYear)
    return `${STATION_CALENDAR_META.minYear}-01-01`;
  if (year > STATION_CALENDAR_META.maxYear)
    return `${STATION_CALENDAR_META.maxYear}-12-31`;
  return date;
}

export function StationCalendar() {
  const now = useStationClock();
  const clock = getStationNow(now);
  const [selectedDate, setSelectedDate] = useState(initialCalendarDate);
  const [month, setMonth] = useState(() => selectedDate.slice(0, 7));
  const [showYear, setShowYear] = useState(false);
  const [sourceError, setSourceError] = useState(false);
  const { width } = useWindowDimensions();
  const wide = width >= 850;
  const clockYear = Number(clock.date.slice(0, 4));
  const clockSupported =
    clockYear >= STATION_CALENDAR_META.minYear &&
    clockYear <= STATION_CALENDAR_META.maxYear;
  const todaySchedule = clockSupported ? getScheduleForDate(clock.date) : null;
  const currentShift = clockSupported
    ? getScheduledShift(clock.date, clock.time)
    : null;
  const holidays = getYearHolidays(Number(month.slice(0, 4)));
  const returnToday = () => {
    if (!clockSupported) return;
    setSelectedDate(clock.date);
    setMonth(clock.date.slice(0, 7));
  };
  const openSource = async () => {
    setSourceError(false);
    try {
      await Linking.openURL(STATION_CALENDAR_META.sourceUrl);
    } catch {
      setSourceError(true);
    }
  };

  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          gap: 12,
          alignItems: "center",
          marginBottom: 22,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            backgroundColor: C.light,
            borderRadius: 13,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="calendar" color={C.green} size={22} />
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <Label>POSTO · BAURU, SP</Label>
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: F.heading,
              color: C.ink,
              fontSize: 23,
              letterSpacing: -0.8,
            }}
          >
            O ritmo do seu posto.
          </Text>
        </View>
      </View>
      <View
        style={{ flexDirection: wide ? "row" : "column", gap: wide ? 32 : 24 }}
      >
        <View style={{ flex: 1.3, gap: 16 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Body size={12}>Toque em uma data para consultar os turnos.</Body>
            </View>
            <Button
              variant="ghost"
              compact
              icon="corner-up-left"
              onPress={returnToday}
              disabled={!clockSupported}
            >
              Hoje
            </Button>
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {[-1, 1].map((step) => (
              <Button
                key={step}
                variant="secondary"
                compact
                disabled={
                  Number(month.slice(0, 4)) + step <
                    STATION_CALENDAR_META.minYear ||
                  Number(month.slice(0, 4)) + step >
                    STATION_CALENDAR_META.maxYear
                }
                onPress={() => {
                  const target = `${Number(month.slice(0, 4)) + step}${month.slice(4)}`;
                  setMonth(target);
                  setSelectedDate(`${target}-01`);
                }}
              >
                {step === -1 ? "Ano anterior" : "Próximo ano"}
              </Button>
            ))}
          </View>
          <StationMonth
            month={month}
            selectedDate={selectedDate}
            today={clock.date}
            onMonthChange={setMonth}
            onSelect={setSelectedDate}
          />
        </View>
        <View style={{ flex: 1, gap: 18 }}>
          <View
            accessibilityLiveRegion="polite"
            style={{
              backgroundColor: C.green,
              borderRadius: 17,
              padding: 20,
              gap: 13,
            }}
          >
            <View
              style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
            >
              <Icon name="clock" color={C.lime} size={16} />
              <Label color={C.lime}>HORÁRIO PREVISTO AGORA</Label>
            </View>
            <Text
              style={{ fontFamily: F.heading, fontSize: 22, color: C.white }}
            >
              {!clockSupported
                ? "Confira o relógio"
                : currentShift
                  ? currentShift.label
                  : "Fora do horário"}
            </Text>
            <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.lime }}>
              {currentShift
                ? `${currentShift.start}–${currentShift.end}`
                : todaySchedule
                  ? `Hoje: ${todaySchedule.shifts[0].start}–${todaySchedule.shifts[1].end}`
                  : "Data fora de 2026–2100"}
            </Text>
            <Body size={12} color="#D0DDCE">
              {stationDateLabel(clock.date, true)} · {clock.time} · horário de
              São Paulo
            </Body>
            <Body size={12} color="#D0DDCE">
              {todaySchedule && todaySchedule.holidays.length > 0
                ? todaySchedule.holidays
                    .map((holiday) => holiday.name)
                    .join(" · ")
                : todaySchedule?.kind === "domingo"
                  ? "Domingo: turnos reduzidos."
                  : "Segunda a sábado: turnos completos."}
            </Body>
            <Body size={11} color="#D0DDCE">
              Esta indicação é da escala prevista. Não significa que um caixa
              foi aberto ou fechado.
            </Body>
          </View>
          <View style={{ gap: 12 }}>
            <Label color={C.ink}>ESCALA PREVISTA</Label>
            <View style={{ gap: 4 }}>
              <Text style={{ fontFamily: F.bold, color: C.ink, fontSize: 13 }}>
                Segunda a sábado
              </Text>
              <Body size={13}>06h–14h · 14h–22h</Body>
            </View>
            <View style={{ gap: 4 }}>
              <Text style={{ fontFamily: F.bold, color: C.ink, fontSize: 13 }}>
                Domingos e feriados oficiais
              </Text>
              <Body size={13}>07h–13h · 13h–19h</Body>
            </View>
            <Body size={12}>
              Feriados prevalecem sobre o dia da semana. Pontos facultativos,
              Carnaval, emendas e vésperas seguem a escala normal do respectivo
              dia.
            </Body>
          </View>
          <Button
            compact
            variant="secondary"
            icon={showYear ? "chevron-up" : "list"}
            onPress={() => setShowYear((value) => !value)}
          >
            {showYear
              ? "Ocultar feriados do ano"
              : `Ver feriados de ${month.slice(0, 4)}`}
          </Button>
        </View>
      </View>
      {showYear && (
        <View
          style={{
            marginTop: 24,
            borderTopWidth: 1,
            borderTopColor: C.line,
            paddingTop: 20,
            gap: 8,
          }}
        >
          <Label color={C.ink}>
            FERIADOS DE {month.slice(0, 4)} · BAURU, SP
          </Label>
          <Body size={11}>
            Selecione um feriado para consultar seus turnos.
          </Body>
          {holidays.map((holiday) => (
            <Pressable
              key={`${holiday.date}-${holiday.name}`}
              accessibilityRole="button"
              accessibilityLabel={`${stationDateLabel(holiday.date)}. ${holiday.name}, ${holiday.scope}. Consultar turnos.`}
              onPress={() => {
                setSelectedDate(holiday.date);
                setMonth(holiday.date.slice(0, 7));
              }}
              style={({ pressed }) => ({
                paddingVertical: 12,
                paddingHorizontal: 10,
                borderBottomWidth: 1,
                borderBottomColor: C.line,
                backgroundColor: pressed ? C.light : "transparent",
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderRadius: 8,
              })}
            >
              <View style={{ width: 54, gap: 3 }}>
                <Text
                  style={{ fontFamily: F.bold, color: C.orange, fontSize: 12 }}
                >
                  {stationDateLabel(holiday.date, true)}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text
                  style={{ fontFamily: F.medium, color: C.ink, fontSize: 13 }}
                >
                  {holiday.name}
                </Text>
                <Text
                  style={{
                    fontFamily: F.regular,
                    color: C.muted,
                    fontSize: 11,
                    textTransform: "capitalize",
                  }}
                >
                  Feriado {holiday.scope}
                </Text>
              </View>
              <Icon name="chevron-right" size={15} color={C.muted} />
            </Pressable>
          ))}
        </View>
      )}
      <View style={{ marginTop: 24, gap: 12 }}>
        <Notice>
          Calendário calculado no aplicativo, sem cadastro anual manual. Regras
          verificadas no calendário oficial de Bauru de 2026. Projeções futuras
          seguem essas regras; mudanças legais exigem atualização do aplicativo.
        </Notice>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Button
            variant="ghost"
            compact
            icon="external-link"
            onPress={openSource}
          >
            Fonte: Prefeitura de Bauru
          </Button>
          <Body size={10}>Verificado em 28/10/2026 · consulta 2026–2100</Body>
        </View>
        {sourceError && (
          <Notice warning>
            Não foi possível abrir a fonte. O calendário permanece disponível
            sem consulta externa.
          </Notice>
        )}
        <Body size={10}>
          Os horários são de funcionamento do posto. Não representam validação
          de jornada, convenção coletiva ou autorização de trabalho em feriados.
        </Body>
      </View>
    </Card>
  );
}
