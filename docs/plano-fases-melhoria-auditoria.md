# Plano por fases para melhoria da auditoria técnica

**Status:** Fases 0 e 1 concluídas em 29/09/2026; Fase 2 pronta para execução  
**Baseline:** auditoria técnica com 13/20, 0 P0, 2 P1, 4 P2 e 0 P3  
**Meta:** atingir pelo menos 18/20, sem achados P0 ou P1  
**Escopo:** desempenho da prévia A4, acessibilidade, responsividade, alvos de toque, sistema de tokens, integridade do CSS e cobertura automatizada  
**Documentos relacionados:** [plano-melhorias-ux.md](plano-melhorias-ux.md) e [plano-templates-dinamicos.md](plano-templates-dinamicos.md)

## 1. Objetivo

Aplicar as correções levantadas pela auditoria sem alterar o conteúdo jurídico, o modelo de armazenamento local, a numeração dos documentos ou a fidelidade da impressão A4.

O resultado esperado é uma aplicação mais responsiva durante a digitação, semanticamente consistente para tecnologias assistivas, segura em telas estreitas e sustentada por um sistema visual mais previsível.

## 2. Restrições obrigatórias

- Não alterar a chave `paraibaImoveisRecibosV3`.
- Não alterar esquema, migração ou numeração sem proposta e testes específicos.
- Não adicionar back-end para registros operacionais.
- Não introduzir biblioteca de interface sem decisão explícita.
- Não modificar redação jurídica sem validação do responsável.
- Não usar dados pessoais reais em testes, fixtures ou capturas.
- Preservar snapshots e documentos já emitidos.
- Tratar desktop, mobile e impressão A4 como superfícies distintas.
- Implementar mudanças pequenas, compreensíveis e reversíveis.

## 3. Indicadores de baseline

| Indicador | Estado inicial |
| --- | ---: |
| Nota da auditoria | 13/20 |
| Achados P0 | 0 |
| Achados P1 | 2 |
| Achados P2 | 4 |
| Testes automatizados | 93 aprovados |
| Atualização longa da prévia, CPU 4× | 126 ms |
| Dez entradas rápidas, CPU 4× | 1,03 s |
| Tamanho do build | aproximadamente 209 KB gzip |
| Menor largura verificada | 320 px |

## 4. Ordem das fases

| Fase | Responsabilidade principal | Resultado |
| --- | --- | --- |
| 0 | Testes e baseline | Problemas reproduzíveis e métricas registradas |
| 1 | Desenvolvimento | Paginação sem bloqueio durante a digitação |
| 2 | Desenvolvimento e acessibilidade | Navegação e relações semânticas coerentes |
| 3 | Design responsivo | Reflow correto e alvos de toque de 44 px |
| 4 | Design e desenvolvimento | Tokens consolidados e CSS previsível |
| 5 | Testes e polish | Verificação integrada em desktop, mobile e impressão |
| 6 | Auditoria | Nova nota e relatório comparativo |

## 5. Fase 0 — Baseline e testes de regressão

### Objetivo

Transformar cada achado confirmado em um cenário reproduzível antes de alterar o comportamento.

### Atividades

1. Registrar a nota, as severidades e as medições atuais neste documento.
2. Confirmar que `npm run check` parte de uma suíte integralmente aprovada.
3. Criar testes que reproduzam:
   - excesso de repaginações após entradas rápidas;
   - perda de texto sob o espaçamento da WCAG 1.4.12;
   - inconsistência entre os grupos de navegação e o padrão ARIA de abas;
   - elementos `label` sem controle associado;
   - alvos interativos menores que 44 × 44 px.
4. Inventariar as exceções legítimas da folha A4:
   - dimensões em `mm` e `pt`;
   - texto documental justificado;
   - tipografia documental específica;
   - recorte necessário para impressão.
5. Usar as instruções de papel em:
   - `.codex/agents/desenvolvimento.md`;
   - `.codex/agents/design.md`;
   - `.codex/agents/testes.md`.

### Critérios de aceite

- Os 93 testes existentes continuam aprovados.
- Cada defeito prioritário possui uma reprodução determinística.
- Os testes não dependem de esperas arbitrárias ou dados reais.
- Nenhum arquivo funcional é alterado nesta fase.

### Gate

```powershell
npm run check
```

### Registro de execução da Fase 0

O gate anterior à inclusão dos cenários foi executado em 29/09/2026 e confirmou a baseline integralmente aprovada: 5 testes de API e 88 execuções E2E, totalizando os 93 testes existentes. Os dados usados pelos novos cenários são inteiramente fictícios.

