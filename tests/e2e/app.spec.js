import { expect, test } from '@playwright/test';

const storageKey = 'paraibaImoveisRecibosV3';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => localStorage.removeItem(key), storageKey);
  await page.goto('/');
});

async function preencherReciboValido(page) {
  await page.getByRole('tab', { name: /Novo documento/i }).click();
  await page.locator('#tenant').fill('Maria da Silva');
  await page.locator('#cpf').fill('52998224725');
  await page.locator('#property').fill('Rua das Acácias, 100, Centro');
  await page.locator('#amount').fill('1500,50');
  await page.locator('#reference').fill('2026-09');
  await page.locator('#receiptDate').fill('2026-09-25');
}

test('carrega o gerador com a gestão como centro de navegação', async ({ page }) => {
  await expect(page).toHaveTitle(/Gerador de Recibos de Aluguel/i);
  await expect(page.getByRole('heading', { name: 'Gerador de documentos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gestão documental' })).toBeVisible();

  await page.getByRole('tab', { name: /Dossiês/i }).click();
  await expect(page.getByRole('heading', { name: /Dossiês por imóvel/i })).toBeVisible();

  await page.getByRole('tab', { name: /Novo documento/i }).click();
  await expect(page.locator('#view-new')).toBeVisible();

  await page.getByRole('tab', { name: /Histórico/i }).click();
  await expect(page.locator('#view-history')).toBeVisible();

  await page.getByRole('tab', { name: /Cadastros/i }).click();
  await expect(page.locator('#view-contacts')).toBeVisible();

  await page.getByRole('tab', { name: /Modelos/i }).click();
  await expect(page.locator('#view-templates')).toBeVisible();

  await page.getByRole('tab', { name: /Backup e segurança/i }).click();
  await expect(page.locator('#view-safety')).toBeVisible();
});

test('valida os dados obrigatórios antes de emitir um recibo', async ({ page }) => {
  await page.getByRole('tab', { name: /Novo documento/i }).click();
  await page.locator('#issueBtn').click();

  await expect(page.locator('#amountError')).toContainText('Informe um valor');
  await expect(page.locator('#tenantError')).toContainText('Informe o nome');
  await expect(page.locator('#cpfError')).toContainText('Informe o CPF ou CNPJ');
  await expect(page.locator('#propertyError')).toContainText('Informe a localização');
});

test('emite um recibo válido e o mantém no histórico local', async ({ page }) => {
  await preencherReciboValido(page);
  await expect(page.locator('#amountWords')).toContainText('mil e quinhentos reais');

  await page.locator('#issueBtn').click();
  await expect(page.locator('#confirmModal')).toBeVisible();
  await expect(page.locator('#confirmTenant')).toContainText('Maria da Silva');
  await page.locator('#confirmIssueBtn').click();

  await expect(page.locator('#documentStatus')).toContainText('emitido e registrado');
  await expect(page.locator('#printBtn')).toBeEnabled();

  await page.getByRole('tab', { name: /Histórico/i }).click();
  await expect(page.locator('#historyList')).toContainText('Maria da Silva');

  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.history).toHaveLength(1);
  expect(persisted.history[0]).toMatchObject({ tenant: 'Maria da Silva', status: 'issued' });
});

test('não aceita CPF inválido', async ({ page }) => {
  await preencherReciboValido(page);
  await page.locator('#cpf').fill('11111111111');
  await page.locator('#issueBtn').click();

  await expect(page.locator('#cpfError')).toContainText('não é válido');
  await expect(page.locator('#confirmModal')).toBeHidden();
});

test('emite uma declaração e preserva sua numeração', async ({ page }) => {
  await page.getByRole('tab', { name: /Novo documento/i }).click();
  await page.getByRole('button', { name: 'Declaração', exact: true }).click();
  await page.locator('#docTitle').fill('DECLARAÇÃO DE RESIDÊNCIA');
  await page.locator('#docDate').fill('2026-09-25');
  await page.locator('#docCity').fill('Araçariguama/SP');
  await page.locator('#docDeclarant').fill('Maria da Silva');
  await page.locator('#docDeclarantDocument').fill('52998224725');
  await page.locator('#docSubject').fill('Comprovação de residência');
  await page.locator('#docBody').fill('Declaramos que Maria da Silva reside no endereço informado nesta declaração.');

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#genericIssueBtn').click();

  await expect(page.locator('#genericStatus')).toContainText('emitido');
  await expect(page.locator('#genericPrintBtn')).toBeEnabled();
  await expect(page.locator('#dpNumber')).toContainText('DECL-001/2026');
});

