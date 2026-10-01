---
name: Paraíba Imóveis
description: Sistema de interface sóbrio e preciso para gestão local de documentos e contratos.
colors:
  primary: "#b70d18"
  primary-dark: "#8f0710"
  primary-soft: "#fff1f2"
  routine-info: "#57c4e5"
  surface: "#fff"
  surface-muted: "#f7f8fa"
  canvas: "#eef1f5"
  control: "#eef1f4"
  control-hover: "#e5e8ec"
  border: "#dde2e8"
  border-strong: "#c9d0d8"
  text: "#20242b"
  muted: "#646d78"
  success: "#237a43"
  success-soft: "#eaf7ee"
  warning: "#8a6116"
  warning-soft: "#fff8e8"
  danger: "#b42318"
  danger-soft: "#fff0f0"
typography:
  display:
    fontFamily: "Inter, 'Segoe UI', Arial, sans-serif"
    fontSize: "clamp(20px, 2vw, 26px)"
    fontWeight: 700
  title:
    fontFamily: "Inter, 'Segoe UI', Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Inter, 'Segoe UI', Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter, 'Segoe UI', Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 700
  metric:
    fontFamily: "Inter, 'Segoe UI', Arial, sans-serif"
    fontSize: "clamp(20px, 1.6vw, 24px)"
    fontWeight: 800
    lineHeight: 1.1
  document:
    fontFamily: "Calibri, 'Carlito', 'Segoe UI', Arial, sans-serif"
    fontSize: "10pt"
    fontWeight: 400
    lineHeight: 1.35
  code:
    fontFamily: "Consolas, 'Courier New', monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  compact: "8px"
  field: "9px"
  button: "10px"
  tab: "10px"
  section: "12px"
  panel: "13px"
  overlay: "16px"
  card: "20px"
  pill: "999px"
spacing:
  tight: "8px"
  field: "13px"
  panel: "18px"
  section: "22px"
interaction:
  minimumTarget: "44px"
  focusRing: "0 0 0 3px rgba(183, 13, 24, 0.16)"
document:
  pageWidth: "210mm"
  pageHeight: "297mm"
  fontFamily: "Calibri, 'Carlito', 'Segoe UI', Arial, sans-serif"
  genericFontFamily: "Arial, sans-serif"
  brand: "#c00000"
  text: "#222"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.button}"
    padding: "12px 14px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.control}"
    textColor: "{colors.text}"
    rounded: "{rounded.button}"
    padding: "12px 14px"
    height: "44px"
  field-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "11px 12px"
    height: "44px"
  tab-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.tab}"
    padding: "9px 15px"
    height: "44px"
---

# Design System: Paraíba Imóveis

## Overview

**Creative North Star: "Gestão de documentos e contratos"**

Este é um sistema de operação para trabalho imobiliário recorrente: sóbrio, preciso e confiável. A interface reduz a burocracia visual para que a atenção do operador permaneça nos dados, na situação do documento e na ação de emissão.

Superfícies claras, bordas calmas e profundidade moderada organizam informação densa sem transformar a aplicação em um painel técnico confuso. O Vermelho Institucional dá autoridade às decisões relevantes; o Azul de Informação atende dados e orientações rotineiras. A forma deve reforçar clareza, nunca competir com o documento em si.

**Key Characteristics:**

- Hierarquia funcional orientada à emissão, consulta e validação.
- Contraste alto, texto legível e estados perceptíveis para leitores de tela e operação assistida.
- Camadas claras, cantos suavemente arredondados e sombras contidas.
- Cor de destaque usada com disciplina, não como decoração.

## Colors

A paleta é predominantemente neutra, com cor aplicada para prioridade, orientação e estado — nunca para enfeite.

### Primary

- **Vermelho Institucional** (`{colors.primary}`): ações primárias, seleção ativa, obrigatoriedade e estados que pedem atenção imediata.
- **Vermelho Profundo** (`{colors.primary-dark}`): resposta de interação para a ação primária.
- **Vermelho Suave** (`{colors.primary-soft}`): contexto de apoio para o acento institucional, sem disputar atenção com o conteúdo.

### Secondary

- **Azul de Informação** (`{colors.routine-info}`): informações rotineiras, orientação contextual e indicadores que não exigem ação imediata. O token `--info` e suas variações de superfície, borda e contraste são canônicos na interface.

### Neutral

- **Papel Operacional** (`{colors.surface}`) e **Superfície Suave** (`{colors.surface-muted}`): áreas de leitura, formulários e cartões.
- **Tela Fria** (`{colors.canvas}`): fundo que separa a área de trabalho das superfícies de conteúdo.
- **Grafite de Leitura** (`{colors.text}`), **Texto de Apoio** (`{colors.muted}`) e os tons de borda: hierarquia textual e delimitação sem ruído.

### Status feedback

- **Sucesso**, **Aviso** e **Perigo** devem comunicar resultado operacional de forma explícita e sempre acompanhada de texto.

