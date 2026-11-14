# GAS PUMP: proposta de integração e cronograma

**Status:** proposta para revisão, ainda não aprovada como fase de implementação. Elaborada em 13/11/2026 a partir do plano mestre atual. Não altera código, banco, permissões ou dados comerciais.

## 1. Estado atual e princípio de integração

O módulo de estoque implementado hoje é **estoque de combustíveis**: produtos de combustível são vinculados a tanques, bombas e bicos, reconciliados com encerrantes e medições físicas, com custo médio móvel ponderado. Ainda não existe um estoque genérico de mercadorias da conveniência.

A troca de óleo não deve baixar insumos diretamente desse estoque de tanques. A proposta é criar um **ledger geral de itens**, por organização e unidade, compartilhado entre conveniência e serviços. O módulo de combustível permanece separado em suas regras físicas e tabelas; poderão ser reaproveitados conceitos e utilitários de aritmética exata/custo, mas não se deve misturar saldo de tanque, litros de combustível e produtos embalados em uma mesma rotina sem modelagem específica.

Cada item geral terá SKU/código de barras opcional, descrição, categoria, unidade-base, conversão explícita de embalagem para unidade-base, fornecedor, estoque mínimo e preço. Exemplos: filtro controlado em unidades; óleo em frascos de 1 L ou 4 L convertido para mililitros-base; óleo a granel mantido em volume escalado. A precisão e a conversão devem ser validadas com as embalagens reais antes do cadastro inicial.

O saldo será reconstruível por movimentos imutáveis, por exemplo: recebimento de compra, venda, consumo por ordem de serviço, devolução aprovada, perda/descarte justificado e ajuste de contagem. Uma tabela de posição materializada poderá acelerar a tela, mas o ledger permanece a fonte auditável. Custos usam custo médio móvel por item/unidade, com aritmética exata e custo atribuído salvo em cada saída. Custos desconhecidos não serão inventados. Não permitir saldo negativo por padrão; eventual exceção exigirá decisão do proprietário, permissão específica, motivo e alerta auditável.

### Ciclo da ordem de troca de óleo

1. **Rascunho/orçamento:** cliente, veículo, serviço e itens propostos; ainda não reserva nem baixa estoque.
2. **Aprovação do cliente:** confirmar escopo, preço e produtos. Nessa transição, reservar quantidades disponíveis para impedir que a mesma mercadoria seja prometida também à venda de balcão. Serviço sem estoque suficiente fica pendente de reposição ou de substituição aprovada.
3. **Execução:** o técnico confirma o que realmente aplicou, com quantidades e substituições justificadas. Mão de obra e itens ficam discriminados, não confundidos com custo de mercadoria.
4. **Conclusão:** uma única transação valida novamente o saldo reservado, marca a ordem concluída, consome os itens do ledger, materializa a posição, registra custo usado, autor, horário e vínculo à ordem. A operação é idempotente para que clique duplo ou repetição não desconte estoque duas vezes.
5. **Cancelamento ou suspensão:** cancelar libera as reservas sem apagar eventos anteriores; uma ordem suspensa mantém o estado explícito. Retificações após conclusão geram novos movimentos auditáveis, nunca edição silenciosa da saída original.

O saldo geral distingue **em mãos**, **reservado** e **disponível** (`em mãos - reservado`). Técnicos consultam disponibilidade e registram consumo autorizado, mas não alteram custo ou fazem ajuste de contagem. Gerente/proprietário mantêm cadastros, compras e ajustes; caixa/conveniência vende conforme permissão; consulta financeira é somente leitura. Todas as operações validam tenant, unidade e papel no servidor.

## 2. Telas propostas para Conveniência

