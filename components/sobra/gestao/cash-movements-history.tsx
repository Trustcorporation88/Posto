import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import {
  Body,
  Button,
  C,
  Card,
  Empty,
  F,
  Label,
  Notice,
  SectionTitle,
} from "@/components/sobra/ui";
import { formatCents } from "@/lib/business/fuel-domain";
import type {
  CashMovement,
  CashMovementHistoryPage,
} from "@/lib/business/cash-movement-domain";
import {
  cashMovementTypeLabel,
  cashPaymentMethodLabel,
  cashReceiptNatureLabel,
} from "@/components/sobra/gestao/cash-movements-form";

function recordedAtLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    return "Horário do servidor indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function MovementCard({ item }: { item: CashMovement }) {
  const isWithdrawal = item.type === "sangria";
  const amountColor = isWithdrawal ? C.orange : C.green;
  const methodDescription =
    item.type === "recebimento"
      ? `${cashPaymentMethodLabel(item.paymentMethod)} · ${cashReceiptNatureLabel(item.receiptNature)}`
      : "Dinheiro físico · movimento de custódia";
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: C.line,
        paddingTop: 14,
        paddingBottom: 4,
        gap: 7,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 14 }}>
            {cashMovementTypeLabel(item.type)} · {item.description}
          </Text>
          <Body size={11}>
            {recordedAtLabel(item.recordedAt)} · movimento #{item.id}
          </Body>
        </View>
        <Text
          style={{
            color: amountColor,
            fontFamily: F.bold,
            fontSize: 14,
            textAlign: "right",
          }}
        >
          {isWithdrawal ? "−" : "+"}
          {formatCents(item.amount)}
        </Text>
      </View>
      <Body size={11}>{methodDescription}</Body>
      <Body size={11}>
        Responsável autenticado: {item.responsible} · ID {item.responsibleId}
      </Body>
      {item.counterparty ? (
        <Body size={11}>Origem/destino: {item.counterparty}</Body>
      ) : null}
      {item.reference ? (
        <Body size={11}>Referência: {item.reference}</Body>
      ) : null}
      <Body size={11}>
        Abertura #{item.openingId} · caixa #{item.registerId}
      </Body>
    </View>
  );
}

export function CashMovementsHistory({
  page,
  loading,
  refreshing,
  error,
  pageNumber,
  hasNewer,
  hasOlder,
  canNavigate,
  onRefresh,
  onNewer,
  onOlder,
}: {
  page: CashMovementHistoryPage | undefined;
  loading: boolean;
  refreshing: boolean;
  error: string;
  pageNumber: number;
  hasNewer: boolean;
  hasOlder: boolean;
  canNavigate: boolean;
  onRefresh: () => void;
  onNewer: () => void;
  onOlder: () => void;
}) {
  return (
    <Card style={{ gap: 14 }}>
      <SectionTitle
        title="Movimentos registrados"
        eyebrow="HISTÓRICO IMUTÁVEL"
      />
      <Body>
        Ordem decrescente de registro. Cada página contém até 50 itens; o total
        vem do servidor e não é calculado a partir da página exibida.
      </Body>
      {error ? (
        <Notice warning>
          Não foi possível atualizar esta página do histórico. Se uma página
          anterior estiver disponível, ela está identificada como desatualizada.
        </Notice>
      ) : null}
      {page && error ? (
        <Notice warning>
          Página em cache · dados podem estar desatualizados.
        </Notice>
      ) : null}
      {!page && loading ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ActivityIndicator color={C.green} />
          <Body>Consultando histórico do servidor…</Body>
        </View>
      ) : null}
      {!page && !loading && error ? (
        <Empty
          title="Histórico indisponível"
          text="A consulta falhou. Atualize quando houver conexão; nenhum histórico vazio foi presumido."
          icon="wifi-off"
        />
      ) : null}
      {page ? (
        <>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <View style={{ gap: 4 }}>
              <Label>
                PÁGINA {pageNumber} · {page.totalCount} REGISTROS NO TURNO
              </Label>
              <Body size={11}>
                {page.items.length} itens recebidos nesta página · abertura #
                {page.openingId}
              </Body>
            </View>
            <Button
              compact
              variant="secondary"
              icon="refresh-cw"
              disabled={refreshing || !canNavigate}
              onPress={onRefresh}
            >
              Atualizar histórico
            </Button>
          </View>
          {page.items.length === 0 ? (
            <Body>Nenhum movimento registrado nesta abertura.</Body>
          ) : (
            <View style={{ gap: 12 }}>
              {page.items.map((item) => (
                <MovementCard key={item.id} item={item} />
              ))}
            </View>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
            <View style={{ flexGrow: 1, flexBasis: 170 }}>
              <Button
                compact
                variant="secondary"
                icon="arrow-left"
                disabled={!hasNewer || !canNavigate || refreshing}
                onPress={onNewer}
              >
                Mais recentes
              </Button>
            </View>
            <View style={{ flexGrow: 1, flexBasis: 170 }}>
              <Button
                compact
                variant="secondary"
                icon="arrow-right"
                disabled={!hasOlder || !canNavigate || refreshing}
                onPress={onOlder}
              >
                Mais antigos
              </Button>
            </View>
          </View>
        </>
      ) : null}
      {refreshing && page ? (
        <Body size={11}>Atualizando esta página a partir do servidor…</Body>
      ) : null}
    </Card>
  );
}
