# Plano de melhorias de UX, emissão segura e acessibilidade

**Status:** pronto para detalhamento em tarefas e início de implementação  
**Escopo:** interface, fluxos de emissão, gestão, modelos dinâmicos, acessibilidade, backup local e cobertura automatizada.  
**Antecedente técnico:** `docs/plano-templates-dinamicos.md` descreve a fundação já adotada para templates HTML e formulários dinâmicos.

## 1. Objetivo

Reduzir o risco de emitir um documento incorreto sem sacrificar a velocidade de trabalho da equipe imobiliária. A Gestão continuará sendo a tela de entrada, mas deverá orientar a pessoa para uma próxima ação clara: emitir, continuar um rascunho, tratar uma pendência ou localizar um documento.

O produto continua sendo uma aplicação local: os documentos, cadastros e histórico permanecem no navegador; a prévia e a impressão A4 são parte do produto; não haverá inclusão de back-end para os registros operacionais.

## 2. Decisões já tomadas

- A aplicação abre em **Gestão**, e não diretamente em "Novo documento".
- O risco prioritário é a **emissão de documento incorreto**.
- Nos templates dinâmicos, a obrigatoriedade é definida pela pessoa que cria ou edita o template, no controle **Obrigatório** de cada campo.
- O sistema não deve inferir exigências jurídicas para modelos personalizados. Um contrato dinâmico segue as regras declaradas pelo seu template.
- A chave `paraibaImoveisRecibosV3`, a numeração, os snapshots de emissão e os dados existentes devem ser preservados.
- Conteúdo jurídico e modelos institucionais só mudam com validação do responsável.

## 3. Princípios de produto

1. **Revisar antes de registrar.** Nenhuma emissão deve parecer um salvamento comum; a revisão exibe os dados que mudam a validade operacional do documento.
2. **A regra mora no modelo.** Campos dinâmicos obrigatórios, sua ajuda e sua validação vêm da definição do template e são aplicados de forma consistente na edição, revisão e emissão.
3. **O erro fica perto da correção.** Mensagens não usam alertas nativos; indicam o campo, preservam o contexto e levam o foco ao próximo passo útil.
4. **Gestão é uma central de trabalho.** A primeira dobra mostra ações e pendências, não todos os recursos administrativos ao mesmo tempo.
5. **Local não significa protegido.** O estado de backup deve ser explícito quando passa a importar, especialmente após uma emissão.
6. **Desktop, celular e A4 são superfícies distintas.** Melhorias de interface não podem degradar toque, foco, prévia ou impressão.

## 4. Escopo e limites

### Incluído

- Modal, confirmação, validação, mensagens de estado e retorno de foco.
- Revisão final de recibos, documentos genéricos, documentos dinâmicos e emissão em lote.
- Hierarquia da tela Gestão, Dossiês, busca e ações administrativas.
- Fluxo de formulários e revisão para modelos e campos dinâmicos.
- Backup local, ajuda contextual, contraste, tipografia operacional, navegação por teclado e mobile.
- Testes E2E, testes de API de templates, testes visuais quando houver alteração de CSS responsivo ou de impressão.

### Excluído

- Sincronização, autenticação, banco de dados ou qualquer back-end para os registros emitidos.
- Alteração de redação jurídica, regras de negócio de numeração ou substituição de documentos já emitidos.
- Migração de esquema sem uma proposta específica, backup automático e testes explícitos.
- Atalhos globais que conflitem com a digitação em campos, o navegador ou tecnologias assistivas.

## 5. Ordem de implementação

| Ordem | Fase | Prioridade | Resultado principal |
| --- | --- | --- | --- |
| 0 | Fundamentos de interação segura | P0 | Uma linguagem única para modais, erros, foco e abas. |
| 1 | Emissão à prova de erro | P0 | Revisão e confirmação confiáveis sem consumir numeração indevidamente. |
| 2 | Gestão orientada à próxima tarefa | P1 | A abertura em Gestão ajuda a agir sem expor complexidade cedo demais. |
| 3 | Modelos e contratos guiados por definição | P1 | Campos e pendências dinâmicos respeitam o template criado pelo usuário. |
| 4 | Backup e aprendizagem contextual | P2 | O risco do armazenamento local aparece no momento certo e é acionável. |
| 5 | Legibilidade, eficiência e acabamento | P2 | Interface mais legível, acessível e eficiente, sem afetar A4. |

