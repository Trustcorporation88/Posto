import { Tabs } from "expo-router";
import { AppNav } from "@/components/sobra/shell";
import { BudgetProvider } from "@/hooks/use-budget";
import { TransactionEditor } from "@/components/sobra/transaction-editor";

export default function TabLayout() {
  return (
    <BudgetProvider>
      <Tabs
        tabBar={(props) => <AppNav {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: "#F6F5EF" },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Painel" }} />
        <Tabs.Screen name="transactions" options={{ title: "Lançamentos" }} />
        <Tabs.Screen name="budgets" options={{ title: "Orçamentos" }} />
        <Tabs.Screen name="more" options={{ title: "Mais" }} />
      </Tabs>
      <TransactionEditor />
    </BudgetProvider>
  );
}
