export function ownerAccessNotice(input: {
  checking: boolean;
  apiFailed: boolean;
  oauthResult?: string;
  authenticated: boolean;
  canBootstrap: boolean;
  hasOrganization: boolean;
}): { message: string; warning: boolean } {
  if (input.checking) return { message: "Verificando a sessão Manus e a autorização do projeto…", warning: false };
  if (input.apiFailed) return { message: "Não foi possível verificar a autorização pela API. A criação continua bloqueada; nenhuma conta foi criada.", warning: true };
  if (input.hasOrganization) return { message: "Uma organização já foi configurada. O cadastro inicial não pode ser repetido. Use o login ou a recuperação do proprietário.", warning: false };
  if (input.oauthResult === "failed") return { message: "O retorno da autenticação Manus falhou ou a tentativa expirou. Nenhuma conta foi criada. A criação permanece bloqueada até confirmar uma sessão válida do proprietário.", warning: true };
  if (input.authenticated && input.canBootstrap) return { message: "Conta Manus reconhecida como proprietária do projeto. Você pode revisar os dados e criar a primeira conta com e-mail e senha próprios.", warning: false };
  if (input.authenticated) return { message: "A sessão Manus foi reconhecida, mas não foi autorizada como proprietária deste projeto. O cadastro permanece bloqueado. É necessário verificar a identidade de proprietário configurada; sua senha GAS PUMP não corrige essa autorização.", warning: true };
  if (input.oauthResult === "returned") return { message: "O navegador retornou da autenticação, mas a sessão Manus não foi reconhecida pela aplicação. Nenhuma conta foi criada. O bloqueio pode estar na sessão ou nos cookies; isso não confirma que sua senha esteja errada.", warning: true };
  return { message: "A primeira conta exige a autenticação Manus do proprietário do projeto. Ela apenas autoriza o cadastro, não cria automaticamente a conta GAS PUMP.", warning: true };
}

export function canRequestOwnerRecovery(input: {
  authenticated: boolean;
  checking: boolean;
  apiFailed: boolean;
  canBootstrap: boolean;
  hasOrganization: boolean;
  oauthFailed: boolean;
}) {
  return input.authenticated && !input.checking && !input.apiFailed &&
    input.canBootstrap && input.hasOrganization && !input.oauthFailed;
}