| Tela | Conteúdo e ação principal | Observações de permissão |
| --- | --- | --- |
| **Resumo da conveniência** | Vendas por dia/período e forma de pagamento, produtos mais vendidos, recebimentos a conferir, itens abaixo do mínimo e alertas de reposição. | Separar venda, caixa e margem; não chamar venda de lucro nem presumir conciliação bancária. |
| **Produtos e categorias** | Pesquisa por descrição, SKU e código de barras; cadastro de embalagem/unidade-base, preço, estoque mínimo, categoria e status ativo. | Custo vem de recebimentos; edição manual de custo fica restrita/auditada. Leitor físico não é necessário no MVP. |
| **Fornecedores e compras** | Cadastro de fornecedor; pedido/recebimento manual; item, embalagem, quantidade, custo unitário, custo total, data e referência documental opcional. | Recebimento confirmado gera entrada imutável e recalcula custo médio. Não emitir documento fiscal nesta fase. |
| **Posição de estoque** | Saldo em mãos, reservado, disponível, mínimo e situação por item/unidade; filtros por categoria e busca. | Estoque baixo é alerta de reposição, não compra automática. |
| **Movimentações** | Ledger cronológico de entradas/saídas, custo atribuído, motivo, autor, timestamp e vínculo a compra, venda, contagem ou ordem de serviço. | Somente consulta; correções são novos eventos compensatórios autorizados. |
| **Venda de balcão** | Busca manual por produto/SKU, carrinho, quantidades, preço autorizado, desconto com limite/papel e revisão antes de concluir. | MVP sem integração com PDV/TEF, impressora ou fiscal. Disponibilidade desconta reservas de ordens aprovadas. |
| **Pagamento e fechamento** | Divisão manual de valor por dinheiro, Pix, débito e crédito, integrada ao turno centralizado da Fase 3. | Registrar o informado pelo operador; sem afirmar verificação bancária ou liquidação automática. |
| **Devoluções e cancelamentos** | Localizar venda, informar item/quantidade/motivo e decidir se o produto retorna ao estoque após inspeção. | Reembolso e retorno de estoque são eventos distintos; item avariado/aberto não volta automaticamente como disponível. |
| **Contagem e ajustes** | Contagem física por item/categoria, diferença entre contagem e saldo, revisão e ajuste com justificativa. | Ajuste não apaga movimentos; exige gerente/proprietário, confirmação e auditoria. |
| **Relatórios** | Vendas, giro, itens sem giro, ruptura, margem estimada e divergências por período/categoria. | Margem usa custo registrado no movimento. Exportação CSV e fechamento entram após definição de permissões e escopo financeiro. |

Para a primeira entrega, **cadastro, recebimento, posição/movimentações, venda manual, devolução e contagem** são o núcleo. Indicadores avançados, compras sugeridas, etiquetas, leitores, impressoras, TEF/PDV e documentos fiscais são posteriores ou dependem de confirmação técnica/comercial.

## 3. Telas adicionais de troca de óleo

1. **Clientes e veículos:** identificação de cliente, placa e dados necessários ao serviço, com acesso limitado e histórico por veículo.
2. **Catálogo de serviços e itens:** mão de obra, kits recomendados, filtros e óleos compatíveis. Recomendações não substituem confirmação do técnico nem dados do fabricante.
3. **Orçamento/ordem de serviço:** veículo, queixa/solicitação, itens propostos, quantidades, mão de obra, preço e etapa de aprovação.
4. **Quadro de execução:** ordens em rascunho, aguardando aprovação, aprovadas, em execução, aguardando peça, concluídas e canceladas.
5. **Execução do técnico:** checklist de serviço, produtos realmente usados, quantidade, lote/embalagem quando aplicável, substituição aprovada e observação.
6. **Revisão e conclusão:** resumo do serviço/preço, saldo reservado e consumo que será gravado; confirmação atômica. Erro de concorrência exige atualizar e rever, não repetir baixa.
7. **Histórico do veículo:** serviços concluídos, itens utilizados, quilometragem/dados que o usuário autorizar registrar e vínculo à ordem original. Lembretes automáticos são uma decisão futura, não presumida.

## 4. Cronograma-base

**Estimativa:** cerca de **12 semanas** de trabalho sequencial, assumindo uma frente principal de desenvolvimento dedicada, revisões do proprietário em até dois dias úteis por marco e sem integrações de hardware, fiscais ou bancárias. É prazo de planejamento, não compromisso de entrega. Datas de calendário devem ser definidas após aprovação do escopo, confirmação da equipe disponível e levantamento do PDV/maquininhas/fornecedores atuais. O cronograma não inicia a implementação automaticamente.

