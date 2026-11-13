import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { Body, C, Card, F, Label, Notice } from "@/components/sobra/ui";
import { GestaoShell, useMe } from "@/components/sobra/gestao/gestao-shell";

export default function GestaoHome() {
  const session = useMe();

  if (session.isLoading) {
    return (
      <View
        style={{
          flex: 1,
          minHeight: 360,
          justifyContent: "center",
          alignItems: "center",
          gap: 12,
          backgroundColor: C.bg,
        }}
      >
        <ActivityIndicator color={C.green} />
        <Body>Verificando a sessão da gestão…</Body>
      </View>
    );
  }

  if (session.error || !session.data) {
    return <Redirect href="/gestao/login" />;
  }

  const role = session.data.role;
  if (role === "cashier") {
    return <Redirect href="/gestao/caixa" />;
  }
  if (
    role === "owner" ||
    role === "manager" ||
    role === "attendant" ||
    role === "finance_viewer"
  ) {
    return <Redirect href="/gestao/pista" />;
  }

  return (
    <GestaoShell
      title="Acesso restrito"
      subtitle="A página inicial respeita o perfil autenticado."
    >
      <Card style={{ gap: 13 }}>
        <Label>SEM MÓDULO INICIAL DISPONÍVEL</Label>
        <Text style={{ color: C.ink, fontFamily: F.heading, fontSize: 20 }}>
          Este perfil não tem acesso à pista nem ao caixa.
        </Text>
        <Notice warning>
          O perfil técnico de troca de óleo não recebe acesso ao caixa nesta
          subetapa. Nenhum redirecionamento automático será repetido.
        </Notice>
      </Card>
    </GestaoShell>
  );
}
