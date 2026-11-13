import React, { ReactNode, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Link, usePathname, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  C,
  F,
  Body,
  Button,
  Card,
  Icon,
  Label,
  Notice,
} from "@/components/sobra/ui";
import { trpc } from "@/lib/trpc";
import { setBusinessCsrfToken } from "@/lib/business-csrf";
import { GasPumpBrand } from "@/components/sobra/gas-pump-brand";
import { clearBusinessQueryCache } from "@/lib/business-query-cache";
import { notifyBusinessSessionChanged } from "@/lib/business-session-events";

export const businessAuth = trpc.businessAuth;
export const businessAdmin = trpc.businessAdmin;
export const useMe = () =>
  businessAuth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });
export function useBusinessCsrf(enabled = true) {
  const csrf = businessAuth.csrf.useQuery(undefined, {
    retry: false,
    enabled,
  });
  useEffect(() => {
    if (typeof csrf.data?.token === "string")
      setBusinessCsrfToken(csrf.data.token);
    return () => setBusinessCsrfToken(null);
  }, [csrf.data]);
  return csrf;
}

const nav = [
  { path: "/gestao/caixa", label: "Caixa", icon: "dollar-sign" },
  { path: "/gestao/pista", label: "Combustíveis", icon: "droplet" },
  { path: "/gestao/equipe", label: "Equipe", icon: "users" },
] as const;

export function GestaoShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useMe();
  const csrf = useBusinessCsrf(Boolean(session.data));
  const logout = businessAuth.logout.useMutation({
    onSuccess: async () => {
      setBusinessCsrfToken(null);
      notifyBusinessSessionChanged();
      await clearBusinessQueryCache(queryClient);
      router.replace("/gestao/login" as any);
    },
  });
  const [wide, setWide] = useState(Platform.OS !== "web");
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const update = () => setWide(window.innerWidth >= 900);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  useEffect(() => {
    if (!session.isLoading && (session.error || !session.data)) {
      router.replace("/gestao/login" as any);
    }
  }, [router, session.data, session.error, session.isLoading]);

  if (session.isLoading)
    return (
      <View style={center}>
        <ActivityIndicator color={C.green} />
        <Body>Verificando acesso…</Body>
      </View>
    );
  if (session.error || !session.data)
    return (
      <View style={center}>
        <Card style={{ width: "100%", maxWidth: 420, gap: 16 }}>
          <Label>Acesso restrito</Label>
          <Text style={{ color: C.ink, fontFamily: F.heading, fontSize: 24 }}>
            Sua sessão não está ativa
          </Text>
          <Body>
            Entre novamente para continuar. Nenhuma informação interna foi
            carregada.
          </Body>
          <Button onPress={() => router.replace("/gestao/login" as any)}>
            Ir para o login
          </Button>
        </Card>
      </View>
    );

  const profile = session.data as any;
  const visibleNav = nav.filter((item) => {
    if (item.path === "/gestao/equipe") {
      return profile.role === "owner" || profile.role === "manager";
    }
    if (item.path === "/gestao/caixa") {
      return ["owner", "manager", "cashier", "finance_viewer"].includes(
        profile.role,
      );
    }
    if (item.path === "/gestao/pista") {
      return ["owner", "manager", "attendant", "finance_viewer"].includes(
        profile.role,
      );
    }
    return false;
  });
  const aside = (
    <View
      style={{
        width: wide ? 248 : "100%",
        backgroundColor: C.green,
        paddingHorizontal: 22,
        paddingVertical: 22,
        gap: 24,
      }}
    >
      <View style={{ alignItems: wide ? "flex-start" : "center", gap: 10 }}>
        <GasPumpBrand width={wide ? 204 : 170} />
        <Label color={C.lime}>GESTÃO DE POSTO</Label>
      </View>
      {!wide && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {visibleNav.map((item) => (
            <Link key={item.path} href={item.path as any} asChild>
              <Pressable
                style={{
                  flexDirection: "row",
                  gap: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor:
                    pathname === item.path ? "#ffffff22" : "transparent",
                }}
              >
                <Icon name={item.icon} color="white" size={16} />
                <Text style={{ color: "white", fontFamily: F.medium }}>
                  {item.label}
                </Text>
              </Pressable>
            </Link>
          ))}
        </View>
      )}
      {wide && (
        <View style={{ gap: 7 }}>
          <Label color="#B9CCBB">OPERAÇÃO</Label>
          {visibleNav.map((item) => (
            <Link key={item.path} href={item.path as any} asChild>
              <Pressable
                style={{
                  flexDirection: "row",
                  gap: 12,
                  alignItems: "center",
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor:
                    pathname === item.path ? "#ffffff1c" : "transparent",
                }}
              >
                <Icon
                  name={item.icon}
                  color={pathname === item.path ? C.lime : "#DCE7DD"}
                  size={17}
                />
                <Text
                  style={{ color: "white", fontFamily: F.medium, fontSize: 13 }}
                >
                  {item.label}
                </Text>
              </Pressable>
            </Link>
          ))}
        </View>
      )}
      <View style={{ marginTop: "auto", gap: 12 }}>
        <Text style={{ color: "#DCE7DD", fontFamily: F.medium, fontSize: 12 }}>
          {profile.name || profile.email}
        </Text>
        <Button
          variant="secondary"
          icon="log-out"
          disabled={logout.isPending || !csrf.data?.token}
          onPress={() => logout.mutate()}
        >
          Sair
        </Button>
      </View>
    </View>
  );
  return (
    <View
      style={{
        flex: 1,
        flexDirection: wide ? "row" : "column",
        backgroundColor: C.bg,
      }}
    >
      {aside}
      <ScrollView
        contentContainerStyle={{
          padding: wide ? 38 : 20,
          paddingBottom: 48,
          flexGrow: 1,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 1120,
            alignSelf: "center",
            gap: 24,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <View style={{ gap: 7 }}>
              <Label>BAURU · SP</Label>
              <Text
                style={{
                  color: C.ink,
                  fontFamily: F.heading,
                  fontSize: wide ? 30 : 26,
                  letterSpacing: -0.8,
                }}
              >
                {title}
              </Text>
              <Body>{subtitle}</Body>
            </View>
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: C.lime,
                borderRadius: 20,
              }}
            >
              <Text
                style={{ color: C.green, fontFamily: F.bold, fontSize: 11 }}
              >
                {profile.location?.name ||
                  profile.organization?.name ||
                  "Gestão"}
              </Text>
            </View>
          </View>
          {children}
          <Notice>
            O fechamento é manual e registra diferença pendente quando os
            valores não coincidem; não confirma banco, TEF, POS ou documento
            fiscal. Combustíveis e pista permanecem disponíveis; conveniência e
            troca de óleo seguem em etapas futuras.
          </Notice>
        </View>
      </ScrollView>
    </View>
  );
}
const center = {
  flex: 1,
  minHeight: 400,
  justifyContent: "center",
  alignItems: "center",
  padding: 24,
  gap: 14,
  backgroundColor: C.bg,
} as const;
