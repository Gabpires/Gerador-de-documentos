# Equipe de agentes do projeto

Este repositório é um front-end estático para gerar recibos, declarações, termos e contratos da Paraíba Imóveis. A fonte de verdade é o navegador: os registros são mantidos em `localStorage` e a impressão/PDF é acionada pelo navegador.

## Papéis disponíveis

| Papel | Instruções | Quando usar |
| --- | --- | --- |
| Desenvolvimento | `agents/desenvolvimento.md` | Implementar, corrigir ou refatorar comportamento. |
| Testes | `agents/testes.md` | Criar, revisar ou executar testes e investigar regressões. |
| Design | `agents/design.md` | Ajustar interface, responsividade, acessibilidade e impressão. |

Antes de atuar em um papel, leia o arquivo correspondente integralmente. Para uma tarefa que abranja mais de um papel, a ordem padrão é desenvolvimento, design e testes.

## Regras do repositório

- Preserve compatibilidade com navegador moderno e mantenha a aplicação sem dependência de back-end.
- Não altere a chave `paraibaImoveisRecibosV3`, o esquema de dados ou a numeração de documentos sem migração e testes explícitos.
- Nunca coloque dados reais de clientes nos testes, exemplos, capturas ou commits.
- Após qualquer mudança funcional, execute `npm run check`.
- Ao alterar HTML, CSS ou o fluxo de emissão, execute também o projeto `mobile-chrome` com `npx playwright test --project=mobile-chrome`.

## Comandos essenciais

```powershell
npm install
npx playwright install chromium
npm run dev
npm run check
```
