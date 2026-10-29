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