Após a inclusão, `npm run check` concluiu com 5 testes de API e 98 execuções E2E aprovadas (103 no total, sem falhas). A passagem isolada `npx playwright test --project=mobile-chrome` também terminou com 49 testes aprovados.

Os testes de caracterização registram o comportamento problemático atual. Em cada fase corretiva, a respectiva asserção deve ser invertida para expressar o comportamento desejado, sem remover a cobertura.

| Achado reproduzido | Evidência inicial determinística | Cenário automatizado |
| --- | --- | --- |
| Repaginações excessivas | 10 eventos `input` disparados na mesma tarefa produzem 10 substituições em `#documentPagesPreview`; a sincronização usa dois `requestAnimationFrame`, sem espera temporal arbitrária | `reproduz uma repaginação para cada entrada rápida no mesmo frame` |
| Espaçamento WCAG 1.4.12 | Com `line-height: 1.5`, `letter-spacing: 0.12em`, `word-spacing: 0.16em` e margem de parágrafo de `2em`, o título de uma linha da Gestão tem `scrollWidth` maior que `clientWidth` e permanece com `overflow: hidden`, elipse e linha única | `reproduz perda de texto com o espaçamento da WCAG 1.4.12` |
| Grupos de navegação versus abas ARIA | `ArrowRight` parte da única aba do `tablist` “Emitir” e move o foco para uma aba pertencente ao `tablist` “Acompanhar” | `reproduz navegação por setas atravessando grupos ARIA de abas` |
| Labels órfãos | Foram encontrados exatamente `Valor por extenso`, `Rodapé institucional` e `Biblioteca de cláusulas` sem `for` válido nem controle rotulável descendente | `reproduz labels sem controle associado` |
| Alvos menores que 44 × 44 px | Os botões de mover campo e de Negrito, Itálico e Sublinhado têm 44 px de altura, mas largura entre aproximadamente 24 e 31 px | `reproduz controles de formatação e reordenação com menos de 44 px` |

O detector técnico Impeccable também foi executado sobre `src`. Ele registrou 21 padrões e 281 avisos consultivos; esse resultado não recalcula a nota 13/20 nem a distribuição de severidades. Sinais relativos a medidas, tipografia, justificação e recorte dentro da folha A4 foram classificados no inventário abaixo, em vez de tratados automaticamente como defeitos da interface operacional.

### Inventário de exceções legítimas da folha A4

| Exceção | Seletores e valores atuais | Limite da exceção | Motivo para preservar |
| --- | --- | --- | --- |
| Geometria física em `mm` | `#receipt.receipt`, `.document-pages-preview`, `.document-pagination-measure`, `.document-preview` e `body.printing-generic .document-preview-page`; folhas de 210 × 297 mm, margens, cabeçalhos, rodapés e assinaturas também medidos em `mm` | Somente a prévia documental, o contêiner oculto de medição e `@media print` | Mantém a correspondência com o papel A4 e a posição física dos elementos no PDF |
| Tipografia e espaçamento em `pt` | `#receipt` usa Calibri/Carlito e tamanhos/entrelinhas em `pt`; `.document-preview` usa Arial e tamanhos documentais em `pt` | Não se aplica a formulários, navegação, avisos, metadados ou demais textos da interface | Preserva a composição calibrada do recibo e a paginação dos demais documentos |
| Texto documental justificado | `#receipt .body-text`, `#receipt .disclaimer`, `.document-content` e `.document-content .contract-party` | Apenas a prosa que integra o documento emitido; textos operacionais continuam com alinhamento natural de leitura | Mantém a apresentação formal e a fidelidade visual do documento |
| Recorte da folha | `overflow: hidden` em `#receipt.receipt`, `.document-preview` e nas páginas de impressão com altura fixa de 297 mm | Não pode ser aplicado a painéis, menus, mensagens, linhas de Gestão ou conteúdo de tela | Impede sangria entre folhas; a paginação deve mover o conteúdo excedente para a folha seguinte antes do recorte |
| Posicionamento e quebras de impressão | Rodapés e numeração absolutos, `break-after: page`, `page-break-after` e proteção de assinaturas com `break-inside: avoid` | Exclusivo das páginas geradas e das regras de impressão | Garante uma folha por página, rodapé estável e blocos de assinatura não fragmentados |

## 6. Fase 1 — Otimização da prévia e da paginação A4

### Objetivo

Evitar a reconstrução completa das páginas A4 em cada evento de digitação, preservando a paginação definitiva antes de revisar, emitir ou imprimir.

