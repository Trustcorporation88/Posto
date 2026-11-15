/**
 * Public credentials of the DEMO deployment. Only accepted where DEMO_MODE=true, whose
 * database holds fictitious data only; the production database never has these accounts.
 */
export const DEMO_PASSWORD = "gaspump-demo";
export const DEMO_EMAIL_DOMAIN = "gaspump.test";

export const DEMO_ACCOUNTS = [
  { role: "Proprietária", email: `proprietario@${DEMO_EMAIL_DOMAIN}` },
  { role: "Gerente", email: `manager@${DEMO_EMAIL_DOMAIN}` },
  { role: "Caixa", email: `cashier@${DEMO_EMAIL_DOMAIN}` },
  { role: "Frentista", email: `attendant@${DEMO_EMAIL_DOMAIN}` },
  { role: "Consulta financeira", email: `finance@${DEMO_EMAIL_DOMAIN}` },
] as const;
