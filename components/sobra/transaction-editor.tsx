import React, { useState } from "react";
import { View, Text } from "react-native";
import { useBudget } from "@/hooks/use-budget";
import {
  Transaction,
  TxType,
  createId,
  normalizeDate,
  parseMoney,
  todayISO,
} from "@/lib/budget";
import { C, F, Sheet, Field, Chip, Button, Notice, Label } from "./ui";
export function TransactionEditor() {
  const { editor } = useBudget();
  if (editor === undefined) return null;
  return <TransactionForm key={editor?.id ?? "new"} />;
}
function TransactionForm() {
  const { editor, closeEditor, data, month, commit, busy, notify, setMonth } =
    useBudget();
  const [type, setType] = useState<TxType>(() => editor?.type ?? "despesa");
  const [description, setDescription] = useState(
    () => editor?.description ?? "",
  );
  const [amount, setAmount] = useState(() =>
    editor ? (editor.amount / 100).toFixed(2).replace(".", ",") : "",
  );
  const [date, setDate] = useState(() =>
    (
      editor?.date ??
      (todayISO().startsWith(month) ? todayISO() : `${month}-01`)
    )
      .split("-")
      .reverse()
      .join("/"),
  );
  const [categoryId, setCategoryId] = useState(
    () =>
      editor?.categoryId ??
      data.categories.find((c) => c.type === "despesa")?.id ??
      "",
  );
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const chooseType = (next: TxType) => {
    setType(next);
    setCategoryId(data.categories.find((c) => c.type === next)?.id ?? "");
  };
  const save = async () => {
    const cents = parseMoney(amount);
    const normalized = normalizeDate(date);
    if (!description.trim())
      return setError("Escreva uma descrição para identificar o lançamento.");
    if (cents === null || cents <= 0)
      return setError("Informe um valor positivo, como 125,90.");
    if (!normalized)
      return setError("Informe uma data válida no formato DD/MM/AAAA.");
    if (!data.categories.some((c) => c.id === categoryId && c.type === type))
      return setError("Selecione uma categoria para este tipo de lançamento.");
    try {
      const tx: Transaction = {
        id: editor?.id ?? createId(),
        type,
        description: description.trim(),
        amount: cents,
        date: normalized,
        categoryId,
      };
      await commit((d) => ({
        ...d,
        transactions: editor
          ? d.transactions.map((t) => (t.id === editor.id ? tx : t))
          : [...d.transactions, tx],
      }));
      setMonth(normalized.slice(0, 7));
      notify(
        editor
          ? "Lançamento atualizado."
          : "Lançamento salvo. Seu mês está atualizado.",
      );
      closeEditor();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async () => {
    if (!editor) return;
    try {
      await commit((d) => ({
        ...d,
        transactions: d.transactions.filter((t) => t.id !== editor.id),
      }));
      notify("Lançamento excluído.");
      closeEditor();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Sheet
      visible={editor !== undefined}
      onClose={() => {
        if (!busy) closeEditor();
      }}
      title={editor ? "Editar lançamento" : "Novo lançamento"}
      subtitle="Um registro simples. Um mês mais claro."
    >
      <View style={{ flexDirection: "row", gap: 9 }}>
        <Chip
          selected={type === "despesa"}
          onPress={() => chooseType("despesa")}
        >
          Despesa
        </Chip>
        <Chip
          selected={type === "receita"}
          onPress={() => chooseType("receita")}
        >
          Receita
        </Chip>
      </View>
      <Field
        label="Valor (R$)"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0,00"
        style={{ fontFamily: F.heading, fontSize: 29, paddingVertical: 18 }}
        maxLength={18}
      />
      <Field
        label="Descrição"
        value={description}
        onChangeText={setDescription}
        placeholder={
          type === "despesa" ? "Ex.: Almoço de domingo" : "Ex.: Salário"
        }
        maxLength={200}
      />
      <Field
        label="Data"
        value={date}
        onChangeText={setDate}
        placeholder="DD/MM/AAAA"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />
      <View style={{ gap: 10 }}>
        <Label color={C.ink}>Categoria</Label>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {data.categories
            .filter((c) => c.type === type)
            .map((c) => (
              <Chip
                key={c.id}
                selected={categoryId === c.id}
                color={c.color}
                onPress={() => setCategoryId(c.id)}
              >
                {c.name}
              </Chip>
            ))}
        </View>
        {!data.categories.some((c) => c.type === type) && (
          <Notice>
            Crie uma categoria deste tipo na área Mais antes de salvar.
          </Notice>
        )}
      </View>
      {!!error && <Notice warning>{error}</Notice>}
      <Button icon="check" disabled={busy} onPress={() => void save()}>
        {busy
          ? "Salvando..."
          : editor
            ? "Salvar alterações"
            : "Salvar lançamento"}
      </Button>
      {editor && !deleting && (
        <Button
          variant="ghost"
          icon="trash-2"
          disabled={busy}
          onPress={() => setDeleting(true)}
        >
          Excluir lançamento
        </Button>
      )}
      {deleting && (
        <View style={{ gap: 10 }}>
          <Notice warning>
            Excluir este lançamento? O saldo e os gráficos serão recalculados.
            Esta ação não pode ser desfeita.
          </Notice>
          <Button
            variant="danger"
            disabled={busy}
            onPress={() => void remove()}
          >
            Sim, excluir lançamento
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onPress={() => setDeleting(false)}
          >
            Manter lançamento
          </Button>
        </View>
      )}
      <Text
        style={{
          textAlign: "center",
          fontFamily: F.regular,
          fontSize: 11,
          color: C.muted,
        }}
      >
        Seus registros permanecem neste dispositivo.
      </Text>
    </Sheet>
  );
}