### Arquivos prováveis

- `src/scripts/script.js`
- `tests/e2e/app.spec.js`

### Implementação

1. Criar um agendador central de paginação:
   - manter apenas uma `requestAnimationFrame` pendente;
   - aplicar debounce curto para entradas de texto;
   - cancelar trabalho obsoleto quando houver conteúdo mais recente;
   - impedir que uma execução antiga substitua a prévia atual.
2. Separar atualização de conteúdo e paginação:
   - atualizar os dados básicos da prévia imediatamente;
   - reconstruir páginas após uma pequena pausa;
   - não paginar continuamente quando a prévia mobile estiver fechada.
3. Criar uma operação de finalização obrigatória:
   - executar a paginação pendente antes da revisão;
   - executar antes da emissão;
   - executar antes da impressão ou geração de PDF.
4. Reduzir trabalho de layout:
   - reutilizar o contêiner de medição;
   - agrupar escritas no DOM antes de leituras de layout;
   - aplicar `replaceChildren` apenas ao final;
   - evitar recalcular escala quando a área disponível não mudou.
5. Comunicar processamento sem ruído:
   - usar `aria-busy` no contêiner da prévia;
   - não disparar anúncios de leitor de tela a cada tecla.

### Testes

- Dez entradas rápidas devem resultar em no máximo uma ou duas atualizações finais da paginação.
- Revisão e impressão devem aguardar qualquer paginação pendente.
- Documentos multipágina devem manter ordem, conteúdo, assinaturas e rodapé.
- A prévia mobile deve ser recalculada ao abrir, caso tenha ficado pendente.
- Snapshots emitidos devem continuar imutáveis.

### Metas de desempenho

| Cenário | Meta em CPU 4× |
| --- | ---: |
| Uma atualização de documento longo | menos de 200 ms |
| Dez entradas rápidas | estabilização em menos de 300 ms |
| Bloqueio contínuo próximo de 1 s | nenhum |

### Gate

```powershell
npm run check
npm run build
```

### Registro de execução da Fase 1

A paginação passou a ser coordenada por um único agendador versionado. Entradas de texto usam debounce de 50 ms, mantêm no máximo um `requestAnimationFrame` pendente e invalidam versões antigas antes da substituição atômica das páginas. A atualização estrutural da prévia continua imediata; no mobile, a paginação fica pendente enquanto a prévia está fechada e é finalizada ao abri-la.

A operação de finalização cancela temporizadores e quadros pendentes e conclui a versão mais recente antes da revisão, da emissão e da impressão. O contêiner oculto de medição é reutilizado, a busca dos pontos de quebra passou a estimar a capacidade pela altura disponível com poucas leituras incrementais, e a escala da prévia só é recalculada quando área, tipo, quantidade de páginas ou barra móvel mudam. O contêiner publicado expõe `aria-busy`; a mensagem com `role="status"` só muda quando o resultado da paginação muda.

Os testes automatizados confirmam:

- consolidação de dez entradas rápidas em no máximo duas paginações, com estabilização inferior a 300 ms em CPU 4×;
- finalização síncrona antes da revisão e da impressão;
- suspensão da paginação mobile e recálculo único ao abrir a prévia;
- preservação da ordem, do conteúdo, das assinaturas e de um rodapé por página em documentos longos;
- preservação dos snapshots emitidos pela cobertura de regressão existente;
- mediana inferior a 200 ms para três atualizações de contrato multipágina em CPU 4×, sem amostra igual ou superior a 300 ms.

Os benchmarks de CPU 4× foram repetidos cinco vezes de forma isolada no projeto Chromium, sempre aprovados. O gate final `npm run check` terminou com 5 testes de API e 106 execuções E2E aprovadas — 53 em `chromium` e 53 em `mobile-chrome`, 111 verificações no total. `npm run build` também foi aprovado com Vite 7.3.6; os artefatos principais ficaram em 257,28 kB para o HTML, 73,45 kB para o CSS e 209,66 kB para o JavaScript antes de gzip.

## 7. Fase 2 — Semântica e acessibilidade

### Objetivo

Fazer a estrutura anunciada por tecnologias assistivas corresponder ao comportamento real da interface.

### Arquivos prováveis

- `src/index.html`
- `src/scripts/script.js`
- `src/scripts/management.js`
- `tests/e2e/app.spec.js`

### Navegação principal

Os destinos representam áreas diferentes da aplicação, e não abas de um único painel visual. A implementação deve:

