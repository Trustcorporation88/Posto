import React, { useState } from "react";
import { Platform, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { useAuth } from "@/hooks/use-auth";
import { startOAuthLogin } from "@/constants/oauth";
import { ownerAccessNotice } from "@/lib/business-owner-access";
export default function ConfigurarGestao() {
  const router = useRouter();
  const params = useLocalSearchParams<{ oauth?: string }>();
  const owner = useAuth();
  const status = businessAuth.setupStatus.useQuery(undefined, { retry: false, refetchOnMount: "always" });
  const [organizationName, setOrganization] = useState("");
  const [locationName, setLocation] = useState("");
  const [ownerName, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const beginOwnerLogin = async () => {
    setError("");
    try {
      await startOAuthLogin("setup");
    } catch {
      setError("Não foi possível iniciar a autenticação do proprietário.");
    }
  };
  const setup = businessAuth.bootstrapOwner.useMutation({
    onSuccess: () => router.replace("/gestao/login" as any),
    onError: (e: any) =>
      setError(
        e.message || "Não foi possível configurar. Revise e tente novamente.",
      ),
  });
  const ready = !!status.data?.canBootstrap && !status.data?.hasOrganization &&
    !status.error && !status.isLoading && params.oauth !== "failed";
  const notice = ownerAccessNotice({
    checking: status.isLoading || owner.loading,
    apiFailed: Boolean(status.error),
    oauthResult: typeof params.oauth === "string" ? params.oauth : undefined,
    authenticated: owner.isAuthenticated,
    canBootstrap: Boolean(status.data?.canBootstrap),
    hasOrganization: Boolean(status.data?.hasOrganization),
  });
  const submit = () => {
    setError("");
    if (
      !organizationName.trim() ||
      !locationName.trim() ||
      !ownerName.trim() ||
      !email.includes("@")
    ) {
      setError("Preencha todos os campos com informações válidas.");
      return;
    }
    if (password.length < 12) {
      setError("Use uma senha com pelo menos 12 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setup.mutate({
      organizationName: organizationName.trim(),
      locationName: locationName.trim(),
      ownerName: ownerName.trim(),
      email: email.trim(),
      password,
    });
  };
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.bg,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
      }}
    >
      <Card style={{ width: "100%", maxWidth: 560, gap: 16, padding: 26 }}>
        <Label>CONFIGURAÇÃO INICIAL</Label>
        <Text style={{ fontFamily: F.heading, fontSize: 27, color: C.ink }}>
          Criar a primeira conta
        </Text>
        <Body>
          O provisionamento só pode acontecer uma vez e exige uma sessão OAuth
          válida do proprietário do projeto. Depois, o acesso comercial usa
          e-mail e senha próprios.
        </Body>
        <Notice warning={notice.warning}>{notice.message}</Notice>
        {!owner.isAuthenticated && !owner.loading ? (
          <View style={{ gap: 10 }}>
            <Button
              variant="secondary"
              disabled={Platform.OS !== "web"}
              onPress={() => void beginOwnerLogin()}
            >
              Entrar como proprietário do projeto
            </Button>
          </View>
        ) : null}
        {error ? <Notice warning>{error}</Notice> : null}
        <Field
          label="Nome da empresa"
          value={organizationName}
          onChangeText={setOrganization}
        />
        <Field
          label="Nome da unidade"
          value={locationName}
          onChangeText={setLocation}
        />
        <Field
          label="Nome do proprietário"
          value={ownerName}
          onChangeText={setName}
        />
        <Field
          label="E-mail de acesso"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <Field
          label="Senha (mínimo 12 caracteres)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <Field
          label="Confirmar senha"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <Button
          disabled={!ready || !owner.isAuthenticated || setup.isPending}
          onPress={submit}
        >
          {setup.isPending ? "Configurando…" : "Criar proprietário"}
        </Button>
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
