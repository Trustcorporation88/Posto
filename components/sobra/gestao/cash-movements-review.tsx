import React from "react";
import { Text, View } from "react-native";
import {
  Body,
  Button,
  C,
  Card,
  F,
  Notice,
  SectionTitle,
} from "@/components/sobra/ui";
import { formatCents } from "@/lib/business/fuel-domain";
import type { CashMovementReview } from "@/lib/business/cash-movement-ui";
import type {
  CashMovementType,
  CashPaymentMethod,
} from "@/lib/business/cash-movement-domain";
import {
  cashMovementTypeLabel,
  cashPaymentMethodLabel,
  cashReceiptNatureLabel,
} from "@/components/sobra/gestao/cash-movements-form";

function operationDateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    dateStyle: "long",
  }).format(date);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        borderTopWidth: 1,
        borderColor: C.line,
        paddingTop: 12,
      }}
    >
      <Text style={{ color: C.muted, fontFamily: F.medium, fontSize: 12 }}>
        {label}
      </Text>
      <Text
        selectable
        style={{
          flex: 1,
          color: C.ink,
          fontFamily: F.bold,
          fontSize: 13,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function methodLabel(type: CashMovementType, method: CashPaymentMethod) {
  return type === "recebimento" ? cashPaymentMethodLabel(method) : "Dinheiro";
}

export function CashMovementsReview({
  review,
  error,
  stale,
  uncertain,
  pending,
  blocked,
  refreshing,
  authorized,
  csrfReady,
  onConfirm,
  onBack,
  onRefresh,
}: {
  review: CashMovementReview;
  error: string;
  stale: boolean;
  uncertain: boolean;
  pending: boolean;
  blocked: boolean;
  refreshing: boolean;
  authorized: boolean;
  csrfReady: boolean;
  onConfirm: () => void;
  onBack: (cancelled: boolean) => void;
  onRefresh: () => void;
}) {
  const type = review.payload.type;
  const receiptNature = review.payload.receiptNature;
  return (
    <Card style={{ gap: 16 }}>
      <SectionTitle
        title="Revisão da movimentação"
        eyebrow="CONFIRMAÇÃO EXPLÍCITA"
      />
      <Body>
        Confira os dados congelados desta tentativa. Voltar ou cancelar preserva
        o formulário e não grava. Somente a confirmação abaixo envia a mutação.
      </Body>
      <View style={{ gap: 8 }}>
        <Text style={{ color: C.green, fontFamily: F.heading, fontSize: 28 }}>
          {formatCents(review.payload.amount)}
        </Text>
        <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 15 }}>
          {cashMovementTypeLabel(type)} · {review.payload.description}
        </Text>
      </View>
      <DetailRow label="Unidade" value={review.unitName} />
      <DetailRow label="Caixa" value={review.registerName} />
      <DetailRow
        label="Abertura vinculada"
        value={`#${review.payload.openingId} · revisão ${review.payload.expectedRevision}`}
      />
      <DetailRow
        label="Operador da abertura"
        value={`${review.openingOperatorName} · ID ${review.openingOperatorId}`}
      />
      <DetailRow
        label="Responsável autenticado nesta ação"
        value={`${review.responsibleName} · ID ${review.responsibleId}`}
      />
      <DetailRow
        label="Data operacional e turno"
        value={`${operationDateLabel(review.payload.operationDate)} · ${review.shiftLabel} (${review.shiftStart}–${review.shiftEnd})`}
      />
      <DetailRow label="Tipo" value={cashMovementTypeLabel(type)} />
      <DetailRow
        label="Meio de pagamento"
        value={methodLabel(type, review.payload.paymentMethod)}
      />
      {type === "recebimento" ? (
        <DetailRow
          label="Natureza do recebimento"
          value={cashReceiptNatureLabel(receiptNature)}
        />
      ) : null}
      <DetailRow label="Valor" value={formatCents(review.payload.amount)} />
      <DetailRow
        label={type === "recebimento" ? "Descrição" : "Motivo"}
        value={review.payload.description}
      />
      <DetailRow
        label="Referência documental / transação"
        value={review.payload.reference || "Não informada"}
      />
      <DetailRow
        label="Origem / destino"
        value={review.payload.counterparty || "Não informado"}
      />
      <View
        style={{
          marginTop: 2,
          padding: 15,
          borderRadius: 14,
          backgroundColor: C.light,
          gap: 7,
        }}
      >
        <Text style={{ color: C.green, fontFamily: F.bold, fontSize: 12 }}>
          IMPACTO PROJETADO NO DINHEIRO ESPERADO
        </Text>
        <DetailRow
          label="Antes, resumo do servidor"
          value={formatCents(review.before.cashExpected)}
        />
        <DetailRow
          label="Após este movimento"
          value={formatCents(review.after.cashExpected)}
        />
        <Body size={11}>
          Projeção sobre o resumo completo recebido do servidor. Não representa
          contagem física.
        </Body>
      </View>

      {type === "recebimento" ? (
        <Notice>
          O valor é informado manualmente em base bruta. Esta revisão não
          confirma pagamento bancário nem realiza conciliação.
        </Notice>
      ) : (
        <Notice>
          Suprimentos e sangrias são movimentos de custódia, não receitas nem
          despesas.
        </Notice>
      )}
      {error ? <Notice warning>{error}</Notice> : null}
      {uncertain ? (
        <Notice warning>
          A resposta pode ter sido perdida após uma gravação. Esta intenção e o
          payload foram preservados. Repita manualmente somente a mesma
          tentativa para recuperar a confirmação; não inicie outra revisão.
        </Notice>
      ) : null}
      {stale && !uncertain ? (
        <Notice warning>
          A revisão ficou desatualizada, a posição mudou ou o turno expirou.
          Nenhum campo foi atualizado silenciosamente; atualize o estado e faça
          uma nova revisão antes de confirmar.
        </Notice>
      ) : null}
      {!csrfReady ? (
        <Notice warning>
          A proteção CSRF da sessão não está disponível. A confirmação permanece
          desabilitada.
        </Notice>
      ) : null}
      {!authorized ? (
        <Notice warning>
          A sessão não tem permissão ativa para registrar este movimento. O
          servidor revalida o perfil antes de gravar.
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
            : "Atualizar estado e fazer nova revisão"}
        </Button>
      ) : null}

      {uncertain ? (
        <Button
          icon="refresh-cw"
          disabled={!csrfReady || !authorized || pending || refreshing}
          onPress={onConfirm}
        >
          {pending
            ? "Aguardando resposta do servidor…"
            : "Repetir a mesma tentativa"}
        </Button>
      ) : null}

      {!uncertain && !stale ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
          <View style={{ flexGrow: 1, flexBasis: 190 }}>
            <Button
              variant="secondary"
              disabled={pending || refreshing}
              onPress={() => onBack(false)}
            >
              Voltar e ajustar
            </Button>
          </View>
          <View style={{ flexGrow: 1, flexBasis: 190 }}>
            <Button
              variant="ghost"
              disabled={pending || refreshing}
              onPress={() => onBack(true)}
            >
              Cancelar revisão
            </Button>
          </View>
        </View>
      ) : null}
      {!uncertain && !stale ? (
        <Button
          disabled={
            !csrfReady || !authorized || pending || refreshing || blocked
          }
          onPress={onConfirm}
        >
          {pending
            ? "Aguardando confirmação do servidor…"
            : "Confirmar e registrar movimentação"}
        </Button>
      ) : null}
    </Card>
  );
}
