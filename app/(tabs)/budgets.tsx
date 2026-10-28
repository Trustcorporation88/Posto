import React, { useState } from "react";
import { View, Text, Pressable, useWindowDimensions } from "react-native";
import { useBudget } from "@/hooks/use-budget";
import { getSummary, money, parseMoney, Category } from "@/lib/budget";
import { Page } from "@/components/sobra/shell";
import {
  C,
  F,
  Card,
  Body,
  Label,
  Icon,
  Sheet,
  Field,
  Button,
  Notice,
  SectionTitle,
} from "@/components/sobra/ui";
export default function Budgets() {
  const { data, month, commit, busy, notify } = useBudget();
  const { width } = useWindowDimensions();
  const [category, setCategory] = useState<Category | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const summary = getSummary(data, month);
  const open = (cat: Category) => {
    const budget = data.budgets.find(
      (b) => b.month === month && b.categoryId === cat.id,
    );
    setAmount(budget ? (budget.amount / 100).toFixed(2).replace(".", ",") : "");
    setError("");
    setCategory(cat);
  };
  const save = async (remove = false) => {
    if (!category) return;
    const cents = parseMoney(amount);
    if (!remove && (cents === null || cents < 0))
      return setError("Informe um limite válido, como 500,00.");
    try {
      await commit((d) => ({
        ...d,
        budgets: [
          ...d.budgets.filter(
            (b) => !(b.categoryId === category.id && b.month === month),
          ),
          ...(remove
            ? []
            : [{ month, categoryId: category.id, amount: cents! }]),
        ],
      }));
      notify(
        remove ? "Limite removido deste mês." : "Orçamento mensal atualizado.",
      );
      setCategory(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Page
      title="Um plano para o seu mês."
      subtitle="Defina seus limites. Deixe espaço para o que importa."
      addButton={false}
    >
      <Card style={{ backgroundColor: C.green, borderColor: C.green }}>
        <View
          style={{
            flexDirection: width > 650 ? "row" : "column",
            gap: 25,
            justifyContent: "space-between",
          }}
        >
          {[
            { label: "LIMITE TOTAL DO MÊS", value: summary.budgetTotal },
            {
              label: "GASTO NAS CATEGORIAS COM LIMITE",
              value: summary.spentBudgeted,
            },
            {
              label:
                summary.budgetRemaining >= 0
                  ? "AINDA DISPONÍVEL NO ORÇAMENTO"
                  : "EXCEDENTE NO ORÇAMENTO",
              value: Math.abs(summary.budgetRemaining),
            },
          ].map((item) => (
            <View key={item.label} style={{ gap: 10, flex: 1 }}>
              <Label color="#D1DCCF">{item.label}</Label>
              <Text
                style={{
                  fontFamily: F.heading,
                  color: C.lime,
                  fontSize: 26,
                  letterSpacing: -1,
                }}
              >
                {money(item.value)}
              </Text>
            </View>
          ))}
        </View>
        <Text
          style={{
            fontFamily: F.regular,
            color: "#CEDCCE",
            fontSize: 11,
            lineHeight: 18,
            marginTop: 22,
          }}
        >
          O disponível no orçamento considera apenas categorias com limite
          positivo. Não é o seu saldo financeiro.
          {summary.expenses > summary.spentBudgeted
            ? ` Há ${money(summary.expenses - summary.spentBudgeted)} em despesas sem limite definido.`
            : ""}
        </Text>
      </Card>
      <Card>
        <SectionTitle
          title="Seus limites, categoria por categoria"
          eyebrow="PLANEJADO × REALIZADO"
        />
        <View style={{ gap: 7 }}>
          {summary.categorySpending.map((item) => {
            const hasBudget = item.limit !== null && item.limit > 0;
            const exceeded = hasBudget && item.spent > item.limit!;
            return (
              <Pressable
                key={item.category.id}
                accessibilityRole="button"
                accessibilityLabel={`Editar orçamento de ${item.category.name}`}
                onPress={() => open(item.category)}
                style={({ pressed }) => ({
                  paddingVertical: 20,
                  paddingHorizontal: 5,
                  borderBottomWidth: 1,
                  borderBottomColor: C.line,
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      padding: 12,
                      backgroundColor: `${item.category.color}18`,
                      borderRadius: 13,
                    }}
                  >
                    <Icon
                      name={item.category.icon}
                      color={item.category.color}
                      size={20}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text
                      style={{ color: C.ink, fontFamily: F.bold, fontSize: 14 }}
                    >
                      {item.category.name}
                    </Text>
                    <Text
                      style={{
                        color: C.muted,
                        fontFamily: F.regular,
                        fontSize: 11,
                      }}
                    >
                      {money(item.spent)}{" "}
                      {hasBudget
                        ? `de ${money(item.limit!)}`
                        : "gastos neste mês"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 5 }}>
                    <Text
                      style={{
                        color: exceeded ? C.orange : C.green,
                        fontFamily: F.bold,
                        fontSize: 12,
                      }}
                    >
                      {hasBudget
                        ? `${Math.round((item.spent / item.limit!) * 100)}% usado`
                        : "Definir limite"}
                    </Text>
                    <Text
                      style={{
                        color: exceeded ? C.orange : C.muted,
                        fontFamily: F.regular,
                        fontSize: 10,
                      }}
                    >
                      {hasBudget
                        ? `${money(Math.abs(item.limit! - item.spent))} ${exceeded ? "acima" : "disponível"}`
                        : "Sem orçamento definido"}
                    </Text>
                  </View>
                  <Icon name="chevron-right" color={C.muted} size={16} />
                </View>
                <View
                  style={{
                    height: 6,
                    marginTop: 17,
                    backgroundColor: C.light,
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      height: 6,
                      borderRadius: 4,
                      width: `${hasBudget ? Math.min(100, (item.spent / item.limit!) * 100) : 0}%`,
                      backgroundColor: exceeded
                        ? C.orange
                        : item.category.color,
                    }}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={{ marginTop: 20 }}>
          <Body size={12}>
            Os limites valem apenas para o mês selecionado. Gastar além deles
            gera um aviso, mas nunca bloqueia seus registros.
          </Body>
        </View>
      </Card>
      <Sheet
        visible={category !== null}
        onClose={() => {
          if (!busy) setCategory(null);
        }}
        title={category?.name ?? "Orçamento"}
        subtitle="Quanto você pretende usar nesta categoria?"
      >
        <Field
          label="Limite mensal (R$)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="Ex.: 500,00"
          maxLength={18}
        />
        <Notice>
          Este ajuste vale somente para o mês selecionado. Limite zero será
          tratado como sem orçamento definido.
        </Notice>
        {!!error && <Notice warning>{error}</Notice>}
        <Button disabled={busy} onPress={() => void save()}>
          {busy ? "Salvando..." : "Salvar orçamento"}
        </Button>
        <Button variant="ghost" disabled={busy} onPress={() => void save(true)}>
          Remover limite deste mês
        </Button>
      </Sheet>
    </Page>
  );
}