- preservar o elemento `nav` e seu nome acessível;
- manter os grupos Emitir, Acompanhar e Administrar;
- manter botões expansíveis com `aria-expanded` e `aria-controls`;
- substituir `tablist`, `tab` e `tabpanel` por navegação agrupada comum;
- indicar o destino atual com `aria-current="page"`;
- preservar Tab, Shift+Tab, Enter e Escape;
- remover a navegação por setas que atravessa grupos semanticamente separados;
- manter os oito destinos disponíveis em desktop e mobile.

### Rótulos e agrupamentos

1. **Valor por extenso**
   - substituir o `label` isolado por texto identificador;
   - usar `output` associado ao campo de valor;
   - preservar atualização com `aria-live="polite"`.
2. **Rodapé institucional**
   - usar um único label clicável envolvendo checkbox e descrição;
   - remover o label sem controle associado.
3. **Biblioteca de cláusulas**
   - usar `fieldset` e `legend`;
   - manter cada checkbox com rótulo próprio.

### Automação recomendada

- Adicionar `@axe-core/playwright` apenas como dependência de desenvolvimento, se aprovado.
- Executar a análise nas superfícies principais e nos modais abertos.
- Manter verificações explícitas de foco, Escape e retorno ao acionador.

### Critérios de aceite

- Nenhum `label` órfão.
- Nenhum ID duplicado ou referência ARIA inexistente.
- A árvore acessível anuncia navegação e grupos coerentes.
- Nenhuma violação de impacto crítico ou sério no Axe.
- Atalhos Alt+N, Alt+H e Alt+P continuam seguros durante a digitação.
- Modais mantêm foco contido e devolvem o foco corretamente.

### Gate

```powershell
npm run check
npx playwright test --project=mobile-chrome
```

## 8. Fase 3 — Reflow, texto ampliado e toque

### Objetivo

Garantir que a interface permaneça completa em telas estreitas e sob preferências de espaçamento, sem alterar a composição A4.

### Arquivos prováveis

- `src/styles/styles.css`
- `src/index.html`
- `tests/e2e/app.spec.js`

### Implementação

1. Corrigir as linhas de Gestão:
   - permitir quebra do título no mobile;
   - remover clipping e elipse quando escondem informação operacional;
   - empilhar título e valor quando não houver largura suficiente.
2. Padronizar alvos de interação:
   - campos e filtros com altura mínima de 44 px;
   - botões de reordenação e formatação com no mínimo 44 × 44 px;
   - área clicável de checkboxes fornecida pelo label, sem ampliar necessariamente o desenho nativo.
3. Proteger as ações fixas no mobile:
   - manter o último controle acima da barra de ações;
   - preservar `safe-area-inset-bottom`;
   - evitar salto de layout ao abrir a prévia.
4. Validar os seguintes tamanhos:
   - 1280 px;
   - 900 px;
   - 767 px;
   - 380 px;
   - 320 px.
5. Aplicar o teste de espaçamento da WCAG 1.4.12:
   - `line-height: 1.5`;
   - `letter-spacing: 0.12em`;
   - `word-spacing: 0.16em`;
   - margem de parágrafo ampliada.

### Critérios de aceite

- Nenhuma rolagem horizontal da página.
- Nenhum texto necessário perdido por clipping ou elipse.
- Controles personalizados com área efetiva mínima de 44 × 44 px.
- Barra móvel não cobre campos, erros ou ações.
- Prévia e impressão continuam nas dimensões A4 corretas.

### Gate

```powershell
npm run check
npx playwright test --project=mobile-chrome
npm run test:visual
```

## 9. Fase 4 — Tokens e arquitetura CSS

### Objetivo

Reduzir conflitos de cascata e alinhar a implementação ao sistema documentado em `DESIGN.md`.

### Arquivos prováveis

- `src/styles/styles.css`
- `DESIGN.md`
- `.impeccable/design.json`

### Implementação

1. Consolidar um único bloco de tokens:
   - vermelho institucional;
   - azul de informação;
   - superfícies, bordas e textos;
   - sucesso, aviso e perigo;
   - raios, sombras e espaçamentos;
   - tamanho mínimo de controle.
2. Separar conceitualmente as regras em:
   - tokens e base;
   - interface operacional;
   - Gestão e administração;
   - prévia documental;
   - impressão;
   - responsividade.
3. Remover duplicações:
   - blocos `:root` concorrentes;
   - declarações repetidas de navegação;
   - correções tardias que apenas anulam estilos anteriores;
   - `!important` fora dos casos necessários para impressão.
