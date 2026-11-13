import React from "react";
import { Text, View } from "react-native";
import {
  Body,
  Button,
  C,
  Card,
  F,
  Label,
  Notice,
  SectionTitle,
} from "@/components/sobra/ui";
import {
  CASH_CLOSING_METHOD_LABELS,
  CASH_CLOSING_METHODS,
  type CashClosingReview as CashClosingReviewModel,
} from "@/lib/business/cash-closing-ui";
import { formatCents } from "@/lib/business/fuel-domain";
import { STATION_CALENDAR_META } from "@/lib/station-calendar";

function formatServerDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Horário indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: STATION_CALENDAR_META.timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatOperationDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    dateStyle: "long",
  }).format(date);
}

function signedCents(value: number) {
  if (value > 0) return `+${formatCents(value)}`;
  if (value < 0) return `−${formatCents(Math.abs(value))}`;
  return formatCents(0);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 14,
        borderTopWidth: 1,
        borderColor: C.line,
        paddingTop: 11,
      }}
    >
      <Body size={12}>{label}</Body>
      <Text
        selectable
        style={{
          flex: 1,
          color: C.ink,
          fontFamily: F.bold,
          fontSize: 12,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function CashClosingReview({
  review,
  error,
  stale,
  uncertain,
  pending,
  blocked,
  refreshing,
  authorized,
  actorMatches,
  csrfReady,
  onConfirm,
  onBack,
  onRefresh,
}: {
  review: CashClosingReviewModel;
  error: string;
  stale: boolean;
  uncertain: boolean;
  pending: boolean;
  blocked: boolean;
  refreshing: boolean;
  authorized: boolean;
  actorMatches: boolean;
  csrfReady: boolean;
  onConfirm: () => void;
  onBack: (cancelled: boolean) => void;
  onRefresh: () => void;
}) {
  const totals = review.totals;
  const differencePending = review.status === "diferenca-pendente";

  return (
    <Card style={{ gap: 16 }}>
      <SectionTitle
        title="Revisão do fechamento"
        eyebrow="CONFIRMAÇÃO EXPLÍCITA"
      />
      <Body>
        Confirme a abertura original, o resumo integral, os valores conferidos e
        as diferenças por meio. Cancelar ou voltar não grava; apenas a
        confirmação explícita abaixo envia a intenção imutável ao servidor.
      </Body>
      <View style={{ gap: 11 }}>
        <DetailRow label="Unidade" value={review.unitName} />
        <DetailRow label="Caixa" value={review.registerName} />
        <DetailRow
          label="Abertura revisada"
          value={`#${review.payload.openingId}`}
        />
        <DetailRow
          label="Autor da abertura"
          value={`${review.openingOperatorName} · ID ${review.openingOperatorId}`}
        />
        <DetailRow
          label="Fechador e conferente autenticado"
          value={`${review.closingActorName} · ID ${review.closingActorId}`}
        />
        <DetailRow
          label="Data operacional original"
          value={formatOperationDate(review.payload.operationDate)}
        />
        <DetailRow
          label="Turno original"
          value={`${review.shiftLabel} · ${review.shiftStart}–${review.shiftEnd}`}
        />
        <DetailRow
          label="Abertura registrada pelo servidor"
          value={formatServerDateTime(review.opening.openedAt)}
        />
        <DetailRow
          label="Revisão global esperada"
          value={String(review.payload.expectedRevision)}
        />
      </View>

      <View style={{ gap: 9 }}>
        <Label>QUATRO VALORES POR MEIO · CENTAVOS INTEIROS</Label>
        {CASH_CLOSING_METHODS.map((method) => {
          const difference = totals.differenceByMethod[method];
          const differenceColor =
            difference > 0 ? C.green : difference < 0 ? C.orange : C.muted;
          return (
            <View
              key={method}
              accessibilityLabel={`${CASH_CLOSING_METHOD_LABELS[method]}: esperado ${formatCents(totals.expectedByMethod[method])}, conferido ${formatCents(totals.countedByMethod[method])}, diferença ${signedCents(difference)}`}
              style={{
                borderWidth: 1,
                borderColor: C.line,
                borderRadius: 12,
                padding: 12,
                gap: 9,
              }}
            >
              <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 12 }}>
                {CASH_CLOSING_METHOD_LABELS[method]}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <ValueCell
                  label="Esperado"
                  value={formatCents(totals.expectedByMethod[method])}
                />
                <ValueCell
                  label="Conferido"
                  value={formatCents(totals.countedByMethod[method])}
                />
                <ValueCell
                  label="Diferença"
                  value={signedCents(difference)}
                  color={differenceColor}
                />
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ gap: 8 }}>
        <Label>RESUMO INTEGRAL CONGELADO</Label>
        <DetailRow
          label="Fundo de abertura incluído no dinheiro esperado"
          value={formatCents(totals.openingFloat)}
        />
        <DetailRow
          label="Vendas registradas"
          value={formatCents(totals.sales)}
        />
        <DetailRow
          label="Recebimentos de contas anteriores"
          value={formatCents(totals.previousReceipts)}
        />
        <DetailRow label="Suprimentos" value={formatCents(totals.supplies)} />
        <DetailRow label="Sangrias" value={formatCents(totals.withdrawals)} />
        <DetailRow
          label="Movimentos no resumo completo"
          value={String(totals.movementCount)}
        />
      </View>

      <Notice warning={differencePending}>
        {differencePending
          ? "Situação resultante: diferença pendente. O turno será encerrado; nenhuma diferença vira movimento ou ajuste automático. A conferência não confirma dados bancários ou fiscais."
          : "Situação resultante: fechado. Os quatro valores conferidos coincidem com o resumo; isso não representa auditoria, liquidação ou conciliação bancária."}
      </Notice>
      <DetailRow
        label="Status resultante"
        value={differencePending ? "Diferença pendente" : "Fechado"}
      />
      <DetailRow
        label="Justificativa manual"
        value={
          review.payload.varianceReason ||
          "Sem diferença; justificativa não necessária"
        }
      />

      {error ? <Notice warning>{error}</Notice> : null}
      {uncertain ? (
        <Notice warning>
          A resposta do servidor é incerta. A revisão, os campos e o UUID foram
          mantidos. Somente uma repetição manual da mesma intenção, pelo ator
          autenticado original, pode recuperar o resultado; não é possível
          cancelar ou iniciar outra tentativa até resolver.
        </Notice>
      ) : null}
      {!actorMatches ? (
        <Notice warning>
          A conta ou o nome autenticado mudou depois da conferência. A
          confirmação está bloqueada. Se o resultado for incerto, volte à conta
          original para recuperar exatamente esta intenção.
        </Notice>
      ) : null}
      {stale ? (
        <Notice warning>
          A revisão global ou a abertura mudou. Atualize o estado e faça uma
          nova revisão; o payload congelado não será atualizado pelo polling.
        </Notice>
      ) : null}

      {stale && !uncertain ? (
        <Button
          variant="secondary"
          icon="refresh-cw"
          disabled={refreshing || pending}
          onPress={onRefresh}
        >
          {refreshing
            ? "Atualizando estado…"
            : "Atualizar estado e revisar novamente"}
        </Button>
      ) : null}

      {!uncertain ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
          <View style={{ flexGrow: 1, flexBasis: 190 }}>
            <Button
              variant="secondary"
              disabled={pending || stale || refreshing}
              onPress={() => onBack(false)}
            >
              Voltar e ajustar
            </Button>
          </View>
          <View style={{ flexGrow: 1, flexBasis: 190 }}>
            <Button
              variant="ghost"
              disabled={pending || stale || refreshing}
              onPress={() => onBack(true)}
            >
              Cancelar fechamento
            </Button>
          </View>
        </View>
      ) : null}

      <Button
        disabled={
          !csrfReady ||
          !authorized ||
          !actorMatches ||
          pending ||
          refreshing ||
          (blocked && !uncertain)
        }
        onPress={onConfirm}
      >
        {pending
          ? "Aguardando confirmação do servidor…"
          : uncertain
            ? "Repetir a mesma tentativa"
            : "Confirmar e fechar turno"}
      </Button>
      {!csrfReady ? (
        <Notice warning>
          A confirmação fica desabilitada enquanto a proteção CSRF da sessão não
          estiver disponível.
        </Notice>
      ) : null}
      {!authorized ? (
        <Notice warning>
          O perfil atual não pode fechar o caixa. Somente proprietário, gerente
          ou caixa autenticado podem confirmar.
        </Notice>
      ) : null}
      {blocked && !uncertain ? (
        <Body size={11}>
          Confirmação bloqueada até receber uma posição completa e atual do
          servidor, a identidade da sessão e a proteção CSRF.
        </Body>
      ) : null}
    </Card>
  );
}

function ValueCell({
  label,
  value,
  color = C.ink,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 105, gap: 4 }}>
      <Label>{label}</Label>
      <Text style={{ color, fontFamily: F.bold, fontSize: 12 }}>{value}</Text>
    </View>
  );
}
