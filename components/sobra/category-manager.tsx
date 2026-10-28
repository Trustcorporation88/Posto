import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useBudget } from "@/hooks/use-budget";
import { Category, TxType, createId } from "@/lib/budget";
import {
  C,
  F,
  Card,
  SectionTitle,
  Body,
  Button,
  Sheet,
  Field,
  Chip,
  Icon,
  Notice,
  Label,
} from "./ui";
const colors = [
  "#214D40",
  "#90A36C",
  "#C86646",
  "#6896A1",
  "#C5A85A",
  "#8B88A2",
  "#B18C77",
  "#668577",
];
export function CategoryManager() {
  const { data, commit, busy, notify } = useBudget();
  const [visible, setVisible] = useState(false);
  const [type, setType] = useState<TxType>("despesa");
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(colors[0]);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const reset = () => {
    setEditing(null);
    setName("");
    setColor(colors[0]);
    setError("");
    setDeleting(false);
  };
  const edit = (category: Category) => {
    setEditing(category);
    setName(category.name);
    setColor(category.color);
    setError("");
    setDeleting(false);
  };
  const save = async () => {
    if (!name.trim()) return setError("Informe um nome para a categoria.");
    if (
      data.categories.some(
        (c) =>
          c.type === type &&
          c.id !== editing?.id &&
          c.name.toLocaleLowerCase("pt-BR") ===
            name.trim().toLocaleLowerCase("pt-BR"),
      )
    )
      return setError(
        "Já existe uma categoria com este nome para o mesmo tipo.",
      );
    try {
      const category: Category = {
        id: editing?.id ?? createId(),
        type,
        name: name.trim(),
        color,
        icon: editing?.icon ?? (type === "receita" ? "briefcase" : "tag"),
      };
      await commit((d) => ({
        ...d,
        categories: editing
          ? d.categories.map((c) => (c.id === editing.id ? category : c))
          : [...d.categories, category],
      }));
      notify(editing ? "Categoria atualizada." : "Categoria criada.");
      reset();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async () => {
    if (!editing) return;
    try {
      await commit((d) => {
        if (
          d.transactions.some((t) => t.categoryId === editing.id) ||
          d.budgets.some((b) => b.categoryId === editing.id)
        )
          throw new Error(
            "Esta categoria está em uso em lançamentos ou orçamentos. Reclassifique os registros e remova os limites antes de excluir.",
          );
        return {
          ...d,
          categories: d.categories.filter((c) => c.id !== editing.id),
        };
      });
      notify("Categoria excluída.");
      reset();
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  };
  return (
    <>
      <Card>
        <SectionTitle title="Do seu jeito." eyebrow="SUAS CATEGORIAS" />
        <Body>
          Mercado, casa, planos e pequenos prazeres. Organize suas receitas e
          despesas com nomes que fazem sentido para você.
        </Body>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 18,
            marginBottom: 20,
          }}
        >
          {data.categories
            .filter((c) => c.type === "despesa")
            .slice(0, 5)
            .map((c) => (
              <View
                key={c.id}
                style={{
                  backgroundColor: `${c.color}14`,
                  paddingHorizontal: 11,
                  paddingVertical: 8,
                  borderRadius: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon name={c.icon} color={c.color} size={12} />
                <Text
                  style={{ color: C.ink, fontFamily: F.medium, fontSize: 11 }}
                >
                  {c.name}
                </Text>
              </View>
            ))}
        </View>
        <Button
          compact
          variant="secondary"
          icon="tag"
          onPress={() => {
            reset();
            setVisible(true);
          }}
        >
          Gerenciar categorias
        </Button>
      </Card>
      <Sheet
        visible={visible}
        onClose={() => {
          if (!busy) setVisible(false);
        }}
        title="Suas categorias"
        subtitle="Crie, renomeie e organize sem perder o histórico."
      >
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip
            selected={type === "despesa"}
            onPress={() => {
              setType("despesa");
              reset();
            }}
          >
            Despesas
          </Chip>
          <Chip
            selected={type === "receita"}
            onPress={() => {
              setType("receita");
              reset();
            }}
          >
            Receitas
          </Chip>
        </View>
        <View style={{ gap: 8 }}>
          <Label>{editing ? "EDITAR CATEGORIA" : "NOVA CATEGORIA"}</Label>
          <Field
            label="Nome"
            placeholder="Ex.: Pets"
            value={name}
            onChangeText={setName}
            maxLength={50}
          />
          <View style={{ flexDirection: "row", gap: 9, marginVertical: 5 }}>
            {colors.map((value) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Selecionar cor ${value}`}
                accessibilityState={{ selected: value === color }}
                key={value}
                onPress={() => setColor(value)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  backgroundColor: value,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {value === color && (
                  <Icon name="check" color={C.white} size={16} />
                )}
              </Pressable>
            ))}
          </View>
          {!!error && <Notice warning>{error}</Notice>}
          <Button disabled={busy} onPress={() => void save()}>
            {busy
              ? "Salvando..."
              : editing
                ? "Salvar categoria"
                : "Criar categoria"}
          </Button>
          {editing && (
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              <Button compact variant="ghost" onPress={reset}>
                Cancelar edição
              </Button>
              <Button
                compact
                variant="danger"
                disabled={busy}
                onPress={() => {
                  if (
                    data.transactions.some(
                      (t) => t.categoryId === editing.id,
                    ) ||
                    data.budgets.some((b) => b.categoryId === editing.id)
                  )
                    setError(
                      "Esta categoria está em uso em lançamentos ou orçamentos. Reclassifique os registros e remova os limites antes de excluir.",
                    );
                  else setDeleting(true);
                }}
              >
                Excluir categoria
              </Button>
            </View>
          )}
          {deleting && (
            <View style={{ gap: 9 }}>
              <Notice warning>
                Excluir a categoria {editing?.name}? Esta ação não pode ser
                desfeita.
              </Notice>
              <Button
                variant="danger"
                disabled={busy}
                onPress={() => void remove()}
              >
                Confirmar exclusão
              </Button>
            </View>
          )}
        </View>
        <View style={{ height: 1, backgroundColor: C.line }} />
        <View style={{ gap: 4 }}>
          {data.categories
            .filter((c) => c.type === type)
            .map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                onPress={() => edit(c)}
                style={{
                  paddingVertical: 12,
                  flexDirection: "row",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    width: 33,
                    height: 33,
                    borderRadius: 10,
                    backgroundColor: `${c.color}18`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={c.icon} color={c.color} size={16} />
                </View>
                <Text
                  style={{
                    color: C.ink,
                    fontFamily: F.medium,
                    fontSize: 13,
                    flex: 1,
                  }}
                >
                  {c.name}
                </Text>
                <Icon name="edit-2" color={C.muted} size={14} />
              </Pressable>
            ))}
        </View>
      </Sheet>
    </>
  );
}
