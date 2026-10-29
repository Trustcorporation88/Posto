import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useBudget } from "@/hooks/use-budget";
import { useStationRegister } from "@/hooks/use-station-register";
import { useStationClock } from "@/hooks/use-station-clock";
import { money, parseMoney } from "@/lib/budget";
import { getMovementSummary } from "@/lib/shift-movements";
import {
  createStationClosureId,
  movementDataForRegister,
  prepareStationClosure,
} from "@/lib/station-register";
import type {
  MethodTotals,
  ShiftClosure,
  ShiftClosureReview,
} from "@/lib/station-register";
import {
  Body,
  Button,
  C,
  Card,
  Field,
  F,
  Label,
  Notice,
  SectionTitle,
  Sheet,
} from "./ui";
import { stationDateLabel } from "./station-month";

const METHODS: {
  id: keyof MethodTotals;
  label: string;
  mode: "contado" | "relatorio";
}[] = [
  { id: "dinheiro", label: "Dinheiro físico contado", mode: "contado" },
  { id: "pix", label: "Pix no relatório", mode: "relatorio" },
  { id: "debito", label: "Débito no relatório", mode: "relatorio" },
  { id: "credito", label: "Crédito no relatório", mode: "relatorio" },
];
const emptyCounts = () => ({ dinheiro: "", pix: "", debito: "", credito: "" });
function instantLabel(instant: string, seconds = false): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" as const } : {}),
    hourCycle: "h23",
  }).format(new Date(instant));
}
function differenceLabel(value: number): { text: string; color: string } {
  if (value > 0) return { text: `Sobra ${money(value)}`, color: C.green };
  if (value < 0)
    return { text: `Falta ${money(Math.abs(value))}`, color: C.orange };
  return { text: "Sem diferença", color: C.muted };
}
function timeOnly(instant: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instant));
}
function ClosureHistory({ closure }: { closure: ShiftClosure }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: C.line,
        paddingTop: 14,
        gap: 9,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontFamily: F.bold, color: C.ink, fontSize: 14 }}>
            {stationDateLabel(closure.opening.operationDate)} ·{" "}
            {closure.opening.shift.label}
          </Text>
          <Body size={11}>
            {closure.opening.shift.start}–{closure.opening.shift.end} · aberto
            por {closure.opening.operator} · fechado{" "}
            {instantLabel(closure.closedAt)}
          </Body>
        </View>
        <Text
          style={{
            fontFamily: F.bold,
            color: closure.status === "diferenca-pendente" ? C.orange : C.green,
            fontSize: 11,
            textAlign: "right",
            flexShrink: 1,
          }}
        >
          {closure.status === "diferenca-pendente"
            ? "Diferença pendente"
            : "Fechado"}
        </Text>
      </View>
      <Body size={11}>
        Fechamento declarado por {closure.closingOperator} · conferente
        declarado: {closure.confirmer}
      </Body>
      <Button
        compact
        variant="ghost"
        onPress={() => setExpanded((value) => !value)}
      >
        {expanded
          ? "Ocultar detalhes do turno"
          : "Ver conferência e movimentos"}
      </Button>
      {expanded && (
        <View
          style={{
            backgroundColor: C.light,
            padding: 13,
            borderRadius: 13,
            gap: 11,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Label>MEIO</Label>
            <Label>ESPERADO</Label>
            <Label>INFORMADO</Label>
            <Label>DIFERENÇA</Label>
          </View>
          {METHODS.map((method) => {
            const difference = differenceLabel(
              closure.totals.differenceByMethod[method.id],
            );
            return (
              <View
                key={method.id}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: C.line,
                  paddingTop: 8,
                  gap: 4,
                }}
              >
                <Text
                  style={{ fontFamily: F.bold, color: C.ink, fontSize: 12 }}
                >
                  {method.label
                    .replace(" físico contado", "")
                    .replace(" no relatório", "")}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <Body size={11}>
                    Esperado {money(closure.totals.expectedByMethod[method.id])}
                  </Body>
                  <Body size={11}>
                    Informado {money(closure.totals.countedByMethod[method.id])}
                  </Body>
                  <Text
                    style={{
                      color: difference.color,
                      fontFamily: F.bold,
                      fontSize: 11,
                    }}
                  >
                    {difference.text}
                  </Text>
                </View>
              </View>
            );
          })}
          <Body size={11}>
            Fundo {money(closure.totals.openingFloat)} · vendas registradas{" "}
            {money(closure.totals.sales)} · contas anteriores{" "}
            {money(closure.totals.previousReceipts)} · suprimentos{" "}
            {money(closure.totals.supplies)} · sangrias{" "}
            {money(closure.totals.withdrawals)}
          </Body>
          {closure.varianceReason ? (
            <View style={{ gap: 4 }}>
              <Label>JUSTIFICATIVA DECLARADA</Label>
              <Body color={C.ink}>{closure.varianceReason}</Body>
            </View>
          ) : null}
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: C.line,
              paddingTop: 8,
              gap: 7,
            }}
          >
            <Label>MOVIMENTOS CONGELADOS · {closure.movements.length}</Label>
            {closure.movements.length === 0 ? (
              <Body size={11}>Nenhum movimento lançado neste turno.</Body>
            ) : (
              [...closure.movements].reverse().map((movement) => (
                <View
                  key={movement.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{ color: C.ink, fontFamily: F.bold, fontSize: 11 }}
                    >
                      {timeOnly(movement.recordedAt)} · {movement.description}
                    </Text>
                    <Body size={10}>
                      {movement.responsible}
                      {movement.type === "recebimento"
                        ? ` · ${movement.paymentMethod}${movement.receiptNature === "conta-anterior" ? " · conta anterior" : " · venda"}`
                        : ` · ${movement.counterparty}`}
                      {movement.reference
                        ? ` · ref. ${movement.reference}`
                        : ""}
                    </Body>
                  </View>
                  <Text
                    style={{
                      color: movement.type === "sangria" ? C.orange : C.green,
                      fontFamily: F.bold,
                      fontSize: 11,
                    }}
                  >
                    {movement.type === "sangria" ? "−" : "+"}
                    {money(movement.amount)}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      )}
    </View>
  );
}

