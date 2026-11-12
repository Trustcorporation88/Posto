import React, { useState } from "react";
import { Platform, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, C, Card, F, Label, Notice } from "@/components/sobra/ui";
import { businessAuth } from "@/components/sobra/gestao/gestao-shell";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";

export default function RecuperarAcesso() {
  const router = useRouter();
  const ownerSession = useAuth();
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [copyState, setCopyState] = useState("");
  const recovery = businessAuth.ownerPasswordResetLink.useMutation({
    onSuccess: ({ token }) => {
      if (Platform.OS !== "web") return;
      const target = new URL(
        "/gestao/redefinir-senha",
        window.location.origin,
      ).toString();
      setLink(`${target}#token=${encodeURIComponent(token)}`);
    },
    onError: (failure) =>
      setError(
        failure.message ||
          "Não foi possível validar o proprietário. Entre com a conta do projeto.",
      ),
  });

  const authenticateOwner = async () => {
    setError("");
    if (Platform.OS !== "web") return;
    try {
      window.sessionStorage.setItem("sobra.gestao.return", "recover");
      await startOAuthLogin();
    } catch {
      setError("Não foi possível iniciar a autenticação do proprietário.");
    }
  };

  const copy = async () => {
    try {
      if (Platform.OS === "web" && navigator.clipboard) {
        await navigator.clipboard.writeText(link);
        setCopyState("Link copiado. Envie-o por um canal privado.");
      } else if (Platform.OS === "web") {
        window.prompt("Copie o link temporário", link);
      }
    } catch {
      setError(
        "Não foi possível copiar o link. Selecione-o e copie manualmente.",
      );
    }
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
      <Card style={{ width: "100%", maxWidth: 520, gap: 17, padding: 26 }}>
        <Label>RECUPERAÇÃO DO PROPRIETÁRIO</Label>
        <Text style={{ fontFamily: F.heading, fontSize: 27, color: C.ink }}>
          Recuperar acesso
        </Text>
        <Body>
          Para confirmar a titularidade, entre pela conta autorizada do projeto.
          O sistema criará um link de senha válido por 30 minutos e de uso
          único. Nenhum e-mail será enviado.
        </Body>
        {ownerSession.loading ? (
          <Notice>Verificando a conta do projeto…</Notice>
        ) : null}
        {error ? <Notice warning>{error}</Notice> : null}
        {copyState ? <Notice>{copyState}</Notice> : null}
        {!ownerSession.isAuthenticated ? (
          <Button onPress={() => void authenticateOwner()}>
            Entrar com a conta autorizada do projeto
          </Button>
        ) : (
          <Button
            disabled={recovery.isPending}
            onPress={() => {
              setError("");
              setCopyState("");
              recovery.mutate();
            }}
          >
            {recovery.isPending ? "Validando…" : "Gerar link temporário"}
          </Button>
        )}
        {link ? (
          <View style={{ gap: 10 }}>
            <Notice>
              Link disponível somente nesta tela. Guarde-o em local privado. A
              nova senha encerrará todas as sessões existentes.
            </Notice>
            <Text
              selectable
              style={{ color: C.ink, fontFamily: F.regular, fontSize: 13 }}
            >
              {link}
            </Text>
            <Button variant="secondary" onPress={() => void copy()}>
              Copiar link de redefinição
            </Button>
          </View>
        ) : null}
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
