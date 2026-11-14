# Sobra: proposta do aplicativo

Status: plano aprovado pelo usuário e pelo Blueprint. Projeto Mobile Expo inicializado e implementado. O Blueprint confirmou também mapeamento de colunas na importação e exportação dos limites orçamentários em CSV, incorporados na implementação. Este arquivo conserva o restante da proposta aprovada como registro de decisões.

## Produto

Aplicativo móvel de orçamento pessoal em português do Brasil, com versão de navegador. Permite registrar receitas e despesas por categoria, definir limites mensais por categoria e entender quanto sobra. Valores em reais e apresentação de datas em português.

A experiência tem quatro áreas de navegação inferior: Painel, Lançamentos, Orçamentos e Mais. O mês selecionado orienta os resumos e comparações. Um botão de novo lançamento fica acessível para uso com uma mão.

### Painel

O destaque será o saldo do mês, calculado como receitas menos despesas do período. Exibir também receitas, despesas e limite mensal total. Separar claramente o saldo financeiro do valor ainda disponível nos orçamentos, pois são conceitos diferentes.

Mostrar gastos por categoria em gráfico de rosca com legenda e valores acessíveis em texto. Exibir evolução de receitas e despesas nos seis meses encerrados no mês selecionado. Meses sem lançamentos aparecem com zero, sem divisão por zero nas comparações.

As análises serão calculadas localmente, com regras transparentes. Exemplos de formato: “A categoria Restaurantes está 32% acima do orçamento”, “Você usou 74% do orçamento de Transporte” e “Suas despesas caíram 12% em relação ao mês anterior”. Os números apresentados sempre virão dos lançamentos e limites reais. Não inventar percentuais quando não houver orçamento ou base anterior. Para limite zero ou ausente, apresentar “Sem orçamento definido”.

### Lançamentos e categorias

Criar, editar e excluir receitas e despesas. Cada lançamento terá tipo, descrição, valor positivo, categoria e data válida. O sinal financeiro decorre do tipo. Categorias de receita e despesa serão distinguidas. Valores serão armazenados em centavos inteiros.

Listar lançamentos com filtros de mês, tipo e categoria, além de busca por descrição. Confirmar exclusões com interface funcional no navegador e no nativo. Validar campos antes de salvar e informar erros sem perder o formulário.

Fornecer categorias iniciais de despesas, como Moradia, Mercado, Restaurantes, Transporte, Saúde, Lazer, Educação e Outros, e categorias iniciais de receitas, como Salário, Trabalho extra e Outros recebimentos. Permitir cadastrar e renomear categorias. Impedir exclusão de categoria em uso e explicar o motivo, evitando lançamentos órfãos.

### Orçamentos

Definir e editar um limite em reais por categoria de despesa para cada mês. Exibir realizado, limite, valor disponível ou excedente e barra de progresso. Orçamento de um mês não altera o histórico dos demais. Não restringir o registro de uma despesa que exceda o limite, apenas alertar.

O percentual acima do limite será `(gasto - limite) / limite × 100`, apenas quando o limite for positivo. Gastos de categorias sem limite não serão excluídos do total de despesas, nem apresentados como disponíveis dentro do orçamento.

### CSV

Importar e exportar CSV de lançamentos. Modelo de colunas: `data;tipo;descricao;categoria;valor`. Aceitar datas ISO `AAAA-MM-DD` ou brasileiras `DD/MM/AAAA`, tipos `receita` e `despesa`, e valores monetários brasileiros sem ambiguidade. Exportar em UTF-8 com BOM, separador ponto e vírgula e números com vírgula decimal, adequado ao Excel em português.

Oferecer um CSV de exemplo. Usar detecção de delimitador para arquivos separados por vírgula ou ponto e vírgula. Tratar aspas, quebras de linha, BOM e acentuação. Bloquear valores inválidos, datas impossíveis, tipos desconhecidos e campos obrigatórios ausentes. Antes de importar, mostrar prévia, quantidade de registros válidos e erros por linha. Não importar silenciosamente um arquivo parcialmente inválido. Alertar sobre registros potencialmente duplicados e permitir cancelar antes de confirmar o lote. Criar categorias ausentes somente na confirmação da importação e vinculá-las ao tipo correto.

Exportação incluirá todos os lançamentos, para evitar confundir o filtro de tela com uma cópia completa. No navegador, importar por seletor de arquivos e exportar por download. No nativo, usar DocumentPicker, FileSystem e compartilhamento do Expo, respeitando as dependências compatíveis do starter.

A exportação de lançamentos não será descrita como backup completo, pois não inclui os limites de orçamento. A tela explicará essa distinção.

## Privacidade e persistência

Sem login obrigatório, sincronização, integração bancária ou envio dos dados financeiros a serviços externos. Não haverá chamadas de IA para gerar análises.

Na web, persistir em localStorage. No nativo, usar AsyncStorage, com um adaptador comum e armazenamento versionado. Validar o conteúdo carregado, tratar indisponibilidade ou limite de armazenamento e não substituir dados corrompidos silenciosamente. A gravação deverá ser concluída ou apresentar erro antes de informar sucesso.

Avisar em Mais que os dados ficam neste navegador ou dispositivo, não sincronizam entre aparelhos e podem ser perdidos ao limpar o armazenamento ou desinstalar o app. Armazenamento local não equivale a criptografia. Não prometer proteção que não exista.

O template Mobile gerenciado provisiona servidor e banco de dados automaticamente. Eles permanecerão fora do fluxo de persistência financeira. Os serviços necessários ao Preview podem rodar, mas receitas, despesas, categorias e limites não serão enviados ao backend.

O primeiro uso terá estado vazio honesto e convite para registrar o primeiro lançamento. Poderá existir um modo de demonstração explicitamente identificado e separado dos dados pessoais, sem lançamentos fictícios misturados à conta real.

## Implementação

Criar com as ferramentas webdev, applicationKind mobile_app, usando o starter fixo Expo Router, React Native, TypeScript e NativeWind. Manter os identificadores nativos gerados pela plataforma. A interface usa componentes React Native também na web; operações DOM de arquivo ficam isoladas em módulos web.

Reaproveitar bibliotecas compatíveis já presentes antes de instalar novas dependências. Papa Parse será usado para ler e escrever CSV. react-native-svg será a base leve dos gráficos, evitando acrescentar um framework gráfico pesado desnecessário.

O Actual Budget será referência de separação entre domínio, interface e persistência local. Não clonar seu núcleo, servidor, sincronização, IndexedDB ou SQLite. Não copiar código sem observar a licença do arquivo ou pacote de origem.

### Estrutura prevista

A estrutura segue as pastas fixas do starter. Após a inicialização, confirmar os arquivos existentes antes de adaptar:

- `app/`: layouts do Expo Router e telas Painel, Lançamentos, Orçamentos e Mais.
- `components/`: cartões, navegação mensal, formulários, modais, estados vazios, gráficos e indicadores de orçamento.
- `lib/budget/`: tipos de domínio, cálculos em centavos, datas locais sem deslocamento UTC, resumos mensais e geração determinística das análises.
- `lib/storage/`: adaptadores web e nativo, chave versionada, validação de leitura e persistência.
- `lib/csv/`: leitura, normalização, validação, prévia e serialização de CSV, além de adaptadores de arquivo por plataforma.
- `hooks/`: estado compartilhado do orçamento e ações de criação, edição, exclusão e importação.
- `assets/`: fontes e ícones da identidade Sobra.
- `server/` e `drizzle/`: infraestrutura existente do starter, sem tabelas ou endpoints para as finanças pessoais.
- `plan.md` e `TODO.md`: plano aprovado e acompanhamento dos resultados exigidos.

O domínio ficará independente das telas para permitir verificar cálculos e CSV sem interface. Antes de programar, confirmar os diagnósticos TypeScript gerenciados do projeto. Usar as verificações existentes do starter e complementar com testes de funções de domínio e CSV. Uma revisão técnica independente e somente leitura verificará as conexões entre os módulos antes da entrega.

O Preview Mobile requer Metro na porta 8081 e API na porta 3000. O starter especifica os comandos e a preparação do schema da infraestrutura; executar apenas o necessário, sem implementar autenticação para o produto. A versão web permite experimentar o aplicativo no navegador. Teste em Expo Go e geração de APK/AAB ou iOS são superfícies distintas e só serão declarados concluídos se realmente realizados. Builds nativos serão feitos pelo Dashboard, não no sandbox.

As alterações novas serão registradas no repositório gerenciado exigido pelo Mobile. A consulta a repositórios públicos de apoio não autoriza alterar repositórios pessoais do usuário. Caso futuramente seja necessário corrigir código em um repositório GitHub do usuário, seguir seu fluxo de Pull Request e CI verde antes do merge.

## Direção visual proposta

As legendas do Instagram foram acessadas, mas a composição completa dos carrosséis não foi confirmada. A identidade abaixo é uma proposta original, não uma reprodução dos posts.

Alternativas de estilo consideradas: editorial financeiro em creme e verde profundo (probabilidade 0,06); suíço utilitário em branco e azul mineral (probabilidade 0,04); caderno digital em areia e terracota (probabilidade 0,03). Escolha proposta: editorial financeiro.

**Movimento de design:** editorial contemporâneo com influência de impressos financeiros e organização de extrato pessoal.

**Princípios:** números claros em primeiro plano; hierarquia forte sem excesso de cartões; espaçamento confortável em telas pequenas; status sempre comunicado por texto além da cor.

**Filosofia de cor:** fundo creme suave, tinta verde muito escura, verde-floresta para a identidade e pistache para destacar o saldo. Terracota sinaliza atenção e limites excedidos sem transformar o painel inteiro em alerta.

**Layout:** fluxo vertical assimétrico, com cabeçalho compacto, mês selecionável, destaque de saldo e seções editoriais. Navegação inferior e ação principal acessível com o polegar. Em telas largas, limitar a largura de leitura e aproveitar o espaço para aproximar gráficos e resumos sem perder a hierarquia móvel.

