import React from "react";
import { Text, View } from "react-native";
import { Body, Card, C, Empty, F, Label } from "@/components/sobra/ui";
import { GestaoShell, useMe } from "@/components/sobra/gestao/gestao-shell";
export default function GestaoHome() {
  const session = useMe();
  return (
    <GestaoShell title="Painel" subtitle="Visão geral da operação do posto.">
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <View style={{ padding: 22, backgroundColor: C.green, gap: 9 }}>
          <Label color={C.lime}>INÍCIO DA OPERAÇÃO</Label>
          <Text style={{ color: "white", fontFamily: F.heading, fontSize: 23 }}>
            Seu espaço de gestão começa aqui.
          </Text>
          <Body color="#DCE7DD">
            A estrutura de acesso está pronta. Ainda não há dados operacionais
            carregados.
          </Body>
        </View>
        <View style={{ padding: 22 }}>
          <Empty
            icon="clipboard"
            title="Nenhum indicador disponível"
            text="Não existem vendas, turnos ou valores fictícios nesta tela. Os módulos de operação chegam em fases posteriores."
          />
        </View>
      </Card>
      <View style={{ gap: 8 }}>
        <Label>CONTA ATUAL</Label>
        <Text style={{ color: C.ink, fontFamily: F.heading, fontSize: 19 }}>
          {session.data?.name || session.data?.email || "Equipe"}
        </Text>
        <Body>
          Organização e unidade são exibidas conforme os dados retornados pela
          API.
        </Body>
      </View>
    </GestaoShell>
  );
}