As fases 0 e 1 são uma entrega de segurança operacional e devem ser liberadas juntas. As fases seguintes só começam após a suíte da fase anterior estar estável.

## 6. Fase 0 — Fundamentos de interação segura

### Objetivo

Eliminar padrões contraditórios de interação e corrigir falhas que impedem navegação consistente por teclado e leitor de tela.

### Escopo de implementação

- Criar uma primitiva reutilizável de modal acessível, ou extrair as funções existentes de modal para uma API comum.
- Aplicar foco inicial intencional, contenção de Tab/Shift+Tab, `Escape`, clique fora quando apropriado e retorno de foco ao controle que abriu o modal.
- Substituir `alert`, `confirm` e `prompt` em Gestão, lote, cancelamento, arquivamento, visões salvas e emissão genérica por modal ou feedback contextual compatível com o risco da ação.
- Corrigir a ativação de abas para que as abas inseridas por `management.js` usem a mesma navegação por clique, setas, Home e End das abas estáticas.
- Dar nome acessível a controles icônicos: setas de reordenação, controles `B`, `I` e `S` do editor e ações sem texto suficiente.
- Padronizar mensagens de erro em campos e estados de sucesso em regiões vivas, sem anunciar conteúdo redundante.

### Arquivos prováveis

- `src/scripts/script.js`
- `src/scripts/management.js`
- `src/scripts/template-engine.js`
- `src/index.html`
- `src/styles/styles.css`
- `tests/e2e/app.spec.js`

### Critérios de aceite

- Todo modal abre com um foco útil, mantém o foco interno e devolve-o ao gatilho ao fechar.
- `Escape` fecha somente o modal ou menu em primeiro plano; a alteração pendente é descartada apenas quando a ação de cancelamento tiver sido explicitada.
- O erro de justificativa obrigatória no modal de situação permanece no modal, é associado ao campo e não interrompe o fluxo com um alerta do navegador.
- As abas Gestão e Dossiês respondem a teclado da mesma forma que as abas originalmente presentes no HTML.
- A toolbar anuncia, respectivamente, "Negrito", "Itálico" e "Sublinhado"; os controles de subir e descer campo possuem nome acessível.

### Testes

- E2E: Tab, Shift+Tab e Escape em confirmação, cancelamento, situação documental e bloqueio local.
- E2E: retorno de foco após fechar cada modal e ausência de foco fora do diálogo aberto.
- E2E: setas, Home e End atravessam abas estáticas e criadas dinamicamente.
- E2E: salvar visão, emitir lote, cancelar e arquivar não disparam diálogos nativos.
- E2E: verificações por `getByRole` e nome acessível para a toolbar e os botões de reordenação.

## 7. Fase 1 — Emissão à prova de erro

### Objetivo

Fazer com que a pessoa confira deliberadamente os dados críticos antes de criar o registro definitivo, preservando a regra de só reservar numeração ao confirmar uma emissão válida.

### Escopo de implementação

- Criar uma etapa de revisão final reutilizável antes da confirmação de recibos, documentos genéricos, documentos dinâmicos e lotes.
- Exibir, conforme o tipo, documento/modelo, partes, imóvel ou assunto, data, valor, responsável, competência e número proposto.
- Para templates dinâmicos, listar os campos obrigatórios ausentes pelo nome configurado no template e oferecer navegação direta para o respectivo campo.
- Revalidar os dados imediatamente antes de persistir e tratar disputa de numeração sem emitir um registro parcial.
- Deixar visualmente clara a consequência da ação: "Emitir e registrar", quantidade de itens no lote e preservação do histórico.
- Oferecer saída segura da revisão: voltar à edição sem perder dados e sem reservar número.

### Critérios de aceite

- Dados inválidos não abrem a confirmação e não incrementam contador algum.
- A confirmação só pode registrar um documento depois de mostrar dados críticos atuais; dados alterados desde a abertura exigem nova validação.
- Um recibo, documento dinâmico ou lote válido aparece no histórico e persiste após recarregar a página.
- A falha de persistência mostra uma mensagem contextual e não comunica emissão bem-sucedida.
- Documentos livres continuam sem número; as categorias numeradas preservam os prefixos e sequências existentes.
- O snapshot do modelo dinâmico, valores e HTML renderizado permanecem congelados após a emissão.

### Testes