**Elementos de assinatura:** símbolo de duas formas sobrepostas sugerindo saldo restante; valores monetários com algarismos tabulares; pequeno traço gráfico associado à evolução financeira.

**Interações:** formulários em modais ou telas focadas, filtros visíveis, retorno imediato após salvar e confirmação para exclusão. Textos claros para ausência de dados e falha de armazenamento.

**Animação:** transições discretas de 160 a 240 ms, pequenas mudanças de opacidade e preenchimento de barras. Não animar contadores monetários de forma a atrasar a leitura. Respeitar redução de movimento quando disponível.

**Tipografia:** Manrope nos títulos e valores principais, com DM Sans nos textos de apoio, ou fontes locais equivalentes se houver restrição técnica. Números principais grandes, títulos de seção compactos e rótulos legíveis, sem excesso de caixa alta.

**Essência da marca:** Sobra ajuda você a entender para onde o dinheiro foi e quanto ainda pode usar. Personalidade: clara, tranquila e criteriosa.

**Voz:** direta e sem julgamento. Exemplos: “Seu mês, com mais clareza.” e “Restaurantes passou do limite. Veja os lançamentos.”

**Logotipo e ícone:** marca própria com duas formas geométricas em verde profundo e pistache, sem cantos arredondados embutidos no arquivo do launcher. Aplicar a identidade também em splash, favicon e variantes Android e registrar o logo HTTPS exigido pela plataforma.

**Cor de assinatura:** verde-floresta `#214D40`. Fundo `#F6F5EF`, texto `#172D28`, acento pistache `#DAE8B0`, atenção `#C86646`.

## Referências consultadas

- Instagram, lucratividade e foco no resultado restante: https://www.instagram.com/p/DeUU8tSlk2t/
- Instagram, denominadores corretos e clareza de percentuais: https://www.instagram.com/p/DehuWDjFsJ_/
- Papa Parse, parsing e serialização CSV, licença MIT: https://github.com/mholt/PapaParse
- react-native-svg, gráficos multiplataforma e integração Expo, licença MIT: https://github.com/software-mansion/react-native-svg
- Actual Budget, referência arquitetural local-first: https://github.com/actualbudget/actual

Não faziam parte da versão inicial: integração com Instagram, CRM, precificação comercial, gestão de postos, conciliação bancária, contas compartilhadas e sincronização na nuvem. A correção de escopo para um posto e a etapa específica abaixo foram aprovadas posteriormente; preservar a versão inicial e evoluir uma etapa de cada vez.

## Etapa aprovada em 28/10/2026: calendário do posto em Bauru, SP

O usuário autorizou a evolução para fechamento por turno, a ser construída passo a passo. A entrega atual abrange somente calendário e turnos previstos. Definiu o horário do estabelecimento: segunda a sábado, 06h–14h e 14h–22h; domingos e feriados oficiais, 07h–13h e 13h–19h. Feriado prevalece sobre o dia da semana. Pontos facultativos seguem o horário normal do respectivo dia da semana. Cidade confirmada: Bauru, SP. Calendário automático por ano, calculado no aplicativo, sem cadastro anual manual e sem consulta de dados financeiros a serviços externos.

Nesta entrega, implementar somente a identificação do horário e do turno e a consulta ao calendário, acessíveis em Mais. Não implementar nem simular abertura, movimentações, conferência, fechamento, assinatura, reabertura ou conciliação de caixa antes da confirmação da próxima etapa. Não remover nem migrar os lançamentos atuais de orçamento pessoal e não declarar o app pronto para operação de caixa.

Criar `lib/station-calendar.ts` com regras puras de datas civis, feriados fixos e móveis, escala diária e turno previsto para um instante, usando o fuso America/Sao_Paulo. As faixas são início inclusivo e término exclusivo: às 14h em dia normal é o segundo turno; às 13h em domingo/feriado é o segundo turno; às 22h/19h não há turno previsto. A indicação representa o horário previsto, não um caixa efetivamente aberto. Rejeitar datas e horários inválidos. Limitar anos de consulta a 2026–2100 e avisar que projeções futuras seguem as regras verificadas em 2026, sem atualização legislativa automática.

Criar `components/sobra/station-calendar.tsx` com resumo dos dois horários, indicação de hoje e de turno previsto ou fora do horário, consulta mensal selecionável, toque em uma data para consultar seus turnos e lista anual de feriados. Usar componentes React Native, a identidade visual atual e controles acessíveis em retrato. Atualizar a indicação de hoje com timer de interface e ao voltar do segundo plano, sem tarefa agendada nem serviço externo. Dados financeiros e armazenamento versão 1 permanecem inalterados; o calendário é derivado, não uma nova base financeira.

A fonte oficial consultada é https://www2.bauru.sp.gov.br/feriados.aspx, calendário 2026: nacionais, 9 de julho estadual, aniversário de Bauru em 1º de agosto e Corpus Christi municipal. Calcular Paixão de Cristo e Corpus Christi em relação à Páscoa; a classificação exibida da Paixão de Cristo seguirá a fonte municipal e será explicitamente identificada como classificação dessa fonte. Carnaval, emendas e vésperas não entram como feriados. Exibir origem, data de verificação e ressalva sobre atualização das regras após mudanças legais. Esta escala é de funcionamento do posto, não validação de jornada, CCT ou trabalho em feriados.

Não acrescentar dependência global de feriados: a biblioteca date-holidays consultada não oferece Bauru entre as regiões e seus dados têm licença distinta do código. Implementar as regras específicas a partir da fonte oficial, preservando as fontes em `REFERENCES.md`. Validar domínio, fronteiras de turno e fuso por testes e verificar empacotamento Expo web, sem afirmar validação em aparelho físico.

## Etapa aprovada em 28/10/2026: abertura de turno

Implementar somente abertura, com nome do operador e fundo de troco, acessível em Mais junto ao calendário. Nesta etapa, o módulo opera um caixa principal neste navegador/dispositivo e permite uma abertura ativa por base. Não acrescentar vendas, pagamentos, suprimentos, sangrias, fechamento, cancelamento ou reabertura antes de nova confirmação. Deixar explícito que o módulo ainda está em construção e não está pronto para uma rotina completa de caixa.

Identificar automaticamente data operacional e turno vigente pelo relógio no fuso America/Sao_Paulo e pelas regras aprovadas. Permitir abertura somente dentro da faixa prevista, com início inclusivo e término exclusivo, sem selecionar uma data passada/futura do calendário para abrir caixa. Exigir operador de 2 a 80 caracteres e valor monetário válido não negativo, armazenado em centavos inteiros. Zero é válido quando não existe fundo de troco. Nome é declarado, sem autenticação ou assinatura digital. Fundo de troco é custódia, nunca receita do orçamento pessoal.

O formulário apresenta data e turno, operador e fundo. Antes de gravar, uma segunda tela interna mostra os dados exatos para confirmação; cancelar retorna ao formulário preservando-o. Revalidar o turno vigente na confirmação, e novamente depois da leitura do armazenamento, para impedir que a janela aberta antes de 14h/13h registre abertura no turno errado. Após sucesso, mostrar o registro imutável com operador, fundo, data, turno, horário previsto e timestamp real. Só informar sucesso após gravação concluída. Não encerrar automaticamente quando o horário terminar: o registro permanece aberto, aguardando módulo de fechamento posterior, e impede outra abertura.

Criar `lib/shift-opening.ts` para tipos, validação e criação determinística do registro; `lib/shift-opening-storage.ts` e `.web.ts` como adaptadores de uma chave própria `sobra:station-opening:v1`; `lib/shift-opening-store.ts` para leitura e gravação testáveis, bloqueio de gravação no mesmo contexto e conferência de revisão/conteúdo em disco antes de gravar; `hooks/use-shift-opening.ts` para integrar o estado; `components/sobra/shift-opening.tsx` para estado, formulário e revisão. Não modificar o schema `AppData` versão 1, a chave de orçamento, os gráficos ou CSV pessoal. Dados corrompidos/incompatíveis bloqueiam gravação sem serem apagados. Falha de gravação mantém o estado e o formulário anteriores, com tentativa de releitura disponível.

O bloqueio local e a revisão detectam estados obsoletos, mas não são uma transação distribuída. Manter aviso para usar uma única janela e um único dispositivo por caixa, sem prometer sincronização ou auditoria inviolável. Recarregar abertura ao voltar de segundo plano e não sobrescrever abertura detectada em outro contexto. Demonstração financeira não permite registrar uma abertura real. CSV pessoal não inclui esse registro; avisar sobre proteção/cópia e perda de dados locais, sem acrescentar exportação de caixa não solicitada nesta etapa.

Validar domínio e armazenamento com testes isolados/mocks, fronteiras e mudanças de turno, gravação duplicada, erro de leitura e de gravação e preservação da chave financeira; verificar TypeScript, lint e empacotamento web. Não criar uma abertura real durante testes nem publicar ou gerar APK. Revisão técnica somente leitura antes do salvamento. Após entregar, aguardar confirmação para a etapa seguinte.

## Etapa aprovada em 28/10/2026: movimentações do turno

Implementar recebimentos, sangrias e suprimentos do caixa principal, vinculados à abertura real existente. Manter fechamento, conferência final, cancelamento, estorno, reabertura, importação/exportação de caixa, autenticação e publicação fora desta etapa. Não reescrever a abertura, o orçamento pessoal ou seus CSVs. Usar chave local separada `sobra:station-movements:v1`, leitura da chave de abertura somente para conferir vínculo e status, sem migração destrutiva.

