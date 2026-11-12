import React, { useState } from "react";
import { Platform, Text, View } from "react-native";
import { useRouter } from "expo-router";
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

function readInvitationToken() {
  if (Platform.OS !== "web") return "";
  try {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("token") ?? "";
    window.history.replaceState({}, "", window.location.pathname);
    return token;
  } catch {
    return "";
  }
}

export default function AceitarConvite() {
  const router = useRouter();
  const [token] = useState(readInvitationToken);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const accept = businessAuth.acceptInvite.useMutation({
    onSuccess: () => router.replace("/gestao/login" as any),
    onError: (failure) =>
      setError(
        failure.message ||
          "Convite inválido ou expirado. Solicite um novo link ao administrador.",
      ),
  });
  const submit = () => {
    setError("");
    if (!token) {
      setError("O link não contém um convite válido ou ele já foi removido.");
      return;
    }
    if (name.trim().length < 2) {
      setError("Informe seu nome.");
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
    accept.mutate({ token, name: name.trim(), password });
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
      <Card style={{ width: "100%", maxWidth: 480, gap: 17, padding: 26 }}>
        <Label>ACESSO DA EQUIPE</Label>
        <Text style={{ fontFamily: F.heading, fontSize: 27, color: C.ink }}>
          Ativar convite
        </Text>
        <Body>
          Crie sua senha para concluir a entrada na equipe. O link é individual,
          temporário e de uso único.
        </Body>
        {!token ? (
          <Notice warning>
            Este link não é válido. Peça ao proprietário da empresa um novo
            convite.
          </Notice>
        ) : null}
        {error ? <Notice warning>{error}</Notice> : null}
        <Field
          label="Seu nome"
          value={name}
          onChangeText={setName}
          autoComplete="name"
        />
        <Field
          label="Nova senha (mínimo 12 caracteres)"
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
        <Button disabled={!token || accept.isPending} onPress={submit}>
          {accept.isPending ? "Ativando…" : "Criar acesso"}
        </Button>
      </Card>
    </View>
  );
}