- E2E para emissão válida e inválida de recibo, declaração, termo, contrato, documento dinâmico e lote.
- E2E para retorno da revisão à edição, inclusive com dados preenchidos no celular.
- E2E para conflito de numeração e para falha simulada de persistência.
- E2E para emissão em lote com um item inválido: nenhum item deve ser emitido.
- E2E para snapshot: emitir, alterar o template e confirmar que o histórico continua exibindo o registro original.
- Executar os casos de emissão no projeto `mobile-chrome`.

## 8. Fase 2 — Gestão orientada à próxima tarefa

### Objetivo

Manter Gestão como porta de entrada, reduzindo a carga cognitiva da primeira dobra e revelando recursos avançados no momento em que são necessários.

### Escopo de implementação

- Reestruturar o topo da Gestão em três blocos claros: **Emitir agora**, **Continuar trabalho** e **Pendências**.
- Priorizar atalhos para novo documento, rascunho em andamento, documentos que exigem situação e ações de lote quando houver dossiês aptos.
- Manter indicadores úteis, mas não usar KPIs decorativos como ação principal.
- Colocar busca avançada, visões salvas, emissão em lote e governança sob seções expansíveis ou ações explícitas, mantendo a descoberta possível.
- Agrupar a navegação em "Emitir", "Acompanhar" e "Administrar", sem remover acessos existentes nem reduzir a navegação por teclado.
- Apresentar estado vazio de Gestão com uma ação primária e uma explicação curta do que acontecerá a seguir.

### Critérios de aceite

- Com histórico vazio, a primeira ação disponível é emitir ou criar um dossiê; não há tela vazia com filtros dominantes.
- Com rascunhos ou pendências, eles surgem antes de busca avançada e governança.
- A busca avançada continua capaz de reproduzir os filtros existentes, mas não ocupa a primeira dobra por padrão.
- Os oito destinos atuais continuam alcançáveis por teclado, por toque e pelo menu móvel.
- A troca de abas atualiza `aria-selected`, `tabindex`, painel ativo e foco de forma consistente.

### Testes

- E2E para Gestão vazia, com rascunho, com pendência e com dossiê apto a lote.
- E2E de abertura e recolhimento de busca avançada sem perder filtros já preenchidos.
- E2E de menu móvel e navegação por abas em larguras de 767 px e 380 px.
- Regressão de Dossiês, histórico, cadastros, clientes, modelos e backup.

## 9. Fase 3 — Modelos e contratos guiados por definição

### Objetivo

Transformar a definição do template em uma experiência de preenchimento e revisão clara, sem codificar exigências jurídicas nos modelos customizados.

### Regra de obrigatoriedade

Para documento dinâmico, `field.required` é a fonte de verdade. O formulário, a lista de pendências, a revisão final e o bloqueio de emissão devem usar a mesma definição. Validações como CPF/CNPJ, moeda e data continuam declarativas pelo campo.

Formulários institucionais já existentes continuam com suas validações próprias. Se um contrato for emitido por template dinâmico, ele se comporta como qualquer outro template: exige apenas os campos marcados como obrigatórios pelo criador.

### Escopo de implementação

- Exibir durante o preenchimento um estado simples de pendências: quantidade de campos obrigatórios completos e o próximo campo necessário.
- Criar uma tela de revisão dinâmica que agrupa pendências por ordem do template e permite retornar diretamente a cada campo.
- Preservar a sequência do template como ordem padrão de preenchimento. Não introduzir etapas jurídicas automáticas.
- Melhorar o editor de templates: nome acessível na toolbar, dica de uso das tags, explicação curta de "Obrigatório", validação e valor padrão.
- Garantir que a marcação de obrigatoriedade seja refletida imediatamente no JSON gerado, na prévia de rascunho e no formulário emitido a partir do modelo salvo.
- Oferecer salvamento de rascunho claro antes da emissão para formulários longos; se houver autosalvamento, informar o estado, não atribuir numeração e permitir descarte explícito.

### Evolução futura opcional

Caso seja necessário organizar templates muito extensos, introduzir metadados opcionais de seção em uma versão futura da definição. Campos de templates legados entram em uma seção padrão. Essa evolução exige proposta de migração, backup e testes antes de alterar qualquer esquema persistido.

### Critérios de aceite

- Marcar um campo como obrigatório no editor e salvar faz com que ele bloqueie a emissão quando vazio.
- Um campo opcional vazio não bloqueia a emissão.
- A mensagem usa o nome do campo configurado pela pessoa usuária, não seu identificador interno ou tag.
- A lista de pendências direciona o foco ao campo correspondente e atualiza após sua correção.
- Campos obrigatórios de checkbox são tratados como pendentes quando desmarcados.
- Documento emitido conserva `templateId`, revisão, definição, valores e HTML renderizado do momento da emissão.
- Modelos existentes, modelos arquivados, documentos emitidos e backups importados continuam abrindo sem perda de campos.

