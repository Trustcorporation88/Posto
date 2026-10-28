import React, { useState } from "react";
import { Text, View } from "react-native";
import { useBudget } from "@/hooks/use-budget";
import { useShiftOpening } from "@/hooks/use-shift-opening";
import { useStationClock } from "@/hooks/use-station-clock";
import { money, parseMoney } from "@/lib/budget";
import { getScheduledShift, getStationNow } from "@/lib/station-calendar";
import { prepareShiftOpening, ShiftOpeningReview } from "@/lib/shift-opening";
import { stationDateLabel } from "./station-month";
import {
  Body,
  Button,
  C,
  Card,
  F,
  Field,
  Icon,
  Label,
  Notice,
  Sheet,
} from "./ui";

function openingTimeLabel(instant: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(instant));
}

export function ShiftOpeningPanel() {
  const { demo } = useBudget();
  const { data, ready, busy, loadError, reload, open } = useShiftOpening();
  const now = useStationClock();
  const clock = getStationNow(now);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [operator, setOperator] = useState("");
  const [floatText, setFloatText] = useState("");
  const [review, setReview] = useState<ShiftOpeningReview | null>(null);
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState(false);
  let currentShift: ReturnType<typeof getScheduledShift> = null;
  let clockInvalid = false;
  try {
    currentShift = getScheduledShift(clock.date, clock.time);
  } catch {
    clockInvalid = true;
  }
  const opening = data.opening;
  const reviewCurrent = Boolean(
    review &&
    currentShift &&
    review.operationDate === clock.date &&
    review.shift.id === currentShift.id &&
    review.shift.start === currentShift.start &&
    review.shift.end === currentShift.end,
  );
  const blocked = !ready || busy || Boolean(loadError) || demo;
  const closeSheet = () => {
    if (busy) return;
    setSheetVisible(false);
    setReview(null);
    setError("");
  };
  const begin = () => {
    if (blocked || opening || !currentShift) return;
    setReview(null);
    setError("");
    setSavedNotice(false);
    setSheetVisible(true);
  };
  const prepare = () => {
    if (blocked) return;
    try {
      const amount = parseMoney(floatText);
      if (amount === null)
        throw new Error(
          "Informe o fundo em reais, por exemplo 300,00. Use 0,00 se não houver fundo de troco.",
        );
      setReview(prepareShiftOpening(data, operator, amount, new Date()));
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível revisar a abertura.",
      );
    }
  };
  const confirm = async () => {
    if (blocked || !review) return;
    try {
      await open(review);
      setSheetVisible(false);
      setReview(null);
      setOperator("");
      setFloatText("");
      setError("");
      setSavedNotice(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar. Os dados anteriores foram preservados.",
      );
      setReview(null);
    }
  };

  return (
    <>
      <Card>
        <View
          style={{
            flexDirection: "row",
            gap: 12,
            alignItems: "center",
            marginBottom: 20,
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
            <Icon name="key" color={C.green} size={22} />
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <Label>CAIXA PRINCIPAL · BAURU</Label>
            <Text
              accessibilityRole="header"
              style={{
                fontFamily: F.heading,
                color: C.ink,
                fontSize: 23,
                letterSpacing: -0.8,
              }}
            >
              Abertura do turno.
            </Text>
          </View>
        </View>
        <View style={{ gap: 16 }}>
          {demo ? (
            <Notice>
              Abertura real indisponível na demonstração. Saia desse modo para
              consultar ou registrar o caixa do posto.
            </Notice>
          ) : !ready ? (
            <Body>Carregando o registro local da abertura...</Body>
          ) : loadError ? (
            <>
              <Notice warning>
                {loadError} Nada foi apagado. Preserve os dados do navegador ou
                aparelho antes de limpar qualquer coisa.
              </Notice>
              <Button
                compact
                variant="secondary"
                icon="refresh-cw"
                disabled={busy}
                onPress={() => void reload()}
              >
                Tentar ler novamente
              </Button>
            </>
          ) : opening ? (
            <>
              {savedNotice && (
                <Notice>Abertura gravada neste dispositivo.</Notice>
              )}
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: C.green,
                  }}
                />
                <Text
                  style={{ fontFamily: F.bold, color: C.green, fontSize: 13 }}
                >
                  Aberto · aguardando fechamento
                </Text>
              </View>
              <Text
                style={{ fontFamily: F.heading, fontSize: 22, color: C.ink }}
              >
                {opening.operator}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
                <View style={{ minWidth: 130, flex: 1, gap: 7 }}>
                  <Label>FUNDO DE TROCO</Label>
                  <Text
                    style={{
                      fontFamily: F.extra,
                      fontVariant: ["tabular-nums"],
                      fontSize: 28,
                      color: C.green,
                    }}
                  >
                    {money(opening.openingFloat)}
                  </Text>
                  <Body size={11}>Custódia do caixa, não receita.</Body>
                </View>
                <View style={{ minWidth: 160, flex: 1, gap: 7 }}>
                  <Label>DATA E TURNO REGISTRADOS</Label>
                  <Body color={C.ink} size={13}>
                    {stationDateLabel(opening.operationDate)}
                  </Body>
                  <Body color={C.ink} size={13}>
                    {opening.shift.label} · {opening.shift.start}–
                    {opening.shift.end}
                  </Body>
                  <Body size={12}>
                    Aberto às {openingTimeLabel(opening.openedAt)} · São Paulo
                  </Body>
                </View>
              </View>
              <Notice warning>
                O fim do horário previsto não fecha este registro. Uma nova
                abertura fica bloqueada até o fechamento. Esse módulo será
                implementado na próxima etapa autorizada.
              </Notice>
              <Button
                variant="ghost"
                compact
                icon="refresh-cw"
                disabled={busy}
                onPress={() => void reload()}
              >
                Atualizar registro local
              </Button>
            </>
          ) : (
            <>
              <Body>
                Registre quem recebe o caixa e o fundo de troco contado. A data
                e o turno são identificados pelo horário de São Paulo.
              </Body>
              <View
                style={{
                  padding: 16,
                  backgroundColor: C.light,
                  borderRadius: 13,
                  gap: 6,
                }}
              >
                <Text
                  style={{ fontFamily: F.bold, color: C.green, fontSize: 14 }}
                >
                  {currentShift
                    ? `${currentShift.label} · ${currentShift.start}–${currentShift.end}`
                    : clockInvalid
                      ? "Confira a data do aparelho"
                      : "Fora do horário de funcionamento"}
                </Text>
                <Body size={12}>
                  {stationDateLabel(clock.date)} · {clock.time}
                </Body>
              </View>
              {!currentShift && (
                <Notice warning>
                  {clockInvalid
                    ? "A data está fora do intervalo de calendário suportado, 2026–2100. Corrija o relógio para registrar a abertura."
                    : "A abertura só pode ser registrada durante um turno previsto. A seleção de datas no calendário é apenas consulta."}
                </Notice>
              )}
              <Button
                icon="unlock"
                disabled={blocked || !currentShift}
                onPress={begin}
              >
                Registrar abertura
              </Button>
            </>
          )}
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: C.line,
              paddingTop: 14,
              gap: 8,
            }}
          >
            <Body size={11}>
              Etapa em construção: somente abertura. Movimentações e fechamento
              ainda não estão disponíveis. Não use como rotina completa de
              caixa.
            </Body>
            <Body size={11}>
              Use uma única janela e um único dispositivo por caixa. O nome do
              operador é declarado, sem autenticação ou assinatura digital.
            </Body>
            <Body size={11}>
              O registro fica neste navegador ou aparelho. O CSV do orçamento
              pessoal não inclui a abertura; limpar os dados locais ou
              desinstalar o app pode apagá-la.
            </Body>
          </View>
        </View>
      </Card>
      <Sheet
        visible={sheetVisible && !demo && ready && !loadError && !opening}
        onClose={closeSheet}
        title={review ? "Confira a abertura." : "Quem recebe o caixa?"}
        subtitle={
          review
            ? "Confirme os dados antes de gravar neste dispositivo."
            : "Caixa principal · os campos não alteram o orçamento pessoal."
        }
      >
        {review ? (
          <>
            <View
              style={{
                backgroundColor: C.light,
                padding: 18,
                borderRadius: 14,
                gap: 14,
              }}
            >
              <View style={{ gap: 5 }}>
                <Label>OPERADOR DECLARADO</Label>
                <Text
                  style={{ fontFamily: F.bold, color: C.ink, fontSize: 19 }}
                >
                  {review.operator}
                </Text>
              </View>
              <View style={{ gap: 5 }}>
                <Label>FUNDO DE TROCO</Label>
                <Text
                  style={{ fontFamily: F.extra, color: C.green, fontSize: 30 }}
                >
                  {money(review.openingFloat)}
                </Text>
              </View>
              <Body color={C.ink}>
                {stationDateLabel(review.operationDate)}
              </Body>
              <Body color={C.ink}>
                {review.shift.label} · {review.shift.start}–{review.shift.end}
              </Body>
            </View>
            {!reviewCurrent && (
              <Notice warning>
                O turno previsto mudou enquanto o formulário estava aberto.
                Volte e revise os dados novamente.
              </Notice>
            )}
            <Notice>
              O fundo é o dinheiro físico recebido para troco. Esta confirmação
              não cria receita e não autentica a identidade do operador.
            </Notice>
            <Button
              disabled={blocked || !reviewCurrent}
              icon="check"
              onPress={() => void confirm()}
            >
              {busy ? "Salvando abertura..." : "Confirmar e registrar"}
            </Button>
            <Button
              disabled={busy}
              variant="ghost"
              onPress={() => {
                setReview(null);
                setError("");
              }}
            >
              Voltar ao formulário
            </Button>
          </>
        ) : (
          <>
            <Notice>
              {currentShift
                ? `${stationDateLabel(clock.date)} · ${currentShift.label}, ${currentShift.start}–${currentShift.end}.`
                : "Nenhum turno previsto agora. Aguarde o horário de funcionamento."}
            </Notice>
            <Field
              label="Nome do operador"
              accessibilityLabel="Nome declarado do operador"
              value={operator}
              onChangeText={setOperator}
              editable={!busy}
              maxLength={80}
              autoCapitalize="words"
              placeholder="Nome de quem recebe o caixa"
            />
            <Field
              label="Fundo de troco (R$)"
              accessibilityLabel="Fundo de troco em reais"
              value={floatText}
              onChangeText={setFloatText}
              editable={!busy}
              keyboardType="decimal-pad"
              maxLength={24}
              placeholder="Ex.: 300,00"
            />
            <Body size={12}>
              Informe o valor contado. Se não houver fundo de troco, registre
              0,00.
            </Body>
            {error && <Notice warning>{error}</Notice>}
            <Button
              disabled={blocked || !currentShift}
              icon="arrow-right"
              onPress={prepare}
            >
              Revisar abertura
            </Button>
            <Button disabled={busy} variant="ghost" onPress={closeSheet}>
              Cancelar
            </Button>
          </>
        )}
      </Sheet>
    </>
  );
}
