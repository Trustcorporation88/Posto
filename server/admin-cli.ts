/**
 * Server administration commands. Run inside the server environment (DATABASE_URL set):
 *
 *   node dist/admin.mjs migrate       apply pending Drizzle migrations
 *   node dist/admin.mjs bootstrap     create the organization, location and owner (once)
 *   node dist/admin.mjs owner-reset   print a 30-minute password reset link for the owner
 *
 * Passwords are typed interactively and never accepted as arguments, so they do not end
 * up in shell history or process lists.
 */
import "dotenv/config";
import path from "node:path";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { bootstrap, createOwnerPasswordReset, organizationExists } from "./auth/service";
import { validEmail, validatePassword } from "./auth/security";
import { resetDemoPasswords, seedDemo } from "./demo-seed";

let muted = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk, encoding);
    callback();
  },
});

function prompt() {
  return createInterface({ input: process.stdin, output, terminal: true });
}

async function ask(question: string, check: (value: string) => string | null) {
  const rl = prompt();
  try {
    for (;;) {
      const value = (await rl.question(question)).trim();
      const problem = check(value);
      if (!problem) return value;
      console.log(`  ${problem}`);
    }
  } finally {
    rl.close();
  }
}

async function askHidden(question: string) {
  const rl = prompt();
  try {
    process.stdout.write(question);
    muted = true;
    const value = await rl.question("");
    return value;
  } finally {
    muted = false;
    process.stdout.write("\n");
    rl.close();
  }
}

const length = (min: number, max: number) => (value: string) =>
  value.length >= min && value.length <= max ? null : `Use de ${min} a ${max} caracteres.`;

async function askPassword() {
  for (;;) {
    const password = await askHidden("Senha do proprietário (mínimo 12 caracteres): ");
    if (!validatePassword(password)) {
      console.log("  A senha precisa ter de 12 a 256 caracteres.");
      continue;
    }
    const again = await askHidden("Repita a senha: ");
    if (again === password) return password;
    console.log("  As senhas não coincidem.");
  }
}

function publicUrl() {
  const raw = process.env.PUBLIC_APP_URL ?? "";
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  } catch {
    // fall through
  }
  return "";
}

async function runMigrate() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida.");
  const db = drizzle(url);
  await migrate(db, { migrationsFolder: path.resolve("drizzle") });
  await db.$client.end();
  console.log("Migrações aplicadas.");
}

async function runBootstrap() {
  if (await organizationExists()) {
    console.log("A configuração inicial já foi concluída. Nada foi alterado.");
    return;
  }
  console.log("Configuração inicial do GAS PUMP. Pressione Ctrl+C para cancelar.\n");
  const organizationName = await ask("Nome da empresa: ", length(1, 160));
  const locationName = await ask("Nome da unidade (posto): ", length(1, 160));
  const ownerName = await ask("Nome do proprietário: ", length(2, 120));
  const email = await ask("E-mail do proprietário: ", (value) =>
    validEmail(value) ? null : "E-mail inválido.",
  );
  const password = await askPassword();
  const confirm = await ask(
    `\nCriar "${organizationName}", unidade "${locationName}", proprietário ${ownerName} <${email}>? (sim/não) `,
    (value) => (["sim", "nao", "não", "s", "n"].includes(value.toLowerCase()) ? null : "Responda sim ou não."),
  );
  if (!confirm.toLowerCase().startsWith("s")) {
    console.log("Cancelado. Nada foi gravado.");
    return;
  }
  try {
    await bootstrap({ organizationName, locationName, ownerName, email, password });
  } catch (error) {
    if (error instanceof Error && error.message === "BOOTSTRAP_CLOSED") {
      console.log("Outra configuração foi concluída ao mesmo tempo. Nada foi alterado.");
      return;
    }
    throw error;
  }
  console.log("\nConta criada. Entre em /gestao/login com o e-mail e a senha informados.");
}

async function runOwnerReset() {
  const token = await createOwnerPasswordReset();
  if (!token) {
    console.log("Não há conta proprietária ativa. Rode primeiro: node dist/admin.mjs bootstrap");
    return;
  }
  const base = publicUrl();
  const link = `${base}/gestao/redefinir-senha#token=${encodeURIComponent(token)}`;
  console.log("\nLink de redefinição (válido por 30 minutos, uso único):\n");
  console.log(link);
  if (!base) console.log("\nDefina PUBLIC_APP_URL para receber o endereço completo.");
  console.log("\nEnvie por um canal privado. Gerar outro link invalida este.");
}

async function runSeedDemo() {
  console.log("Criando dados de demonstração (pode levar alguns minutos)…\n");
  const result = await seedDemo((line) => console.log(`  ${line}`));
  console.log("\nContas de demonstração (mesma senha para todas):\n");
  for (const { role, email } of result.accounts) console.log(`  ${role.padEnd(20)} ${email}`);
  console.log(`\n  Senha: ${result.password}\n`);
}

async function runDemoPassword() {
  const result = await resetDemoPasswords();
  console.log(`Senha das ${result.updated} contas de demonstração definida como: ${result.password}`);
}

const commands: Record<string, () => Promise<void>> = {
  migrate: runMigrate,
  bootstrap: runBootstrap,
  "owner-reset": runOwnerReset,
  // Only on the DEMO deployment (DEMO_MODE=true) and only on an empty database.
  "seed-demo": runSeedDemo,
  "demo-password": runDemoPassword,
};

async function main() {
  const name = process.argv[2] ?? "";
  const command = commands[name];
  if (!command) {
    console.log("Uso: node dist/admin.mjs <migrate|bootstrap|owner-reset|seed-demo>");
    process.exitCode = 1;
    return;
  }
  await command();
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    if (message === "SERVICE_UNAVAILABLE") {
      console.error("Banco de dados indisponível. Verifique DATABASE_URL.");
    } else {
      console.error(`Falha: ${message}`);
    }
    process.exit(1);
  });