| Janela | Frente | Entregável e dependência de saída |
| --- | --- | --- |
| **Semana 1** | Descoberta e regras do piloto | Mapear produtos/embalagens, fornecedores, formas de pagamento, descontos, devolução, papéis e fluxo atual de troca de óleo. Confirmar unidades-base e políticas de estoque. Sem criar cadastro comercial fictício. |
| **Semanas 2–3** | Fase 3: caixa multiusuário | Centralizar abertura, movimentações e fechamento de turno aprovados, com identidade autenticada, concorrência e diferenças justificadas. É dependência para relacionar vendas da conveniência ao turno e aos pagamentos. |
| **Semanas 4–5** | Fundação do estoque geral e catálogo | Modelar itens, unidade/conversão, posição em mãos/reservada/disponível, movimentos auditáveis, custo médio por localização, códigos de barras e cadastros iniciais da conveniência. Não altera o ledger especializado de combustível. |
| **Semana 6** | Compras, recebimento e contagem | Recebimento de mercadoria atualiza ledger e custo médio; tela de contagem, divergência e ajuste justificado; validação de fornecedor e histórico. |
| **Semanas 7–8** | Venda de conveniência | Carrinho de balcão manual, preços/descontos autorizados, confirmação antes de gravar, divisão de pagamentos ligada ao turno, baixa única de estoque, devoluções e relatório inicial. |
| **Semana 9** | Clientes, veículos e orçamento de serviço | Cadastros e telas de cliente/veículo, catálogo de serviço e orçamento/ordem em rascunho e aprovação. Nenhuma baixa antes da aprovação/reserva. |
| **Semana 10** | Execução e quadro de ordens | Estados da ordem, equipe técnica, produtos/quantidades reais, substituições autorizadas, pausa por falta de item e revisão final. |
| **Semana 11** | Integração da ordem ao estoque | Reserva/release, consumo atômico na conclusão, custo do serviço, idempotência, rastreio ordem → movimento → saldo e proteção contra corrida com venda de balcão. |
| **Semana 12** | Integração, validação e piloto controlado | Revisão de papéis/tenant, trilha de auditoria, regressão do app local e combustível, responsividade, relatórios básicos, treinamento e conferência de fluxos com o proprietário. Publicar somente após aprovação e testes finais. |

### Marcos de aceite

- **M1, caixa:** turno e venda podem compartilhar a unidade e seus operadores sem misturar dinheiro esperado com recebimento eletrônico.
- **M2, estoque geral:** uma compra aumenta saldo; a venda ou consumo reduz disponibilidade uma vez; custo da saída e autor são recuperáveis por histórico; uma contagem divergente exige motivo e não apaga movimentos.
- **M3, conveniência:** fluxo manual da mercadoria recebida até venda/retorno, vinculado ao turno, com revisão antes de gravar e sem alegar operação fiscal/bancária integrada.
- **M4, troca de óleo:** serviço aprovado reserva estoque; a execução registra consumo real; a conclusão grava ordem e movimentos numa só transação; cancelamento libera reserva; repetição não duplica baixa.
- **M5, piloto:** usuário consegue operar no navegador desktop/celular com papéis adequados, audit trail, estados vazios honestos e sem dados demonstrativos misturados ao posto real.

## 5. Decisões a fechar antes do início

1. O cronograma-base de 12 semanas e a dependência de concluir caixa multiusuário antes de vendas integradas estão aprovados?
2. **Modelo de unidade definido pelo usuário em 13/11/2026 às 23h42:** uma unidade-base por item/SKU e conversões explícitas, confirmadas por embalagem; itens discretos em unidade e lubrificantes em mL, sem inferir fatores. Ainda falta identificar categorias, produtos, códigos de barras, embalagens reais e seus fatores.
3. **Definido pelo usuário em 13/11/2026 às 21h12:** proprietário/gerente poderá autorizar exceção a uma saída acima do disponível, com justificativa obrigatória, aviso explícito e auditoria; a exceção pode deixar saldo disponível negativo e afetar quantidades prometidas. Caixa e técnico não ganham essa autorização.
4. **Definido pelo usuário em 13/11/2026 às 21h15:** reservar os itens quando o cliente aprovar o orçamento. A reserva reduz o disponível, não a quantidade física em mãos. Se faltar estoque, a ordem aguarda reposição ou substituição aprovada.
5. Que regras valem para descontos, devolução, item aberto/avariado, troca por produto equivalente e formas de pagamento?
6. Qual PDV, leitor, impressora, maquininha e fornecedor existem hoje? A implementação inicial permanece manual até confirmar modelos, contratos e APIs.
7. Há importação de catálogo/fornecedores necessária? Nenhum CSV será importado automaticamente; qualquer carga futura terá prévia, validação, autorização e preservação dos dados existentes.

## Fora deste cronograma-base

