import React from "react";
import { Text, View } from "react-native";
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
} from "@/components/sobra/ui";
import {
  CASH_CLOSING_METHOD_LABELS,
  CASH_CLOSING_METHODS,
  type CashClosingFormValues,
} from "@/lib/business/cash-closing-ui";

export function CashClosingForm({
  values,
  actorId,
  actorName,
  error,
  disabled,
  csrfReady,
  onChange,
  onReview,
  onCancel,
}: {
  values: CashClosingFormValues;
  actorId: number;
  actorName: string;
  error: string;
  disabled: boolean;
  csrfReady: boolean;
  onChange: (values: CashClosingFormValues) => void;
  onReview: () => void;
  onCancel: () => void;
}) {
  return (
    <Card style={{ gap: 17 }}>
      <SectionTitle title="Contagem manual do turno" eyebrow="FECHAMENTO" />
      <Body>
        Preencha os quatro valores conferidos. Cada campo começa em branco; zero
        precisa ser informado explicitamente. O dinheiro inclui o fundo físico
        de abertura.
      </Body>
      {CASH_CLOSING_METHODS.map((method) => (
        <Field
          key={method}
          label={`${CASH_CLOSING_METHOD_LABELS[method]} · R$`}
          accessibilityLabel={`${CASH_CLOSING_METHOD_LABELS[method]}, valor em reais`}
          accessibilityHint="Informe um valor não negativo com até duas casas decimais. Digite zero explicitamente quando aplicável."
          value={values.countedText[method]}
          onChangeText={(value) =>
            onChange({
              ...values,
              countedText: { ...values.countedText, [method]: value },
            })
          }
          placeholder="Digite o valor contado"
          keyboardType="decimal-pad"
          maxLength={24}
          autoCapitalize="none"
          style={{
            minHeight: 58,
            fontFamily: F.heading,
            fontSize: 22,
            textAlign: "center",
            color: C.ink,
          }}
        />
      ))}
      <Field
        label="Justificativa de diferenças (opcional se todos os valores coincidirem)"
        accessibilityLabel="Justificativa manual de diferença, até 500 caracteres"
        accessibilityHint="Obrigatória com 3 a 500 caracteres quando houver diferença. Caracteres de controle não são permitidos."
        value={values.varianceReason}
        onChangeText={(varianceReason) =>
          onChange({ ...values, varianceReason })
        }
        placeholder="Explique a diferença observada, se houver"
        multiline
        numberOfLines={4}
        maxLength={500}
        autoCapitalize="sentences"
        textAlignVertical="top"
        style={{ minHeight: 104, paddingTop: 14 }}
      />
      <View
        style={{
          padding: 14,
          borderRadius: 12,
          backgroundColor: C.light,
          gap: 6,
        }}
      >
        <Label>FECHADOR E CONFERENTE AUTENTICADO</Label>
        <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 13 }}>
          {actorName} · ID {actorId}
        </Text>
        <Body size={11}>
          Uma única pessoa autenticada fecha e confere. A autoria vem da sessão;
          não há campo para declarar ou trocar o nome.
        </Body>
      </View>
      <Notice>
        Pix, débito e crédito são valores brutos informados manualmente a partir
        dos relatórios. A tela não confirma liquidação, extrato ou conciliação
        bancária. O fechamento registra uma conferência operacional, não fiscal.
      </Notice>
      {error ? <Notice warning>{error}</Notice> : null}
      {!csrfReady ? (
        <Notice warning>
          A proteção CSRF da sessão não está disponível. A revisão ficará
          desabilitada até o token seguro ser carregado.
        </Notice>
      ) : null}
      <Button disabled={disabled || !csrfReady} onPress={onReview} icon="eye">
        Revisar fechamento
      </Button>
      <Button variant="ghost" disabled={disabled} onPress={onCancel}>
        Cancelar sem gravar
      </Button>
    </Card>
  );
}