4. Trocar cores literais da interface por tokens.
5. Preservar as exceções documentais:
   - medidas fixas A4;
   - texto justificado na folha;
   - tipografia documental;
   - cores específicas do documento, preferencialmente como tokens documentais.
6. Após estabilizar o CSS:
   - executar `$impeccable document`;
   - atualizar `.impeccable/design.json`;
   - confirmar que `DESIGN.md` continua sendo a fonte de verdade.

### Critérios de aceite

- Um único bloco principal de tokens.
- Nenhuma cor literal nas regras de tela, exceto na definição de tokens.
- Exceções A4 isoladas e documentadas.
- Nenhuma alteração visual acidental em formulário, Gestão ou impressão.
- Build igual ou menor que o baseline, salvo justificativa registrada.

### Gate

```powershell
npm run build
npm run check
npx playwright test --project=mobile-chrome
npm run test:visual
```

## 10. Fase 5 — Integração e polish

### Objetivo

Executar uma verificação visual e funcional limitada antes da nova auditoria.

### Rodada visual principal

Inspecionar em uma única rodada:

- desktop em 1280 × 844;
- tablet em 900 × 900;
- mobile em 380 × 844;
- reflow em 320 × 844;
- Gestão vazia, com rascunho e com pendências;
- recibo, declaração, termo e contrato;
- documento longo multipágina;
- Histórico, Dossiês, Modelos e Backup;
- modais de revisão, erro, cancelamento e bloqueio;
- impressão A4 simples e multipágina.

Os problemas encontrados nessa rodada devem ser corrigidos em um único lote. Depois disso, realizar apenas uma rodada adicional de confirmação.

### Verificações finais

- Nenhum erro inesperado no console.
- Nenhuma requisição externa não autorizada.
- CSP presente no servidor de produção.
- Templates carregando e salvando normalmente.
- LocalStorage, histórico, snapshots e contadores preservados.
- Impressão disponível após build de produção.
- Nenhum `test.only`, dado real ou segredo no repositório.

### Gate

```powershell
npm run check
npx playwright test --project=mobile-chrome
npm run test:visual
npm run build
npm start
```

### Comando Impeccable

```text
$impeccable polish
```

## 11. Fase 6 — Nova auditoria

### Procedimento

1. Executar o detector técnico:

   ```powershell
   C:\Users\gabri\.agents\skills\impeccable\scripts\impeccable.cmd detect src
   ```

2. Repetir o benchmark de paginação no build de produção.
3. Executar a análise de acessibilidade automatizada.
4. Repetir os testes de reflow e espaçamento da WCAG.
5. Executar uma nova auditoria Impeccable.
6. Comparar o resultado com o baseline deste documento.

### Metas finais

| Indicador | Meta |
| --- | ---: |
| Nota geral | pelo menos 18/20 |
| Achados P0 | 0 |
| Achados P1 | 0 |
| Achados P2 | no máximo 2 |
| Testes automatizados | 100% aprovados |
| Violações Axe críticas ou sérias | 0 |
| Rolagem horizontal | 0 |
| Labels órfãos | 0 |
| Alvos personalizados menores que 44 px | 0 |
| Dez entradas rápidas em CPU 4× | menos de 300 ms |
| Regressões de impressão A4 | 0 |

## 12. Estratégia de commits

1. `test: registrar baseline da auditoria`
2. `perf: agendar e consolidar paginação da prévia`
3. `a11y: corrigir navegação e relações semânticas`
4. `ui: ampliar alvos e corrigir reflow`
5. `style: consolidar tokens e regras de tela`
6. `test: ampliar cobertura acessível e responsiva`
7. `docs: sincronizar sistema de design`
8. `polish: corrigir achados finais da verificação`

Cada commit deve ser pequeno, reversível e acompanhado pelos testes relacionados ao comportamento alterado.

## 13. Definição de pronto

O plano estará concluído quando:

- a digitação em documentos longos não provocar bloqueios perceptíveis;
- revisão, emissão e impressão sempre usarem paginação finalizada;
- a navegação possuir semântica coerente com seu comportamento;
- textos e controles continuarem completos em 320 px e com espaçamento ampliado;
- todos os alvos personalizados respeitarem a área útil mínima;
- o CSS possuir uma fonte clara de tokens e exceções documentais isoladas;
- armazenamento, histórico, snapshots, numeração e conteúdo jurídico permanecerem inalterados;
- todos os testes e verificações visuais estiverem aprovados;
- a nova auditoria atingir pelo menos 18/20 sem P0 ou P1.