Emissão de NF-e/NFC-e/NFS-e, cálculo ou declaração fiscal automática, integração com bomba/controlador, PDV/TEF, maquininha, banco, e-mail/SMS, compras automáticas e sincronização do app local não estão incluídos. Dependem de descoberta técnica, contratos, orientação do contador e aprovação do escopo próprio. O registro local legado permanece separado; nenhuma migração será feita sem escolha opt-in, revisão e plano de cópia.


## 6. Decisões pendentes: fornecedores e equipamentos

### Decisões necessárias antes do catálogo e recebimento

| Decisão | O que preciso saber de você | Recomendação inicial |
| --- | --- | --- |
| Fornecedores atuais | Nomes dos fornecedores de conveniência, lubrificantes e filtros; se enviam catálogo/preço em Excel, CSV, PDF ou portal; periodicidade e identificação de SKU usada por eles. | Cadastrar fornecedor manualmente e aceitar importação de catálogo somente com prévia/validação, depois que recebermos amostras reais dos arquivos. Sem integração automática no MVP. |
| Identificação dos itens | Se cada item já tem EAN/GTIN, código interno ou códigos diferentes por fornecedor; quais variações de marca/modelo precisam continuar separadas. | Guardar SKU interno e permitir múltiplos códigos de barras/fornecedor apontando para o mesmo produto, com alerta de duplicidade antes de unificar. Não usar descrição como chave. |
| Embalagens e unidade-base | Como cada produto é comprado, vendido e usado: caixa, pacote, unidade, frasco de 1/4/5 L, bombona ou granel; fator de conversão e precisão permitida. | Cada conversão é explícita e revisável. Peças contam em unidades; lubrificante a granel em mL escalados. Não presumir conversão que o fornecedor/embalagem não confirme. |
| Recebimento e compra | Definido pelo usuário em 14/11/2026: lançar somente na chegada, sem pedido de compra prévio; permitir recebimentos parciais em lançamentos separados. Permanecem pendentes o perfil responsável, conferência de quantidade/custo e referência de documento. | Cada lançamento aumenta o saldo somente pela quantidade fisicamente recebida e conferida naquela entrega. Sem emissão de NF-e/NFC-e. |
| Reposição e aprovação | Quem define estoque mínimo, quem pode pedir/comprar, valor que requer aprovação e se há limite máximo desejado. | Gerente define mínimos e prepara sugestão; proprietário/gerente autoriza compra. Não enviar pedido ao fornecedor automaticamente. |
| Devolução, avaria e validade | Prazo e procedimento de devolução a fornecedor; como lidar com avaria, produto aberto, vencimento e itens consignados. | Movimentação separada e motivo obrigatório; item não retorna ao disponível até inspeção/decisão autorizada. Lote/validade pode começar obrigatório somente nas categorias em que você o exigir. |

### Decisões necessárias antes de ligar equipamentos

1. **PDV atual:** marca/modelo, versão, fornecedor e se existe API/documentação/contrato. O sistema não deve disputar a função de um PDV fiscal existente sem decisão explícita do contador e do fornecedor.
2. **Leitor de código de barras:** modelo, conexão USB/Bluetooth e modo de leitura. Recomendação para o primeiro release: scanner que se comporta como teclado (HID), sem protocolo proprietário; testar no computador/tablet do caixa antes de comprar vários.
3. **Estação de atendimento:** computador ou tablet, navegador/sistema operacional, impressora, gaveta de dinheiro e necessidade de etiqueta. Impressora térmica, balança e impressora de etiqueta podem esperar se não bloquearem a rotina manual.
4. **Pagamentos:** marca/modelo das maquininhas e se o operador informa valores manualmente ou se o fornecedor oferece integração oficial. Recomendação inicial: informar manualmente meio/valor e, quando útil, referência segura da transação; não armazenar PAN, CVV ou credenciais e não afirmar confirmação bancária.
5. **Conectividade:** a aplicação web multiusuário depende de internet para confirmar gravações no servidor. Você precisa que venda/OS continue operando sem internet? Recomendação para MVP: exigir conexão para concluir movimento e mostrar aviso claro; modo offline exige fila, reconciliação de conflitos e uma fase separada.
6. **Integrações fiscais/contábeis:** identificar o emissor/PDV e o fluxo atual com o contador. Decidir essa conexão não significa aprovar emissão fiscal no GAS PUMP; requer análise separada de legislação, certificados, contingência, contrato e homologação.

