/**
 * In-app help. Plain data so the screen stays simple and the text can be reviewed in one place.
 * Keep it in sync with docs/manual/manual-gaspump.html (the PDF version).
 */

export type HelpSectionId =
  | "regras"
  | "primeiros-passos"
  | "painel"
  | "caixa"
  | "pista"
  | "relatorios"
  | "equipe"
  | "duvidas";

export type HelpBlock =
  | { kind: "text"; text: string }
  | { kind: "steps"; title?: string; items: string[] }
  | { kind: "list"; title?: string; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "note"; text: string; warning?: boolean };

export type HelpSection = {
  id: HelpSectionId;
  title: string;
  summary: string;
  icon: string;
  /** Roles that see the section; empty means everyone. */
  roles: string[];
  blocks: HelpBlock[];
};

const DASHBOARD_ROLES = ["owner", "manager", "cashier", "attendant", "finance_viewer"];

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "regras",
    title: "Como o sistema funciona",
    summary: "Três regras que valem em todas as telas.",
    icon: "info",
    roles: [],
    blocks: [
      {
        kind: "list",
        items: [
          "Nada grava sem revisão: toda operação mostra uma conferência, e só o botão de confirmar salva. Voltar ou cancelar não grava nada.",
          "Nada é apagado: um erro é corrigido com um novo lançamento justificado. O histórico mostra quem fez o quê e quando.",
          "Cada pessoa usa a própria conta: o nome gravado nos registros é sempre o da conta conectada, não um nome digitado.",
        ],
      },
      {
        kind: "note",
        text: "O sistema precisa de internet. Sem conexão, a tela avisa e nada é salvo pela metade.",
      },
    ],
  },
  {
    id: "primeiros-passos",
    title: "Primeiros passos",
    summary: "Configuração inicial do posto, feita uma vez.",
    icon: "flag",
    roles: ["owner", "manager"],
    blocks: [
      { kind: "text", text: "Em Combustíveis, na seção Estrutura da pista, escolha a categoria e use Adicionar. Siga esta ordem, porque cada item depende do anterior:" },
      {
        kind: "steps",
        items: [
          "Combustíveis: código e nome. Ex.: GC Gasolina comum, ET Etanol, S10 Diesel S10.",
          "Tanques: cada tanque fica ligado a um combustível. Informe a capacidade para ver o percentual de ocupação no Painel.",
          "Bombas e bicos: cada bico fica ligado à bomba e ao tanque que o abastece.",
          "Preço: Registrar preço para cada combustível, com a data e hora em que passa a valer.",
          "Encerrante inicial: Registrar encerrante inicial de cada bico, com o número atual do contador da bomba.",
          "Estoque inicial: registre a carga em Receber combustível (ou Ajustar estoque, com justificativa) e confira com Medir tanque fisicamente.",
          "Equipe: convide gerente, caixas e frentistas em Equipe.",
          "Caixa: abra o primeiro turno com o fundo de troco contado.",
        ],
      },
      { kind: "note", text: "O Painel mostra a lista de primeiros passos com o que já foi feito e o que falta, com atalho para cada tela." },
    ],
  },
  {
    id: "painel",
    title: "Painel",
    summary: "O resumo do posto, atualizado a cada minuto.",
    icon: "home",
    roles: DASHBOARD_ROLES,
    blocks: [
      {
        kind: "list",
        items: [
          "Caixa: turno aberto, operador, dinheiro esperado na gaveta, Pix, débito e crédito lançados e os últimos fechamentos.",
          "Pista hoje: litros vendidos, venda estimada, margem estimada e tanques com diferença de medição a investigar.",
          "Gráfico dos últimos 7 dias, litros por combustível e estoque teórico de cada tanque.",
        ],
      },
      { kind: "note", text: "Os números da pista do dia só aparecem depois da primeira leitura de encerrante, no fim do turno." },
    ],
  },
  {
    id: "caixa",
    title: "Caixa por turno",
    summary: "Abrir, registrar movimentos e fechar com conferência.",
    icon: "dollar-sign",
    roles: ["owner", "manager", "cashier", "finance_viewer"],
    blocks: [
      { kind: "text", text: "Turnos de Bauru: segunda a sábado 06h–14h e 14h–22h; domingos e feriados 07h–13h e 13h–19h. O turno é escolhido pelo relógio do servidor." },
      {
        kind: "steps",
        title: "Abrir o turno",
        items: [
          "Conte o fundo de troco e digite o valor. Zero é permitido.",
          "Confira operador, data, turno e fundo e toque em Confirmar e abrir caixa.",
        ],
      },
      {
        kind: "list",
        title: "Registrar movimentos",
        items: [
          "Recebimento: meio (dinheiro, Pix, débito ou crédito), natureza (venda do turno ou conta anterior), valor e descrição. Pix, cartões e contas anteriores pedem uma referência, como o NSU ou o número do comprovante.",
          "Sangria: retirada de dinheiro da gaveta, por exemplo para o cofre. Não pode passar do dinheiro esperado.",
          "Suprimento: reforço de troco em dinheiro.",
          "Nunca digite número de cartão, CVV ou senha.",
        ],
      },
      { kind: "note", text: "Dinheiro esperado = fundo + recebimentos em dinheiro + suprimentos − sangrias. Fundo, sangria e suprimento são guarda de dinheiro, não receita nem despesa." },
      {
        kind: "steps",
        title: "Fechar o turno",
        items: [
          "Conte o dinheiro da gaveta, incluindo o fundo, e digite o total.",
          "Digite os totais de Pix, débito e crédito dos relatórios das maquininhas.",
          "Confira o esperado e a diferença de cada meio. Se houver diferença, escreva a justificativa: o turno fecha como diferença pendente.",
          "Toque em Confirmar e fechar turno. O turno fechado não aceita movimentos, e o próximo pode ser aberto.",
        ],
      },
      { kind: "note", warning: true, text: "O caixa não fecha sozinho quando o horário acaba, e um novo turno só abre depois do fechamento. A conferência é manual: não confirma banco, TEF, PDV nem documento fiscal." },
    ],
  },
  {
    id: "pista",
    title: "Pista e combustíveis",
    summary: "Leituras de bico, cargas, medições e preços.",
    icon: "droplet",
    roles: ["owner", "manager", "attendant", "finance_viewer"],
    blocks: [
      {
        kind: "table",
        head: ["Quando", "O que fazer", "Botão"],
        rows: [
          ["Fim de cada turno", "Anotar o encerrante final de cada bico. O sistema calcula litros, venda e custo.", "Registrar leitura de pista"],
          ["Chegada do caminhão", "Fornecedor, tanque, volume, custo por litro e número da nota (opcional).", "Receber combustível"],
          ["Toda semana", "Medir o tanque. Diferenças viram pendência a investigar, não perda automática.", "Medir tanque fisicamente"],
          ["Mudança de preço", "Novo preço com data e hora. Faça a leitura de todos os bicos nesse mesmo horário.", "Registrar preço"],
          ["Correção autorizada", "Entrada ou saída com justificativa. Só proprietário e gerente.", "Ajustar estoque"],
          ["Troca ou zeramento do medidor", "Novo encerrante com justificativa.", "Troca/reset de medidor"],
        ],
      },
      { kind: "note", text: "Margem estimada = venda estimada − custo médio do combustível vendido. É um indicador de gestão, não lucro contábil. Sem custo de compra conhecido, a margem fica indisponível." },
    ],
  },
  {
    id: "relatorios",
    title: "Relatórios",
    summary: "Resultados de 7, 30 ou 90 dias e exportação para Excel.",
    icon: "bar-chart-2",
    roles: DASHBOARD_ROLES,
    blocks: [
      {
        kind: "list",
        items: [
          "Pista: litros, venda e margem do período, venda por dia em gráfico e participação de cada combustível.",
          "Por combustível: litros, venda, margem por litro, preço vigente e custo médio.",
          "Recebimentos de combustível do período.",
          "Caixa: turnos fechados, quantos com diferença, diferença líquida, total conferido por meio e as justificativas.",
          "Exportar em CSV gera planilhas para o Excel (ponto e vírgula e vírgula decimal).",
        ],
      },
    ],
  },
  {
    id: "equipe",
    title: "Equipe e acessos",
    summary: "Convites, funções e senhas.",
    icon: "users",
    roles: ["owner", "manager"],
    blocks: [
      {
        kind: "steps",
        title: "Convidar uma pessoa",
        items: [
          "Em Equipe, informe o e-mail e a função.",
          "Copie o link gerado (vale 72 horas, uso único) e envie por um canal privado, como o WhatsApp.",
          "A pessoa abre o link, informa o nome e cria a senha (mínimo de 12 caracteres).",
        ],
      },
      {
        kind: "table",
        head: ["Função", "Pode fazer"],
        rows: [
          ["Proprietário", "Tudo, inclusive convidar, trocar funções, bloquear contas e gerar links de senha."],
          ["Gerente", "Cadastros, preços, cargas e ajustes da pista; caixa completo; vê a equipe."],
          ["Caixa", "Abre, movimenta e fecha o caixa."],
          ["Frentista", "Leituras de bico e medições dos tanques."],
          ["Consulta financeira", "Vê caixa, pista e relatórios, sem alterar."],
        ],
      },
      { kind: "note", text: "Esqueceu a senha? O proprietário gera um link de redefinição em Equipe (vale 30 minutos). Usar o link encerra as sessões abertas daquela conta." },
    ],
  },
  {
    id: "duvidas",
    title: "Perguntas frequentes",
    summary: "Correções, estimativas e uso em várias abas.",
    icon: "help-circle",
    roles: [],
    blocks: [
      { kind: "list", title: "Lancei um valor errado. Como apago?", items: ["Não se apaga. No caixa, registre o movimento correto e explique no fechamento. Na pista, o gerente faz um ajuste justificado."] },
      { kind: "list", title: "Por que a venda da pista é estimada?", items: ["Ela vem dos litros (diferença de encerrantes) vezes o preço vigente. Não é a soma das vendas do PDV nem documento fiscal."] },
      { kind: "list", title: "Posso usar duas abas ou dois aparelhos?", items: ["Pode. Se outra pessoa alterar o caixa enquanto você revisa, o sistema pede para atualizar e revisar de novo antes de gravar."] },
      {
        kind: "list",
        title: "Como instalar no celular?",
        items: [
          "Android (Chrome): abra posto.trustcorp.com.br, toque no menu ⋮ e escolha Instalar app ou Adicionar à tela inicial.",
          "iPhone (Safari): toque em Compartilhar e escolha Adicionar à Tela de Início.",
          "O ícone do GAS PUMP abre o sistema em tela cheia. Continua precisando de internet.",
        ],
      },
      { kind: "list", title: "Onde treino sem mexer no posto real?", items: ["No ambiente de demonstração, com dados fictícios: gas-pump-demo.up.railway.app. A tela de login de lá tem um botão para entrar com cada perfil."] },
    ],
  },
];

/** Sections a role can see, in reading order. */
export function helpSectionsFor(role: string): HelpSection[] {
  return HELP_SECTIONS.filter((section) => section.roles.length === 0 || section.roles.includes(role));
}

/** Which help section explains the screen at `pathname`. */
export function helpSectionForPath(pathname: string): HelpSectionId | null {
  if (pathname.startsWith("/gestao/caixa")) return "caixa";
  if (pathname.startsWith("/gestao/pista")) return "pista";
  if (pathname.startsWith("/gestao/relatorios")) return "relatorios";
  if (pathname.startsWith("/gestao/equipe")) return "equipe";
  if (pathname.startsWith("/gestao/painel")) return "painel";
  return null;
}
