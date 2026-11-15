import React, { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { Body, Button, C, Card, Chip, F, Label, Notice, SectionTitle } from "@/components/sobra/ui";
import { GestaoShell, useMe } from "@/components/sobra/gestao/gestao-shell";
import { BarChart, Metric, ShareBars } from "@/components/sobra/gestao/dashboard-charts";
import { formatCents, formatMilliLiters } from "@/lib/business/fuel-domain";
import { litersToMilli } from "@/lib/business/dashboard";
import { saveCSV } from "@/lib/files";
import { trpc } from "@/lib/trpc";

type Report = inferRouterOutputs<AppRouter>["dashboard"]["report"];
type Days = 7 | 30 | 90;

const liters = (value: string) => `${formatMilliLiters(litersToMilli(value))} L`;
const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const fullDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const METHODS = [
  ["dinheiro", "Dinheiro"],
  ["pix", "Pix"],
  ["debito", "Débito"],
  ["credito", "Crédito"],
] as const;

/** Brazilian Excel-friendly CSV: UTF-8 BOM, semicolons, decimal comma. */
function csv(rows: (string | number)[][]) {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `\uFEFF${rows.map((row) => row.map(cell).join(";")).join("\r\n")}\r\n`;
}
const decimal = (cents: bigint | number) => {
  const value = typeof cents === "bigint" ? cents : BigInt(cents);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? "-" : ""}${abs / 100n},${(abs % 100n).toString().padStart(2, "0")}`;
};
const litersCsv = (value: string) => value.replace(".", ",");

export default function Relatorios() {
  const session = useMe();
  const [days, setDays] = useState<Days>(30);
  const report = trpc.dashboard.report.useQuery({ days }, { enabled: Boolean(session.data) });

  return (
    <GestaoShell title="Relatórios" subtitle="Vendas estimadas da pista e fechamentos de caixa por período.">
      <Card style={{ gap: 12 }}>
        <Label>PERÍODO</Label>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {([7, 30, 90] as Days[]).map((option) => (
            <Chip key={option} selected={days === option} onPress={() => setDays(option)}>
              {`Últimos ${option} dias`}
            </Chip>
          ))}
        </View>
        {report.data ? (
          <Body size={12}>
            De {fullDate(report.data.from)} a {fullDate(report.data.to)}, no horário de Bauru.
          </Body>
        ) : null}
      </Card>
      {report.isLoading ? (
        <Card style={{ alignItems: "center", gap: 10 }}>
          <ActivityIndicator color={C.green} />
          <Body>Calculando o relatório…</Body>
        </Card>
      ) : report.error || !report.data ? (
        <Notice warning>Não foi possível carregar o relatório. Tente de novo.</Notice>
      ) : (
        <>
          {report.data.fuel ? <FuelReport report={report.data} /> : null}
          {report.data.cash ? <CashReport report={report.data} /> : null}
        </>
      )}
    </GestaoShell>
  );
}

function FuelReport({ report }: { report: Report }) {
  const fuel = report.fuel!;
  const totalLiters = fuel.products.reduce((sum, product) => sum + litersToMilli(product.quantityLiters), 0n);
  const exportCsv = () =>
    saveCSV(
      csv([
        ["data", "litros", "venda_estimada", "margem_estimada", "leituras"],
        ...fuel.daily.map((point) => [
          point.date,
          litersCsv(point.quantityLiters),
          decimal(point.revenueCents),
          point.marginCents === null ? "indisponível" : decimal(point.marginCents),
          point.readingCount,
        ]),
      ]),
      `gaspump-pista-${report.from}-a-${report.to}.csv`,
    );
  return (
    <View style={{ gap: 12 }}>
      <SectionTitle title="Pista e combustíveis" eyebrow="VENDAS ESTIMADAS" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Metric label="Litros vendidos" value={`${formatMilliLiters(totalLiters)} L`} />
        <Metric label="Venda estimada" value={formatCents(fuel.totalRevenueCents)} />
        <Metric
          label="Margem estimada"
          value={fuel.totalMarginCents === null ? "Indisponível" : formatCents(fuel.totalMarginCents)}
          detail="Indicador gerencial, não é lucro contábil"
        />
        <Metric label="Recebimentos" value={String(fuel.receipts.length)} detail="Cargas de combustível no período" />
      </View>
      <Card style={{ gap: 12 }}>
        <Label>VENDA ESTIMADA POR DIA</Label>
        <BarChart
          height={170}
          points={fuel.daily.map((point) => ({
            key: point.date,
            label: shortDate(point.date),
            value: Number(point.revenueCents),
            display: formatCents(point.revenueCents),
          }))}
        />
        <Button variant="secondary" compact icon="download" onPress={() => void exportCsv()}>
          Exportar dias em CSV
        </Button>
      </Card>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Card style={{ flexGrow: 1, flexBasis: 300, gap: 12 }}>
          <Label>PARTICIPAÇÃO EM LITROS</Label>
          <ShareBars
            rows={fuel.products.map((product) => ({
              key: String(product.productId),
              label: product.productName,
              value: Number(litersToMilli(product.quantityLiters)),
              display: liters(product.quantityLiters),
            }))}
          />
        </Card>
        <Card style={{ flexGrow: 1, flexBasis: 300, gap: 10 }}>
          <Label>POR COMBUSTÍVEL</Label>
          {fuel.products.map((product) => {
            const milli = litersToMilli(product.quantityLiters);
            const marginPerLiter =
              product.marginCents !== null && milli > 0n ? (product.marginCents * 1000n) / milli : null;
            return (
              <View key={product.productId} style={{ gap: 2, paddingVertical: 4 }}>
                <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 13 }}>{product.productName}</Text>
                <Text style={{ color: C.muted, fontFamily: F.regular, fontSize: 12 }}>
                  {liters(product.quantityLiters)} · venda {formatCents(product.revenueCents)} · margem{" "}
                  {product.marginCents === null ? "indisponível" : formatCents(product.marginCents)}
                  {marginPerLiter !== null ? ` (${formatCents(marginPerLiter)}/L)` : ""}
                </Text>
                <Text style={{ color: C.muted, fontFamily: F.regular, fontSize: 12 }}>
                  Preço vigente{" "}
                  {product.currentPriceCentsPerLiter === null
                    ? "não cadastrado"
                    : `${formatCents(product.currentPriceCentsPerLiter)}/L`}
                  {" · custo médio "}
                  {product.currentAverageCostCentsPerLiter === null
                    ? "desconhecido"
                    : `${formatCents(product.currentAverageCostCentsPerLiter)}/L`}
                </Text>
              </View>
            );
          })}
        </Card>
      </View>
      {fuel.receipts.length ? (
        <Card style={{ gap: 10 }}>
          <Label>RECEBIMENTOS DE COMBUSTÍVEL</Label>
          {fuel.receipts.slice(0, 20).map((receipt) => (
            <View key={receipt.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <Text style={{ color: C.ink, fontFamily: F.medium, fontSize: 13, flexShrink: 1 }}>
                {new Date(receipt.receivedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} ·{" "}
                {receipt.supplier}
              </Text>
              <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 13 }}>
                {liters(receipt.quantityLiters)} · {formatCents(receipt.totalCostCents)}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

function CashReport({ report }: { report: Report }) {
  const cash = report.cash!;
  const { totals } = cash;
  const totalDifference =
    totals.differenceByMethod.dinheiro +
    totals.differenceByMethod.pix +
    totals.differenceByMethod.debito +
    totals.differenceByMethod.credito;
  const exportCsv = () =>
    saveCSV(
      csv([
        [
          "data",
          "turno",
          "operador",
          "fechado_por",
          "status",
          ...METHODS.flatMap(([key]) => [`${key}_esperado`, `${key}_conferido`, `${key}_diferenca`]),
          "justificativa",
        ],
        ...cash.closings.map((closing) => [
          closing.opening.operationDate,
          closing.opening.shift.label,
          closing.opening.operator,
          closing.closedBy,
          closing.status === "fechado" ? "fechado" : "diferença pendente",
          ...METHODS.flatMap(([key]) => [
            decimal(closing.totals.expectedByMethod[key]),
            decimal(closing.totals.countedByMethod[key]),
            decimal(closing.totals.differenceByMethod[key]),
          ]),
          closing.varianceReason,
        ]),
      ]),
      `gaspump-caixa-${report.from}-a-${report.to}.csv`,
    );
  return (
    <View style={{ gap: 12 }}>
      <SectionTitle title="Caixa" eyebrow="FECHAMENTOS" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Metric label="Turnos fechados" value={String(totals.turns)} />
        <Metric
          label="Com diferença pendente"
          value={String(totals.pending)}
          tone={totals.pending > 0 ? "warning" : "default"}
        />
        <Metric
          label="Diferença líquida"
          value={formatCents(totalDifference)}
          detail="Conferido menos esperado, todos os meios"
          tone={totalDifference !== 0 ? "warning" : "default"}
        />
      </View>
      <Card style={{ gap: 12 }}>
        <Label>CONFERIDO POR MEIO DE PAGAMENTO</Label>
        <ShareBars
          rows={METHODS.map(([key, label]) => ({
            key,
            label,
            value: totals.countedByMethod[key],
            display: formatCents(totals.countedByMethod[key]),
          }))}
        />
        <Body size={12}>
          Valores informados no fechamento a partir da contagem e dos relatórios das maquininhas. Não é
          conciliação bancária.
        </Body>
      </Card>
      <Card style={{ gap: 10 }}>
        <Label>TURNOS NO PERÍODO</Label>
        {cash.closings.length ? (
          cash.closings.map((closing) => {
            const difference =
              closing.totals.differenceByMethod.dinheiro +
              closing.totals.differenceByMethod.pix +
              closing.totals.differenceByMethod.debito +
              closing.totals.differenceByMethod.credito;
            const pending = closing.status === "diferenca-pendente";
            return (
              <View key={closing.id} style={{ gap: 2, paddingVertical: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                  <Text style={{ color: C.ink, fontFamily: F.medium, fontSize: 13, flexShrink: 1 }}>
                    {fullDate(closing.opening.operationDate)} · {closing.opening.shift.label} · {closing.opening.operator}
                  </Text>
                  <Text style={{ color: pending ? C.orange : C.green, fontFamily: F.bold, fontSize: 12 }}>
                    {pending ? formatCents(difference) : "Sem diferença"}
                  </Text>
                </View>
                {pending && closing.varianceReason ? (
                  <Text style={{ color: C.muted, fontFamily: F.regular, fontSize: 12 }}>
                    Justificativa: {closing.varianceReason}
                  </Text>
                ) : null}
              </View>
            );
          })
        ) : (
          <Body>Nenhum turno fechado no período.</Body>
        )}
        {cash.truncated ? (
          <Notice>O relatório considera os 100 fechamentos mais recentes.</Notice>
        ) : null}
        {cash.closings.length ? (
          <Button variant="secondary" compact icon="download" onPress={() => void exportCsv()}>
            Exportar turnos em CSV
          </Button>
        ) : null}
      </Card>
    </View>
  );
}
