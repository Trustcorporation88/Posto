import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useBudget } from "@/hooks/use-budget";
import { money } from "@/lib/budget";
import {
  parseTransactionsCSV,
  applyCsvImport,
  exportTransactionsCSV,
  exportBudgetsCSV,
  SAMPLE_CSV,
  CsvPreview,
  CsvMapping,
  CsvField,
} from "@/lib/csv";
import { pickCSV, saveCSV } from "@/lib/files";
import {
  C,
  F,
  Card,
  SectionTitle,
  Body,
  Button,
  Sheet,
  Notice,
  Label,
  Chip,
  Icon,
} from "./ui";
const fields: { field: CsvField; label: string }[] = [
  { field: "date", label: "Data" },
  { field: "type", label: "Tipo" },
  { field: "description", label: "Descrição" },
  { field: "category", label: "Categoria" },
  { field: "amount", label: "Valor" },
];
export function CsvTools() {
  const { data, commit, busy, notify, demo, ready, loadError } = useBudget();
  const unavailable = !ready || !!loadError;
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [raw, setRaw] = useState("");
  const [mappingOpen, setMappingOpen] = useState(false);
  const [error, setError] = useState("");
  const [ack, setAck] = useState(false);
  const [working, setWorking] = useState(false);
  const chooseFile = async () => {
    if (unavailable) return;
    setError("");
    try {
      const text = await pickCSV();
      if (text === null) return;
      const parsed = parseTransactionsCSV(text, data);
      setRaw(text);
      setPreview(parsed);
      setAck(false);
      setMappingOpen(
        parsed.errors.length > 0 &&
          Object.values(parsed.mapping).some((v) => !v),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remap = (field: CsvField, header: string) => {
    if (!preview) return;
    const mapping: CsvMapping = { ...preview.mapping, [field]: header };
    setPreview(parseTransactionsCSV(raw, data, mapping));
    setAck(false);
  };
  const importFile = async () => {
    if (
      unavailable ||
      !preview ||
      preview.errors.length ||
      !preview.rows.length ||
      (preview.duplicateCount > 0 && !ack)
    )
      return;
    setError("");
    try {
      await commit((d) => applyCsvImport(d, preview));
      notify(
        `${preview.rows.length} lançamentos importados${demo ? " na demonstração" : " no dispositivo"}.`,
      );
      setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const download = async (kind: "transactions" | "budgets" | "sample") => {
    if (unavailable) return;
    setWorking(true);
    setError("");
    try {
      const content =
        kind === "transactions"
          ? exportTransactionsCSV(data)
          : kind === "budgets"
            ? exportBudgetsCSV(data)
            : SAMPLE_CSV;
      await saveCSV(
        content,
        kind === "sample"
          ? "gas-pump-modelo.csv"
          : kind === "budgets"
            ? "gas-pump-orcamentos.csv"
            : "gas-pump-lancamentos.csv",
      );
      notify(
        kind === "sample"
          ? "Modelo CSV preparado."
          : "Arquivo CSV preparado para download ou compartilhamento.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <>
      <Card>
        <SectionTitle
          title="Seu dinheiro também cabe em uma planilha."
          eyebrow="IMPORTAR E EXPORTAR"
        />
        <Body>
          Traga seus registros ou leve uma cópia com você. O arquivo é
          processado aqui, sem enviar seus dados para um servidor.
        </Body>
        <View style={{ marginTop: 22, gap: 12 }}>
          <Button
            icon="upload"
            disabled={unavailable || working || busy}
            onPress={() => void chooseFile()}
          >
            Importar lançamentos CSV
          </Button>
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Button
              compact
              variant="secondary"
              icon="download"
              disabled={unavailable || working}
              onPress={() => void download("transactions")}
            >
              Exportar lançamentos
            </Button>
            <Button
              compact
              variant="secondary"
              icon="download"
              disabled={unavailable || working}
              onPress={() => void download("budgets")}
            >
              Exportar orçamentos
            </Button>
          </View>
          <Button
            compact
            variant="ghost"
            icon="file-text"
            disabled={unavailable || working}
            onPress={() => void download("sample")}
          >
            Baixar modelo de importação
          </Button>
        </View>
        <View
          style={{
            marginTop: 20,
            borderTopWidth: 1,
            borderTopColor: C.line,
            paddingTop: 15,
            gap: 8,
          }}
        >
          <Body size={11}>
            CSV de lançamentos: todos os meses, receitas e despesas. CSV de
            orçamentos: limites por categoria e mês. Formato UTF-8, ponto e
            vírgula e decimais brasileiros.
          </Body>
          <Body size={11}>
            Importação aceita lançamentos. O CSV de orçamentos é uma cópia para
            consulta em planilhas, não restauração automática. Categorias sem
            registros não entram no CSV. Estes arquivos não são um backup
            integral do app.
          </Body>
        </View>
        {!!error && !preview && (
          <View style={{ marginTop: 15 }}>
            <Notice warning>{error}</Notice>
          </View>
        )}
      </Card>
      <Sheet
        visible={preview !== null}
        onClose={() => {
          if (!busy) {
            setPreview(null);
            setError("");
          }
        }}
        title="Confira antes de importar"
        subtitle="Nada será salvo até você confirmar."
      >
        {preview && (
          <>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[
                {
                  label: "VÁLIDOS",
                  value: preview.rows.length,
                  color: C.green,
                },
                {
                  label: "ERROS",
                  value: preview.errors.length,
                  color: C.orange,
                },
                {
                  label: "SEMELHANTES",
                  value: preview.duplicateCount,
                  color: C.muted,
                },
              ].map((item) => (
                <View
                  key={item.label}
                  style={{
                    flex: 1,
                    padding: 12,
                    backgroundColor: C.white,
                    borderRadius: 12,
                    gap: 8,
                  }}
                >
                  <Label>{item.label}</Label>
                  <Text
                    style={{
                      fontFamily: F.heading,
                      fontSize: 25,
                      color: item.color,
                    }}
                  >
                    {item.value}
                  </Text>
                </View>
              ))}
            </View>
            <Button
              compact
              variant="secondary"
              icon="sliders"
              onPress={() => setMappingOpen(!mappingOpen)}
            >
              {mappingOpen ? "Ocultar mapeamento" : "Mapear colunas do arquivo"}
            </Button>
            {mappingOpen && (
              <View style={{ gap: 16 }}>
                {fields.map(({ field, label }) => (
                  <View key={field} style={{ gap: 8 }}>
                    <Label color={C.ink}>{label}</Label>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 7 }}
                    >
                      <Chip
                        selected={!preview.mapping[field]}
                        onPress={() => remap(field, "")}
                      >
                        Selecionar
                      </Chip>
                      {preview.headers.map((header) => (
                        <Chip
                          key={header}
                          selected={preview.mapping[field] === header}
                          onPress={() => remap(field, header)}
                        >
                          {header}
                        </Chip>
                      ))}
                    </ScrollView>
                  </View>
                ))}
              </View>
            )}
            {preview.errors.length > 0 && (
              <Notice warning>
                {preview.errors
                  .slice(0, 15)
                  .map(
                    (e) => `${e.line ? `Linha ${e.line}: ` : ""}${e.message}`,
                  )
                  .join("\n")}
                {preview.errors.length > 15
                  ? `\nE mais ${preview.errors.length - 15} erros.`
                  : ""}
                {"\n"}Corrija o arquivo ou o mapeamento. Nenhum registro será
                importado enquanto houver erros.
              </Notice>
            )}
            {!!preview.rows.length && (
              <View style={{ gap: 9 }}>
                <Label>PRÉVIA DOS PRIMEIROS REGISTROS</Label>
                {preview.rows.slice(0, 6).map((row, index) => (
                  <View
                    key={`${row.line}-${index}`}
                    style={{
                      padding: 13,
                      borderRadius: 11,
                      backgroundColor: C.white,
                      gap: 5,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 10,
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: F.bold,
                          color: C.ink,
                          fontSize: 12,
                          flex: 1,
                        }}
                      >
                        {row.description}
                      </Text>
                      <Text
                        style={{
                          fontFamily: F.bold,
                          color: row.type === "receita" ? C.green : C.orange,
                          fontSize: 12,
                        }}
                      >
                        {money(row.amount)}
                      </Text>
                    </View>
                    <Body size={11}>
                      {row.date.split("-").reverse().join("/")} · {row.category}{" "}
                      · {row.type}
                      {row.duplicate ? " · Possível duplicata" : ""}
                    </Body>
                  </View>
                ))}
                {preview.rows.length > 6 && (
                  <Body size={11}>
                    E mais {preview.rows.length - 6} registros válidos.
                  </Body>
                )}
              </View>
            )}
            {preview.duplicateCount > 0 && (
              <View style={{ gap: 12 }}>
                <Notice warning>
                  Encontramos registros semelhantes por data, tipo, categoria,
                  descrição e valor. Eles não serão ignorados automaticamente.
                  Confira antes de continuar.
                </Notice>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: ack }}
                  onPress={() => setAck(!ack)}
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: ack ? C.green : C.muted,
                      backgroundColor: ack ? C.green : C.white,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {ack && <Icon name="check" size={15} color={C.white} />}
                  </View>
                  <Text
                    style={{
                      fontFamily: F.medium,
                      color: C.ink,
                      fontSize: 12,
                      flex: 1,
                      lineHeight: 18,
                    }}
                  >
                    Conferi os registros semelhantes e quero importar todos.
                  </Text>
                </Pressable>
              </View>
            )}
            {!!error && <Notice warning>{error}</Notice>}
            <Button
              icon="check"
              disabled={
                busy ||
                !!preview.errors.length ||
                !preview.rows.length ||
                (preview.duplicateCount > 0 && !ack)
              }
              onPress={() => void importFile()}
            >
              {busy
                ? "Importando..."
                : `Confirmar ${preview.rows.length} lançamentos`}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onPress={() => {
                setPreview(null);
                setError("");
              }}
            >
              Cancelar sem importar
            </Button>
          </>
        )}
      </Sheet>
    </>
  );
}