**The Accent Has Authority Rule.** O Vermelho Institucional é reservado a ações principais, seleção ativa, obrigatoriedade e alertas. Informação de rotina usa o Azul de Informação; o restante da tela permanece neutro.

## Typography

**Display Font:** Inter (com Segoe UI e Arial como fallback)

**Body Font:** Inter (com Segoe UI e Arial como fallback)

**Character:** Uma sans-serif funcional, compacta e de alta legibilidade sustenta longas rotinas de preenchimento. Pesos fortes distinguem rótulos, números e ações sem exigir tipografia ornamental.

### Hierarchy

- **Display** (`{typography.display.fontWeight}`, `{typography.display.fontSize}`): títulos de áreas e contextos de trabalho.
- **Title** (`{typography.title.fontWeight}`, `{typography.title.fontSize}`): títulos de painéis, modais e seções principais.
- **Body** (`{typography.body.fontSize}`, line-height de `{typography.body.lineHeight}`): instruções, conteúdo de documento e informação operacional.
- **Label** (`{typography.label.fontWeight}`, `{typography.label.fontSize}`): rótulos curtos e inequívocos antes de cada controle.
- **Metric** (`{typography.metric.fontWeight}`, `{typography.metric.fontSize}`): indicadores numéricos de gestão, sempre com algarismos tabulares.
- **Document** (`{typography.document.fontFamily}`): composição da folha A4, com medidas tipográficas em pontos.
- **Code** (`{typography.code.fontFamily}`, `{typography.code.fontSize}`): JSON e HTML editáveis no estúdio de templates.

**The Label-First Rule.** Nenhum campo depende de placeholder, cor ou posição para explicar seu propósito; o rótulo nomeia o dado antes da entrada.

### Exceção documental A4

A folha A4 preserva os tamanhos em `pt/mm` e o texto justificado definidos para recibos, declarações, termos e contratos. Essa exceção é exclusiva da prévia e da impressão: chips, metadados, avisos, rótulos e textos auxiliares da interface operacional usam no mínimo 12px, contraste AA e alinhamento natural de leitura em tela.

## Layout

No desktop, a área de emissão trabalha em duas colunas: formulário de largura controlada e prévia A4 persistente. Cabeçalho e navegação ficam acessíveis enquanto o operador percorre um formulário longo; cartões de conteúdo sustentam as áreas de histórico, cadastros, modelos e segurança.

O ritmo usa pequenos agrupamentos para campos relacionados e espaços maiores entre seções. Em larguras intermediárias, grades e filtros se reduzem progressivamente. A partir de 767px, o formulário passa a uma coluna, a prévia abre em uma camada própria de tela inteira e as ações de emissão permanecem fixas e alcançáveis no rodapé. A impressão remove o chrome da aplicação e preserva a página A4 como superfície documental autônoma.

## Elevation & Depth

O sistema é levemente em camadas, não flutuante. Cartões, painel do formulário e prévia usam sombra difusa para separar contextos sobre uma tela fria; menus e a folha A4 recebem elevação um pouco maior apenas quando precisam se sobrepor ou representar um objeto físico.

### Shadow Vocabulary

- **UI baixa** (`0 12px 32px rgba(22, 29, 37, 0.08)`): cartões e painéis persistentes.
- **Prévia de documento** (`0 16px 38px rgba(27, 34, 43, 0.18)`): folha A4 no espaço de trabalho.
- **Menu contextual** (`0 16px 32px rgba(22, 29, 37, 0.16)`): ação transitória acima da lista.

**The Quiet Layers Rule.** Use profundidade para esclarecer relações de contexto, não para ornamentar cada bloco de conteúdo.

## Shapes

Os cantos são suavemente arredondados e seguem uma escala fechada: compacto (`{rounded.compact}`), campo (`{rounded.field}`), botão/aba (`{rounded.button}`), seção (`{rounded.section}`), painel (`{rounded.panel}`), sobreposição (`{rounded.overlay}`) e cartão (`{rounded.card}`). O raio de pílula (`{rounded.pill}`) é reservado a chips e estados. Bordas cinza claras fazem a maior parte da separação; a forma permanece estável e profissional, sem cápsulas excessivas ou geometrias chamativas.

O foco visível é uma auréola institucional de três pixels. Controles mantêm altura útil de pelo menos 44px, preservando toque e navegação por teclado em todas as superfícies interativas.

## Components

### Buttons

**Character:** ações firmes, legíveis e proporcionais à consequência.

- **Shape:** canto suavemente arredondado (`{rounded.button}`) e altura mínima de `{components.button-primary.height}`.
- **Primary:** fundo e texto definidos por `{components.button-primary.backgroundColor}` e `{components.button-primary.textColor}`; emitir, confirmar e criar ficam nesse nível.
- **Hover / Focus:** o hover escurece a ação principal; foco visível preserva a auréola institucional e não pode depender apenas de mudança de cor.
- **Secondary / Quiet / Danger:** secundário tem fundo cinza claro; quiet usa superfície com borda; danger usa a cor semântica apenas para operações destrutivas.

