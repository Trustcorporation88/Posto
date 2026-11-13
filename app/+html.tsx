import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>GAS PUMP | Gestão de postos</title>
        <meta name="description" content="GAS PUMP, gestão de equipe, pista, combustíveis e estoque do posto." />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
