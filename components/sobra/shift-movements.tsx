import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useBudget } from "@/hooks/use-budget";
import { useShiftMovements } from "@/hooks/use-shift-movements";
import { useStationClock } from "@/hooks/use-station-clock";
import { money, parseMoney } from "@/lib/budget";
import { getScheduledShift, getStationNow } from "@/lib/station-calendar";
import {
  createMovementIntentId,
  getMovementSummary,
  prepareShiftMovement,
} from "@/lib/shift-movements";
import type {
  MovementType,
  PaymentMethod,
  ShiftMovementDraft,
  ShiftMovementReview,
} from "@/lib/shift-movements";
import {
  Body,
  Button,
  C,
  Card,
  Chip,
  Field,
  F,
  Icon,
  Label,
  Notice,
  SectionTitle,
  Sheet,
} from "./ui";

const TYPE_OPTIONS: { id: MovementType; label: string }[] = [
  { id: "recebimento", label: "Recebimento" },
  { id: "sangria", label: "Sangria" },
  { id: "suprimento", label: "Suprimento" },
];
const PAYMENT_OPTIONS: { id: PaymentMethod; label: string }[] = [
  { id: "dinheiro", label: "Dinheiro" },
  { id: "pix", label: "Pix" },
  { id: "debito", label: "Débito" },
  { id: "credito", label: "Crédito" },
];
const METHOD_LABEL: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Débito",
  credito: "Crédito",
};
const TYPE_LABEL: Record<MovementType, string> = {
  recebimento: "Recebimento",
  sangria: "Sangria",
  suprimento: "Suprimento",
};
const emptyDraft = (): ShiftMovementDraft => ({
  type: "recebimento",
  paymentMethod: "dinheiro",
  receiptNature: "venda",
  amount: 0,
  description: "",
  reference: "",
  counterparty: "",
  responsible: "",
});
function timeLabel(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function ShiftMovementsPanel() {
  const { demo } = useBudget();
  const { data, opening, ready, busy, loadError, reload, record } =
    useShiftMovements();
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<ShiftMovementDraft>(emptyDraft);
  const [amountText, setAmountText] = useState("");
  const [review, setReview] = useState<ShiftMovementReview | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const now = useStationClock();
  let shiftNow = null;
  let clockError = false;
  try {
    const local = getStationNow(now);
    shiftNow = getScheduledShift(local.date, local.time);
  } catch {
    clockError = true;
  }
  const windowActive = Boolean(
    opening &&
    shiftNow &&
    opening.operationDate === getStationNow(now).date &&
    opening.shift.id === shiftNow.id &&
    now.getTime() >= Date.parse(opening.openedAt),
  );
  const blocked =
    demo || !ready || busy || Boolean(loadError) || !opening || !windowActive;
  const summary = useMemo(
    () =>
      opening
        ? getMovementSummary(
            opening,
            data.opening ? data : { ...data, opening },
          )
        : null,
    [opening, data],
  );
  const patch = (part: Partial<ShiftMovementDraft>) =>
    setDraft((prev) => ({ ...prev, ...part }));
  const close = () => {
    if (busy) return;
    setVisible(false);
    setReview(null);
    setError("");
  };
  const start = () => {
    if (blocked) return;
    setSuccess("");
    setError("");
    setDraft(emptyDraft());
    setAmountText("");
    setReview(null);
    setVisible(true);
  };
  const prepare = () => {
    if (!opening || blocked) return;
    try {
      const amount = parseMoney(amountText);
      if (amount === null)
        throw new Error(
          "Informe um valor em reais válido, por exemplo 125,50.",
        );
      const normalized: ShiftMovementDraft = { ...draft, amount };
      setReview(
        prepareShiftMovement(
          data,
          opening,
          normalized,
          now,
          createMovementIntentId(),
        ),
      );
      setError("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível revisar a movimentação.",
      );
    }
  };
  const confirm = async () => {
    if (!review || demo || !ready || busy || loadError || !opening) return;
    try {
      await record(review);
      setSuccess("Movimentação registrada neste dispositivo.");
      setVisible(false);
      setReview(null);
      setDraft(emptyDraft());
      setAmountText("");
      setError("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Falha ao gravar. O histórico anterior foi preservado.",
      );
    }
  };
  const reviewStillCurrent = Boolean(
    review &&
    opening &&
    review.openingId === opening.id &&
    review.expectedRevision === data.revision &&
    shiftNow &&
    review.operationDate === getStationNow(now).date &&
    review.shiftId === shiftNow.id &&
    windowActive,
  );
  const receipt = draft.type === "recebimento";
  const physical = draft.paymentMethod === "dinheiro";

  return (
    <>
      <Card>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 13,
              backgroundColor: C.light,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="activity" color={C.green} size={21} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Label>CAIXA PRINCIPAL</Label>
            <Text
              accessibilityRole="header"
              style={{ fontFamily: F.heading, fontSize: 22, color: C.ink }}
            >
              Movimentos do turno.
            </Text>
          </View>
        </View>
        {demo ? (
          <Notice>Movimentações reais indisponíveis na demonstração.</Notice>
        ) : !ready ? (
          <Body>Carregando o histórico local...</Body>
        ) : loadError ? (
          <>
            <Notice warning>
              {loadError} Os dados não foram apagados; nenhuma gravação está
              disponível até a releitura.
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
        ) : !opening ? (
          <Notice>
            Registre a abertura do turno acima antes de lançar recebimentos,
            sangrias ou suprimentos.
          </Notice>
        ) : (
          <>
            {success ? <Notice>{success}</Notice> : null}
            {!windowActive && (
              <Notice warning>
                {clockError
                  ? "Confira a data e o relógio do aparelho. O histórico permanece disponível, mas novos movimentos estão bloqueados."
                  : "O horário previsto deste turno terminou ou mudou. O histórico permanece disponível, mas novos movimentos estão bloqueados."}
              </Notice>
            )}
            {summary && (
              <>
                <View
                  style={{
                    padding: 16,
                    backgroundColor: C.green,
                    borderRadius: 15,
                    gap: 8,
                  }}
                >
                  <Label color={C.lime}>DINHEIRO ESPERADO NA GAVETA</Label>
                  <Text
                    style={{
                      fontFamily: F.extra,
                      color: C.white,
                      fontSize: 30,
                    }}
                  >
                    {money(summary.cashExpected)}
                  </Text>
                  <Body color="#D0DDCE" size={11}>
                    Estimativa: fundo + entradas em dinheiro + suprimentos −
                    sangrias. Não é contagem física.
                  </Body>
                </View>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {PAYMENT_OPTIONS.map((method) => (
                    <View
                      key={method.id}
                      style={{
                        flexGrow: 1,
                        minWidth: 125,
                        padding: 12,
                        borderRadius: 12,
                        backgroundColor: C.light,
                        gap: 5,
                      }}
                    >
                      <Label>{method.label.toUpperCase()}</Label>
                      <Text
                        style={{
                          color: C.ink,
                          fontFamily: F.bold,
                          fontSize: 16,
                        }}
                      >
                        {money(summary.receiptsByMethod[method.id])}
                      </Text>
                    </View>
                  ))}
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <Body>Vendas registradas</Body>
                  <Body color={C.ink}>{money(summary.sales)}</Body>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <Body>Contas anteriores recebidas</Body>
                  <Body color={C.ink}>{money(summary.previousReceipts)}</Body>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <Body>Suprimentos / sangrias</Body>
                  <Body color={C.ink}>
                    {money(summary.supplies)} / {money(summary.withdrawals)}
                  </Body>
                </View>
                <Button
                  icon="plus"
                  disabled={blocked || !windowActive}
                  onPress={start}
                >
                  Registrar movimentação
                </Button>
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: C.line,
                    paddingTop: 14,
                    gap: 10,
                  }}
                >
                  <SectionTitle
                    title={`Histórico · ${data.movements.length}`}
                  />
                  {data.movements.length === 0 ? (
                    <Body>Nenhuma movimentação neste turno.</Body>
                  ) : (
                    [...data.movements].reverse().map((item) => (
                      <View
                        key={item.id}
                        style={{
                          flexDirection: "row",
                          gap: 12,
                          paddingVertical: 10,
                          borderTopWidth: 1,
                          borderTopColor: C.line,
                        }}
                      >
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text
                            style={{
                              color: C.ink,
                              fontFamily: F.bold,
                              fontSize: 13,
                            }}
                          >
                            {TYPE_LABEL[item.type]} · {item.description}
                          </Text>
                          <Body size={11}>
                            {timeLabel(item.recordedAt)} · {item.responsible}
                            {item.type === "recebimento"
                              ? ` · ${METHOD_LABEL[item.paymentMethod]}${item.receiptNature === "conta-anterior" ? " · conta anterior" : " · venda"}`
                              : ` · ${item.counterparty}`}
                            {item.reference ? ` · ref. ${item.reference}` : ""}
                          </Body>
                        </View>
                        <Text
                          style={{
                            color: item.type === "sangria" ? C.orange : C.green,
                            fontFamily: F.bold,
                          }}
                        >
                          {item.type === "sangria" ? "−" : "+"}
                          {money(item.amount)}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </>
            )}
          </>
        )}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: C.line,
            paddingTop: 13,
            marginTop: 16,
            gap: 7,
          }}
        >
          <Body size={11}>
            Registro manual, local e por operador declarado. Pix/cartões não são
            verificados no banco; não informe PAN, CVV nem senha.
          </Body>
          <Body size={11}>
            Sangrias e suprimentos são custódia, não despesa nem receita. Sem
            fechamento, estorno, exportação ou sincronização nesta etapa.
          </Body>
        </View>
      </Card>
      <Sheet
        visible={visible && Boolean(opening) && !demo && ready && !loadError}
        onClose={close}
        title={review ? "Confira a movimentação." : "Novo movimento."}
        subtitle="Caixa principal · confirme antes de gravar neste dispositivo."
      >
        {review ? (
          <>
            <View
              style={{
                padding: 16,
                backgroundColor: C.light,
                borderRadius: 14,
                gap: 11,
              }}
            >
              <Label>{TYPE_LABEL[review.type].toUpperCase()}</Label>
              <Text
                style={{ color: C.green, fontFamily: F.extra, fontSize: 28 }}
              >
                {money(review.amount)}
              </Text>
              <Body color={C.ink}>{review.description}</Body>
              {review.type === "recebimento" && (
                <Body color={C.ink}>
                  {METHOD_LABEL[review.paymentMethod]} ·{" "}
                  {review.receiptNature === "venda"
                    ? "venda deste turno"
                    : "conta anterior"}
                </Body>
              )}
              {review.reference ? (
                <Body>Referência: {review.reference}</Body>
              ) : null}
              {review.counterparty ? (
                <Body>Origem/destino: {review.counterparty}</Body>
              ) : null}
              <Body>Responsável declarado: {review.responsible}</Body>
            </View>
            {!reviewStillCurrent && (
              <Notice warning>
                A abertura, o turno ou o histórico mudou. Volte ao formulário
                para revisar novamente.
              </Notice>
            )}
            <Notice>
              {review.type === "sangria"
                ? "A sangria reduz apenas o dinheiro físico esperado."
                : review.type === "suprimento"
                  ? "O suprimento aumenta apenas o dinheiro físico esperado."
                  : "Recebimentos não equivalem a lucro nem a confirmação bancária."}
            </Notice>
            {error ? <Notice warning>{error}</Notice> : null}
            <Button
              icon="check"
              disabled={busy || demo || !ready || Boolean(loadError)}
              onPress={() => void confirm()}
            >
              {busy ? "Gravando..." : "Confirmar e registrar"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
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
            <View style={{ gap: 8 }}>
              <Label>TIPO DE MOVIMENTO</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                {TYPE_OPTIONS.map((o) => (
                  <Chip
                    key={o.id}
                    selected={draft.type === o.id}
                    onPress={() => {
                      patch({
                        type: o.id,
                        receiptNature: o.id === "recebimento" ? "venda" : null,
                        paymentMethod: "dinheiro",
                        counterparty: "",
                      });
                      setError("");
                    }}
                  >
                    {o.label}
                  </Chip>
                ))}
              </View>
            </View>
            {receipt && (
              <>
                <View style={{ gap: 8 }}>
                  <Label>MEIO DE PAGAMENTO</Label>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}
                  >
                    {PAYMENT_OPTIONS.map((o) => (
                      <Chip
                        key={o.id}
                        selected={draft.paymentMethod === o.id}
                        onPress={() => patch({ paymentMethod: o.id })}
                      >
                        {o.label}
                      </Chip>
                    ))}
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  <Label>NATUREZA DO RECEBIMENTO</Label>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}
                  >
                    <Chip
                      selected={draft.receiptNature === "venda"}
                      onPress={() => patch({ receiptNature: "venda" })}
                    >
                      Venda deste turno
                    </Chip>
                    <Chip
                      selected={draft.receiptNature === "conta-anterior"}
                      onPress={() => patch({ receiptNature: "conta-anterior" })}
                    >
                      Conta anterior
                    </Chip>
                  </View>
                </View>
              </>
            )}
            <Field
              label="Valor (R$)"
              accessibilityLabel="Valor em reais"
              keyboardType="decimal-pad"
              maxLength={24}
              value={amountText}
              onChangeText={setAmountText}
              placeholder="Ex.: 125,50"
            />
            <Field
              label="Descrição"
              accessibilityLabel="Descrição da movimentação"
              maxLength={200}
              value={draft.description}
              onChangeText={(v) => patch({ description: v })}
              placeholder={
                draft.type === "recebimento"
                  ? "Ex.: venda de combustível"
                  : draft.type === "sangria"
                    ? "Ex.: retirada para cofre"
                    : "Ex.: troco para caixa"
              }
            />
            <Field
              label={
                receipt
                  ? "Referência (obrigatória em Pix/cartão e conta anterior)"
                  : "Referência (opcional)"
              }
              accessibilityLabel="Referência documental ou da transação"
              maxLength={120}
              value={draft.reference}
              onChangeText={(v) => patch({ reference: v })}
              placeholder={
                physical
                  ? "Cupom, turno ou observação"
                  : "NSU/ID da transação, sem dados do cartão"
              }
            />
            {!receipt && (
              <Field
                label={
                  draft.type === "sangria"
                    ? "Destino da sangria"
                    : "Origem do suprimento"
                }
                accessibilityLabel="Origem ou destino do dinheiro"
                maxLength={120}
                value={draft.counterparty}
                onChangeText={(v) => patch({ counterparty: v })}
                placeholder={
                  draft.type === "sangria"
                    ? "Ex.: cofre identificado"
                    : "Ex.: responsável pelo aporte"
                }
              />
            )}
            <Field
              label="Responsável declarado"
              accessibilityLabel="Responsável declarado"
              maxLength={80}
              autoCapitalize="words"
              value={draft.responsible}
              onChangeText={(v) => patch({ responsible: v })}
              placeholder="Nome de quem registra"
            />
            {draft.type !== "recebimento" && (
              <Notice>
                Movimento de custódia em dinheiro, não será somado como receita
                ou despesa.
              </Notice>
            )}
            {error ? <Notice warning>{error}</Notice> : null}
            <Button icon="arrow-right" disabled={blocked} onPress={prepare}>
              Revisar movimentação
            </Button>
            <Button variant="ghost" disabled={busy} onPress={close}>
              Cancelar
            </Button>
          </>
        )}
      </Sheet>
    </>
  );
}
