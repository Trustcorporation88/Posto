import React, { useState } from "react";
import { View, Text, TextInput, ScrollView } from "react-native";
import { useBudget } from "@/hooks/use-budget";
import { money, TxType } from "@/lib/budget";
import { Page } from "@/components/sobra/shell";
import { C, F, Card, Chip, Icon, Empty, Label } from "@/components/sobra/ui";
import { TransactionRow } from "@/components/sobra/transaction-row";
export default function Transactions() {
  const { data, month, openEditor } = useBudget();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TxType | "todos">("todos");
  const [category, setCategory] = useState("todos");
  const items = data.transactions
    .filter(
      (t) =>
        t.date.startsWith(month) &&
        (type === "todos" || t.type === type) &&
        (category === "todos" || t.categoryId === category) &&
        t.description
          .toLocaleLowerCase("pt-BR")
          .includes(query.toLocaleLowerCase("pt-BR")),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = items.reduce(
    (sum, t) => sum + (t.type === "receita" ? t.amount : -t.amount),
    0,
  );
  return (
    <Page
      title="Cada registro conta."
      subtitle="Entradas, saídas e as escolhas por trás de cada uma."
    >
      <Card>
        <View
          style={{
            flexDirection: "row",
            gap: 12,
            alignItems: "center",
            padding: 13,
            borderRadius: 12,
            backgroundColor: C.bg,
            marginBottom: 18,
          }}
        >
          <Icon name="search" color={C.muted} size={18} />
          <TextInput
            accessibilityLabel="Buscar lançamentos por descrição"
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por descrição..."
            placeholderTextColor={C.muted}
            style={{
              flex: 1,
              minHeight: 24,
              fontFamily: F.regular,
              fontSize: 14,
              color: C.ink,
            }}
          />
          {query !== "" && <Icon name="x" color={C.muted} size={15} />}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          {(["todos", "receita", "despesa"] as const).map((item) => (
            <Chip
              key={item}
              selected={type === item}
              onPress={() => {
                setType(item);
                setCategory("todos");
              }}
            >
              {item === "todos"
                ? "Todos"
                : item === "receita"
                  ? "Receitas"
                  : "Despesas"}
            </Chip>
          ))}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 9 }}
        >
          <Chip
            selected={category === "todos"}
            onPress={() => setCategory("todos")}
          >
            Todas as categorias
          </Chip>
          {data.categories
            .filter((c) => type === "todos" || c.type === type)
            .map((c) => (
              <Chip
                key={c.id}
                selected={category === c.id}
                color={c.color}
                onPress={() => setCategory(c.id)}
              >
                {c.name}
              </Chip>
            ))}
        </ScrollView>
      </Card>
      <Card>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 10,
            paddingBottom: 18,
            borderBottomWidth: 1,
            borderBottomColor: C.line,
          }}
        >
          <View style={{ gap: 6 }}>
            <Label>SEUS REGISTROS</Label>
            <Text style={{ fontFamily: F.heading, fontSize: 17, color: C.ink }}>
              {items.length}{" "}
              {items.length === 1
                ? "lançamento encontrado"
                : "lançamentos encontrados"}
            </Text>
          </View>
          <View style={{ gap: 6, alignItems: "flex-end" }}>
            <Label>SALDO FILTRADO</Label>
            <Text
              style={{
                fontFamily: F.bold,
                fontSize: 16,
                color: total < 0 ? C.orange : C.green,
              }}
            >
              {money(total)}
            </Text>
          </View>
        </View>
        {items.length ? (
          items.map((t, i) => (
            <TransactionRow
              key={t.id}
              transaction={t}
              last={i === items.length - 1}
            />
          ))
        ) : (
          <Empty
            title="Nenhum registro por aqui"
            text="Experimente outro filtro ou adicione um lançamento para este mês."
            action="Adicionar lançamento"
            onPress={() => openEditor()}
          />
        )}
      </Card>
    </Page>
  );
}