### Testes

- API: aceitar e rejeitar definições de template conforme `required`, tipo, tag e validação.
- E2E: criar template fictício com texto obrigatório, data obrigatória, checkbox obrigatório e campo opcional.
- E2E: tentar emitir cada combinação incompleta; confirmar que não há emissão nem consumo de numeração.
- E2E: corrigir uma pendência a partir da revisão, emitir, recarregar e validar o snapshot.
- E2E: editar o template após a emissão e comparar o documento histórico com o snapshot preservado.
- E2E desktop e `mobile-chrome`: criação de template, preenchimento, rascunho, revisão e emissão.

## 10. Fase 4 — Backup e aprendizagem contextual

### Objetivo

Deixar explícita a responsabilidade pelo armazenamento local sem alarmismo e ajudar quem está começando a completar tarefas reais.

### Escopo de implementação

- Substituir o indicador genérico "Dados locais" por um estado compreensível de armazenamento e backup, com linguagem que não sugira sincronização inexistente.
- Após a primeira emissão sem backup registrado, mostrar aviso persistente e não bloqueante com ação direta de exportar.
- Reforçar a situação de backup na área de Segurança e em Gestão quando estiver ausente ou desatualizado.
- Criar ajuda contextual dispensável para: primeiro recibo, criação de dossiê, recuperação de documento emitido, competência, timbre e visões salvas.
- Persistir a dispensa de dicas em configuração já existente e compatível, sem alterar documentos emitidos.

### Critérios de aceite

- O produto nunca afirma ou insinua que os dados locais estão protegidos por backup sem um backup registrado.
- A primeira emissão bem-sucedida oferece exportação de backup sem interromper impressão, histórico ou continuidade do trabalho.
- Uma dica pode ser dispensada e não reaparece em toda navegação.
- A ajuda descreve a consequência da ação no ponto de uso, sem exigir leitura de manual externo.

### Testes

- E2E: primeira emissão sem backup, abertura de exportação e atualização visual de estado quando houver registro de backup.
- E2E: estado de backup ausente, atual e desatualizado.
- E2E: exibição e dispensa persistente de cada ajuda contextual.
- Regressão de importação, exportação e recuperação de dados locais.

## 11. Fase 5 — Legibilidade, eficiência e acabamento

### Objetivo

Eliminar barreiras de leitura e tornar tarefas recorrentes mais rápidas, preservando a aparência profissional e a composição A4.

### Escopo de implementação

- Elevar texto auxiliar de interface e contraste para o mínimo AA fora da folha A4; manter tipografia documental impressa quando ela for uma decisão A4 intencional.
- Revisar chips, rótulos de tabela, metadados, avisos e estados que hoje usam fontes entre 9,5 px e 11,5 px na interface operacional.
- Garantir áreas de toque de no mínimo 44 px para controles primários e não reduzir foco visível por estética.
- Revisar hierarquia visual de cartões para remover aninhamentos que não expressem uma relação real de contexto.
- Avaliar atalhos apenas para ações frequentes e sem ambiguidade; documentá-los na própria interface e desativá-los enquanto o foco estiver em entrada de texto.
- Manter texto justificado apenas na saída documental, não em conteúdo operacional de leitura em tela.

### Critérios de aceite

- Texto de interface, ícones e estados em fundo claro atendem contraste AA e tamanho legível; exceções de impressão são documentadas e validadas visualmente.
- Não há rolagem horizontal desnecessária em 767 px ou 380 px.
- A barra de ações móvel permanece alcançável e não cobre o último controle editável.
- A prévia A4, paginação e impressão de documentos longos continuam corretas.
- Nenhum atalho causa emissão, cancelamento, arquivamento ou perda de dados sozinho.

### Testes

- Revisão de contraste e nomes acessíveis dos controles alterados.
- `npm run test:visual` para qualquer alteração de `@media`, impressão ou prévia.
- E2E desktop e `mobile-chrome` em 1280 px, 900 px, 767 px e 380 px.
- Regressão de PDF A4 multipágina, menu móvel, foco em modal e ausência de rolagem horizontal.

## 12. Estratégia técnica

### Componentes e responsabilidades