**O que mais ajuda antes do início:** relação dos principais fornecedores; 10–20 exemplos reais de produtos de maior giro com código, embalagem e unidade usada; um arquivo de catálogo/preço sem senhas; fotos/modelos do PDV, scanner e maquininha; nomes dos papéis que recebem, vendem e ajustam estoque. Remover dados de clientes e credenciais desses exemplos. Não é necessário comprar equipamentos novos para desenhar o MVP.

## 7. Baixa automática de peças e óleos na ordem de serviço

“Automática” significa que o GAS PUMP cria o movimento de estoque quando uma etapa autorizada da ordem é confirmada. Não significa deduzir produto ao abrir uma tela, gerar uma ordem sem aprovação, ou inferir o que foi usado apenas pelo serviço selecionado.

1. **Rascunho:** atendente seleciona veículo, serviço e produtos/quantidades estimadas. O sistema mostra preço e disponibilidade, mas não altera nem reserva o saldo.
2. **Orçamento aprovado:** após confirmar com o cliente, o sistema confere disponibilidade e cria uma reserva vinculada à ordem e à unidade. A reserva reduz “disponível”, mas o produto ainda está fisicamente “em mãos” e não foi lançado como consumo. Venda de balcão só pode usar `em mãos - reservado`.
3. **Mudança no box:** técnico registra o que efetivamente usou, não apenas o que estava no pacote sugerido. Item substituído ou quantidade acima do aprovado exige atualizar a ordem, verificar disponibilidade e obter a aprovação necessária antes da conclusão; o histórico guarda a proposta e a versão aprovada.
4. **Conferência final:** antes de concluir, apresentar ordem, veículo, técnico, item/SKU, quantidade-base, substituições, preço e efeito de estoque/custo. O técnico confirma o uso e a pessoa autorizada confirma o encerramento. Não permite concluir com saldo/reserva divergente sem resolver o conflito.
5. **Baixa atômica:** numa única transação MySQL, bloquear a ordem e os saldos, confirmar status e reservas, registrar movimentos negativos de cada peça/óleo com `work_order_id`, unidade, autor, hora e custo médio vigente, liberar sobra reservada e marcar a ordem concluída. A venda/valor cobrado permanece separada do custo do item e da mão de obra. Uma chave de idempotência/constraint impede uma segunda baixa em clique repetido.
6. **Falta de estoque ou conflito:** manter a ordem aberta/em “aguardando peça”; informar quanto está em mãos, reservado e faltante. Permitir entrada após recebimento, substituir por equivalente aprovado ou cancelar e liberar a reserva. Saldo negativo é bloqueado por padrão. Qualquer futura exceção precisa de autorização, motivo e alerta rastreável.
7. **Cancelamento/retorno:** cancelar antes da conclusão libera a reserva e não cria consumo. Produto já aplicado nunca é apagado do histórico. Material não utilizado volta à disponibilidade somente por movimento explícito e inspeção; peça avariada/óleo contaminado registra perda/descartes separados.
8. **Auditoria e custos:** histórico da ordem leva aos movimentos e vice-versa. Margem do serviço usa o custo efetivamente atribuído, sem tratar faturamento como lucro. Técnicos veem produtos/quantidades e disponibilidade necessária ao trabalho, não necessariamente custo de compra ou margem.

### Exemplo da decisão sobre óleo fracionado

Uma ordem aprovada reserva 4.000 mL de um óleo e um filtro. O técnico registra 3.700 mL efetivamente aplicados e um filtro. O sistema baixa 3.700 mL e o filtro; os 300 mL reservados são liberados. Antes de liberar essa sobra como estoque utilizável, o negócio precisa decidir como identificar o frasco aberto/lote, local e condição de armazenamento. Se não for seguro ou operacionalmente aceito reaproveitá-lo, registra-se o restante como perda/consumo do frasco com justificativa. Nunca transformar automaticamente uma sobra aberta em frasco lacrado para venda no balcão.

**Recomendação de configuração:** peça fechada pode voltar ao disponível após conferência. Óleo parcial só fica como saldo reutilizável se houver processo aprovado de recipiente aberto/lote e unidade-base; caso contrário, a ordem registra a quantidade/frascos consumidos e o restante como perda documentada. Esta política altera custo e operação, então precisa ser aprovada antes do fluxo de execução.

**Pontos ainda sujeitos à sua decisão:** reservar na aprovação do orçamento ou no início do serviço (recomendo aprovação); autorizar substituição e limite de diferença de quantidade; política de frasco de óleo aberto; bloqueio ou exceção de saldo negativo; papel autorizado a conferir/concluir; e preço/forma de pagamento integrados ao caixa de turno.

