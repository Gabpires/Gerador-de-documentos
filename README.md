# Gerador de Documentos — Paraíba Imóveis

Aplicação local para criar recibos, declarações, termos, contratos e documentos livres. Os registros ficam no armazenamento do navegador; os templates HTML ficam no projeto e são atendidos por um servidor local, sem sincronização externa.

## Primeiro uso

Pré-requisito: Node.js 20 ou superior.

```powershell
npm install
npx playwright install chromium
npm run dev
```

Abra o endereço indicado pelo Vite (normalmente `http://127.0.0.1:5173`). Para encerrar o servidor, use `Ctrl+C` no terminal.

## Templates dinâmicos

O menu **Modelos** inclui o construtor de formulários e o editor visual/HTML. Cada template salvo forma um par de arquivos em `resources/templates/`:

```text
resources/templates/
  contrato-locacao.json  # campos, tags, categoria e revisão
  contrato-locacao.html  # documento HTML com tags como {{LOCATARIO}}
  _archived/             # pares arquivados, que podem ser restaurados
```

O JSON aceita campos `text`, `textarea`, `number`, `currency`, `date`, `select` e `checkbox`; campos `select` declaram as opções. Uma tag deve ser única e seguir o formato `{{NOME_DA_TAG}}`.

O servidor escuta apenas em `127.0.0.1` e rejeita scripts, eventos HTML, iframes, SVG ativo e recursos externos. A prévia é isolada. Toda emissão dinâmica guarda uma cópia do HTML, do JSON e dos valores utilizados no `localStorage`, portanto futuras edições do template não alteram o documento emitido.

## Testes durante o desenvolvimento

```powershell
npm run check                 # suíte completa em desktop e celular
npm run test:api              # validações do servidor de templates
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
