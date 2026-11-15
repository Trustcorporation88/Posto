import React from "react";
import { Body, Notice } from "@/components/sobra/ui";
import {
  CommandLine,
  ServerCommandCard,
} from "@/components/sobra/gestao/server-command-card";

export default function GestaoRecuperar() {
  return (
    <ServerCommandCard label="RECUPERAR ACESSO" title="Esqueci a senha">
      <Body>
        Se você faz parte da equipe, peça ao proprietário um link de
        redefinição na tela Equipe. O link vale por 30 minutos e só pode ser
        usado uma vez.
      </Body>
      <Body>
        Se você é o proprietário, quem administra o servidor gera o link com o
        comando abaixo e envia a você por um canal privado.
      </Body>
      <CommandLine>node dist/admin.mjs owner-reset</CommandLine>
      <Notice>
        Ao usar o link, as sessões abertas da conta são encerradas e os outros
        links pendentes deixam de valer.
      </Notice>
    </ServerCommandCard>
  );
}
