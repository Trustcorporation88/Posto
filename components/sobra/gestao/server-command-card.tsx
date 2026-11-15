import React, { ReactNode } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, C, Card, F, Label } from "@/components/sobra/ui";
import { GasPumpBrand } from "@/components/sobra/gas-pump-brand";

/** Monospaced command line shown to the person who administers the server. */
export function CommandLine({ children }: { children: string }) {
  return (
    <View
      style={{
        backgroundColor: C.ink,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
      }}
    >
      <Text
        selectable
        style={{ color: C.lime, fontFamily: "monospace", fontSize: 13 }}
      >
        {children}
      </Text>
    </View>
  );
}

export function ServerCommandCard({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.bg,
        justifyContent: "center",
        alignItems: "center",
        padding: 22,
      }}
    >
      <Card style={{ width: "100%", maxWidth: 520, gap: 18, padding: 28 }}>
        <View style={{ gap: 8 }}>
          <GasPumpBrand width={190} />
          <Label>{label}</Label>
          <Text style={{ fontFamily: F.heading, color: C.ink, fontSize: 26 }}>
            {title}
          </Text>
        </View>
        {children}
        <Button
          variant="ghost"
          onPress={() => router.replace("/gestao/login" as any)}
        >
          Voltar ao login
        </Button>
      </Card>
    </View>
  );
}