export function ShiftClosingPanel() {
  const { demo } = useBudget();
  const { data, ready, busy, loadError, reload, close } = useStationRegister();
  const now = useStationClock();
  const opening = data.opening;
  const summary = useMemo(
    () =>
      opening
        ? getMovementSummary(opening, movementDataForRegister(data))
        : null,
    [data, opening],
  );
  const [visible, setVisible] = useState(false);
  const [countTexts, setCountTexts] = useState(emptyCounts);
  const [closingOperator, setClosingOperator] = useState("");
  const [confirmer, setConfirmer] = useState("");
  const [varianceReason, setVarianceReason] = useState("");
  const [review, setReview] = useState<ShiftClosureReview | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expanded, setExpanded] = useState(true);
  const blocked = demo || !ready || busy || Boolean(loadError);
  const reviewCurrent = Boolean(
    review &&
    opening &&
    review.openingId === opening.id &&
    review.expectedRegisterRevision === data.revision,
  );
  const begin = () => {
    if (blocked || !opening) return;
    setError("");
    setSuccess("");
    setReview(null);
    setVisible(true);
  };
  const updateCount = (method: keyof MethodTotals, value: string) => {
    setCountTexts((current) => ({ ...current, [method]: value }));
  };
  const prepare = () => {
    if (blocked || !opening) return;
    try {
      const countedByMethod = Object.fromEntries(
        METHODS.map((method) => {
          const text = countTexts[method.id];
          if (!text.trim())
            throw new Error(
              `Informe ${method.label.toLowerCase()}; digite 0,00 quando não houver valor.`,
            );
          const value = parseMoney(text);
          if (value === null)
            throw new Error(`Valor inválido em ${method.label.toLowerCase()}.`);
          return [method.id, value];
        }),
      ) as MethodTotals;
      setReview(
        prepareStationClosure(
          data,
          { closingOperator, confirmer, countedByMethod, varianceReason },
          now,
          createStationClosureId(),
        ),
      );
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível revisar o fechamento.",
      );
    }
  };
  const confirm = async () => {
    if (!review || blocked || !reviewCurrent) return;
    try {
      await close(review);
      setVisible(false);
      setReview(null);
      setCountTexts(emptyCounts());
      setClosingOperator("");
      setConfirmer("");
      setVarianceReason("");
      setError("");
      setSuccess(
        "Fechamento gravado neste dispositivo. O turno está encerrado.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Falha ao fechar; os registros anteriores foram preservados.",
      );
    }
  };
  const latest = data.closures[data.closures.length - 1];
  const newestFirst = [...data.closures].reverse();

  return (
    <>
      <Card>
        <SectionTitle
          title="Fechamento do turno."
          eyebrow="CONFERÊNCIA MANUAL · CAIXA PRINCIPAL"
        />
        <View style={{ gap: 14 }}>
          {demo ? (
            <Notice>Fechamento real indisponível na demonstração.</Notice>
          ) : !ready ? (
            <Body>Carregando o registro local dos turnos...</Body>
          ) : loadError ? (
            <>
              <Notice warning>
                {loadError} Nenhum dado foi apagado e o fechamento está
                bloqueado até reler o registro.
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
          ) : (
            <>
              {success ? <Notice>{success}</Notice> : null}
              {opening ? (
                <>
                  <View
                    style={{
                      padding: 15,
                      backgroundColor: C.light,
                      borderRadius: 13,
                      gap: 5,
                    }}
                  >
                    <Text
                      style={{
                        color: C.green,
                        fontFamily: F.bold,
                        fontSize: 14,
                      }}
                    >
                      {opening.shift.label} · {opening.shift.start}–
                      {opening.shift.end}
                    </Text>
                    <Body color={C.ink}>
                      {stationDateLabel(opening.operationDate)} · aberto por{" "}
                      {opening.operator}
                    </Body>
                    <Body size={11}>
                      Abertura às {instantLabel(opening.openedAt, true)} · fundo{" "}
                      {money(opening.openingFloat)}
                    </Body>
                  </View>
                  <Notice warning>
                    Informe a contagem física de dinheiro e os valores brutos
                    dos relatórios. Os campos começam vazios. A diferença fica
                    registrada e não altera receitas ou despesas.
                  </Notice>
                  {summary && (
                    <Body size={12}>
                      Esperado em dinheiro: {money(summary.cashExpected)} · Pix:{" "}
                      {money(summary.receiptsByMethod.pix)} · débito:{" "}
                      {money(summary.receiptsByMethod.debito)} · crédito:{" "}
                      {money(summary.receiptsByMethod.credito)}. Este resumo é
                      operacional, não lucro nem saldo bancário.
                    </Body>
                  )}
                  <Button icon="lock" disabled={blocked} onPress={begin}>
                    Conferir e fechar turno
                  </Button>
                  <Button
                    compact
                    variant="ghost"
                    disabled={busy}
                    onPress={() => void reload()}
                  >
                    Atualizar registro
                  </Button>
                  <Body size={11}>
                    É permitido registrar o fechamento após o horário previsto,
                    sem lançar movimentos retroativos. Para o próximo turno,
                    informe novamente o fundo que foi efetivamente contado.
                  </Body>
                </>
              ) : (
                <Notice>
                  {latest
                    ? `Último turno fechado: ${stationDateLabel(latest.opening.operationDate)}, ${latest.opening.shift.label}. Consulte o histórico abaixo. Uma nova abertura só pode ocorrer no horário previsto.`
                    : "Ainda não há turno aberto. Registre uma abertura durante um horário previsto para conferir e fechar o caixa."}
                </Notice>
              )}
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: C.line,
                  paddingTop: 13,
                  gap: 8,
                }}
              >
                <Button
                  compact
                  variant="ghost"
                  onPress={() => setExpanded((value) => !value)}
                >
                  {expanded
                    ? `Ocultar histórico · ${data.closures.length}`
                    : `Histórico de fechamentos · ${data.closures.length}`}
                </Button>
                {expanded &&
                  (newestFirst.length ? (
                    newestFirst.map((item) => (
                      <ClosureHistory key={item.id} closure={item} />
                    ))
                  ) : (
                    <Body>Nenhum fechamento registrado neste dispositivo.</Body>
                  ))}
              </View>
            </>
          )}
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: C.line,
              paddingTop: 12,
              gap: 6,
            }}
          >
            <Body size={11}>
              Pix e cartões são informados manualmente a partir de relatórios. O
              app não consulta banco, adquirente ou PDV e não declara
              conciliação, auditoria, assinatura digital ou resultado fiscal.
            </Body>
            <Body size={11}>
              Fechamentos preservados neste dispositivo não podem ser editados
              ou reabertos nesta etapa. Use uma janela e um dispositivo por
              caixa; nomes são declarações, não autenticação.
            </Body>
          </View>
        </View>
      </Card>
      <Sheet
        visible={visible && Boolean(opening) && !demo && ready && !loadError}
        onClose={() => {
          if (!busy) {
            setVisible(false);
            setReview(null);
            setError("");
          }
        }}
        title={review ? "Revise o fechamento." : "Conte antes de fechar."}
        subtitle="Caixa principal · conferência manual, sem gravação automática dos valores previstos."
      >
        {review ? (
          <>
            <View
              style={{
                backgroundColor: C.light,
                padding: 16,
                borderRadius: 14,
                gap: 11,
              }}
            >
              <Body color={C.ink}>
                {opening
                  ? `${stationDateLabel(opening.operationDate)} · ${opening.shift.label} · aberto por ${opening.operator}`
                  : "Abertura não disponível"}
              </Body>
              <Body color={C.ink}>
                Fechamento proposto: {instantLabel(review.closedAt, true)} ·
                horário de São Paulo
              </Body>
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: C.line,
                  paddingTop: 10,
                  gap: 10,
                }}
              >
                {METHODS.map((method) => {
                  const diff = differenceLabel(
                    review.differenceByMethod[method.id],
                  );
                  return (
                    <View key={method.id} style={{ gap: 3 }}>
                      <Label>{method.label.toUpperCase()}</Label>
                      <Body color={C.ink}>
                        Esperado {money(review.expectedByMethod[method.id])} ·
                        informado {money(review.countedByMethod[method.id])}
                      </Body>
                      <Text
                        style={{
                          color: diff.color,
                          fontFamily: F.bold,
                          fontSize: 13,
                        }}
                      >
                        {diff.text}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <Body color={C.ink}>
                Responsável: {review.closingOperator} · conferente declarado:{" "}
                {review.confirmer}
              </Body>
              {review.varianceReason ? (
                <View style={{ gap: 3 }}>
                  <Label>JUSTIFICATIVA</Label>
                  <Body color={C.ink}>{review.varianceReason}</Body>
                </View>
              ) : null}
            </View>
            {review.differenceByMethod &&
            Object.values(review.differenceByMethod).some(
              (value) => value !== 0,
            ) ? (
              <Notice warning>
                O fechamento ficará “diferença pendente”. Os valores serão
                preservados como informados, sem ajuste automático.
              </Notice>
            ) : (
              <Notice>
                Os valores informados coincidem com o esperado. Isso não
                significa conciliação bancária ou auditoria.
              </Notice>
            )}
            {!reviewCurrent ? (
              <Notice warning>
                O registro mudou desde a revisão. Atualize e prepare uma nova
                conferência antes de fechar.
              </Notice>
            ) : null}
            <Button
              icon="lock"
              disabled={blocked || !reviewCurrent}
              onPress={() => void confirm()}
            >
              {busy
                ? "Gravando fechamento..."
                : "Confirmar fechamento definitivo"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onPress={() => {
                setReview(null);
                setError("");
              }}
            >
              Voltar e corrigir a contagem
            </Button>
          </>
        ) : (
          <>
            <Notice>
              Dinheiro: conte as cédulas/moedas, incluindo o fundo. Pix e
              cartões: consulte os relatórios do turno e informe o valor bruto
              operacional. Digite 0,00 quando o método não tiver movimento.
            </Notice>
            {METHODS.map((method) => (
              <Field
                key={method.id}
                label={`${method.label} (R$)`}
                accessibilityLabel={`${method.label}, valor em reais`}
                value={countTexts[method.id]}
                onChangeText={(value) => updateCount(method.id, value)}
                editable={!busy}
                keyboardType="decimal-pad"
                maxLength={24}
                placeholder="Informe o valor, ex.: 125,50"
              />
            ))}
            <Field
              label="Responsável pelo fechamento"
              value={closingOperator}
              onChangeText={setClosingOperator}
              editable={!busy}
              maxLength={80}
              autoCapitalize="words"
              placeholder="Nome declarado"
            />
            <Field
              label="Conferente declarado"
              value={confirmer}
              onChangeText={setConfirmer}
              editable={!busy}
              maxLength={80}
              autoCapitalize="words"
              placeholder="Nome de quem confere"
            />
            <Field
              label="Justificativa se houver diferença"
              value={varianceReason}
              onChangeText={setVarianceReason}
              editable={!busy}
              maxLength={500}
              multiline
              placeholder="Será obrigatória se algum valor divergir"
            />
            {error ? <Notice warning>{error}</Notice> : null}
            <Button icon="eye" disabled={blocked || !opening} onPress={prepare}>
              Revisar valores e diferenças
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onPress={() => {
                setVisible(false);
                setReview(null);
                setError("");
              }}
            >
              Cancelar, mantendo os campos
            </Button>
          </>
        )}
      </Sheet>
    </>
  );
}