### Cards / Containers

**Character:** superfícies de trabalho estruturadas, não blocos promocionais.

- **Corner Style:** cartões usam `{rounded.card}`; seções internas usam `{rounded.section}`.
- **Background:** papel operacional sobre tela fria, com borda neutra e sombra baixa.
- **Internal Padding:** espaçamento adaptável no cartão, com ritmo de `{spacing.panel}` nos painéis de formulário.

### Inputs / Fields

**Character:** entradas diretas, com contexto e validação próximos do dado.

- **Style:** superfície clara, borda forte, canto `{rounded.field}` e altura `{components.field-input.height}`.
- **Focus:** borda institucional e auréola visível.
- **Error / Disabled:** erro combina cor, texto associado e `aria-invalid`; estado desabilitado não deve esconder a razão nem bloquear a leitura pelo leitor de tela.

### Navigation

**Character:** área de trabalho persistente, com seleção inequívoca.

- **Style:** barra de abas clara e levemente translúcida; aba ativa segue `{components.tab-active}`.
- **Mobile treatment:** a navegação pode rolar horizontalmente; o menu compacto preserva acesso às áreas sem reduzir os controles abaixo da altura útil.

### Document Preview

**Character:** uma folha documental real dentro de um ambiente de operação.

- **Desktop:** a prévia A4 se mantém próxima ao formulário para validação contínua.
- **Mobile and print:** no celular, abre como camada própria; na impressão, torna-se a única superfície visível.

## CSS Architecture

`DESIGN.md` é a fonte de verdade do sistema visual; `src/styles/styles.css` é sua implementação canônica e `.impeccable/design.json` é o sidecar estruturado derivado. O CSS mantém um único bloco `:root` e segue esta ordem conceitual:

1. **Tokens e base:** cores, tipografia global, raios, sombras, espaçamento e tamanho mínimo de controle.
2. **Interface operacional:** emissão, formulários, navegação, modais e feedback.
3. **Gestão e administração:** Gestão, histórico, clientes, dossiês, modelos, backup e governança.
4. **Prévia documental A4:** composição física, tipografia e cores documentais isoladas por tokens `--doc-*`.
5. **Impressão A4:** únicas regras autorizadas a usar `!important`, para neutralizar o chrome da aplicação e fixar a folha.
6. **Responsividade:** adaptações progressivas de tablet, celular, safe areas e movimento reduzido.

As medidas de `210mm × 297mm`, os tamanhos em `pt/mm`, a tipografia documental e o texto justificado são exceções deliberadas da folha. Não devem vazar para a interface operacional.

### Build baseline

Antes da otimização de carregamento, a produção entregava **257,13 kB / 132,10 kB gzip** de HTML e **209,16 kB / 62,54 kB gzip** de JavaScript inicial. O baseline atual entrega **100,88 kB / 13,59 kB gzip** de HTML e **181,96 kB / 54,08 kB gzip** de JavaScript inicial; o editor de templates ocupa um chunk sob demanda de **28,50 kB / 9,76 kB gzip**. O logo de **117,26 kB** agora é um recurso PNG externo, com dimensões declaradas e cache independente. A folha de estilos fica em **81,22 kB / 15,12 kB gzip** após a consolidação dos tokens de tipografia, forma e movimento.

## Do's and Don'ts

### Do:

- **Do** mantenha o Vermelho Institucional para ação principal, seleção ativa, obrigatoriedade e alerta.
- **Do** use o Azul de Informação para mensagens rotineiras e orientação contextual, sempre com a variação de contraste apropriada.
- **Do** associe rótulos, ajuda, erro e foco ao campo correspondente; o estado deve ser entendido sem depender apenas de cor.
- **Do** preserve o fluxo formulário → prévia A4 → confirmação → emissão, com ações críticas sempre alcançáveis.
- **Do** adapte a estrutura para uma coluna e uma prévia dedicada no celular, mantendo controles de toque e leitura confortáveis.
- **Do** use movimento curto apenas para continuidade de contexto e feedback; com `prefers-reduced-motion`, remova deslocamentos espaciais e preserve mudanças de opacidade, cor e estado em 120ms.

### Don't:

- **Don't** usar o vermelho como preenchimento decorativo ou sinalizar prioridades concorrentes na mesma tela.
- **Don't** adicionar ornamentos, gradientes vistosos, sombras pesadas ou superfícies que façam o produto parecer promocional.
- **Don't** criar aparência de painel técnico confuso com cartões redundantes, filtros sem agrupamento ou informação operacional sem hierarquia.
- **Don't** reduzir contraste, tamanho de toque, foco visível ou mensagens de erro por razões estéticas.
