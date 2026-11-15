import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Body,
  Button,
  C,
  Card,
  Field,
  F,
  Label,
  Notice,
} from "@/components/sobra/ui";
import { businessAuth } from "@/components/sobra/gestao/gestao-shell";
import { GasPumpBrand } from "@/components/sobra/gas-pump-brand";
import { clearBusinessQueryCache } from "@/lib/business-query-cache";
import { setBusinessCsrfToken } from "@/lib/business-csrf";
import { notifyBusinessSessionChanged } from "@/lib/business-session-events";
import { useDemoMode } from "@/lib/api-base";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/shared/demo";
export default function GestaoLogin() {
  const demo = useDemoMode();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const login = businessAuth.login.useMutation({
    onSuccess: async () => {
      setBusinessCsrfToken(null);
      notifyBusinessSessionChanged();
      await clearBusinessQueryCache(queryClient);
      setPassword("");
      router.replace("/gestao" as any);
    },
    onError: (e: any) =>
      setError(e.message || "Não foi possível entrar. Tente novamente."),
  });
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
      <Card style={{ width: "100%", maxWidth: 440, gap: 20, padding: 28 }}>
        <View style={{ gap: 8 }}>
          <GasPumpBrand width={210} />
          <Label>GAS PUMP · GESTÃO DE POSTO</Label>
          <Text style={{ fontFamily: F.heading, color: C.ink, fontSize: 29 }}>
            Acesse sua equipe
          </Text>
          <Body>
            A entrada é destinada às pessoas convidadas pela administração.
          </Body>
        </View>
        {demo ? (
          <View
            style={{
              backgroundColor: C.orangeBg,
              borderRadius: 12,
              padding: 14,
              gap: 10,
            }}
          >
            <Text style={{ color: C.orange, fontFamily: F.bold, fontSize: 13 }}>
              AMBIENTE DE DEMONSTRAÇÃO · dados fictícios
            </Text>
            <Text style={{ color: C.ink, fontFamily: F.regular, fontSize: 13 }}>
              Escolha um perfil para entrar. Senha de todas as contas:{" "}
              <Text style={{ fontFamily: F.bold }}>{DEMO_PASSWORD}</Text>
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {DEMO_ACCOUNTS.map((account) => (
                <Button
                  key={account.email}
                  compact
                  variant="secondary"
                  disabled={login.isPending}
                  onPress={() => {
                    setEmail(account.email);
                    setPassword(DEMO_PASSWORD);
                    setError("");
                    login.mutate({ email: account.email, password: DEMO_PASSWORD });
                  }}
                >
                  {`Entrar como ${account.role}`}
                </Button>
              ))}
            </View>
          </View>
        ) : (
          <Notice>Acesso restrito à equipe convidada</Notice>
        )}
        {error ? <Notice warning>{error}</Notice> : null}
        <Field
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <Field
          label="Senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={() =>
            login.mutate({ email: email.trim(), password })
          }
        />
        <Button
          disabled={login.isPending || !email || !password}
          onPress={() => {
            setError("");
            login.mutate({ email: email.trim(), password });
          }}
        >
          {login.isPending ? "Entrando…" : "Entrar"}
        </Button>
        <Text
          style={{
            fontFamily: F.regular,
            color: C.muted,
            fontSize: 12,
            textAlign: "center",
          }}
        >
          Não há cadastro público. Peça um convite ao proprietário.
        </Text>
        <Button
          variant="ghost"
          onPress={() => router.replace("/gestao/recuperar" as any)}
        >
          Esqueci a senha
        </Button>
        <Button
          variant="ghost"
          onPress={() => router.replace("/gestao/configurar" as any)}
        >
          Configurar primeira conta
        </Button>
      </Card>
    </View>
  );
}