Recebimentos são positivos em centavos e distinguem dinheiro, Pix, cartão de débito e cartão de crédito. Diferenciar venda do turno de recebimento de conta anterior para não transformar quitação antiga em novo faturamento. Registrar descrição, referência e responsável declarado; referência documental é obrigatória para conta anterior e para meios eletrônicos. No cartão, registrar referência composta que identifique terminal e transação quando necessário. Não registrar PAN completo, CVV ou credenciais. A entrada eletrônica é informada manualmente pelo usuário, sem afirmar confirmação bancária ou conciliação automática.

Sangrias e suprimentos são movimentos de custódia em dinheiro, não despesas e receitas. Exigir valor positivo, motivo, responsável declarado e destino da sangria/origem do suprimento. Bloquear sangria superior ao dinheiro esperado na gaveta. O resumo esperado = fundo de abertura + recebimentos em dinheiro + suprimentos - sangrias. Pix/cartões ficam separados do dinheiro físico, com totais brutos registrados por meio de pagamento. Mostrar vendas registradas e recebimentos anteriores separados, sem chamar o resumo de lucro, saldo bancário ou dinheiro contado. Garantir centavos seguros também nos totais, com aritmética inteira e verificação de overflow.

Cada movimentação mantém ID, ID da abertura, tipo, valor, meio, natureza do recebimento quando aplicável, descrição, referência, origem/destino, responsável e timestamp real em ISO. Permitir registro somente enquanto a abertura corresponde à data e turno vigentes em America/Sao_Paulo e depois de seu timestamp de abertura. Revalidar depois das leituras do armazenamento e antes da gravação. Movimentos anteriores ficam imutáveis, sem editar/apagar nesta etapa. Não permitir operações no modo demonstração nem sem abertura disponível.

O formulário deve manter os campos, apresentar revisão do payload antes de registrar e só informar sucesso após gravação. IDs de intenção estáveis na revisão evitam duplicar uma mesma confirmação/repetição; reenvio do mesmo ID/payload é idempotente, payload divergente com ID existente é rejeitado. Detectar referência eletrônica/documental repetida no mesmo meio de pagamento, exigindo identificação de transação distinta e sem descartar registros existentes. Usar bloqueio síncrono no mesmo contexto, revisão/conteúdo em disco, snapshots profundamente congelados e releitura ao retomar; falhas de leitura/corrupção/conflito bloqueiam escrita sem apagar dados, quota mantém estado/formulário. Isso não promete transação entre abas/aparelhos; preservar orientação monojanela e monodispositivo.

Criar `lib/shift-movements.ts` para domínio e totais, `lib/shift-movements-store.ts` para coordenação da leitura de abertura e movimentações e gravação testável, `lib/shift-movements-storage.ts`/`.web.ts` para adaptadores locais, `hooks/use-shift-movements.ts` para estado e retomada, `components/sobra/shift-movements.tsx` e `movement-form.tsx` para resumo, histórico e formulário. Integrar em Mais abaixo da abertura e antes do calendário, atualizando textos da abertura que ainda dizem que movimentações não existem. Usar os componentes e fontes atuais, sem novas dependências.

Validar com mocks sem qualquer registro real: vínculo/orfandade, compatibilidade da abertura v1, dinheiro versus meios eletrônicos, natureza de recebimento, suprimento/sangria, falta de dinheiro, overflow, campos, duplicidade/idempotência, mudança de turno durante leitura, conflitos e quota; verificar TypeScript, lint, empacotamento web e revisão somente leitura. Salvar etapa no repositório gerenciado sem publicar. Aguardar confirmação para fechamento posterior.

## Etapa aprovada em 29/10/2026: fechamento e conferência local do turno

O usuário aprovou a implementação do fechamento e confirmou estes padrões: lançar dinheiro fisicamente contado, inclusive o fundo de troco, e valores de Pix/débito/crédito conferidos nos relatórios; comparar cada total com o esperado; permitir fechar com diferença somente mediante justificativa e deixar a situação explicitamente pendente; exigir a identificação declarada do conferente; tornar o registro imutável nesta etapa; e exigir uma nova declaração do fundo contado ao abrir o próximo turno, sem transferi-lo automaticamente.

Criar domínio puro em `lib/station-register.ts`, loja com validação de snapshots e concorrência em `lib/station-register-store.ts`, adaptadores web/nativo versionados e `hooks/use-station-register.ts`. Integrar os hooks atuais de abertura e movimentos à loja única para manter as telas existentes coerentes. Criar `components/sobra/shift-closing.tsx` para formulário, revisão e histórico de fechamentos em Mais. A navegação e os componentes reutilizam o visual, valores monetários e escalas existentes. Não introduzir dependências, serviços ou banco de dados financeiro.

O registro unificado, versionado na chave local própria `sobra:station-register:v1`, mantém turnos abertos e fechados. Quando essa chave ainda não existir, ler e validar, sem alterar ou apagar, as versões legadas `sobra:station-opening:v1` e `sobra:station-movements:v1`. Só publicar a migração ao concluir com sucesso uma operação na chave nova; após isso, ela é a autoridade. Manter as duas chaves anteriores intactas como cópia legada, e interromper leitura/escrita diante de corrupção, divergência ou conflito. Uma gravação na chave única contém em conjunto o arquivo do turno, movimentos preservados, valores conferidos, cálculo da diferença, justificativa e responsáveis, reduzindo atualizações parciais entre registros relacionados. Tratamento de quota mantém o snapshot anterior; orientação permanece de uma janela/dispositivo por caixa, sem prometer sincronização entre abas/aparelhos.

O resumo esperado usa fundo inicial + recebimentos em dinheiro + suprimentos − sangrias para dinheiro e os recebimentos registrados por método para Pix/débito/crédito. Diferença = valor contado ou conferido − valor esperado, com aritmética exata em centavos seguros. Os quatro campos de conferência começam vazios e admitem zero explícito; não são preenchidos automaticamente com o valor esperado. Valores eletrônicos são informados manualmente a partir dos relatórios do posto, em valor bruto operacional. Não significam verificação bancária, liquidação líquida, conciliação automática ou assinatura digital. A justificativa (3–500 caracteres) é obrigatória quando qualquer método divergir. Sem diferença, o turno fica marcado como fechado, mas não como auditado ou conciliado. Com diferença, fecha com “diferença pendente”, conservando os números originais, sem criar lançamento compensatório.

A revisão confirma caixa, operador da abertura, responsável declarado pelo fechamento, conferente declarado, datas/horas, turno, quatro valores informados, esperados, diferenças e justificativa. ID de intenção e revisão estável permitem retry idempotente do mesmo payload após confirmação perdida; estado desatualizado impede duplicata ou fechamento com outro valor. O timestamp de fechamento é real em ISO e não substitui a data/turno operacional. Permitir fechamento depois do fim programado para regularizar turno que permaneceu aberto; não permitir timestamp anterior à abertura. O relógio e a escala continuam em `America/Sao_Paulo`.

Ao fechar, preservar o snapshot imutável da abertura, de todos os movimentos e da conferência. Bloquear novas movimentações no turno encerrado. A próxima abertura mantém as validações de horário existentes e só ocorre depois do fechamento; deve apresentar o último encerramento para consulta, mas exige informar novamente, sem pré-preenchimento ou transferência automática, o novo fundo efetivamente contado. Os fechamentos anteriores e seus movimentos ficam disponíveis em histórico local somente leitura, incluindo divergências e justificativas.

Integrar o novo store às telas em Mais abaixo da abertura e dos movimentos. Não alterar o orçamento, categorias, CSV pessoal nem dados do backend. Não implementar reabertura, edição, cancelamento, estorno, ajustes contábeis, exportação de caixa, integração bancária/TEF/PDV, conferência de combustível em litros/LMC, autenticação, sincronização, publicação automática, APK ou geração de relatórios fiscais. O Sobra continua ferramenta auxiliar manual, não sistema fiscal, POS ou prova de prestação de contas.

A estrutura nova fica em `lib/` para tipos, regras, validação e loja; `lib/*storage*` para os adaptadores localStorage/AsyncStorage e migração legada; `hooks/` para estado único compartilhado; `components/sobra/` e `app/(tabs)/more.tsx` para fechamento, resumo e histórico; `tests/` para os testes do domínio/store. A base visual aprovada permanece a atual em creme e verde profundo; os dados financeiros continuam exclusivamente no navegador/dispositivo.

## Nova direção aprovada em 12/11/2026: Sobra Gestão para posto, conveniência e troca de óleo

**Status em 13/11/2026:** Fases 1 e 2 implementadas, versão GAS PUMP da Fase 2 publicada. O usuário aprovou iniciar a Fase 3 do caixa centralizado em subetapas. A abertura centralizada por unidade já foi implementada pela sessão concorrente e está sendo sincronizada e revisada neste trabalho; isso ainda não inclui movimentações nem fechamento. O projeto continua no repositório Manus, com login próprio por e-mail/senha e dados locais preservados. Auto-publicação segue desligada e a aprovação atual não autoriza publicar nem atualizar a versão pública. A pesquisa curada de dez repositórios está em `/home/ubuntu/repositorios-github-sobra.md`; não houve cópia de código.

### Produto e escopo

Criar uma aplicação de gestão do posto do usuário em Bauru, SP, acessível em navegador desktop e celular. O projeto atual é Expo Router/React Native com backend Express/tRPC e Drizzle/MySQL. Preservar a aplicação móvel existente, seus identificadores e seus registros locais. O acesso web comercial terá persistência central no banco gerenciado, autenticação individual e autorização verificada no servidor, não somente na interface. Inicialmente modelar uma empresa e a unidade do posto; deixar a estrutura preparada para outras unidades sem transformar o produto em SaaS público ou permitir cadastro de outras empresas.

O banco gerenciado e o servidor já estão habilitados, e o schema agora inclui a fundação multiusuário e as tabelas relacionais de combustíveis da Fase 2. As migrations aplicadas são aditivas; esta implementação não inseriu registros comerciais. O orçamento pessoal e os registros locais de abertura, movimentações e fechamento existentes usam armazenamento no navegador/dispositivo e não serão enviados, convertidos ou apagados automaticamente. Qualquer importação futura será opt-in, revisável e preservará uma cópia local/exportada.