test('cadastra clientes PF e PJ e aplica a qualificação completa no contrato', async ({ page }) => {
  await page.getByRole('tab', { name: /Clientes/i }).click();
  await page.locator('#clientName').fill('Marina de Exemplo');
  await page.locator('#clientDocument').fill('52998224725');
  await page.locator('#clientGender').selectOption('female');
  await page.locator('#clientNationality').fill('brasileira');
  await page.locator('#clientProfession').fill('advogada');
  await page.locator('#clientMaritalStatus').fill('casada');
  await page.locator('#clientBirthDate').fill('1988-04-12');
  await page.locator('#clientRg').fill('42.123.456-7');
  await page.locator('#clientRgIssuer').fill('SSP/SP');
  await page.locator('#clientAddress').fill('Rua Fictícia, 100, Centro, Cidade Exemplo/SP, CEP 01000-000');
  await page.locator('#clientForm').evaluate(form => form.requestSubmit());
  await expect(page.locator('#clientsList')).toContainText('Marina de Exemplo');

  let saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  const representativeId = saved.clients[0].id;

  await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  await page.locator('#clientType').selectOption('company');
  await expect(page.locator('#clientNameLabel')).toContainText('Razão social');
  await page.locator('#clientName').fill('Controle Exemplo Sistemas Ltda.');
  await page.locator('#clientDocument').fill('12345678000195');
  await page.locator('#clientAddress').fill('Avenida Demonstração, 725, São Paulo/SP, CEP 02000-000');
  await page.locator('#clientCompanyRegistration').fill('registrada na Junta Comercial sob NIRE de demonstração');
  await page.locator('#clientRepresentativeId').selectOption(representativeId);
  await page.locator('#clientRepresentativeRole').fill('sócia administradora');
  await page.locator('#clientForm').evaluate(form => form.requestSubmit());
  await expect(page.locator('#clientsList')).toContainText('Controle Exemplo Sistemas Ltda.');

  saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(saved.meta.schemaVersion).toBe(10);
  expect(saved.clients).toHaveLength(2);
  const companyId = saved.clients.find(client => client.kind === 'company').id;

  await page.getByRole('tab', { name: /Novo documento/i }).click();
  await page.getByRole('button', { name: 'Contrato', exact: true }).click();
  await page.locator('#docLandlordClient').selectOption(representativeId);
  await page.locator('#docTenantPartyClient').selectOption(companyId);
  await page.locator('#docContractProperty').fill('Apartamento demonstrativo, Rua de Teste, 20');
  await page.locator('#docCustomClauses').fill('Cláusula demonstrativa para teste automatizado.');

  await expect(page.locator('#dpContent')).toContainText('LOCADOR(A): MARINA DE EXEMPLO');
  await expect(page.locator('#dpContent')).toContainText('RG nº 42.123.456-7 - SSP/SP');
  await expect(page.locator('#dpContent')).toContainText('pessoa jurídica de direito privado');
  await expect(page.locator('#dpContent')).toContainText('neste ato representada por sua sócia administradora');

  await page.locator('#docContractSubtype').selectOption('sale');
  await page.locator('#docSellerClient').selectOption(representativeId);
  await page.locator('#docBuyerClient').selectOption(companyId);
  await expect(page.locator('#dpContent')).toContainText('VENDEDOR(A): MARINA DE EXEMPLO');
  await expect(page.locator('#dpContent')).toContainText('COMPRADOR(A): A empresa CONTROLE EXEMPLO SISTEMAS LTDA.');
});

