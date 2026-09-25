# Gerador de Documentos — Paraíba Imóveis

Aplicação local para criar recibos, declarações, termos e contratos. Os dados ficam somente no armazenamento do navegador; use o fluxo de backup da própria aplicação antes de operar com dados reais.

## Primeiro uso

Pré-requisito: Node.js 20 ou superior.

```powershell
npm install
npx playwright install chromium
npm run dev
```

Abra o endereço indicado pelo Vite (normalmente `http://127.0.0.1:5173`). Para encerrar o servidor, use `Ctrl+C` no terminal.

## Testes durante o desenvolvimento

```powershell
npm run check                 # suíte completa em desktop e celular
npm run test:headed           # acompanha o navegador
npm run test:debug            # pausa para depurar um cenário
npm run test:ui               # abre a interface do Playwright
npm run test:report           # abre o último relatório HTML
```

Os testes iniciam um servidor isolado na porta 4173 automaticamente. Se houver falha, os artefatos são gravados em `test-results/` e o relatório em `playwright-report/`.

## Papéis dos agentes

As instruções da equipe ficam em [`AGENTS.md`](AGENTS.md):

- Desenvolvimento: implementa mudanças com segurança para o armazenamento local.
- Testes: amplia e executa a cobertura E2E.
- Design: cuida de responsividade, acessibilidade e impressão.

Ao delegar uma tarefa a um agente, indique o papel e peça a leitura de `agents/<papel>.md` antes do trabalho.

## Estrutura

```text
src/
├── index.html             interface e semântica
├── styles/styles.css      estilos, responsividade e impressão
└── scripts/script.js      regras, preview e armazenamento local
tests/e2e/                 testes de ponta a ponta no navegador
agents/                    instruções especializadas da equipe
playwright.config.js       servidor e navegadores de teste
.vscode/tasks.json         atalhos para VS Code
```

## Regras de segurança

- Não versione backups, dados de clientes ou arquivos `.env`.
- Use dados fictícios nos testes.
- Não mude a chave de dados ou a numeração dos documentos sem migração testada.