### Acesso e segurança multiusuário

Usar contas próprias da aplicação com e-mail e senha, sem cadastro público aberto. O fluxo inicial é o proprietário provisionado uma única vez por meio do contexto OAuth já autorizado do proprietário do projeto; esse usuário poderá convidar operadores. Convites e redefinições serão links individuais, temporários e de uso único; o proprietário poderá emitir convites, alterar papéis, bloquear contas e gerar links de reset de 30 minutos, copiados e enviados por canal privado. A recuperação da própria conta proprietária também exige autenticação OAuth do proprietário do projeto. O MVP não enviará mensagens de e-mail por conta própria. Não apresentar e-mail como verificado enquanto não houver confirmação por provedor de envio.

Nunca armazenar senha em texto puro ou registrar credenciais em logs. Armazenar somente hash de senha com algoritmo resistente e sal exclusivo, usar comparação segura, limitar tentativas de login, encerrar sessões no bloqueio/reset e manter tokens de sessão aleatórios armazenados somente em forma protegida. Para o navegador, sessão em cookie HttpOnly; em HTTPS do Preview, `SameSite=None; Secure`, sem derivar esses atributos de `NODE_ENV` ou do protocolo HTTP interno. Permitir HTTP local apenas com cookie local apropriado. Aplicar allowlist de origens, proteção CSRF nas mutações e autorização no servidor em toda operação de negócio. Sem segredos no bundle Expo/web.

Vincular cada conta a uma organização e unidade por uma associação com papel. Papéis iniciais propostos, configuráveis pelo proprietário: proprietário, gerente, caixa/conveniência, frentista, técnico de troca de óleo e consulta financeira. Cada procedimento protegido valida sessão ativa, organização, unidade e permissão no backend; toda leitura e gravação de negócio exige escopo de organização. Gravar trilha de auditoria para ações críticas de caixa, vendas, estoque, preços, permissões e cadastros, com autor e horários. Dados de uma organização nunca devem aparecer para outra.

### Módulos de negócio previstos

1. **Caixa e turnos:** migrar a capacidade de abertura, recebimentos, sangrias, suprimentos e fechamento para registros centralizados vinculados ao usuário autenticado. Preservar as regras já aprovadas de horários de Bauru, dinheiro versus recebimentos eletrônicos, diferenças justificadas e histórico imutável. A identidade declarada local passará a ser a identidade autenticada; não afirmar confirmação bancária nem conciliação automática.
2. **Posto e combustível:** cadastros de combustíveis, tanques e bombas; recebimentos de combustível e custos; leituras de encerrantes/medidores, vendas por produto e período, estoque teórico versus medido, diferenças/perdas justificadas, preço por litro e margem por litro. Volumes e contadores usarão representação decimal exata ou unidades escaladas, nunca `float` binário; a precisão e as rotinas físicas dependem dos equipamentos reais. Inicialmente entrada manual e importação autorizada, sem alegar conexão com bombas ou PDV.
3. **Conveniência:** produtos, códigos de barras, fornecedores, compras/recebimento, ledger de entradas e saídas, contagem e ajustes justificados, preço/custo, vendas, devoluções e divisão dos pagamentos. Estoque deve ser rastreável por movimento, sem apagar o histórico. Integração com leitor, impressora, maquininha ou PDV fica fora até confirmar modelos e contratos.
4. **Troca de óleo e serviços:** clientes e veículos, catálogo de serviços e produtos, orçamento/ordem de serviço, técnico responsável, itens/óleo/filtros aplicados, mão de obra, valor, status e histórico do veículo. Baixa de insumos vinculada à ordem e à unidade, com revisão antes da conclusão.
5. **Painel, financeiro e portabilidade:** vendas e margem por área (pista, conveniência e serviços); margem de combustível por litro; custos, despesas, taxas de cartão, caixa esperado versus contado, pagamentos/recebimentos e relatórios por período. Separar receita, margem, caixa e recebível. CSV com prévia, validação e exportação por permissão; não chamar CSV de backup completo. Contas a pagar/receber e integração contábil serão delimitadas em fase própria, não presumidas automaticamente.
6. **Fiscal e integrações:** não emitir NF-e, NFC-e, NFS-e nem declarar conformidade fiscal apenas com o dashboard. Antes de automatizar, confirmar emissor/PDV atual, regime e fluxo com contador, escolher provedor/tecnologia e validar requisitos de SP, certificados, contingência e legislação. A licença do SPED-NFE encontrada na pesquisa é ambígua, portanto não incorporar esse código sem esclarecimento e revisão jurídica. Integração de bombas/PDV também depende de compatibilidade do hardware/fornecedor; OpenFSC é somente uma especificação de protocolo.

### Dados e regras de domínio

Valores financeiros serão armazenados em centavos inteiros dentro dos limites seguros e processados sem arredondamentos implícitos. Na Fase 2, volumes serão armazenados em DECIMAL(18,3), isto é, milésimos de litro, e atravessarão a API como strings decimais; essa resolução de software não presume a precisão física dos medidores, que deverá ser confirmada antes de calibrar ou automatizar equipamentos. Separar venda/competência, custo de mercadoria, taxa, recebível e caixa físico. Cálculos de margem identificarão claramente custo usado e período; divergência entre estoque físico e teórico será registrada como diferença a investigar, não automaticamente como fraude, vazamento ou despesa.

Registros de vendas, movimentos de estoque, caixa e ordens de serviço terão IDs, timestamps, autor autenticado, unidade, origem e estado. Eventos críticos e fechamentos serão imutáveis ou corrigidos por novo evento rastreável, sem apagar silenciosamente o histórico. Operações relacionadas usarão transações no banco e restrições de integridade; testes nunca criarão vendas, turnos ou dados reais no banco compartilhado de desenvolvimento/produção.

### Etapas de implementação

1. **Fundação web segura:** shell responsivo de gestão, login/logout por e-mail e senha, provisionamento do primeiro proprietário, convite/revogação, mudança de papéis, bloqueio de contas, redefinição de senha por link temporário, recuperação do proprietário com OAuth, organização/unidade, escopo multiusuário, sessão, auditoria e primeiras tabelas/migrações aditivas. As telas legadas permanecem separadas e os dados locais ficam intactos.
2. **Operação de pista e combustíveis (prioridade solicitada pelo usuário):** cadastro configurável de combustíveis, tanques e bombas; recebimentos; leituras de encerrantes/medidores; vendas estimadas por produto e período; estoque teórico versus medido; diferenças justificadas; preços e margem operacional estimada por litro. Entrada manual inicialmente, sem presumir integração com bombas/PDV.
3. **Caixa de turno centralizado:** conversão das regras já aprovadas para operações autenticadas e compartilhadas, com histórico, concorrência e diferenças justificadas.
4. **Conveniência:** catálogo, compras, estoque por movimento, vendas e caixa integrados.
5. **Troca de óleo:** clientes, veículos, ordens de serviço, consumo de estoque, preço e histórico.
6. **Gestão financeira, CSV e integrações:** relatórios gerenciais, controles de custo e taxa, importação/exportação e integrações externas somente após confirmar fornecedor, dados e obrigações.

### Fase 2 detalhada, aprovada em 13/11/2026

Implementar a operação de pista como módulo web responsivo dentro de `app/gestao/`, com router/serviços protegidos em `server/modules/`, cálculos puros em `lib/business/`, componentes em `components/sobra/gestao/` e tabelas/migrações aditivas em Drizzle. Reutilizar o shell, sessão e escopo de unidade da Fase 1; manter Expo Router, React Native, tRPC, as portas 8081/3000 e a aplicação local legada. Não adicionar dependência de hardware ou serviço externo nesta fase.

O módulo terá cadastros configuráveis e inicialmente vazios de produtos de combustível, tanques, bombas e bicos, associados à unidade. Cadastros usados por históricos serão desativados, não apagados. O proprietário/gerente poderá manter esses cadastros, definir preços com data de vigência e registrar recebimentos com fornecedor, combustível, tanque, data/hora, volume, custo unitário e total, além de referência documental opcional. O sistema não emitirá documento fiscal.

Cada bico terá leituras autenticadas de encerrante inicial e final, intervalo de medição e preço vigente; volume será calculado pela diferença de leituras e vinculado ao combustível/bomba. Leituras de período duplicado, intervalo sobreposto ou contador final inferior ao inicial serão recusadas, salvo evento explícito e auditado de troca/reset autorizado. Mudança de preço no meio de um intervalo exige leitura de fronteira ou divisão manual revisável; o sistema não inventará receita exata para períodos que cruzem preços diferentes. Funcionários autorizados poderão registrar medição física de tanque com horário e unidade de medida.

Manter ledger de estoque por recebimento, venda estimada a partir do encerrante e ajuste autorizado. Calcular estoque teórico por tanque e compará-lo com a medição física; exibir a diferença com sinal, data, autor e justificativa. Cada movimento de entrada/saída do tanque deve ser posterior à medição física mais recente; cada nova medição deve ser posterior ao último movimento e à medição anterior, sem aceitar horário futuro. Recebimentos, encerrantes, resets e ajustes também não aceitam timestamp futuro; somente o preço pode ter vigência futura programada. Divergência não será classificada automaticamente como perda, vazamento, fraude ou despesa. Correção não apagará movimentos: criará evento compensatório auditado. Não criar movimentos ou amostras fictícias, nem escrever dados de negócio no banco compartilhado em testes.

