import React from "react";
import { View, Text, useWindowDimensions } from "react-native";
import { Page } from "@/components/sobra/shell";
import { CsvTools } from "@/components/sobra/csv-tools";
import { CategoryManager } from "@/components/sobra/category-manager";
import { StationCalendar } from "@/components/sobra/station-calendar";
import { ShiftOpeningPanel } from "@/components/sobra/shift-opening";
import { ShiftMovementsPanel } from "@/components/sobra/shift-movements";
import { ShiftClosingPanel } from "@/components/sobra/shift-closing";
import {
  C,
  F,
  Card,
  SectionTitle,
  Body,
  Icon,
  Button,
} from "@/components/sobra/ui";
import { useBudget } from "@/hooks/use-budget";
export default function More() {
  const { width } = useWindowDimensions();
  const { startDemo, exitDemo, demo, data } = useBudget();
  const wide = width >= 850;
  return (
    <Page
      title="Seus dados. Suas regras."
      subtitle="Um espaço para organizar, levar e cuidar do que é seu."
      monthPicker={false}
      addButton={false}
    >
      <ShiftOpeningPanel />
      <ShiftMovementsPanel />
      <ShiftClosingPanel />
      <StationCalendar />
      <View style={{ flexDirection: wide ? "row" : "column", gap: 22 }}>
        <View style={{ flex: wide ? 1.4 : undefined, gap: 22 }}>
          <CsvTools />
          <CategoryManager />
        </View>
        <View style={{ flex: 1, gap: 22 }}>
          <Card style={{ backgroundColor: C.green, borderColor: C.green }}>
            <View
              style={{
                backgroundColor: "#FFFFFF15",
                borderRadius: 14,
                width: 46,
                height: 46,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 23,
              }}
            >
              <Icon name="shield" color={C.lime} size={24} />
            </View>
            <Text
              style={{
                fontFamily: F.heading,
                color: C.lime,
                fontSize: 24,
                letterSpacing: -0.9,
                lineHeight: 32,
                marginBottom: 15,
              }}
            >
              Seu orçamento não precisa sair daqui.
            </Text>
            <Body color="#D0DDCE">
              Sem conta. Sem sincronização. Sem envio de suas finanças para
              inteligência artificial ou bancos de dados remotos.
            </Body>
            <View
              style={{
                height: 1,
                backgroundColor: "#FFFFFF22",
                marginVertical: 20,
              }}
            />
            <Body size={12} color="#D0DDCE">
              Os registros ficam no armazenamento deste navegador ou
              dispositivo. Aparelhos e navegadores diferentes têm dados
              separados.
            </Body>
          </Card>
          <Card>
            <SectionTitle title="Um cuidado importante" />
            <Body>
              Limpar os dados do navegador, trocar de aparelho ou desinstalar o
              app pode apagar seus registros. Exporte cópias regularmente.
            </Body>
            <View style={{ marginTop: 15 }}>
              <Body size={12}>
                Armazenamento local não significa criptografia. Evite usar o
                GAS PUMP em dispositivos compartilhados. As análises são cálculos
                locais, não recomendações de investimento.
              </Body>
            </View>
          </Card>
          <Card>
            <SectionTitle title="Conheça sem compromisso" />
            <Body>
              Explore um mês de exemplo. Seus dados pessoais ficam separados e
              não serão alterados.
            </Body>
            <View style={{ marginTop: 17 }}>
              <Button
                variant="secondary"
                compact
                icon={demo ? "log-out" : "play"}
                onPress={demo ? exitDemo : startDemo}
              >
                {demo ? "Sair da demonstração" : "Explorar demonstração"}
              </Button>
            </View>
          </Card>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              padding: 5,
            }}
          >
            <Text
              style={{ fontFamily: F.regular, color: C.muted, fontSize: 11 }}
            >
              {data.transactions.length} registros · {data.categories.length}{" "}
              categorias
            </Text>
            <Text style={{ fontFamily: F.bold, color: C.muted, fontSize: 11 }}>
              GAS PUMP 1.0
            </Text>
          </View>
        </View>
      </View>
    </Page>
  );
}
