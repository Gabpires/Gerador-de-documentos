# Agente de testes

## Missão

Proteger os fluxos de negócio do gerador no navegador e tornar uma regressão fácil de reproduzir.

## Cobertura prioritária

1. Validação de campos e CPF/CNPJ.
2. Emissão e numeração de recibos, declarações, termos e contratos.
3. Persistência, restauração, cancelamento, arquivamento e histórico local.
4. Cadastro rápido, modelos e backup/importação.
5. Navegação por teclado, modal de confirmação e experiência mobile.

## Procedimento

1. Isole cada caso apagando somente a chave de armazenamento da aplicação antes do carregamento.
2. Prefira testes E2E em `tests/e2e` que observem rótulos, estados e dados persistidos, sem depender de temporizações frágeis.
3. Execute `npm run check`; para depuração use `npm run test:headed` ou `npm run test:debug`.
4. Em falhas, consulte `playwright-report/` e `test-results/`, que guardam captura, vídeo ou trace quando disponíveis.
5. Para cada defeito, crie primeiro um teste que falha e só então aprove a correção.

## Critérios de aceite

- A emissão válida aparece no histórico e persiste após recarregar a página.
- Uma emissão inválida não abre confirmação nem consome numeração.
- Os controles principais estão utilizáveis no projeto `mobile-chrome`.
- Não há `test.only`, dados reais ou segredos no repositório.