Para litros e leituras usar DECIMAL(18,3) no MySQL e strings decimais na fronteira de API, com aritmética exata em milésimos de litro, sem `float` binário. A interface aceita até três casas decimais, sem afirmar que o medidor físico oferece essa resolução. Valores monetários de total usarão centavos inteiros com arredondamento explícito. A margem será apresentada como indicador gerencial estimado, não lucro contábil. O usuário aprovou custo médio móvel ponderado por combustível em 13/11/2026: cada entrada recalcula o custo médio do saldo conhecido, cada saída grava o custo atribuído naquele momento, e o filtro de período não reinicia o saldo histórico. Mostrar o método e preservar o custo usado em cada leitura; quando não houver base conhecida, a margem fica indisponível em vez de inventar custo. Os timestamps MySQL têm precisão de segundo: movimentos do mesmo produto com timestamp igual são permitidos e reproduzidos pelo ID numérico do ledger, atribuído sob lock do estado de custo. Movimentos retroativos são recusados, e novas vigências de preço devem ser posteriores ao último movimento para não alterar uma fronteira já registrada. As fotografias atuais de saldo, última medição e pendências não são reiniciadas pelo filtro de período; combustível, tanque e bomba devem restringir tanto os tanques exibidos quanto a contagem de pendências. Ao selecionar bomba, os históricos de recebimentos e ajustes também são limitados aos tanques que estiveram relacionados aos seus bicos.

Permissões propostas: proprietário/gerente mantêm cadastro, preço e custo, validam recebimentos e autorizam ajustes; frentista registra leituras de bicos e medições físicas, sem editar cadastros nem custos; consulta financeira acessa relatórios somente leitura. Cada chamada valida no servidor sessão, papel e organização/unidade, e registra autor/data/hora nas alterações operacionais. O escopo e os papéis existentes não serão ampliados silenciosamente.

A página de pista mostrará resumos por produto/período de litros e vendas calculadas, preço vigente e margem estimada, posição atual de cada tanque (teórica e medida), divergências pendentes e recebimentos recentes. Incluir filtros por período, produto, tanque e bomba; o período filtra vendas e movimentos históricos, mas não reinicia a fotografia atual. Os filtros de produto/tanque/bomba também recortam tanques e pendências, e recebimentos/ajustes históricos limitam-se aos tanques associados aos bicos da bomba selecionada. A gravação de cadastros, preço, recebimento, encerrante/reset, medição e ajuste exige uma etapa de conferência com associações, valores e timestamp; somente a ação explícita “Confirmar e registrar” chama a mutação, com opção de voltar e corrigir ou cancelar sem persistir. Na medição física, a conferência envia o saldo teórico exibido como precondição; o servidor o compara ao saldo sob lock e, se estiver desatualizado, recusa a gravação, recarrega a posição e exige revisão/confirmação novas. Manter estados vazios honestos sem dados fictícios e comportamento responsivo para desktop e celular. O caixa centralizado, pagamentos, conciliação bancária, vendas unitárias do PDV, emissão fiscal, importação CSV, leitura automática de bombas/controladores e integração com hardware ficam fora da Fase 2; serão avaliados nas etapas posteriores e após identificar equipamentos/fornecedores.

Cada etapa será entregue e explicada em sequência, com Preview e solicitação de confirmação antes de avançar para a etapa seguinte. Publicação pública não está autorizada neste plano: `auto_publish` está desativado e o sistema só será considerado publicado após uma ação e confirmação explícitas. O build web de produção também precisa ser preparado: hoje há Preview Expo e API, mas não há Dockerfile/configuração de publicação nem Express servindo o bundle web. A estratégia de servir frontend e API será validada antes de solicitar publicação.

### Estrutura do projeto

Manter a estrutura fixa do starter Mobile e separar claramente o produto comercial das telas locais existentes:

- `app/(tabs)/`: telas legadas de orçamento/calendário/caixa local, mantidas durante a transição e sem envio silencioso ao servidor.
- `app/gestao/`: login, dashboard e rotas web do caixa, posto, conveniência, troca de óleo, relatórios e administração de usuários; layout responsivo próprio, com side navigation em desktop e navegação compacta em celular.
- `components/sobra/gestao/`: shell, tabelas/cartões, formulários, resumos, estados de autorização e componentes responsivos específicos do posto.
- `hooks/`: sessão comercial, consultas/mutações com cache e invalidação, estado dos filtros e operações das telas.
- `lib/business/`: tipos, validações e cálculos puros de centavos, volumes, margens, pagamentos e movimentos, sem dependência visual.
- `server/auth/`: contas de senha, convites, sessões e permissões, separado do OAuth do starter.
- `server/modules/`: routers e serviços por domínio, incluindo caixa, combustível/estoque, conveniência, ordens de serviço e relatórios; cada consulta impõe tenant/unidade e papel no servidor.
- `drizzle/schema.ts` e `drizzle/`: tabelas e migrações aditivas para credenciais/sessões comerciais, organização, unidade, associação/papel, auditoria e entidades de negócio; manter os usuários OAuth legados e seus dados intactos.
- `tests/`: unitários puros, adaptadores simulados e testes de autorização/escopo sem gravações no banco compartilhado.

O processo e as portas Expo 8081 e API 3000 permanecem fixos. Diagnósticos TypeScript já estão registrados. Usar a base visual Sobra existente, sem gerar imagens decorativas para um painel operacional.

### Direção visual da área Gestão

**Movimento de design:** editorial operacional contemporâneo, com referências a painéis industriais limpos e livros-caixa, adaptado à marca Sobra.

**Princípios:** leitura rápida dos números; diferenças e pendências sempre explícitas; ações críticas com revisão e autoria; densidade desktop sem sacrificar uso no celular.

**Filosofia de cor:** manter creme e verde-profundo já aprovados para continuidade da marca; acrescentar âmbar para avisos operacionais e terracota apenas para erro/diferença, sem depender de cor isolada para comunicar estado.

**Paradigma de layout:** navegação lateral persistente em desktop; área principal contextual por posto/turno; tabelas e comparativos lado a lado em telas largas; em celular, filtros recolhíveis e cartões/linhas por registro, sem tabelas ilegíveis ou rolagem horizontal desnecessária.

**Elementos de assinatura:** marca Sobra com um traço de medidor/encerrante; selo textual de turno/unidade; indicadores de status com ícone, texto e cor.

**Interações:** busca e filtros junto aos dados; confirmação clara em preço, estoque, fechamento e permissões; salvar primeiro e atualizar o estado confirmado somente após resposta do servidor; erros recuperáveis sem perder o formulário; estados de carregamento e acesso negado explícitos.

**Animação:** transições discretas de 140–220 ms, sem contadores animados que atrasem números financeiros; respeitar redução de movimento; destacar mudança de status somente após persistência confirmada.

**Tipografia:** manter Manrope para títulos/valores e DM Sans para rótulos e leitura operacional, já instaladas no projeto; numerais tabulares para moeda, litros e contadores; usar escala de texto legível em caixas e relatórios.

**Essência da marca:** gestão clara e responsável para o dono e a equipe do posto. Personalidade: prática, confiável e precisa.

**Voz:** direta, operacional e sem exagero. Exemplos: “A margem por litro caiu neste período.” e “Diferença registrada. Falta a justificativa do responsável.”

**Wordmark:** manter o logotipo Sobra existente e aplicar a assinatura “GESTÃO DE POSTO” em layout, sem alterar o identificador nativo nem criar uma nova marca concorrente.

**Cor de assinatura:** verde-floresta `#214D40`, com creme `#F6F5EF`, pistache `#DAE8B0`, âmbar `#D59A34` e terracota `#C86646` para estados excepcionais.


## Publicação web autorizada em 13/11/2026 às 11h06

O usuário autorizou a publicação da versão atual. O checkpoint de Fase 2 `9e7c29d2700dfcb7622b360dc2d4ffab81f69d22` foi confirmado pela resposta persistida da solicitação de publicação; o commit também está na branch main do repositório GitHub indicado pelo usuário. A primeira tentativa falhou antes do build por ausência de contrato deploy. Esta autorização substitui somente a restrição anterior de não publicar, sem autorizar ativar auto-publicação ou implementar a Fase 3.

Preparar um container Node 22 com pnpm 9.12.0, lockfile e política de instalação existentes, exportar Expo Web em `web-build/` e compilar o servidor em `dist/`. Express servirá as páginas estáticas exportadas e a API no mesmo domínio HTTPS, mantendo Metro 8081 e API 3000 no Preview. O container usará PORT ou 3000 e health `/api/health`; não executará migrations, seeds nem gravações comerciais ao iniciar. Rotas desconhecidas de API/arquivos devem retornar 404, sem fallback HTML que disfarce falhas. Os arquivos HTML devem receber apenas configuração pública de OAuth obtida do ambiente runtime, nunca credenciais; o cliente publicado acessará a API por URL relativa, sem hostname temporário do Sandbox. As mutações continuam protegidas por sessão, escopo, CSRF e regras de origem. O login por e-mail/senha será preservado; OAuth permanece apenas para bootstrap/recuperação já aprovados.

O reparo será salvo como novo checkpoint, copiado ao GitHub e publicado uma vez após a validação dos caminhos afetados. A confirmação de sucesso será obtida do resultado de publicação, não de Preview ou de push. Caixa centralizado, conveniência e troca de óleo seguem fora deste reparo.


## Marca GAS PUMP solicitada em 13/11/2026 durante a publicação

O usuário solicitou trocar o nome visível de Sobra para `GAS PUMP` e forneceu o logotipo horizontal. Aplicar o logo recebido ao login e aos cabeçalhos da gestão/app, atualizar nome exibido, metadados web e ícones mantendo todo o conteúdo da imagem proporcional. Não recriar a marca por IA nem recortar letras. A imagem original enviada permanece intacta; cópias e tamanhos de exibição serão usados nos assets.

Preservar `appSlug`, bundle IDs, esquema de deep link, namespaces `sobra:*`, cabeçalhos de CSRF, sessionStorage e pastas internas existentes, pois a troca é de marca, não migração destrutiva de identidade técnica. Atualizar textos visíveis, nomes dos arquivos CSV exportados e logo HTTPS de projeto. A publicação solicitada deve usar o novo checkpoint GAS PUMP, sem mudança de domínio customizado ou de repositório canônico.