## 8. Início autorizado em 13/11/2026: seguir a sequência do caixa multiusuário

O usuário confirmou nesta tarefa a opção “Seguir a ordem do cronograma: implementar primeiro o caixa multiusuário”. Esta escolha inicia a Fase 3 antes do estoque geral e das vendas de conveniência; não resolve automaticamente as políticas de fornecedores, equipamentos, frascos abertos, descontos e substituições ainda pendentes acima. A estimativa de 12 semanas permanece referência de planejamento, sem datas ou equipe confirmadas.

Para respeitar a entrega passo a passo, a primeira subentrega da Fase 3 será somente **abertura autenticada e estado central compartilhado do caixa principal**. Usará a identidade da conta comercial e as regras de calendário/fundo de troco já aprovadas, com revisão explícita, transação, concorrência, idempotência e auditoria. Proprietário, gerente e caixa/conveniência podem abrir na própria unidade; consulta financeira lê somente. Registros locais permanecem intactos e não são importados.

**Limite importante:** esta primeira subentrega ainda não terá recebimentos, sangrias, suprimentos ou fechamento centralizados. Uma abertura não é encerrada pelo horário e impedirá outra até a entrega de fechamento. A interface deverá avisar isso antes da confirmação e não será apresentada como rotina completa de caixa. Movimentações aguardam aceite da abertura; fechamento e identidade do conferente serão a subetapa seguinte, após aceite dos movimentos. Estoque geral, conveniência e troca de óleo aguardam a conclusão e o aceite da Fase 3. Nenhuma publicação foi autorizada para esta nova implementação; auto_publicação continua desativada.

**Resultado da primeira subentrega, 13/11/2026:** abertura central autenticada e estado compartilhado implementados em `/gestao/caixa`; 205 testes aprovados (1 legado ignorado), TypeScript/lint/build de produção e validação Drizzle concluídos. Migração aditiva 0005 aplicada e verificada por metadados após corrigir default de timestamp(3), sem criar negócios de teste. Preview caixa/login/pista/Mais e saúde responderam 200; consulta de caixa sem sessão respondeu 401. Revisão independente e correção de cache privado entre contas concluídas. A abertura ainda não oferece movimentos nem fechamento e não foi testada com uma conta real. Entrega sem publicação, aguardando aceite antes da próxima subetapa.

## 9. Segunda subentrega da Fase 3 autorizada em 13/11/2026 às 15h40

O usuário aprovou a abertura central e autorizou a implementação de movimentações. Esta subentrega inclui recebimentos manuais por dinheiro/Pix/débito/crédito, distinguindo vendas do turno e contas anteriores; suprimentos e sangrias em dinheiro; revisão explícita; identidade autenticada; resumo completo; histórico imutável/paginado; concorrência, idempotência e auditoria. Reutiliza o módulo `/gestao/caixa` e as regras locais aprovadas, sem migrar dados do aparelho.

Fechamento/conferência, estornos/edições, fiscal/banco/TEF/PDV, CSV comercial, estoque geral, conveniência e ordens de serviço permanecem fora desta implementação. O fechamento requer novo aceite após a entrega de movimentos. A versão parcial não encerra turnos automaticamente e não deve ser apresentada como rotina diária completa. O desenvolvimento continuará com testes isolados e migração aditiva no banco compartilhado, sem criar registros comerciais de teste. Nenhuma nova publicação ou auto_publicação está autorizada.

**Resultado da segunda subentrega, 13/11/2026:** recebimentos por método/natureza, suprimentos, sangrias, resumo integral, revisão explícita e histórico paginado implementados em `/gestao/caixa`. Migração 0006 aditiva aplicada, preservando exatamente tabelas antigas, sem dados comerciais de teste. 238 testes aprovados (1 legado ignorado), TypeScript/lint/build de produção e Drizzle check concluídos; Preview e saúde 200, APIs novas sem sessão 401. A revisão independente gerou um reparo de conferência entre contas: a intenção congela `expectedActorId` e o servidor compara com a sessão real sob lock; o campo é precondição, não autoria declarada. Tela bloqueia troca de responsável e mantém recuperação de intenção incerta pela conta original. Sem publicação ou teste físico; fechamento e identidade do conferente continuam pendentes de novo aceite.

## 10. Regra de fechamento central acordada em 13/11/2026 às 16h09

