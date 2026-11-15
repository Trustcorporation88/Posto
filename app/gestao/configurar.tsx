import React from "react";
import { ActivityIndicator } from "react-native";
import { Body, C, Notice } from "@/components/sobra/ui";
import { businessAuth } from "@/components/sobra/gestao/gestao-shell";
import {
  CommandLine,
  ServerCommandCard,
} from "@/components/sobra/gestao/server-command-card";

export default function GestaoConfigurar() {
  const status = businessAuth.setupStatus.useQuery(undefined, { retry: false });

  if (status.isLoading) {
    return (
      <ServerCommandCard label="CONFIGURAÇÃO INICIAL" title="Verificando…">
        <ActivityIndicator color={C.green} />
      </ServerCommandCard>
    );
  }

  if (status.error) {
    return (
      <ServerCommandCard label="CONFIGURAÇÃO INICIAL" title="Servidor indisponível">
        <Notice warning>
          Não foi possível consultar o servidor. Verifique a conexão e tente
          novamente. Nenhuma conta foi criada.
        </Notice>
      </ServerCommandCard>
    );
  }

  if (status.data?.hasOrganization) {
    return (
      <ServerCommandCard label="CONFIGURAÇÃO INICIAL" title="Configuração concluída">
        <Body>
          A empresa e a conta do proprietário já existem. Entre com o e-mail e a
          senha do proprietário. As demais pessoas entram por convite.
        </Body>
      </ServerCommandCard>
    );
  }

  return (
    <ServerCommandCard label="CONFIGURAÇÃO INICIAL" title="Criar a conta do proprietário">
      <Body>
        Por segurança, o primeiro cadastro não é feito pelo site. Quem
        administra o servidor roda o comando abaixo uma única vez. Ele pede o
        nome da empresa, da unidade, do proprietário, o e-mail e a senha.
      </Body>
      <CommandLine>node dist/admin.mjs bootstrap</CommandLine>
      <Notice>
        Depois disso, entre pelo login com o e-mail e a senha cadastrados e
        convide a equipe em Equipe.
      </Notice>
    </ServerCommandCard>
  );
}
