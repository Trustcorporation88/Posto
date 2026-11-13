import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { C } from "@/components/sobra/ui";

export default function WebEntryRedirect() {
  const router = useRouter();

  useEffect(() => {
    let destination = "/gestao";
    try {
      const returnTo = window.sessionStorage.getItem("sobra.gestao.return");
      if (returnTo === "setup" || returnTo === "recover") {
        window.sessionStorage.removeItem("sobra.gestao.return");
        destination =
          returnTo === "setup" ? "/gestao/configurar" : "/gestao/recuperar";
      }
    } catch {
      // If browser storage is unavailable, use the normal management entry.
    }
    router.replace(destination as never);
  }, [router]);

  return (
    <View
      accessibilityLabel="Abrindo GAS PUMP"
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.bg,
      }}
    >
      <ActivityIndicator color={C.green} />
    </View>
  );
}
