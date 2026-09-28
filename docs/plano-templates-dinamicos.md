# Plano — templates HTML e formulários dinâmicos

## Resumo

Evoluir o gerador para usar templates salvos em `resources/templates/`, formados por um par `<id>.html` + `<id>.json`. Um servidor Node local serve a aplicação e grava esses arquivos com segurança. Os documentos emitidos guardam o snapshot do template, seus valores e o HTML renderizado.

## Fase 1 — Fundação, arquivos e migração

- Adicionar servidor Node limitado a `127.0.0.1`, responsável apenas pelo catálogo de templates; documentos, cadastros e histórico continuam no `localStorage`.
- Criar `resources/templates/` para pares ativos e `resources/templates/_archived/` para pares arquivados.
- Definir JSON v1 com `id`, `name`, `documentKind`, `revision` e campos com `id`, `name`, `tag`, `type`, obrigatoriedade, valor padrão, ajuda, validação e opções de combobox.
- Validar IDs, tags, opções, tamanho e pares HTML/JSON; gravar os dois arquivos atomicamente e impedir traversal de caminhos.
- Sanitizar HTML no navegador e servidor; bloquear conteúdo ativo, eventos, iframes, SVG ativo e recursos externos; renderizar prévias em iframe isolado.
- Migrar o schema local para 11, com backup automático, snapshots de registros existentes e conversão automática dos modelos locais para arquivos de recursos quando o servidor estiver disponível.

## Fase 2 — Construtor e editor

- Disponibilizar catálogo de templates ativos e arquivados, agrupados por recibo, declaração, termo, contrato e documento livre.
- Criar campos de texto, texto longo, número, moeda, data, combobox e checkbox; suportar regras declaradas de CPF/CNPJ, moeda e data.
- Gerar e validar tags únicas no formato `{{NOME_DA_TAG}}`, com edição manual permitida.
- Oferecer editor rich text nativo com toolbar, inserção de tags e alternância para edição do HTML completo.
- Mostrar JSON gerado, prévia A4 com valores padrão, salvamento com revisão esperada e arquivamento/restauração reversíveis.

## Fase 3 — Emissão, histórico e qualidade

- Gerar o formulário de emissão pelo JSON selecionado, com rótulos, ajuda, mensagens de erro e controles acessíveis.
- Resolver tags somente em nós de texto e inserir valores como texto seguro; campos não preenchidos aparecem como marcadores apenas na prévia de rascunho.
- Preservar contadores e prefixos das quatro categorias existentes; documentos livres não recebem número.
- Persistir `templateId`, revisão, definição, HTML sanitizado, valores e HTML renderizado em cada emissão. Impressões, cancelamentos e arquivamentos usam o snapshot congelado.
- Cobrir a API, a migração, editor, combobox, emissão numerada/livre, snapshots, desktop, mobile e impressão com testes automatizados.

## Operação

Execute `npm run dev` para desenvolvimento e `npm run build` seguido de `npm start` para servir a compilação local. A API grava os arquivos de templates e mantém documentos emitidos somente no navegador.