| Área | Arquivos principais | Responsabilidade |
| --- | --- | --- |
| Emissão e estado local | `src/scripts/script.js` | Validação, numeração, histórico, rascunhos, backup e modais existentes. |
| Gestão e Dossiês | `src/scripts/management.js` | Entrada de Gestão, lote, busca, situação documental, dossiês e abas dinâmicas. |
| Templates dinâmicos | `src/scripts/template-engine.js` | Editor, campos, validação declarativa, prévia, formulário e snapshot. |
| Estrutura e semântica | `src/index.html` | Regiões, rótulos, controles e base dos modais. |
| Aparência e responsividade | `src/styles/styles.css` | Hierarquia, contraste, foco, mobile, prévia e impressão. |
| API de templates | `server.mjs`, `tests/server/templates.test.mjs` | Validação e armazenamento seguro de HTML/JSON. |
| Regressão de interface | `tests/e2e/app.spec.js` | Fluxos de negócio, persistência, teclado, modal, mobile e impressão. |

### Regras de compatibilidade

- Não modificar `paraibaImoveisRecibosV3`.
- Não apagar ou reformatar registros existentes como efeito colateral de alterações de UX.
- Qualquer alteração de `schemaVersion`, modelo persistido ou contador requer: proposta de migração, backup automático anterior, fixture de migração e testes de regressão.
- Preferir metadados opcionais e defaults retrocompatíveis a alterações obrigatórias em templates já salvos.
- O preview e a impressão usam dados do snapshot para documentos emitidos; nunca reprocessar um emitido com o template atual.

## 13. Qualidade e definição de pronto

Uma tarefa só é considerada pronta quando:

- tem comportamento coberto por teste antes ou junto da correção;
- conserva dados, contadores, histórico e snapshots existentes;
- apresenta estados de vazio, erro, sucesso, cancelamento e retorno quando aplicáveis;
- funciona por mouse, teclado e toque;
- não introduz texto jurídico, dados reais de clientes, segredos nem `test.only`;
- passa em `npm run check`.

Quando uma tarefa alterar HTML, CSS ou fluxo de emissão, também deve executar:

```powershell
npx playwright test --project=mobile-chrome
```

Quando alterar `@media`, `@print`, prévia ou paginação, também deve executar:

```powershell
npm run test:visual
```

## 14. Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| Uma revisão nova parece burocrática e reduz velocidade. | Mostrar apenas dados críticos, permitir retorno direto ao campo e manter a confirmação em uma única etapa. |
| Um template livre recebe exigências jurídicas indevidas. | Usar somente `field.required` e validação declarada como fonte de obrigatoriedade para documentos dinâmicos. |
| Alteração de navegação quebra abas criadas dinamicamente. | Centralizar a ativação de abas e cobrir clique e teclado no E2E. |
| Ajustes de legibilidade afetam a página A4. | Separar regras de interface e impressão; executar regressão visual/PDF a cada mudança relevante. |
| Avisos de backup assustam ou são ignorados. | Usar linguagem factual, ação direta de exportar e recorrência controlada pelo estado do backup. |
| Uma mudança de UX altera dados locais. | Não migrar dados nesta iniciativa; qualquer necessidade de esquema vira trabalho separado com migração e testes. |

## 15. Primeiro lote de tarefas

1. Inventariar todos os usos de `alert`, `confirm` e `prompt` e escrever os testes de comportamento atual que precisam ser substituídos.
2. Extrair a primitiva de modal e unificar a navegação por abas, cobrindo Gestão e Dossiês por teclado.
3. Implementar revisão e confirmação segura para uma emissão de documento dinâmico com campo obrigatório; usar esse fluxo como referência reutilizável.
4. Aplicar a revisão reutilizável a recibos, documentos genéricos e lote, preservando regras atuais de numeração.
5. Reorganizar a primeira dobra de Gestão em estado vazio, rascunho e pendências.
6. Implementar painel de pendências para templates e melhorar semântica da toolbar do editor.
7. Adicionar estado de backup pós-primeira emissão e ajuda contextual.
8. Concluir a revisão de contraste, texto operacional, mobile e impressão.

## 16. Marco de entrega

O plano estará concluído quando uma pessoa consiga abrir Gestão, identificar sua próxima ação, preencher um documento institucional ou dinâmico, entender e corrigir pendências, revisar os dados críticos, emitir sem risco de numeração indevida, localizar o registro e perceber claramente quando precisa exportar um backup — em desktop, celular, teclado e impressão A4.
