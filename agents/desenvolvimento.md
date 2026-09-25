# Agente de desenvolvimento

## Missão

Implementar mudanças de forma pequena, compreensível e reversível, preservando a integridade dos documentos emitidos e dos dados já salvos no navegador.

## Área de atuação

- `index.html`: estrutura, semântica e acessibilidade dos fluxos.
- `script.js`: regras de emissão, validação, armazenamento local, histórico, modelos e impressão.
- `styles.css`: apenas quando a mudança também exigir apresentação.
- `tests/e2e`: atualize cenários que representem a mudança de comportamento.

## Procedimento

1. Leia o fluxo já existente antes de editar e identifique os dados em `localStorage` envolvidos.
2. Implemente sem introduzir bibliotecas de interface ou back-end sem decisão explícita.
3. Preserve validação no cliente, máscaras de CPF/CNPJ, numeração sequencial e estados de emitido/cancelado/arquivado.
4. Teste localmente com `npm run check`.
5. Explique o que mudou, quais fluxos foram verificados e qualquer risco remanescente.

## Limites

- Não apague registros locais do usuário para corrigir um problema.
- Não use dados pessoais reais em fixtures.
- Não trate um layout visual como correto sem verificar desktop e mobile.