test('migra o estado anterior sem apagar cadastros ou criar cliente indevido', async ({ page }) => {
  const legacy = {
    counters: {},
    documentCounters: {},
    history: [],
    documents: [],
    draftDocuments: [],
    templates: [],
    contacts: [{ tenant: 'Pessoa de Migração', cpf: '52998224725', property: 'Rua de Teste, 10', active: true }],
    draft: null,
    management: {},
    meta: { schemaVersion: 9, installationId: 'teste-migracao', defaultOperator: 'Sandra Marcondes da Silva Alves' }
  };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value: legacy });
  await page.reload();

  const migrated = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(migrated.meta.schemaVersion).toBe(10);
  expect(migrated.contacts).toHaveLength(1);
  expect(migrated.clients).toEqual([]);
  await expect(page.locator('#savedTenant')).toContainText('Pessoa de Migração');
  const backup = await page.evaluate((key) => localStorage.getItem(`${key}_antes_schema_10`), storageKey);
  expect(backup).toContain('Pessoa de Migração');
});

test('mantém os controles essenciais visíveis sem rolagem horizontal', async ({ page, isMobile }) => {
  await page.getByRole('tab', { name: /Novo documento/i }).click();
  if (isMobile) {
    await expect(page.locator('#previewMobileBtn')).toBeVisible();
  } else {
    await expect(page.locator('#receipt')).toBeVisible();
  }

  await expect(page.getByRole('tab', { name: /Novo documento/i })).toBeVisible();
  const pageWidth = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.client);
});

test('cria um dossiê local e o preserva no mesmo armazenamento da aplicação', async ({ page }) => {
  await page.getByRole('tab', { name: /Dossiês/i }).click();
  await page.getByRole('button', { name: 'Novo dossiê' }).click();
  await page.locator('#dossierProperty').fill('Imóvel demonstrativo, Rua Exemplo, 100');
  await page.locator('#dossierContractCode').fill('LOC-TESTE-001');
  await page.locator('#dossierTenant').fill('Pessoa Exemplo');
  await page.locator('#dossierTenantDocument').fill('52998224725');
  await page.locator('#dossierEndDate').fill('2027-09-25');
  await page.getByRole('button', { name: 'Salvar dossiê' }).click();

  await expect(page.locator('#dossierList')).toContainText('LOC-TESTE-001');
  await expect(page.locator('#dossierDetail')).toContainText('Pessoa Exemplo');
  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.management.dossiers).toHaveLength(1);
  expect(persisted.management.dossiers[0]).toMatchObject({ contractCode: 'LOC-TESTE-001' });
});

test('valida, emite em lote e registra a situação no dossiê', async ({ page }) => {
  await page.getByRole('tab', { name: /Dossiês/i }).click();
  await page.getByRole('button', { name: 'Novo dossiê' }).click();
  await page.locator('#dossierProperty').fill('Apartamento fictício, Rua de Teste, 20');
  await page.locator('#dossierContractCode').fill('LOC-LOTE-001');
  await page.locator('#dossierTenant').fill('Pessoa de Teste');
  await page.locator('#dossierTenantDocument').fill('52998224725');
  await page.locator('#dossierAmount').fill('950,00');
  await page.locator('#dossierDueDay').fill('10');
  await page.getByRole('button', { name: 'Salvar dossiê' }).click();

  await page.getByRole('tab', { name: /Gestão/i }).click();
  await page.locator('#batchDossierList input').check();
  await page.locator('#buildBatchBtn').click();
  await expect(page.locator('#batchPreview')).toContainText('R$ 950,00');
  await expect(page.locator('#issueBatchBtn')).toBeEnabled();

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#issueBatchBtn').click();
  const emitted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(emitted.history).toHaveLength(1);
  expect(emitted.management.audit.some(event => event.action === 'emitido em lote')).toBeTruthy();

  await page.getByRole('tab', { name: /Dossiês/i }).click();
  await page.locator('#dossierDetail').getByText(/Recibo/).click();
  await page.locator('#managementStatusSelect').selectOption('sent');
  await page.locator('#confirmManagementStatusBtn').click();
  const updated = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(updated.history[0].status).toBe('sent');
});
