import React, { useState } from "react";
import { Text, View } from "react-native";
import { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import {
  Body,
  Button,
  C,
  Chip,
  Field,
  F,
  Label,
  Notice,
  Sheet,
} from "@/components/sobra/ui";
import {
  formatCents,
  formatMilliLiters,
  litersAtPriceToCents,
  litersToMilliLiters,
  moneyToCents,
  signedLitersToMilliLiters,
} from "@/lib/business/fuel-domain";

export type FuelFormKey =
  | "product"
  | "tank"
  | "pump"
  | "nozzle"
  | "price"
  | "receipt"
  | "baseline"
  | "interval"
  | "reset"
  | "measurement"
  | "adjustment";

type FuelConfiguration = inferRouterOutputs<AppRouter>["fuel"]["configuration"];
type FuelValues = Record<string, string>;
type Choice = { value: string; label: string };

function Choices({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: Choice[];
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={{ gap: 9 }}>
      <Label color={C.ink}>{label}</Label>
      {options.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {options.map((option) => (
            <Chip
              key={option.value}
              selected={option.value === value}
              onPress={() => onSelect(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </View>
      ) : (
        <Body>Nenhuma opção ativa cadastrada.</Body>
      )}
    </View>
  );
}

function SelectedText({ label, children }: { label: string; children: string }) {
  return (
    <View style={{ gap: 6, padding: 13, backgroundColor: C.light, borderRadius: 12 }}>
      <Label>{label}</Label>
      <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 15 }}>{children}</Text>
    </View>
  );
}

function dateLabel(value: string, timeZone: string) {
  if (!value) return "Informe a data e hora local";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Data e hora inválidas";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 4, borderBottomWidth: 1, borderColor: C.light, paddingVertical: 9 }}>
      <Label>{label}</Label>
      <Text style={{ color: C.ink, fontSize: 15, lineHeight: 21 }}>{value}</Text>
    </View>
  );
}

export function FuelFormSheet({
  visible,
  form,
  values,
  configuration,
  timeZone,
  loading,
  error,
  onChange,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  form: FuelFormKey | null;
  values: FuelValues;
  configuration?: FuelConfiguration;
  timeZone: string;
  loading: boolean;
  error: string;
  onChange: (key: string, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const products = (configuration?.products ?? []).filter((item) => item.active);
  const tanks = (configuration?.tanks ?? []).filter((item) => item.active);
  const pumps = (configuration?.pumps ?? []).filter((item) => item.active);
  const nozzles = (configuration?.nozzles ?? []).filter((item) => item.active);
  const selectedNozzleId = Number(values.nozzleId);
  const currentReading = configuration?.lastReadings.find(
    (item) => item.nozzleId === selectedNozzleId,
  );
  const currentTank = tanks.find((item) => item.id === Number(values.tankId));

  const productChoices = products.map((item) => ({
    value: String(item.id),
    label: `${item.name} · ${item.code}`,
  }));
  const tankChoices = tanks
    .filter((item) => !values.productId || item.productId === Number(values.productId))
    .map((item) => ({ value: String(item.id), label: `${item.name} · ${item.code}` }));
  const pumpChoices = pumps.map((item) => ({
    value: String(item.id),
    label: `${item.name} · ${item.code}`,
  }));
  const nozzleChoices = nozzles.map((item) => ({
    value: String(item.id),
    label: `${item.name} · ${item.code}`,
  }));

  const title = {
    product: "Novo combustível",
    tank: "Novo tanque",
    pump: "Nova bomba",
    nozzle: "Novo bico",
    price: "Preço de venda",
    receipt: "Recebimento de combustível",
    baseline: "Encerrante inicial",
    interval: "Leitura de pista",
    reset: "Troca ou reset de medidor",
    measurement: "Medição física",
    adjustment: "Ajuste autorizado de estoque",
  }[form ?? "product"];

  const selected = (choices: Choice[], value?: string) =>
    choices.find((choice) => choice.value === value)?.label ?? "Não selecionado";
  const volume = (raw?: string, signed = false) => {
    if (!raw?.trim()) return "Não informado";
    try {
      const milliLiters = signed
        ? signedLitersToMilliLiters(raw)
        : litersToMilliLiters(raw, true);
      return `${formatMilliLiters(milliLiters)} L`;
    } catch {
      return `${raw} L (valor inválido)`;
    }
  };
  const money = (raw?: string) => {
    if (!raw?.trim()) return "Não informado";
    try {
      return formatCents(moneyToCents(raw, true));
    } catch {
      return `${raw} (valor inválido)`;
    }
  };
  const localDate = (raw?: string) => raw?.trim()
    ? `${raw.replace("T", " ")} (horário local de Bauru)`
    : "Não informada";
  const totalCost = () => {
    try {
      return formatCents(litersAtPriceToCents(
        litersToMilliLiters(values.quantityLiters ?? ""),
        moneyToCents(values.unitCostPerLiter ?? ""),
      ));
    } catch {
      return "Não calculável até corrigir volume e custo.";
    }
  };
  const intervalVolume = () => {
    if (!currentReading) return "Não calculável: falta encerrante inicial.";
    try {
      const difference =
        litersToMilliLiters(values.finalCounterLiters ?? "", true) -
        litersToMilliLiters(currentReading.counterLiters, true);
      return difference < 0n
        ? "Inválido: o encerrante final é menor que o inicial."
        : `${formatMilliLiters(difference)} L`;
    } catch {
      return "Não calculável até corrigir os encerrantes.";
    }
  };
  const tankDifference = () => {
    if (!currentTank) return "Não calculável: selecione um tanque.";
    try {
      const difference =
        litersToMilliLiters(values.measuredLiters ?? "", true) -
        signedLitersToMilliLiters(currentTank.theoreticalLiters);
      return `${formatMilliLiters(difference)} L (físico − teórico atual)`;
    } catch {
      return "Não calculável até corrigir a medição.";
    }
  };

  let reviewRows: { label: string; value: string }[] = [];
  switch (form) {
    case "product":
      reviewRows = [
        { label: "Código", value: values.code?.trim() || "Não informado" },
        { label: "Nome exibido", value: values.name?.trim() || "Não informado" },
      ];
      break;
    case "tank":
      reviewRows = [
        { label: "Combustível", value: selected(productChoices, values.productId) },
        { label: "Código e nome", value: `${values.code?.trim() || "Não informado"} · ${values.name?.trim() || "Não informado"}` },
        { label: "Capacidade", value: values.capacityLiters?.trim() ? volume(values.capacityLiters) : "Não informada" },
      ];
      break;
    case "pump":
      reviewRows = [
        { label: "Código", value: values.code?.trim() || "Não informado" },
        { label: "Nome exibido", value: values.name?.trim() || "Não informado" },
      ];
      break;
    case "nozzle":
      reviewRows = [
        { label: "Bomba", value: selected(pumpChoices, values.pumpId) },
        { label: "Combustível", value: selected(productChoices, values.productId) },
        { label: "Tanque associado", value: selected(tankChoices, values.tankId) },
        { label: "Código e nome", value: `${values.code?.trim() || "Não informado"} · ${values.name?.trim() || "Não informado"}` },
      ];
      break;
    case "price":
      reviewRows = [
        { label: "Combustível", value: selected(productChoices, values.productId) },
        { label: "Preço por litro", value: `${money(values.price)} /L` },
        { label: "Início da vigência", value: localDate(values.effectiveAt) },
      ];
      break;
    case "receipt":
      reviewRows = [
        { label: "Combustível", value: selected(productChoices, values.productId) },
        { label: "Tanque de destino", value: selected(tankChoices, values.tankId) },
        { label: "Fornecedor", value: values.supplier?.trim() || "Não informado" },
        { label: "Referência documental", value: values.documentReference?.trim() || "Não informada" },
        { label: "Volume recebido", value: volume(values.quantityLiters) },
        { label: "Custo por litro", value: `${money(values.unitCostPerLiter)} /L` },
        { label: "Custo total calculado", value: totalCost() },
        { label: "Data e hora", value: localDate(values.receivedAt) },
      ];
      break;
    case "baseline":
      reviewRows = [
        { label: "Bico", value: selected(nozzleChoices, values.nozzleId) },
        { label: "Encerrante inicial", value: volume(values.counterLiters) },
        { label: "Data e hora", value: localDate(values.measuredAt) },
        { label: "Efeito", value: "Somente base do medidor, sem venda nem alteração de estoque." },
      ];
      break;
    case "interval":
      reviewRows = [
        { label: "Bico", value: selected(nozzleChoices, values.nozzleId) },
        { label: "Encerrante inicial vigente", value: currentReading ? volume(currentReading.counterLiters) : "Não existe" },
        { label: "Encerrante final", value: volume(values.finalCounterLiters) },
        { label: "Volume estimado", value: intervalVolume() },
        { label: "Data e hora", value: localDate(values.measuredAt) },
        { label: "Preço e custo", value: "Serão validados pelo servidor para o intervalo e aplicados na mesma transação do estoque." },
      ];
      break;
    case "reset":
      reviewRows = [
        { label: "Bico", value: selected(nozzleChoices, values.nozzleId) },
        { label: "Encerrante anterior", value: currentReading ? volume(currentReading.counterLiters) : "Não existe" },
        { label: "Novo encerrante", value: volume(values.counterLiters) },
        { label: "Justificativa", value: values.reason?.trim() || "Não informada" },
        { label: "Data e hora", value: localDate(values.measuredAt) },
        { label: "Efeito", value: "Reset auditado, sem gerar volume nem venda." },
      ];
      break;
    case "measurement":
      reviewRows = [
        { label: "Tanque", value: selected(tankChoices, values.tankId) },
        { label: "Estoque teórico atual carregado", value: currentTank ? volume(currentTank.theoreticalLiters, true) : "Não disponível" },
        { label: "Volume medido fisicamente", value: volume(values.measuredLiters) },
        { label: "Diferença estimada", value: tankDifference() },
        { label: "Justificativa", value: values.reason?.trim() || "Nenhuma informada" },
        { label: "Data e hora", value: localDate(values.measuredAt) },
      ];
      break;
    case "adjustment":
      reviewRows = [
        { label: "Tanque", value: selected(tankChoices, values.tankId) },
        { label: "Tipo", value: values.direction === "remove" ? "Retirada justificada" : "Entrada justificada" },
        { label: "Volume", value: volume(values.quantityLiters) },
        ...(values.direction === "remove" ? [] : [
          { label: "Custo por litro", value: `${money(values.unitCostPerLiter)} /L` },
          { label: "Valor total calculado", value: totalCost() },
        ]),
        { label: "Justificativa", value: values.reason?.trim() || "Não informada" },
        { label: "Data e hora", value: localDate(values.recordedAt) },
      ];
      break;
    default:
      reviewRows = [];
  }

  return (
    <Sheet
      visible={visible}
      title={title}
      subtitle="Os registros são associados à unidade autenticada e preservados no histórico."
      onClose={onClose}
    >
      {error ? <Notice warning>{error}</Notice> : null}
      {form === "product" ? (
        <>
          <Field
            label="Código do combustível"
            value={values.code ?? ""}
            onChangeText={(value) => onChange("code", value)}
            autoCapitalize="characters"
            placeholder="Ex.: GAS-C"
          />
          <Field
            label="Nome exibido"
            value={values.name ?? ""}
            onChangeText={(value) => onChange("name", value)}
            placeholder="Ex.: Gasolina comum"
          />
          <Body>O cadastro começa vazio. Use os nomes e códigos realmente utilizados no posto.</Body>
        </>
      ) : null}

      {form === "tank" ? (
        <>
          <Choices
            label="Combustível"
            options={productChoices}
            value={values.productId ?? ""}
            onSelect={(value) => {
              onChange("productId", value);
              onChange("tankId", "");
            }}
          />
          <Field label="Código do tanque" value={values.code ?? ""} onChangeText={(value) => onChange("code", value)} autoCapitalize="characters" />
          <Field label="Nome exibido" value={values.name ?? ""} onChangeText={(value) => onChange("name", value)} />
          <Field label="Capacidade em litros (opcional)" value={values.capacityLiters ?? ""} onChangeText={(value) => onChange("capacityLiters", value)} keyboardType="decimal-pad" placeholder="Ex.: 15000,000" />
        </>
      ) : null}

      {form === "pump" ? (
        <>
          <Field label="Código da bomba" value={values.code ?? ""} onChangeText={(value) => onChange("code", value)} autoCapitalize="characters" />
          <Field label="Nome exibido" value={values.name ?? ""} onChangeText={(value) => onChange("name", value)} placeholder="Ex.: Bomba 1" />
        </>
      ) : null}

      {form === "nozzle" ? (
        <>
          <Choices label="Bomba" options={pumpChoices} value={values.pumpId ?? ""} onSelect={(value) => onChange("pumpId", value)} />
          <Choices
            label="Combustível"
            options={productChoices}
            value={values.productId ?? ""}
            onSelect={(value) => {
              onChange("productId", value);
              onChange("tankId", "");
            }}
          />
          <Choices label="Tanque associado" options={tankChoices} value={values.tankId ?? ""} onSelect={(value) => onChange("tankId", value)} />
          <Field label="Código do bico nesta bomba" value={values.code ?? ""} onChangeText={(value) => onChange("code", value)} autoCapitalize="characters" />
          <Field label="Nome exibido" value={values.name ?? ""} onChangeText={(value) => onChange("name", value)} placeholder="Ex.: Bico 1" />
        </>
      ) : null}

      {form === "price" ? (
        <>
          <Choices label="Combustível" options={productChoices} value={values.productId ?? ""} onSelect={(value) => onChange("productId", value)} />
          <Field label="Preço de venda por litro (R$)" value={values.price ?? ""} onChangeText={(value) => onChange("price", value)} keyboardType="decimal-pad" placeholder="Ex.: 6,49" />
          <Field label="Vigência local em Bauru (AAAA-MM-DDTHH:mm)" value={values.effectiveAt ?? ""} onChangeText={(value) => onChange("effectiveAt", value)} placeholder="2026-11-13T14:00" autoCapitalize="none" />
          <Body>Preço com vigência futura pode ser agendado. Se mudar no meio de um intervalo, registre uma leitura de fronteira em cada bico antes de calcular a venda.</Body>
        </>
      ) : null}

      {form === "receipt" ? (
        <>
          <Choices
            label="Combustível"
            options={productChoices}
            value={values.productId ?? ""}
            onSelect={(value) => {
              onChange("productId", value);
              onChange("tankId", "");
            }}
          />
          <Choices label="Tanque de destino" options={tankChoices} value={values.tankId ?? ""} onSelect={(value) => onChange("tankId", value)} />
          <Field label="Fornecedor" value={values.supplier ?? ""} onChangeText={(value) => onChange("supplier", value)} />
          <Field label="Referência documental (opcional)" value={values.documentReference ?? ""} onChangeText={(value) => onChange("documentReference", value)} />
          <Field label="Volume recebido (litros)" value={values.quantityLiters ?? ""} onChangeText={(value) => onChange("quantityLiters", value)} keyboardType="decimal-pad" />
          <Field label="Custo de aquisição por litro (R$)" value={values.unitCostPerLiter ?? ""} onChangeText={(value) => onChange("unitCostPerLiter", value)} keyboardType="decimal-pad" />
          <SelectedText label="CUSTO TOTAL" >
            {values.quantityLiters && values.unitCostPerLiter
              ? "Será calculado pelo servidor com arredondamento explícito em centavos."
              : "Informe volume e custo unitário."}
          </SelectedText>
          <Field label="Data/hora local em Bauru (AAAA-MM-DDTHH:mm)" value={values.receivedAt ?? ""} onChangeText={(value) => onChange("receivedAt", value)} autoCapitalize="none" />
          <Body>O recebimento não pode ser futuro e deve ser posterior à última medição física do tanque e aos movimentos anteriores. Isso preserva o custo médio e a comparação histórica.</Body>
        </>
      ) : null}

      {form === "baseline" ? (
        <>
          <Choices label="Bico" options={nozzleChoices} value={values.nozzleId ?? ""} onSelect={(value) => onChange("nozzleId", value)} />
          <Field label="Encerrante atual (litros)" value={values.counterLiters ?? ""} onChangeText={(value) => onChange("counterLiters", value)} keyboardType="decimal-pad" />
          <Field label="Data/hora da leitura em Bauru (AAAA-MM-DDTHH:mm)" value={values.measuredAt ?? ""} onChangeText={(value) => onChange("measuredAt", value)} autoCapitalize="none" />
          <Body>Este registro define apenas a base do medidor. Não aceita data futura, não cria uma venda nem altera o estoque.</Body>
        </>
      ) : null}

      {form === "interval" ? (
        <>
          <Choices label="Bico" options={nozzleChoices} value={values.nozzleId ?? ""} onSelect={(value) => onChange("nozzleId", value)} />
          {currentReading ? (
            <SelectedText label="ENCERRANTE INICIAL VIGENTE">
              {`${formatMilliLiters(litersToMilliLiters(currentReading.counterLiters, true))} L · ${dateLabel(currentReading.measuredAt.toISOString(), timeZone)}`}
            </SelectedText>
          ) : (
            <Notice warning>Este bico ainda não tem encerrante inicial. Registre a base primeiro.</Notice>
          )}
          <Field label="Encerrante final (litros)" value={values.finalCounterLiters ?? ""} onChangeText={(value) => onChange("finalCounterLiters", value)} keyboardType="decimal-pad" />
          <Field label="Data/hora da leitura em Bauru (AAAA-MM-DDTHH:mm)" value={values.measuredAt ?? ""} onChangeText={(value) => onChange("measuredAt", value)} autoCapitalize="none" />
          <Body>O volume será calculado pela diferença do encerrante. A leitura não pode ser futura e, quando altera estoque, deve ser posterior à última medição física do tanque.</Body>
        </>
      ) : null}

      {form === "reset" ? (
        <>
          <Choices label="Bico" options={nozzleChoices} value={values.nozzleId ?? ""} onSelect={(value) => onChange("nozzleId", value)} />
          {currentReading ? (
            <SelectedText label="ENCERRANTE ANTERIOR">
              {formatMilliLiters(litersToMilliLiters(currentReading.counterLiters, true)) + " L"}
            </SelectedText>
          ) : null}
          <Field label="Novo encerrante após troca/reset (litros)" value={values.counterLiters ?? ""} onChangeText={(value) => onChange("counterLiters", value)} keyboardType="decimal-pad" />
          <Field label="Data/hora local (AAAA-MM-DDTHH:mm)" value={values.measuredAt ?? ""} onChangeText={(value) => onChange("measuredAt", value)} autoCapitalize="none" />
          <Field label="Justificativa obrigatória" value={values.reason ?? ""} onChangeText={(value) => onChange("reason", value)} multiline numberOfLines={3} />
          <Body>O evento não pode ser futuro, é auditado, preserva o encerrante anterior e não gera volume nem venda.</Body>
        </>
      ) : null}

      {form === "measurement" ? (
        <>
          <Choices label="Tanque" options={tankChoices} value={values.tankId ?? ""} onSelect={(value) => onChange("tankId", value)} />
          {currentTank ? <SelectedText label="ESTOQUE TEÓRICO ATUAL">{`${currentTank.theoreticalLiters} L`}</SelectedText> : null}
          <Field label="Volume medido fisicamente (litros)" value={values.measuredLiters ?? ""} onChangeText={(value) => onChange("measuredLiters", value)} keyboardType="decimal-pad" />
          <Field label="Data/hora da medição em Bauru (AAAA-MM-DDTHH:mm)" value={values.measuredAt ?? ""} onChangeText={(value) => onChange("measuredAt", value)} autoCapitalize="none" />
          <Field label="Justificativa, obrigatória se houver diferença" value={values.reason ?? ""} onChangeText={(value) => onChange("reason", value)} multiline numberOfLines={3} />
          <Body>Registre após o último movimento e medição do tanque, nunca no futuro. A diferença física menos teórica fica pendente de investigação, sem classificação automática como perda ou despesa.</Body>
        </>
      ) : null}

      {form === "adjustment" ? (
        <>
          <Choices label="Tanque" options={tankChoices} value={values.tankId ?? ""} onSelect={(value) => onChange("tankId", value)} />
          <Choices
            label="Tipo de ajuste autorizado"
            options={[
              { value: "add", label: "Entrada justificada" },
              { value: "remove", label: "Retirada justificada" },
            ]}
            value={values.direction ?? "add"}
            onSelect={(value) => onChange("direction", value)}
          />
          <Field label="Volume (litros)" value={values.quantityLiters ?? ""} onChangeText={(value) => onChange("quantityLiters", value)} keyboardType="decimal-pad" />
          {values.direction === "add" ? (
            <Field label="Custo por litro da entrada (R$)" value={values.unitCostPerLiter ?? ""} onChangeText={(value) => onChange("unitCostPerLiter", value)} keyboardType="decimal-pad" />
          ) : null}
          <Field label="Justificativa obrigatória" value={values.reason ?? ""} onChangeText={(value) => onChange("reason", value)} multiline numberOfLines={3} />
          <Field label="Data/hora local em Bauru (AAAA-MM-DDTHH:mm)" value={values.recordedAt ?? ""} onChangeText={(value) => onChange("recordedAt", value)} autoCapitalize="none" />
          <Body>O ajuste não pode ser futuro e deve ocorrer depois da última medição física. O evento compensatório permanece no histórico; retirada sem base conhecida não recebe custo inventado.</Body>
        </>
      ) : null}

      {reviewing ? (
        <View style={{ gap: 4, padding: 14, borderRadius: 14, backgroundColor: C.light }}>
          <Label>CONFERÊNCIA DA OPERAÇÃO</Label>
          <Body>Confira os dados abaixo. A confirmação grava o evento no histórico pela sua conta autenticada e na unidade atual. Valores alterados no formulário atualizam este resumo.</Body>
          {reviewRows.map((item) => <ReviewRow key={item.label} label={item.label} value={item.value} />)}
        </View>
      ) : null}

      <View style={{ gap: 10, paddingTop: 4 }}>
        {reviewing ? (
          <>
            <Button disabled={loading || !form} onPress={onSubmit}>
              {loading ? "Registrando…" : "Confirmar e registrar"}
            </Button>
            <Button variant="ghost" disabled={loading} onPress={() => setReviewing(false)}>Voltar ao formulário</Button>
            <Button variant="ghost" disabled={loading} onPress={onClose}>Cancelar sem registrar</Button>
          </>
        ) : (
          <>
            <Button disabled={loading || !form} onPress={() => setReviewing(true)}>Revisar operação</Button>
            <Button variant="ghost" disabled={loading} onPress={onClose}>Cancelar</Button>
          </>
        )}
      </View>
    </Sheet>
  );
}
