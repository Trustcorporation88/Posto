import React from "react";
import { View, Text, Pressable } from "react-native";
import { Transaction, money } from "@/lib/budget";
import { useBudget } from "@/hooks/use-budget";
import { C, F, Icon } from "./ui";
export function TransactionRow({
  transaction,
  last = false,
}: {
  transaction: Transaction;
  last?: boolean;
}) {
  const { data, openEditor } = useBudget();
  const category = data.categories.find((c) => c.id === transaction.categoryId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Editar ${transaction.description}, ${money(transaction.amount)}`}
      onPress={() => openEditor(transaction)}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 15,
        gap: 13,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: C.line,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View
        style={{
          width: 41,
          height: 41,
          borderRadius: 13,
          backgroundColor: `${category?.color ?? C.green}16`,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon
          name={
            category?.icon ??
            (transaction.type === "receita"
              ? "arrow-down-left"
              : "shopping-bag")
          }
          color={category?.color ?? C.green}
          size={19}
        />
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text
          numberOfLines={1}
          style={{ color: C.ink, fontFamily: F.bold, fontSize: 13 }}
        >
          {transaction.description}
        </Text>
        <Text style={{ color: C.muted, fontFamily: F.regular, fontSize: 11 }}>
          {category?.name} · {transaction.date.split("-").reverse().join("/")}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 5 }}>
        <Text
          style={{
            color: transaction.type === "receita" ? C.green : C.ink,
            fontFamily: F.bold,
            fontSize: 13,
            fontVariant: ["tabular-nums"],
          }}
        >
          {transaction.type === "receita" ? "+" : "−"}{" "}
          {money(transaction.amount)}
        </Text>
        <Text style={{ color: C.muted, fontFamily: F.regular, fontSize: 10 }}>
          {transaction.type === "receita" ? "Receita" : "Despesa"}
        </Text>
      </View>
      <Icon name="chevron-right" color={C.muted} size={14} />
    </Pressable>
  );
}