### Entrega confirmada GAS PUMP, 13/11/2026 às 11h39

Versão publicada `3369202514b205f3f53a8d81e23d140029e3ec9d`, deploy 70210794, URL `https://sobraapp-9bikkgdf.manus.space`, login em `/gestao/login`. Confirmação do job Manus seguida de conferência externa somente leitura: título único GAS PUMP, login/JavaScript 200 e saúde OK, configuração pública OAuth e API no mesmo domínio. O ajuste final utiliza Head do Expo para impedir que um título vazio anterior fosse substituído pelo nome histórico do projeto no gateway. O hostname original permanece válido; não foi solicitado domínio customizado novo.

A implementação final está no GitHub Posto e no remoto Manus, com 172 testes passando, 1 teste legado ignorado, TypeScript/lint/build aprovados. A troca de marca não renomeou identificadores, chaves locais ou contratos de segurança. A Fase 2 cobre combustíveis/pista, equipe e autenticação da Fase 1; conveniência, troca de óleo e caixa centralizado permanecem nas fases futuras. Não afirmar sistema empresarial completo além dos módulos entregues. Auto-publicação continua desligada. O registro final de documentação é separado da versão publicada e não requer novo deploy.

## Fase 3 iniciada em 13/11/2026: caixa multiusuário, primeira subentrega

O usuário escolheu seguir a ordem do cronograma: implementar caixa multiusuário antes de conveniência e troca de óleo. A fase será entregue em subetapas, aguardando confirmação entre elas. A primeira subentrega cobre somente abertura autenticada e estado central compartilhado do caixa principal por organização/unidade. Movimentações e fechamento continuam pendentes até o aceite desta abertura; a primeira entrega não é uma rotina completa de caixa.

Reutilizar Expo/React Native, Express/tRPC, Drizzle/MySQL, shell de gestão e marca GAS PUMP. Criar a rota `/gestao/caixa`, domínio puro em `lib/business/cash-domain.ts`, router e serviço em `server/modules/`, componente em `components/sobra/gestao/` e migração aditiva para caixas e turnos. Não alterar o domínio, os adaptadores ou as chaves de caixa local; não enviar registros antigos ao servidor. O cronograma recuperado do histórico volta ao projeto como referência, preservando as decisões ainda pendentes.

Proprietário, gerente e caixa/conveniência podem abrir o caixa da própria unidade; consulta financeira consulta o estado somente leitura. Frentista e técnico de troca de óleo não recebem acesso ao caixa nesta subentrega. Toda chamada exige sessão comercial ativa, associação/organização/unidade e CSRF/origem existentes. O operador é o usuário autenticado, não um nome enviado pelo formulário. A abertura conserva ID e nome do autor, data operacional, escala e timestamp do servidor.

Mostrar caixa principal, unidade, operador autenticado, turno vigente e horário do servidor em America/Sao_Paulo. Segunda a sábado: 06h–14h e 14h–22h; domingos/feriados oficiais: 07h–13h e 13h–19h, usando o calendário aprovado. Abertura somente dentro da faixa vigente (início inclusivo/fim exclusivo), fundo contado em centavos inteiros seguros não negativos, zero explícito permitido. O fundo começa em branco, não é receita e não é transferido automaticamente.

Uma conferência separada mostra unidade, caixa, operador, data, turno e fundo antes de “Confirmar e abrir caixa”. Voltar/cancelar preserva o formulário e não grava. A revisão envia ID de intenção estável, revisão esperada, data e turno esperados; o backend revalida horário e sessão após adquirir os locks. Um lock por unidade serializa a primeira criação do caixa e as aberturas concorrentes. Constraints de escopo e de slot ativo impedem mais de um turno aberto no caixa principal. Abertura, incremento da revisão e auditoria usam uma única transação. Mesmo ID/payload/autor retorna a abertura existente sem duplicar; payload divergente com ID reutilizado é rejeitado. Conflito obriga atualizar e revisar, sem exibir sucesso antecipado. Consultas não criam caixa/turno nem inserem dados de exemplo.

Estado compartilhado com recarga e atualização periódica enquanto a tela está ativa; deixar claro que exige internet e não opera offline. Se o horário terminar, o turno permanece aberto e bloqueia outro, mostrando que fechamento será a próxima subetapa. Não testar com registros comerciais reais. Testes puros/mocks verificam dinheiro, calendário, papéis, sessão/CSRF, escopo, concorrência, idempotência e rollback; TypeScript, lint e build existentes permanecem obrigatórios. A migração só cria estruturas aditivas, sem seeds. Entrega em Preview/checkpoint Manus, conforme o fluxo aprovado no plano deste projeto, sem publicação nem ativar auto_publicação. Não criar novas integrações, hardware, fiscal, banco, CSV comercial, vendas, reservas ou ordens de serviço nesta subentrega.

**Resultado da primeira subentrega, 13/11/2026:** abertura central autenticada e estado compartilhado implementados em `/gestao/caixa`; 205 testes aprovados (1 legado ignorado), TypeScript/lint/build de produção e validação Drizzle concluídos. Migração aditiva 0005 aplicada e verificada por metadados após corrigir default de timestamp(3), sem criar negócios de teste. Preview caixa/login/pista/Mais e saúde responderam 200; consulta de caixa sem sessão respondeu 401. Revisão independente e correção de cache privado entre contas concluídas. A abertura ainda não oferece movimentos nem fechamento e não foi testada com uma conta real. Entrega sem publicação, aguardando aceite antes da próxima subetapa.

## Fase 3, segunda subentrega autorizada em 13/11/2026 às 15h40: movimentações multiusuário

O usuário aprovou a abertura e autorizou “Aprovar a abertura e implementar movimentações”. Implementar somente recebimentos, suprimentos, sangrias, resumo e histórico central do turno. Fechamento/conferência, estorno, edição/exclusão, importação/exportação, PDV/TEF/banco, fiscal, estoque geral, conveniência e ordens de serviço continuam fora desta subentrega. Reutilizar a página `/gestao/caixa`, a identidade GAS PUMP, componentes React Native, o backend autenticado, as portas 8081/3000 e o repositório canônico Manus. Não mudar chaves/dados locais nem importar o caixa legado.

Estrutura: novo domínio puro `lib/business/cash-movement-domain.ts`, serviço transacional separado `server/modules/cash-movement-service.ts`, extensão do router `cash.ts`, duas tabelas aditivas para movimentos/auditoria e componentes de resumo/formulário/revisão/histórico em `components/sobra/gestao/cash-movements*`. Compartilhar as rotinas de lock/revalidação de identidade da abertura sem duplicar políticas. Não adicionar dependências. Estado do turno, revisão global e resumo completo são uma fotografia consistente de leitura, sem criar registros; histórico tem paginação por ID (50 registros por página, máximo 100), ordem decrescente de ID, e total explícito. O resumo considera todo o histórico, não somente a página visível.

Proprietário, gerente e caixa/conveniência registram na própria unidade, mesmo que outro usuário tenha aberto o caixa. Consulta financeira lê somente; frentista/técnico não acessam. Identidade do responsável é ID/nome da sessão, não campo declarado; guardar autoria distinta do operador que abriu. Revalidar usuário, associação, papel e sessão sob locks; usar CSRF/origem existentes. Recebimentos positivos em centavos por dinheiro/Pix/débito/crédito; natureza obrigatória venda do turno ou conta anterior. Descrição/motivo 3–200 caracteres; referência até 120, obrigatória para recebimento eletrônico ou conta anterior; origem/destino 3–120 obrigatórios nos movimentos de custódia e opcional nos recebimentos. Não solicitar PAN, CVV, senha ou credenciais; referências são documentos/NSU/identificação de terminal/transação, sem confirmação bancária automática.

Suprimento e sangria somente em dinheiro físico, natureza nula, valor positivo, motivo e origem/destino. Dinheiro esperado = fundo inicial + recebimentos em dinheiro + suprimentos − sangrias; recusar sangria superior ao disponível. Fundo/suprimentos/sangrias são custódia, não receitas/despesas. Totais brutos por método, vendas registradas e recebimentos anteriores separados; todos os totais e prospectivos seguros em centavos com BigInt e conversão verificada. Não chamar o resumo de lucro, saldo bancário, caixa contado ou faturamento fiscal. SQL SUM/COUNT deve ser lido exatamente, sem conversão prematura para float.

A revisão confirma unidade/caixa/abertura, operador de abertura, responsável autenticado atual, data/turno, tipo, método/natureza, valor, descrição, referência, origem/destino e efeito prospectivo no dinheiro esperado. Campos começam em branco; cancelar/voltar preservam sem writes. UUID estável e revisão global/data/turno/abertura esperados ficam congelados na revisão. Somente “Confirmar e registrar movimentação” chama a mutação. Polling não atualiza silenciosamente a revisão; conflito exige recarregar e revisar; falha de transporte mantém a mesma intenção/payload para recuperação manual idempotente. Nunca sucesso antes da resposta confirmada. Bloquear ação sem CSRF, sessão, turno atual ou posição/resumo válidos.

Uma transação bloqueia unidade, identidade, caixa e abertura; encontra replay antes das precondições atuais; depois revalida horário do servidor em Bauru e sessão após todas as leituras/locks. Exigir abertura ativa do caixa da unidade, data/turno atuais e timestamp não anterior à abertura nem ao último movimento. Recalcular o resumo completo sob lock antes da sangria e verificar overflow antes de gravar. Incrementar revisão global, inserir movimento e auditoria atomicamente. Unique de intenção por organização/unidade; digest inclui autor e payload normalizado. Retry do mesmo ID/autor/payload retorna o movimento/revisão originais sem duplicar, inclusive após mudança de horário/revisão. Reuso divergente é conflito. Referência de recebimento não vazia tem chave única por organização/unidade/abertura/método após trim/normalização de caixa; reuso com nova intenção é rejeitado, sem apagar o anterior. FKs compostas preservam tenant/unidade/abertura/autor.

