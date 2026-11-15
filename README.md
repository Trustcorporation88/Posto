# GAS PUMP

Gestão de posto (caixa por turno, pista e combustíveis, equipe) em Expo Router + Express/tRPC + MySQL.
Produção: <https://posto.trustcorp.com.br> (Railway, projeto `gas-pump-posto`).

## Desenvolvimento

```bash
pnpm install
cp .env.example .env      # ajuste DATABASE_URL para um MySQL 8 local
pnpm admin migrate        # cria as tabelas
pnpm dev                  # API em :3000, Expo Web em :8081
```

Verificações: `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build:production`. O CI do GitHub roda todas a cada push e PR.

## Deploy

Cada merge na `main` é publicado pelo Railway depois que o CI passa. O Railway constrói o `Dockerfile`, roda
`node dist/admin.mjs migrate` antes de trocar a versão e só libera o tráfego quando `/api/health` responde.

A infraestrutura (app, MySQL, variáveis) está em `.railway/railway.ts`:

```bash
railway config plan    # mostra o que mudaria
railway config apply   # aplica depois de confirmar
```

## Administração

Os comandos rodam dentro do container, com acesso ao banco:

```bash
railway ssh --service gas-pump
cd /app
node dist/admin.mjs bootstrap     # uma única vez: empresa, unidade e conta do proprietário
node dist/admin.mjs owner-reset   # link de redefinição de senha do proprietário (30 min, uso único)
```

As senhas são digitadas de forma oculta. A equipe entra por convite gerado pelo proprietário na tela Equipe.

## Dados

- Valores em centavos inteiros; volumes em `DECIMAL(18,3)`.
- O orçamento pessoal e o caixa local do app ficam só no aparelho e não vão para o servidor.
- Backups do MySQL: ative a agenda em Railway → MySQL → Backups.
