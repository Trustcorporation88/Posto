import React, { useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";
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
import {
  businessAdmin,
  GestaoShell,
  useMe,
} from "@/components/sobra/gestao/gestao-shell";

const roles = [
  { value: "manager", label: "Gerente" },
  { value: "cashier", label: "Caixa / conveniência" },
  { value: "attendant", label: "Frentista" },
  { value: "oil_technician", label: "Técnico de troca de óleo" },
  { value: "finance_viewer", label: "Consulta financeira" },
] as const;
type InviteRole = (typeof roles)[number]["value"];

function roleLabel(role: string) {
  return roles.find((item) => item.value === role)?.label ?? role;
}

function confirmation(message: string, action: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(message)) action();
    return;
  }
  Alert.alert("Confirmar ação", message, [
    { text: "Cancelar", style: "cancel" },
    { text: "Confirmar", style: "destructive", onPress: action },
  ]);
}

function linkFor(path: string, token: string) {
  const target =
    Platform.OS === "web"
      ? new URL(path, window.location.origin).toString()
      : path;
  return `${target}#token=${encodeURIComponent(token)}`;
}

export default function Equipe() {
  const profile = useMe();
  const isOwner = profile.data?.role === "owner";
  const canView = isOwner || profile.data?.role === "manager";
  const members = businessAdmin.listMembers.useQuery(undefined, {
    retry: false,
    enabled: canView,
  });
  const invites = businessAdmin.listInvitations.useQuery(undefined, {
    retry: false,
    enabled: canView,
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("cashier");
  const [createdLink, setCreatedLink] = useState("");
  const [createdLinkLabel, setCreatedLinkLabel] = useState("");
  const [error, setError] = useState("");
  const refresh = () => {
    void members.refetch();
    void invites.refetch();
  };
  const create = businessAdmin.createInvite.useMutation({
    onSuccess: (data) => {
      if (!data.token) {
        setError(
          "Convite criado, mas a API não retornou o token de uso único. Consulte o administrador do sistema.",
        );
        return;
      }
      setCreatedLink(linkFor("/gestao/convite", data.token));
      setCreatedLinkLabel("Convite de acesso");
      setEmail("");
      refresh();
    },
    onError: (failure) =>
      setError(failure.message || "Falha ao criar convite."),
  });
  const resetPassword = businessAdmin.createPasswordReset.useMutation({
    onSuccess: (data) => {
      setCreatedLink(linkFor("/gestao/redefinir-senha", data.token));
      setCreatedLinkLabel("Redefinição de senha");
    },
    onError: (failure) =>
      setError(
        failure.message || "Não foi possível gerar o link de redefinição.",
      ),
  });
  const setStatus = businessAdmin.setMemberStatus.useMutation({
    onSuccess: refresh,
    onError: (failure) =>
      setError(failure.message || "Não foi possível atualizar a conta."),
  });
  const setMemberRole = businessAdmin.setMemberRole.useMutation({
    onSuccess: refresh,
    onError: (failure) =>
      setError(failure.message || "Não foi possível alterar a função."),
  });
  const revoke = businessAdmin.revokeInvitation.useMutation({
    onSuccess: refresh,
    onError: (failure) =>
      setError(failure.message || "Não foi possível revogar o convite."),
  });

  const copy = async () => {
    try {
      if (Platform.OS === "web" && navigator.clipboard) {
        await navigator.clipboard.writeText(createdLink);
      } else if (Platform.OS === "web") {
        window.prompt("Copie o link de uso único", createdLink);
      } else {
        Alert.alert("Link de uso único", createdLink);
      }
    } catch {
      setError(
        "Não foi possível copiar. Selecione o link e envie por um canal interno aprovado.",
      );
    }
  };

  const dataError = members.error || invites.error;
  if (profile.data && !canView) {
    return (
      <GestaoShell title="Equipe" subtitle="Acessos e convites da unidade.">
        <Notice warning>
          Seu papel não permite consultar ou administrar a equipe.
        </Notice>
      </GestaoShell>
    );
  }

  return (
    <GestaoShell
      title="Equipe"
      subtitle="Acessos individuais, funções e convites da unidade."
    >
      {isOwner ? (
        <Card style={{ gap: 17 }}>
          <Label>CONVIDAR UMA PESSOA</Label>
          <Body>
            O link é temporário, individual e de uso único. Ele é mostrado uma
            vez para ser copiado e entregue por um canal interno. Nenhum e-mail
            é enviado.
          </Body>
          {error ? <Notice warning>{error}</Notice> : null}
          <Field
            label="E-mail da pessoa"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <View style={{ gap: 8 }}>
            <Label>FUNÇÃO INICIAL</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {roles.map((item) => (
                <Pressable
                  key={item.value}
                  onPress={() => setRole(item.value)}
                  style={{
                    backgroundColor: role === item.value ? C.green : C.light,
                    padding: 11,
                    borderRadius: 11,
                  }}
                >
                  <Text
                    style={{
                      color: role === item.value ? C.white : C.ink,
                      fontFamily: F.medium,
                      fontSize: 12,
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Button
            disabled={!email.includes("@") || create.isPending}
            onPress={() => {
              setError("");
              create.mutate({ email: email.trim(), role });
            }}
          >
            {create.isPending ? "Criando…" : "Criar convite"}
          </Button>
          {createdLink ? (
            <View style={{ gap: 10 }}>
              <Notice>
                {createdLinkLabel} criado. Copie e entregue em canal interno. O
                link não será enviado automaticamente.
              </Notice>
              <Text
                selectable
                style={{ color: C.ink, fontFamily: F.regular, fontSize: 13 }}
              >
                {createdLink}
              </Text>
              <Button variant="secondary" icon="copy" onPress={copy}>
                Copiar link de uso único
              </Button>
            </View>
          ) : null}
        </Card>
      ) : (
        <Notice>
          Você pode consultar a equipe. Somente o proprietário altera funções,
          cria convites ou redefine acessos.
        </Notice>
      )}

      {dataError ? (
        <Notice warning>
          Não foi possível carregar a equipe. Verifique o acesso e tente
          atualizar. Os dados não foram substituídos por exemplos.
        </Notice>
      ) : null}

      <Card style={{ gap: 16 }}>
        <Label>MEMBROS</Label>
        {members.isLoading ? (
          <Body>Carregando dados da API…</Body>
        ) : Array.isArray(members.data) && members.data.length ? (
          members.data.map((member) => (
            <View
              key={member.id}
              style={{
                borderTopWidth: 1,
                borderColor: C.line,
                paddingTop: 14,
                gap: 10,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: C.ink, fontFamily: F.bold }}>
                    {member.name || member.email}
                  </Text>
                  <Body>
                    {member.email} · {roleLabel(member.role)}
                  </Body>
                </View>
                <Text
                  style={{
                    color: member.active ? C.green : C.orange,
                    fontFamily: F.bold,
                    fontSize: 12,
                  }}
                >
                  {member.active ? "Ativa" : "Desativada"}
                </Text>
              </View>

              {isOwner && member.role !== "owner" ? (
                <>
                  <View style={{ gap: 7 }}>
                    <Label>FUNÇÃO</Label>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 7,
                      }}
                    >
                      {roles.map((item) => (
                        <Pressable
                          key={item.value}
                          accessibilityRole="button"
                          accessibilityState={{
                            selected: member.role === item.value,
                          }}
                          onPress={() => {
                            if (member.role === item.value) return;
                            confirmation(
                              `Alterar a função de ${member.email} para ${item.label}? A sessão atual será encerrada.`,
                              () =>
                                setMemberRole.mutate({
                                  memberId: member.id,
                                  role: item.value,
                                }),
                            );
                          }}
                          style={{
                            backgroundColor:
                              member.role === item.value ? C.green : C.light,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            borderRadius: 10,
                          }}
                        >
                          <Text
                            style={{
                              color:
                                member.role === item.value ? C.white : C.ink,
                              fontFamily: F.medium,
                              fontSize: 11,
                            }}
                          >
                            {item.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    <Button
                      compact
                      variant="secondary"
                      disabled={resetPassword.isPending}
                      onPress={() =>
                        confirmation(
                          `Gerar um novo link temporário de senha para ${member.email}? Links anteriores serão invalidados.`,
                          () => {
                            setError("");
                            setCreatedLink("");
                            resetPassword.mutate({ memberId: member.id });
                          },
                        )
                      }
                    >
                      Redefinir senha
                    </Button>
                    <Button
                      compact
                      variant={member.active ? "danger" : "secondary"}
                      disabled={setStatus.isPending}
                      onPress={() =>
                        confirmation(
                          `${member.active ? "Desativar" : "Reativar"} a conta de ${member.email}?`,
                          () =>
                            setStatus.mutate({
                              memberId: member.id,
                              active: !member.active,
                            }),
                        )
                      }
                    >
                      {member.active ? "Desativar conta" : "Reativar conta"}
                    </Button>
                  </View>
                </>
              ) : member.role === "owner" ? (
                <Body>
                  A conta proprietária não pode ser desativada por aqui.
                </Body>
              ) : null}
            </View>
          ))
        ) : !members.isLoading && !dataError ? (
          <Body>Nenhum membro retornado pela API.</Body>
        ) : null}
      </Card>

      <Card style={{ gap: 15 }}>
        <Label>CONVITES</Label>
        {invites.isLoading ? (
          <Body>Carregando convites…</Body>
        ) : Array.isArray(invites.data) && invites.data.length ? (
          invites.data.map((invite) => (
            <View
              key={invite.id}
              style={{
                borderTopWidth: 1,
                borderColor: C.line,
                paddingTop: 13,
                gap: 8,
              }}
            >
              <Text style={{ color: C.ink, fontFamily: F.bold }}>
                {invite.email}
              </Text>
              <Body>
                {roleLabel(invite.role)} · {invite.status || "Pendente"}
                {invite.expiresAt
                  ? ` · expira ${new Date(invite.expiresAt).toLocaleDateString("pt-BR")}`
                  : ""}
              </Body>
              {isOwner ? (
                <Button
                  compact
                  variant="danger"
                  disabled={revoke.isPending}
                  onPress={() =>
                    confirmation(`Revogar convite para ${invite.email}?`, () =>
                      revoke.mutate({ invitationId: invite.id }),
                    )
                  }
                >
                  Revogar convite
                </Button>
              ) : null}
            </View>
          ))
        ) : !invites.isLoading && !dataError ? (
          <Body>Nenhum convite pendente retornado pela API.</Body>
        ) : null}
      </Card>
      <Button variant="ghost" onPress={refresh}>
        Atualizar lista
      </Button>
    </GestaoShell>
  );
}