Enquanto a tela está ativa, consultar posição/resumo e histórico com recarga periódica e por foco; dados privados não são persistidos no aparelho e seguem a limpeza de cache no login/logout. Exibir indisponibilidade honestamente, nunca vazio fictício em erro. Turno vencido permanece aberto, mas não aceita novos movimentos; resumo/histórico continuam consultáveis. Aviso antes de abrir: esta versão já oferece movimentos, mas ainda não oferece fechamento centralizado e não deve iniciar a rotina diária completa. Não fechar automaticamente nem oferecer botão fictício de fechamento.

Testes usam domínio/mocks/adapter em memória, sem abrir caixas ou inserir movimentos reais no banco compartilhado. Cobrir precisão, zero rejeitado em movimento, campos condicionais, papéis/CSRF, tenant, referência duplicada, replay divergente, fronteiras de turno após leituras, relógio regressivo, revisão concorrente, duas sangrias concorrentes sem saldo negativo e rollback de auditoria. Aplicar somente migração aditiva revisada, sem seeds e sem alterar timestamps antigos. TypeScript/lint/build e revisão independente somente leitura antes do salvamento. Sem publicação/auto_publicação ou testes físicos/APK. Entregar e aguardar confirmação antes de qualquer fechamento.

**Resultado da segunda subentrega, 13/11/2026:** recebimentos por método/natureza, suprimentos, sangrias, resumo integral, revisão explícita e histórico paginado implementados em `/gestao/caixa`. Migração 0006 aditiva aplicada, preservando exatamente tabelas antigas, sem dados comerciais de teste. 238 testes aprovados (1 legado ignorado), TypeScript/lint/build de produção e Drizzle check concluídos; Preview e saúde 200, APIs novas sem sessão 401. A revisão independente gerou um reparo de conferência entre contas: a intenção congela `expectedActorId` e o servidor compara com a sessão real sob lock; o campo é precondição, não autoria declarada. Tela bloqueia troca de responsável e mantém recuperação de intenção incerta pela conta original. Sem publicação ou teste físico; fechamento e identidade do conferente continuam pendentes de novo aceite.

## Fase 3, regras do fechamento central definidas em 13/11/2026 às 16h09

Decisão do usuário: proprietário, gerente ou caixa pode fechar e confirmar sozinho, sem uma segunda pessoa. Fechador/conferente é sempre a identidade autenticada da sessão ativa, com ID/nome e unidade determinados pelo servidor; o formulário não aceita nome declarado. Consulta financeira continua somente leitura. Esta resposta define as regras e **não autoriza por si só iniciar a implementação**, que aguardará confirmação separada.

Reaproveitar as regras aprovadas do fechamento local, convertendo identidade declarada em identidade autenticada: os quatro campos iniciam em branco e guardam dinheiro contado fisicamente (incluindo o fundo), Pix, débito e crédito brutos de relatório. Todos são inteiros não negativos em centavos seguros, com zero explícito válido, sem pré-preencher valores esperados. Dinheiro esperado = fundo + recebimentos em dinheiro + suprimentos − sangrias; demais esperados = recebimentos registrados por meio. Diferença = valor conferido menos esperado. Diferença não zera por ajuste artificial: exigir justificativa declarada de 3–500 caracteres e marcar `diferença pendente`; sem diferença, `fechado`, jamais `auditado`/`conciliado`. Não afirmar verificação bancária, saldo bancário, liquidação líquida nem conciliação automática.

O fechamento pode ocorrer depois do horário programado para regularizar um turno, mas o timestamp real do servidor deve ser posterior/igual à abertura e ao último movimento; conservar data operacional/turno original. Fechamento congela snapshot imutável de abertura, movimentos, quatro valores, esperados, diferenças, justificativa, identidade e timestamp de sessão. Bloquear movimentos posteriores. Próxima abertura somente no horário vigente, com novo fundo digitado e contado, sem transferência automática; impedir turnos simultâneos e nunca fechar automaticamente.

Fechamento/revisão, revisão global, snapshot e auditoria deverão ser atômicos, tenant-scoped e concorrentes com as mutações de movimentos; usar ID de intenção e retry idempotente, rejeitar revisão obsoleta/reuso de payload divergente e não exibir sucesso até confirmação transacional. Sem erro/escrita parcial. Testes isolados/mocks não gravam transações reais. Migrações só aditivas, sem seeds. Ficam fora emissão fiscal/POS/TEF/banco, exportação comercial, ajustes compensatórios, estoque, conveniência e OS. A etapa permanece pendente até autorização explícita de implementação.

### Revisão da sincronização da abertura, 13/11/2026

A revisão desta sincronização confirmou o fluxo de abertura sem bloqueios e apontou cache privado residual entre abas do mesmo navegador. Corrigir somente essa limitação: login/logout confirmado sinaliza mudança de sessão por canal entre abas e marcador técnico sem identidade, token ou dados financeiros. A outra aba recarrega a aplicação para descartar caches e estado transitório antes de continuar com a sessão atual; o foco também verifica marcador perdido durante suspensão. Essa proteção não muda autenticação nem importa dados locais. Uma troca de conta em outra aba pode descartar rascunhos ainda não enviados, consequência explícita de invalidar o contexto anterior. Navegadores com comunicação e armazenamento bloqueados permanecem limitados ao refetch e à autorização do servidor. Não adicionar movimentos, fechamento ou publicação nesta revisão.

**Resultado da sincronização/revisão:** abertura integrada e revisada, sem bloqueios encontrados no fluxo. O achado de cache entre abas foi corrigido e coberto por dez testes puros. Antes do envio, o remoto avançou com movimentações aprovadas e regras definidas de fechamento; esses commits foram preservados, não reimplementados por esta revisão. O fechamento permanece sem código e depende de autorização separada, conforme a decisão registrada acima. A versão integrada passou com 248 testes e um legado ignorado, TypeScript, lint, Drizzle check e build de produção. Não foram executados SQL, migrations, login real, abertura comercial ou publicação nesta sincronização; aplicações de migração descritas acima são evidências herdadas. A versão pública permanece a Fase 2 já publicada.

## Fase 3, terceira subentrega autorizada em 13/11/2026 às 18h04: fechamento central

O usuário confirmou “Sim, implementar o fechamento central”. Implementar somente as regras de fechamento já definidas acima, mantendo estoque, conveniência, OS, fiscal/POS/TEF/banco, exportação comercial, ajustes, estornos e publicação fora do escopo. Preservar a atualização concorrente de isolamento cross-tab integrada do remoto antes desta subentrega; a base atual passou em 248 testes e um legado ignorado. O projeto segue Expo/React Native, Express/tRPC, Drizzle/MySQL, identidade GAS PUMP e servidores 8081/3000 existentes. Reutilizar design, componentes e autorizações, sem nova escolha visual ou nova dependência.

Estrutura: domínio puro `lib/business/cash-closing-domain.ts`; serviço transacional `server/modules/cash-closing-service.ts` e, se necessário, adapter separado; extensão do router `cash.ts`; migração aditiva 0007 com tabelas de fechamentos e auditoria, sem tocar nas tabelas anteriores; componentes de formulário, revisão e histórico em `components/sobra/gestao/cash-closing*`, integrados à mesma `/gestao/caixa`. UI de abertura e movimentos recebe uma fotografia consistente ampliada, `cash.closingState`, com posição/resumo e último fechamento. Contratos anteriores continuam disponíveis; invalidações incluem a fotografia ampliada. Histórico de fechamentos paginado por ID, 20 por página e limite 100, ordem decrescente, total explícito e vínculo para consultar o ledger imutável da abertura pelo histórico de movimentos existente.

O fechamento conserva snapshot da abertura, resumo integral, quatro esperados, quatro conferidos, quatro diferenças, justificativa, status, usuário autenticado e timestamp real do servidor. Movimentos não são apagados nem copiados para um array sem limite: ficam vinculados à abertura, com último ID e quantidade congelados no fechamento; consultas históricas respeitam esse vínculo/corte, e nenhum movimento novo é permitido para abertura fechada. Status “diferença pendente” continua encerrado, não deixa a abertura ativa e não cria ajuste compensatório.

Proprietário/gerente/caixa fecha e confirma sozinho na própria unidade, mesmo se outro usuário abriu; consulta financeira apenas consulta; frentista/técnico não fecham. Não aceitar fechador/conferente declarado. Revisão envia `expectedActorId` como precondição, não autoria, além de UUID estável, revisão global, ID/data/turno da abertura revisada, quatro contagens e justificativa. Revalidar usuário, sessão, associação/papel/unidade e CSRF/origem existentes. A confirmação mostra separadamente autor da abertura e fechador/conferente autenticado atual. Troca de conta/nome, de abertura ou revisão obriga revisar novamente; retry incerto conserva a mesma intenção e só a conta original pode recuperar, inclusive depois de nova abertura ou mudança de data/turno. A segurança cross-tab pode descartar rascunhos quando recarrega a outra aba; não persistir contagens comerciais no aparelho para contornar essa proteção.

Campos dinheiro/Pix/débito/crédito iniciam em branco, todos precisam ser digitados, zero explícito válido, valores inteiros não negativos seguros em centavos. Dinheiro inclui fundo, e esperados vêm do resumo completo, nunca da página visível de movimentos. Comparar cada par com BigInt e validar diferença assinada segura. Justificativa em branco quando não há diferença é permitida; havendo diferença exigir 3–500 caracteres sem controles. Apenas “Confirmar e fechar turno” grava. Cancelar/voltar e erros preservam campos; polling não altera payload em revisão e não existe sucesso otimista ou confirmação bancária automática.

