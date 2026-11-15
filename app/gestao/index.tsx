import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { Body, C, Card, F, Label, Notice } from "@/components/sobra/ui";
import { GestaoShell, useMe } from "@/components/sobra/gestao/gestao-shell";

const DASHBOARD_ROLES = ["owner", "manager", "cashier", "attendant", "finance_viewer"];

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

  if (DASHBOARD_ROLES.includes(session.data.role)) {
    return <Redirect href={"/gestao/painel" as never} />;
  }

  return (
    <GestaoShell
      title="Acesso restrito"
      subtitle="A página inicial respeita o perfil autenticado."
    >
      <Card style={{ gap: 13 }}>
        <Label>SEM MÓDULO INICIAL DISPONÍVEL</Label>
        <Text style={{ color: C.ink, fontFamily: F.heading, fontSize: 20 }}>
          Este perfil ainda não tem módulos disponíveis.
        </Text>
        <Notice warning>
          O perfil de técnico de troca de óleo receberá acesso quando o módulo
          de ordens de serviço for entregue.
        </Notice>
      </Card>
    </GestaoShell>
  );
}