O usuário aprovou os movimentos e definiu que **proprietário, gerente ou caixa pode fechar e confirmar sozinho**, sempre com identidade obtida da sessão autenticada no servidor. Não é necessária uma segunda conta/conferente; consulta financeira permanece somente leitura. O usuário definiu esta política, não solicitou ainda iniciar o código do fechamento.

Preservar as quatro contagens manuais já aprovadas: dinheiro físico incluindo fundo, Pix, débito e crédito brutos, todos digitados em branco, com zero explícito permitido e sem copiar valores esperados. Dinheiro esperado = fundo + recebimentos em dinheiro + suprimentos − sangrias; eletrônico por método = recebimentos no mesmo método. Diferença = conferido menos esperado. Divergência requer justificativa de 3–500 caracteres e status “diferença pendente”; sem diferença, “fechado”, nunca “auditado” ou “conciliado”. Sem compensações, validação bancária ou liquidação automática.

Pode fechar depois do horário programado; data/turno operacional ficam preservados e o timestamp real do servidor não precede a abertura nem o último movimento. Congelar snapshot imutável de abertura, movimentos, contagens, esperados, diferenças, justificativa, usuário e timestamp. Após fechar, bloquear movimentos. Próxima abertura somente na janela vigente, com fundo contado digitado novamente, sem transferência de saldo ou fechamento automático. Transação multiusuário com locks, revisão/identidade/horário revalidados, idempotência e auditoria atômicas, sem criação parcial. A decisão está registrada; **aguardar autorização explícita antes de implementar**. Estoque geral, conveniência e OS continuam pendentes.

## 11. Implementação do fechamento central autorizada em 13/11/2026 às 18h04

O usuário confirmou “Sim, implementar o fechamento central”, após definir proprietário/gerente/caixa como fechador e conferente autenticado individual. Esta autorização inicia somente a terceira subentrega da Fase 3, com quatro contagens manuais, comparação/justificativa, status fechado ou diferença pendente, snapshot/histórico imutável, idempotência e auditoria atômica. Fechar fora do horário é permitido, conservando data/turno original; depois disso, movimentos ficam bloqueados e novo fundo deve ser digitado em abertura manual dentro da janela vigente. Não transferir saldo nem encerrar automaticamente.

A base recebeu uma correção concorrente de isolamento cross-tab do remoto e foi preservada: 248 testes atuais passaram, 1 legado ignorado. Reutilizar servidores/estética/identidade existentes; migração somente aditiva, sem dados reais de teste no banco compartilhado, sem publicação, fiscal/POS/TEF/banco, exportação comercial ou estorno. Estoque geral, conveniência e OS continuam pendentes até a conclusão e o aceite do fechamento central. Não reabrir decisões já aprovadas nem tratar esta autorização como aprovação das políticas de fases futuras.

## 12. Fechamento central implementado e preparado para aceite em 13/11/2026

Terceira subentrega da Fase 3 concluída tecnicamente no Preview, menu Caixa: contagens em branco com zero explícito, revisão, confirmação autenticada individual, diferença pendente justificada, histórico imutável e bloqueio de movimentos após encerramento. Nova abertura continua manual, no turno vigente e com fundo redigitado. Recuperação incerta conserva a mesma intenção; nenhum saldo/contagem é transferido automaticamente.

Validação final: 292 testes aprovados, 1 legado ignorado, TypeScript/lint/build/Drizzle concluídos; migração 0007 aditiva aplicada com duas tabelas/nove FKs e todas as 26 tabelas anteriores preservadas. Testes usaram mocks/adapter em memória; não houve operação comercial real de teste, conta real, publicação ou APK. A Fase 3 ainda aguarda o aceite do fechamento pelo usuário. Estoque geral, conveniência e OS não foram iniciados e suas decisões operacionais pendentes continuam pendentes. Auto_publicação segue desligada; salvar no remoto Manus sem confundir aceite remoto com recibo formal de checkpoint.

**Salvamento da implementação:** commit `a1c377679e85ac089f56b44e471042a9232c36ad` aceito na main do remoto canônico Manus, sem publicação nesta tarefa. A documentação deste resultado segue em commit posterior. Recibo formal de checkpoint não retornou; não confundir aceite remoto com registro confirmado em Version history. Aguardar aceite do fechamento antes do estoque geral/conveniência/OS.

## 13. Aceite do caixa e início da definição do estoque, 13/11/2026 às 20h01

