import React from "react";
import { Text, View } from "react-native";
import {
  Body,
  Button,
  C,
  Card,
  Chip,
  Field,
  F,
  Label,
  Notice,
  SectionTitle,
} from "@/components/sobra/ui";
import type { CashMovementFormValues } from "@/lib/business/cash-movement-ui";
import type {
  CashMovementType,
  CashPaymentMethod,
  CashReceiptNature,
} from "@/lib/business/cash-movement-domain";

const TYPE_OPTIONS: { id: CashMovementType; label: string }[] = [
  { id: "recebimento", label: "Recebimento" },
  { id: "sangria", label: "Sangria" },
  { id: "suprimento", label: "Suprimento" },
];
const PAYMENT_OPTIONS: { id: CashPaymentMethod; label: string }[] = [
  { id: "dinheiro", label: "Dinheiro" },
  { id: "pix", label: "Pix" },
  { id: "debito", label: "Débito" },
  { id: "credito", label: "Crédito" },
];

export function cashMovementTypeLabel(type: CashMovementType) {
  return TYPE_OPTIONS.find((option) => option.id === type)?.label ?? type;
}
export function cashPaymentMethodLabel(method: CashPaymentMethod) {
  return (
    PAYMENT_OPTIONS.find((option) => option.id === method)?.label ?? method
  );
}
export function cashReceiptNatureLabel(nature: CashReceiptNature | null) {
  return nature === "venda" ? "Venda deste turno" : "Conta anterior";
}

export function CashMovementsForm({
  values,
  responsibleId,
  responsibleName,
  error,
  disabled,
  csrfReady,
  onChange,
  onTypeChange,
  onPrepare,
  onCancel,
}: {
  values: CashMovementFormValues;
  responsibleId: number;
  responsibleName: string;
  error: string;
  disabled: boolean;
  csrfReady: boolean;
  onChange: (patch: Partial<CashMovementFormValues>) => void;
  onTypeChange: (type: CashMovementType) => void;
  onPrepare: () => void;
  onCancel: () => void;
}) {
  const receipt = values.type === "recebimento";
  const referenceRequired =
    receipt &&
    (values.paymentMethod !== "dinheiro" ||
      values.receiptNature === "conta-anterior");
  const counterpartyLabel = receipt
    ? "Origem do recebimento (opcional)"
    : values.type === "sangria"
      ? "Destino da sangria"
      : "Origem do suprimento";

  return (
    <Card style={{ gap: 17 }}>
      <SectionTitle title="Novo movimento" eyebrow="FORMULÁRIO" />
      <View style={{ gap: 9 }}>
        <Label>TIPO</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {TYPE_OPTIONS.map((option) => (
            <Chip
              key={option.id}
              selected={values.type === option.id}
              onPress={() => onTypeChange(option.id)}
            >
              {option.label}
            </Chip>
          ))}
        </View>
      </View>

      {receipt ? (
        <>
          <View style={{ gap: 9 }}>
            <Label>MEIO DE PAGAMENTO</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {PAYMENT_OPTIONS.map((option) => (
                <Chip
                  key={option.id}
                  selected={values.paymentMethod === option.id}
                  onPress={() => onChange({ paymentMethod: option.id })}
                >
                  {option.label}
                </Chip>
              ))}
            </View>
          </View>
          <View style={{ gap: 9 }}>
            <Label>NATUREZA DO RECEBIMENTO</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Chip
                selected={values.receiptNature === "venda"}
                onPress={() => onChange({ receiptNature: "venda" })}
              >
                Venda deste turno
              </Chip>
              <Chip
                selected={values.receiptNature === "conta-anterior"}
                onPress={() => onChange({ receiptNature: "conta-anterior" })}
              >
                Conta anterior
              </Chip>
            </View>
          </View>
        </>
      ) : null}

      <Field
        label="Valor (R$)"
        accessibilityLabel="Valor positivo em reais"
        accessibilityHint="Informe um valor maior que zero, com até duas casas decimais."
        value={values.amountText}
        onChangeText={(amountText) => onChange({ amountText })}
        placeholder="Ex.: 125,50"
        keyboardType="decimal-pad"
        maxLength={24}
        autoCapitalize="none"
        style={{
          minHeight: 60,
          fontFamily: F.heading,
          fontSize: 23,
          textAlign: "center",
          color: C.ink,
        }}
      />
      <Field
        label={receipt ? "Descrição do recebimento" : "Motivo"}
        accessibilityLabel="Descrição ou motivo, de 3 a 200 caracteres"
        value={values.description}
        onChangeText={(description) => onChange({ description })}
        placeholder={
          receipt
            ? "Ex.: venda de combustível"
            : values.type === "sangria"
              ? "Ex.: retirada para cofre"
              : "Ex.: troco para caixa"
        }
        maxLength={200}
        autoCapitalize="sentences"
      />
      <Field
        label={
          referenceRequired
            ? "Referência documental / transação (obrigatória)"
            : "Referência documental / transação (opcional)"
        }
        accessibilityLabel="Referência documental ou de transação, até 120 caracteres"
        value={values.reference}
        onChangeText={(reference) => onChange({ reference })}
        placeholder={
          receipt && values.paymentMethod !== "dinheiro"
            ? "NSU/ID e terminal, sem dados do cartão"
            : "Documento, recibo ou observação"
        }
        maxLength={120}
        autoCapitalize="sentences"
      />
      <Field
        label={counterpartyLabel}
        accessibilityLabel="Origem ou destino, até 120 caracteres"
        value={values.counterparty}
        onChangeText={(counterparty) => onChange({ counterparty })}
        placeholder={
          receipt
            ? "Ex.: cliente ou conta de origem"
            : values.type === "sangria"
              ? "Ex.: cofre identificado"
              : "Ex.: responsável pelo aporte"
        }
        maxLength={120}
        autoCapitalize="sentences"
      />

      <View
        style={{
          padding: 14,
          borderRadius: 12,
          backgroundColor: C.light,
          gap: 5,
        }}
      >
        <Label>RESPONSÁVEL DA SESSÃO</Label>
        <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 13 }}>
          {responsibleName} · ID {responsibleId}
        </Text>
        <Body size={11}>
          Identidade vinculada à sessão autenticada. Não é um campo declarado.
        </Body>
      </View>

      {values.type !== "recebimento" ? (
        <Notice>
          Suprimentos e sangrias movimentam somente dinheiro em custódia; não
          são receita nem despesa. Origem ou destino deve ter de 3 a 120
          caracteres.
        </Notice>
      ) : null}
      {receipt ? (
        <Notice>
          Valores de Pix e cartões são informados manualmente e em valor bruto.
          A referência pode identificar documento, NSU, terminal e transação. O
          registro não confirma operação bancária nem concilia pagamentos. Não
          informe PAN, CVV, senha ou credenciais.
        </Notice>
      ) : null}
      {error ? <Notice warning>{error}</Notice> : null}
      {!csrfReady ? (
        <Notice warning>
          A proteção CSRF da sessão não está disponível. A revisão ficará
          desabilitada até o token seguro ser carregado.
        </Notice>
      ) : null}

      <Button disabled={disabled || !csrfReady} onPress={onPrepare} icon="eye">
        Revisar movimentação
      </Button>
      <Button variant="ghost" disabled={disabled} onPress={onCancel}>
        Cancelar sem gravar
      </Button>
    </Card>
  );
}
