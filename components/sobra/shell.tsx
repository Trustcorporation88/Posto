import React, { ReactNode } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  useWindowDimensions,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBudget } from "@/hooks/use-budget";
import { changeMonth, monthTitle, currentMonth } from "@/lib/budget";
import { C, F, Icon, Button, IconButton, Body, Label, Notice } from "./ui";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Image
        source={require("@/assets/images/icon.png")}
        style={{
          width: small ? 30 : 37,
          height: small ? 30 : 37,
          borderRadius: 11,
        }}
        accessibilityLabel="Marca Sobra"
      />
      <Text
        style={{
          fontFamily: F.extra,
          fontSize: small ? 25 : 29,
          color: C.ink,
          letterSpacing: -1.6,
        }}
      >
        sobra<Text style={{ color: C.green }}>.</Text>
      </Text>
    </View>
  );
}
const links = [
  { name: "index", title: "Painel", icon: "grid" },
  { name: "transactions", title: "Lançamentos", icon: "repeat" },
  { name: "budgets", title: "Orçamentos", icon: "pie-chart" },
  { name: "more", title: "Mais", icon: "sliders" },
];
type NavProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    navigate: (name: string) => void;
    emit: (event: {
      type: "tabPress";
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
  };
};
export function AppNav({ state, navigation }: NavProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const desktop = width >= 1050;
  return (
    <View
      style={
        desktop
          ? {
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: 224,
              backgroundColor: C.bg,
              padding: 26,
              borderRightWidth: 1,
              borderRightColor: C.line,
              paddingTop: 35,
            }
          : {
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              flexDirection: "row",
              borderTopWidth: 1,
              borderColor: C.line,
              backgroundColor: C.bg,
              paddingHorizontal: 9,
              paddingTop: 9,
              paddingBottom: Math.max(insets.bottom, 12),
            }
      }
    >
      {desktop && (
        <View style={{ marginBottom: 58 }}>
          <Brand />
          <Text
            style={{
              fontFamily: F.regular,
              color: C.muted,
              fontSize: 11,
              marginTop: 11,
            }}
          >
            Seu dinheiro, mais claro.
          </Text>
        </View>
      )}
      {links.map((item) => {
        const route = state.routes.find((r) => r.name === item.name);
        if (!route) return null;
        const active = state.routes[state.index].key === route.key;
        return (
          <Pressable
            key={item.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!event.defaultPrevented) navigation.navigate(item.name);
            }}
            style={
              desktop
                ? {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 13,
                    paddingHorizontal: 15,
                    paddingVertical: 15,
                    borderRadius: 13,
                    marginBottom: 9,
                    backgroundColor: active ? C.green : "transparent",
                  }
                : {
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 7,
                    gap: 6,
                    borderRadius: 12,
                    backgroundColor: active ? C.light : "transparent",
                  }
            }
          >
            <Icon
              name={item.icon}
              size={desktop ? 19 : 21}
              color={active && desktop ? C.lime : active ? C.green : C.muted}
            />
            <Text
              style={{
                fontFamily: active ? F.bold : F.medium,
                fontSize: desktop ? 13 : 10,
                color: active && desktop ? C.white : active ? C.green : C.muted,
              }}
            >
              {item.title}
            </Text>
            {active && desktop && (
              <View
                style={{
                  marginLeft: "auto",
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: C.lime,
                }}
              />
            )}
          </Pressable>
        );
      })}
      {desktop && (
        <View style={{ marginTop: "auto", gap: 17 }}>
          <View
            style={{
              padding: 16,
              borderWidth: 1,
              borderColor: C.line,
              borderRadius: 15,
              gap: 9,
            }}
          >
            <Icon name="shield" size={19} color={C.green} />
            <Text style={{ fontFamily: F.bold, color: C.ink, fontSize: 12 }}>
              Só você e seus dados.
            </Text>
            <Body size={11}>Tudo fica neste dispositivo. Simples assim.</Body>
          </View>
          <Text style={{ fontFamily: F.regular, fontSize: 10, color: C.muted }}>
            SOBRA · ORÇAMENTO PESSOAL
          </Text>
        </View>
      )}
    </View>
  );
}
export function MonthPicker() {
  const { month, setMonth } = useBudget();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: 12,
        backgroundColor: C.white,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <IconButton
        name="chevron-left"
        label="Mês anterior"
        onPress={() => setMonth(changeMonth(month, -1))}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voltar para o mês atual"
        onPress={() => setMonth(currentMonth())}
      >
        <Text
          style={{
            fontFamily: F.bold,
            color: C.ink,
            fontSize: 12,
            minWidth: 112,
            textAlign: "center",
            textTransform: "capitalize",
          }}
        >
          {monthTitle(month)}
        </Text>
      </Pressable>
      <IconButton
        name="chevron-right"
        label="Próximo mês"
        onPress={() => setMonth(changeMonth(month, 1))}
      />
    </View>
  );
}
export function Page({
  title,
  subtitle,
  children,
  monthPicker = true,
  addButton = true,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  monthPicker?: boolean;
  addButton?: boolean;
}) {
  const { width } = useWindowDimensions();
  const desktop = width >= 1050;
  const { ready, loadError, reload, demo, exitDemo, openEditor, toast } =
    useBudget();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{ flex: 1, backgroundColor: C.bg, paddingLeft: desktop ? 224 : 0 }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: width < 600 ? 20 : 40,
          paddingTop: Math.max(insets.top, desktop ? 35 : 21),
          paddingBottom: desktop ? 35 : 115,
          maxWidth: 1470,
          width: "100%",
          alignSelf: "center",
          gap: 26,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 22,
            borderBottomWidth: 1,
            borderBottomColor: C.line,
          }}
        >
          {!desktop ? (
            <Brand small />
          ) : (
            <Label>MENOS COMPLICAÇÃO. MAIS CLAREZA.</Label>
          )}
          <View style={{ flexDirection: "row", gap: 7, alignItems: "center" }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: "#6C8B58",
              }}
            />
            <Text
              style={{ color: C.muted, fontFamily: F.medium, fontSize: 11 }}
            >
              Dados no dispositivo
            </Text>
            <Icon name="lock" size={12} color={C.muted} />
          </View>
        </View>
        {demo && (
          <View
            style={{
              padding: 13,
              borderRadius: 12,
              backgroundColor: C.lime,
              gap: 10,
              flexDirection: width < 600 ? "column" : "row",
              justifyContent: "space-between",
              alignItems: width < 600 ? "stretch" : "center",
            }}
          >
            <Text
              style={{
                fontFamily: F.medium,
                fontSize: 12,
                color: C.green,
                flex: 1,
              }}
            >
              Modo demonstração. Dados de exemplo separados dos seus.
            </Text>
            <Button compact variant="secondary" onPress={exitDemo}>
              Sair da demonstração
            </Button>
          </View>
        )}
        {loadError ? (
          <View style={{ gap: 10 }}>
            <Notice warning>{loadError}</Notice>
            <Button compact variant="secondary" onPress={() => void reload()}>
              Tentar novamente
            </Button>
          </View>
        ) : null}
        <View style={{ gap: 20 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 15,
            }}
          >
            <View style={{ flex: 1, gap: 8 }}>
              <Text
                style={{
                  fontFamily: F.extra,
                  color: C.ink,
                  fontSize: width < 600 ? 30 : 35,
                  letterSpacing: -1.5,
                }}
              >
                {title}
              </Text>
              <Body>{subtitle}</Body>
            </View>
            {addButton && width >= 680 && (
              <Button
                icon="plus"
                disabled={!ready || !!loadError}
                onPress={() => openEditor()}
              >
                Novo lançamento
              </Button>
            )}
          </View>
          {monthPicker && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <MonthPicker />
              {width >= 800 && <Label>UM MÊS DE CADA VEZ</Label>}
              {addButton && width < 680 && (
                <Button
                  compact
                  icon="plus"
                  disabled={!ready || !!loadError}
                  onPress={() => openEditor()}
                >
                  Novo
                </Button>
              )}
            </View>
          )}
        </View>
        {!ready ? (
          <View style={{ padding: 70, alignItems: "center", gap: 15 }}>
            <ActivityIndicator color={C.green} />
            <Body>Abrindo seus dados locais...</Body>
          </View>
        ) : loadError ? (
          <View style={{ paddingVertical: 40, alignItems: "center", gap: 15 }}>
            <Icon name="lock" size={30} color={C.green} />
            <Body>
              Os registros e as exportações ficam bloqueados até seus dados
              locais serem abertos com segurança.
            </Body>
          </View>
        ) : (
          children
        )}
        <View style={{ alignItems: "center", paddingTop: 8 }}>
          <Text style={{ fontFamily: F.regular, fontSize: 10, color: C.muted }}>
            Mais consciência hoje. Mais tranquilidade amanhã.
          </Text>
        </View>
      </ScrollView>
      {!!toast && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: desktop ? 250 : 20,
            right: 20,
            bottom: desktop ? 25 : 100,
            alignItems: "center",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              gap: 9,
              backgroundColor: C.ink,
              padding: 16,
              borderRadius: 14,
              maxWidth: 580,
            }}
          >
            <Icon name="check-circle" size={18} color={C.lime} />
            <Text
              style={{
                fontFamily: F.medium,
                color: C.white,
                fontSize: 13,
                flexShrink: 1,
              }}
            >
              {toast}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