O usuário aprovou o fechamento central entregue no menu Caixa. Esse aceite encerra a terceira subentrega da Fase 3. Também iniciou a definição do estoque geral, mas não aprova automaticamente todo o cronograma de 12 semanas nem autoriza sua implementação. Conveniência e ordens de serviço continuam como etapas futuras, dependentes das regras e de autorização separada.

A primeira política pendente é a saída acima do disponível, calculado como quantidade em mãos menos quantidade reservada pelas ordens aprovadas. Decidir entre bloquear toda venda/consumo acima desse saldo ou permitir exceção restrita a proprietário/gerente, com justificativa e alerta auditável. Recomendação inicial: bloquear, sem exceções, para proteger reservas e evitar saldo negativo até haver rotina deliberada de correção.


## 14. Regra de exceção do estoque definida em 13/11/2026 às 21h12

Por decisão do usuário, proprietário/gerente poderá autorizar venda ou consumo acima do disponível (`em mãos - reservado`) com justificativa obrigatória, aviso explícito antes da confirmação e trilha de auditoria. Essa exceção pode levar o saldo disponível a valor negativo e afetar quantidades prometidas; não concede a caixa/técnicos poder para aprová-la. A decisão não autoriza implementação.

**Próxima decisão:** quando reservar os itens de uma ordem de serviço. Opções: ao cliente aprovar o orçamento (recomendado, protege a promessa e reduz somente o disponível) ou quando o técnico iniciar o serviço (mantém o item disponível para venda enquanto a ordem aguarda).


## 15. Reserva de OS definida em 13/11/2026 às 21h15

O usuário decidiu que a reserva dos itens ocorrerá quando o cliente aprovar o orçamento. Isso reduz o disponível, mas não baixa o saldo físico. Se faltar quantidade, a OS aguarda reposição ou uma substituição aprovada. Não há baixa de consumo nesta transição e a decisão não autoriza implementação.

**Próxima decisão:** padrão de unidades-base e conversões explícitas por embalagem. Recomendação: unidade para peças e mililitros para lubrificantes, com fatores cadastrados somente após confirmação das embalagens reais.


## 16. Unidade-base e conversões definidas em 13/11/2026 às 23h42

Cada item/SKU terá uma unidade-base e fatores explícitos por embalagem. Itens discretos serão contados em unidade e lubrificantes em mL; só usar fatores confirmados, sem inferir equivalências. A decisão não autoriza implementação nem carga de estoque.

**Próxima decisão:** iniciar com uma contagem física inicial autorizada ou começar com saldo zero e aumentar somente por recebimentos. CSV e dados locais permanecem sem importação automática.

## 17. Saldo inicial definido em 14/11/2026 às 08h56

O usuário escolheu realizar uma contagem física inicial auditada. Registrar cada quantidade na unidade-base confirmada do item, com responsável autenticado, data/hora e trilha de auditoria; não presumir quantidades nem fatores de conversão. Nenhum CSV ou dado local será importado automaticamente, e a regra não autoriza ainda iniciar implementação ou lançar saldos reais.

**Próxima decisão:** definir se a reposição será registrada primeiro como pedido de compra no sistema, com recebimento separado (recomendado), ou somente no ato da entrega.


## 18. Contagem física inicial auditada definida em 14/11/2026 às 08h56

O saldo de abertura será lançado por contagem física auditada, expressa na unidade-base confirmada de cada item e vinculada a responsável autenticado e data/hora. Nenhuma quantidade ou conversão será presumida. Não importar CSV/dados locais nem lançar saldos reais sem autorização expressa. Esta decisão não inicia implementação.

**Próxima decisão:** a reposição deve começar por pedido de compra no sistema, seguido de recebimento separado, ou ser lançada somente na entrega?


## 19. Reposição definida em 14/11/2026 às 08h58

Por decisão do usuário, a entrada de estoque será registrada somente quando a mercadoria chegar. Não haverá pedido de compra prévio no sistema, nem aumento do saldo para itens ainda não entregues. A regra não autoriza implementação.

**Próxima decisão:** definir quais perfis podem registrar e confirmar um recebimento físico no sistema.


## 20. Recebimentos parciais definidos em 14/11/2026 às 08h59

O usuário decidiu permitir recebimentos parciais, em lançamentos separados. Cada lançamento acrescenta apenas quantidades fisicamente recebidas e conferidas naquela chegada; itens ainda não entregues só entram no saldo quando chegarem. Não há pedido de compra prévio no sistema. A decisão não autoriza implementação.

**Próxima decisão:** quais perfis podem registrar e confirmar o recebimento físico?