Fechar depois do horário do turno é permitido, inclusive em outra data, conservando data/turno original; não exigir janela vigente para fechar. Sob a mesma ordem de locks da abertura/movimentos, resolver replay após revalidar identidade, antes das precondições mutáveis; depois recomputar resumo/último movimento, revalidar sessão e colher timestamp real somente após leituras/locks. Recusar relógio inválido/anterior à abertura ou último movimento, revisão obsoleta, abertura errada/já encerrada ou intenção divergente. Inserção de fechamento/snapshot/auditoria, incremento da revisão e liberação de `activeSlot` acontecem na mesma transação. Constraint única por organização/unidade/abertura impede segundo fechamento. Concorrência fechamento versus movimento ou outro fechamento não pode produzir snapshot parcial. Falha reverte todos os efeitos.

Após confirmação, mostrar comprovante de fechamento e histórico, limpar campos do fundo anterior, cancelar revisão de abertura antiga e não ressuscitar `confirmedOpening` já fechado em fallback. A próxima abertura exige fundo contado redigitado, janela vigente, timestamp não anterior ao último fechamento e apenas uma abertura ativa por caixa. Não transferir saldo nem abrir/fechar automaticamente. Leituras não criam registros e erros não viram totais/histórico vazios fictícios. Conexão obrigatória, recarga por foco e polling apenas na tela ativa, cache privado seguindo limpeza/isolamento existentes.

Testes puros/mocks/adapter em memória, sem contas/abertura/movimento/fechamento reais no banco compartilhado. Cobrir campos explícitos/zero, todos os meios, diferenças negativas/positivas e precisão, justificativa, papéis/CSRF/tenant, relógio/identidade depois de leituras, fechamento fora de janela, replay depois de nova abertura, concorrência fechamento/movimentos, rollback, ledger congelado e nova abertura com novo fundo. Migração somente aditiva revisada, timestamp(3) com CURRENT_TIMESTAMP(3), sem seeds; aplicar após revisão por metadados. TypeScript/lint/build e uma revisão independente somente leitura antes de salvar no remoto Manus. Sem publicação ou APK; entregar esta subetapa e aguardar aceite antes do estoque geral/conveniência/troca de óleo.

### Ajustes de integridade confirmados na integração do fechamento

Metadados confirmaram TiDB 8.5.3, modo pessimista e isolamento padrão REPEATABLE-READ. A [documentação de transações pessimistas](https://docs.pingcap.com/tidb/stable/pessimistic-transaction/) distingue leituras sem lock anteriores ao início da transação e leituras atuais com lock; a [documentação de isolamento](https://docs.pingcap.com/tidbcloud/transaction-isolation-levels/) confirma suporte a READ COMMITTED no modo pessimista. Portanto, configurar READ COMMITTED apenas nas transações escritoras de abertura, movimentos e fechamento, preservando locks de unidade e revalidação de revisão. Assim, resumo e corte são lidos após obter o lock, inclusive quando uma requisição aguardou outra transação. Fotografias e históricos somente leitura continuam no isolamento padrão REPEATABLE-READ; não modificar configuração global ou sessão persistente do banco.

A revisão independente confirmou fallback de abertura antiga na tela do operador quando outra sessão fechava: remover esse fallback e confiar na fotografia do servidor, ocultando somente abertura reconhecidamente encerrada pelo próprio resultado confirmado. Limpar fundo também ao confirmar abertura para impedir pré-preenchimento quando o encerramento ocorrer por outra sessão. O painel de fechamento precisa permanecer montado mesmo quando polling retira ou troca a abertura ativa, preservando a revisão e o UUID de uma resposta incerta. Não transportar contagens para uma abertura diferente; iniciar explicitamente nova contagem em branco depois de resolver ou rejeitar a intenção anterior. Esses são reparos dos critérios já aprovados, não novas fases ou novas políticas de operação.

### Resultado técnico do fechamento central, 13/11/2026

Implementação concluída para revisão do usuário no menu Caixa do Preview: quatro contagens manuais explícitas, revisão fixa, fechamento autenticado individual, diferenças justificadas sem ajuste, snapshot/histórico congelados e próxima abertura manual com novo fundo. Suíte final passou em 292 testes e um legado ignorado, TypeScript/lint/build web e servidor/Drizzle sem erros. Migração 0007 aplicada somente em estruturas novas, com nove FKs e precisão de milissegundos; 26 tabelas anteriores preservadas. Metadados de isolamento conferidos sem DML comercial. Revisão independente teve o achado de fallback de abertura antiga corrigido; recuperação incerta e rascunhos entre aberturas receberam reparo/testes específicos. Não houve conta real, lançamento comercial de teste, migração local, publicação, fiscal/TEF/banco, exportação, estorno, estoque ou APK. Salvar no remoto Manus, declarar checkpoint só com recibo e aguardar aceite do fechamento antes da próxima fase.

**Salvamento da implementação:** commit `a1c377679e85ac089f56b44e471042a9232c36ad` aceito na main do remoto canônico Manus, sem publicação nesta tarefa. A documentação deste resultado segue em commit posterior. Recibo formal de checkpoint não retornou; não confundir aceite remoto com registro confirmado em Version history. Aguardar aceite do fechamento antes do estoque geral/conveniência/OS.

## Estado mais recente, 13/11/2026 às 20h01

O usuário aprovou o fechamento central, concluindo sua entrega incremental. A etapa seguinte é definir as regras do estoque geral; a autorização para desenvolvê-las ainda não foi dada. A primeira decisão a fechar é se toda saída acima de `em mãos - reservado` será bloqueada, ou se proprietário/gerente poderá autorizar exceção mediante justificativa e alerta auditável. Recomendação: bloquear toda saída acima do disponível, sem exceção no início, protegendo itens já reservados e evitando saldo negativo. O aceite do caixa não significa aprovação automática de todas as etapas, conveniência, ordens de serviço ou publicação.


## Definição de estoque, atualização de 13/11/2026 às 21h12

O usuário definiu que proprietário/gerente pode autorizar exceção a uma saída acima de `em mãos - reservado`. Exigir justificativa, aviso explícito antes da confirmação e auditoria; permitir que a operação deixe saldo disponível negativo e afete quantidades prometidas. Caixa e técnico não recebem essa permissão. Essa decisão define a política, mas não autoriza código.

A próxima regra pendente é quando reservar produtos para uma ordem de serviço: na aprovação do orçamento pelo cliente (recomendado, reduz disponível sem reduzir o saldo físico) ou somente quando o técnico iniciar o serviço (mantém estoque disponível para balcão durante a espera).


## Definição de estoque, atualização de 13/11/2026 às 21h15

O usuário definiu que a ordem de serviço reserva os itens no momento em que o cliente aprova o orçamento. A reserva reduz o disponível, sem baixar o saldo físico. Se a quantidade aprovada exceder o que está disponível, a ordem fica aguardando reposição ou substituição aprovada; não há consumo automático nesta etapa. Esta é uma decisão de regra, não uma autorização para implementar.

A próxima decisão pendente é o padrão de unidades: recomendar uma unidade-base por item e conversões explícitas/confirmadas para cada embalagem, usando unidade para peças e mililitros para lubrificantes. Nenhum fator de embalagem ou saldo real deve ser presumido.


## Definição de estoque, atualização de 13/11/2026 às 23h42

O usuário escolheu unidade-base e conversões explícitas. Cada item/SKU terá unidade-base própria; conversões por embalagem serão registradas somente quando confirmadas. Itens discretos serão contados em unidade e lubrificantes em mL. Não inferir fator de embalagem nem cadastrar saldo real sem dados confirmados.

A próxima decisão pendente é o saldo inicial do estoque: realizar contagem física inicial autorizada ou começar com saldo zero e aumentá-lo somente pelos recebimentos. CSV ou dados locais não serão importados automaticamente. Esta definição não autoriza implementação.


## Definição de estoque, atualização de 14/11/2026 às 08h56

O usuário escolheu estabelecer o saldo inicial por contagem física auditada. Cada quantidade deve ser informada na unidade-base confirmada do item, vinculada a responsável autenticado e data/hora, com trilha de auditoria. Não presumir quantidades nem fatores de conversão, e não importar CSV ou dados locais sem autorização explícita, prévia e validação. A decisão define a política, não autoriza registrar saldos reais nem iniciar a implementação.

A próxima decisão pendente é o fluxo de reposição: pedido de compra prévio no sistema, com recebimento separado (recomendado), ou lançamento somente no ato da entrega.


## Definição de estoque, atualização de 14/11/2026 às 08h58

O usuário decidiu registrar a entrada somente quando a mercadoria chegar, sem criar pedido de compra prévio no sistema. A entrada deve refletir apenas a quantidade fisicamente recebida, sem aumentar saldo por itens ainda não entregues. Essa decisão não autoriza implementação.

A próxima decisão pendente é aceitar recebimentos parciais, registrando apenas o que chegou e permitindo complemento posterior, ou exigir uma única conferência completa antes de lançar a entrega.


## Definição de estoque, atualização de 14/11/2026 às 08h59

O usuário decidiu permitir recebimentos parciais. Cada chegada será registrada em lançamento separado, acrescentando somente as quantidades fisicamente recebidas e conferidas naquele momento; itens não entregues não aumentam o saldo e podem ser registrados em outro lançamento quando chegarem. O fluxo segue sem pedido de compra prévio no sistema. Esta decisão não autoriza implementação.

A próxima decisão pendente é quais perfis podem registrar e confirmar uma entrada física de mercadoria.


## Definição de estoque, atualização de 14/11/2026 às 09h02

O usuário autorizou proprietário, gerente ou caixa a registrar e confirmar recebimentos físicos. Cada confirmação permanece atribuída à identidade autenticada, nunca a um nome digitado ou presumido. Esta decisão não autoriza implementação.

A próxima decisão pendente é exigir em cada recebimento a referência da nota, romaneio ou comprovante do fornecedor, ou deixá-la opcional quando disponível.
