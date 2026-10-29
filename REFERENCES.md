## Movimentações do posto, etapa aprovada em 28/10/2026

O módulo registra manualmente recebimentos por meio (dinheiro, Pix, débito e crédito) e natureza (venda do turno ou conta anterior). Sangrias e suprimentos são custódia de dinheiro físico, não receitas ou despesas. O valor esperado na gaveta é uma estimativa, não confirma contagem física, saldo bancário, lucro ou conciliação. Não há conexão com bancos ou maquininhas, nem confirmação automática de Pix/cartão. O formulário não solicita senha, PAN completo ou CVV. Movimentos ficam em chave local independente do orçamento e da abertura. Fechamento, conferência final, estorno, exportação de caixa e reabertura não fazem parte desta etapa.

## Fechamento do caixa principal por turno

O fechamento de caixa é uma conferência manual declarada. O dinheiro é contado fisicamente incluindo o fundo; Pix e cartões são informados a partir de relatórios do período. Diferenças são preservadas por meio, com justificativa, como pendências declaradas. A interface não acessa banco, adquirente, TEF ou PDV e não constitui auditoria, conciliação bancária, assinatura digital ou documento fiscal.

O registro unificado usa a chave local `sobra:station-register:v1`. Na primeira leitura, as versões legadas `sobra:station-opening:v1` e `sobra:station-movements:v1` são somente lidas e validadas, nunca apagadas nem gravadas. A chave unificada é escrita quando uma próxima operação for concluída. O snapshot de cada fechamento preserva a abertura, os movimentos originais, a contagem informada, as diferenças e os nomes declarados. A persistência usa `localStorage` na web ou `AsyncStorage` no app nativo. Ela é local, não sincroniza abas/aparelhos; recomenda-se uma janela/dispositivo por caixa.

Continua valendo o calendário oficial já documentado da Prefeitura de Bauru e a escala aprovada do posto. Pontos facultativos não são tratados como feriados. O timestamp do fechamento é o instante registrado, enquanto a data operacional mantém a da abertura.
