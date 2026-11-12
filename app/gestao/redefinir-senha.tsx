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

function readResetToken() {
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

export default function RedefinirSenha() {
  const router = useRouter();
  const [token] = useState(readResetToken);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const reset = businessAuth.resetPassword.useMutation({
    onSuccess: () => router.replace("/gestao/login" as any),
    onError: (failure) =>
      setError(
        failure.message ||
          "Link inválido, expirado ou já utilizado. Solicite outro ao proprietário.",
      ),
  });

  const submit = () => {
    setError("");
    if (!token) {
      setError("Este link não contém um token válido. Solicite outro.");
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
    reset.mutate({ token, password });
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
        <Label>SEGURANÇA DA CONTA</Label>
        <Text style={{ fontFamily: F.heading, fontSize: 27, color: C.ink }}>
          Criar nova senha
        </Text>
        <Body>
          Use uma senha nova, com pelo menos 12 caracteres. Ao concluir, as
          sessões anteriores serão encerradas.
        </Body>
        {!token ? (
          <Notice warning>
            Link ausente ou inválido. Solicite ao proprietário um novo link de
            redefinição.
          </Notice>
        ) : null}
        {error ? <Notice warning>{error}</Notice> : null}
        <Field
          label="Nova senha (mínimo 12 caracteres)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <Field
          label="Confirmar nova senha"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <Button disabled={!token || reset.isPending} onPress={submit}>
          {reset.isPending ? "Salvando…" : "Salvar nova senha"}
        </Button>
      </Card>
    </View>
  );
}
