import { expect, test } from '@playwright/test';

const storageKey = 'paraibaImoveisRecibosV3';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    const guard = `${key}:test-initialized`;
    if (sessionStorage.getItem(guard)) return;
    localStorage.removeItem(key);
    sessionStorage.setItem(guard, 'true');
  }, storageKey);
  await page.goto('/');
});

async function selecionarAba(page, name) {
  const toggle = page.locator('#appMenuToggle');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') {
    await toggle.click();
  }
  const aba = page.getByRole('tab', { name });
  const texto = name instanceof RegExp ? name.source : String(name);
  const grupo = /novo documento/i.test(texto) ? 'Emitir' : /gestão|dossiês|histórico/i.test(texto) ? 'Acompanhar' : 'Administrar';
  const gatilho = page.getByRole('button', { name: grupo, exact: true });
  if (await gatilho.getAttribute('aria-expanded') !== 'true') await gatilho.click();
  await aba.click();
}

function estadoGestao(overrides = {}) {
  return {
    counters: {}, documentCounters: {}, history: [], documents: [], draftDocuments: [], templates: [], contacts: [], clients: [], draft: null, management: {},
    meta: { schemaVersion: 11, lastBackupAt: '', installationId: 'fase-2-testes', defaultOperator: 'Sandra Marcondes da Silva Alves', templateEngineMigration: 1, resourceTemplateMigration: 1 },
    ...overrides
  };
}

async function carregarEstadoGestao(page, state) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value: state });
  await page.reload();
}

async function preencherReciboValido(page) {
  await selecionarAba(page, /Novo documento/i);
  await page.locator('#tenant').fill('Maria da Silva');
  await page.locator('#cpf').fill('52998224725');
  await page.locator('#property').fill('Rua das Acácias, 100, Centro');
  await page.locator('#amount').fill('1500,50');
  await page.locator('#reference').fill('2026-09');
  await page.locator('#receiptDate').fill('2026-09-25');
}

async function confirmarRevisao(page) {
  await expect(page.locator('#confirmModal')).toBeVisible();
  await page.locator('#confirmIssueBtn').click();
}

test('carrega o gerador com a gestão como centro de navegação', async ({ page }) => {
  await expect(page).toHaveTitle(/Gerador de Recibos de Aluguel/i);
  await expect(page.getByRole('heading', { name: 'Gerador de documentos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gestão documental' })).toBeVisible();

  await selecionarAba(page, /Dossiês/i);
  await expect(page.getByRole('heading', { name: /Dossiês por imóvel/i })).toBeVisible();

  await selecionarAba(page, /Novo documento/i);
  await expect(page.locator('#view-new')).toBeVisible();

  await selecionarAba(page, /Histórico/i);
  await expect(page.locator('#view-history')).toBeVisible();

  await selecionarAba(page, /Cadastros/i);
  await expect(page.locator('#view-contacts')).toBeVisible();

  await selecionarAba(page, /Modelos/i);
  await expect(page.locator('#view-templates')).toBeVisible();

  await selecionarAba(page, /Backup e segurança/i);
  await expect(page.locator('#view-safety')).toBeVisible();
});

test('orienta a Gestão vazia para a primeira emissão', async ({ page }) => {
  await expect(page.locator('#managementEmptyState')).toBeVisible();
  await expect(page.locator('#managementEmptyState')).toContainText('Comece pela próxima emissão');
  await expect(page.locator('#advancedSearchDetails')).not.toHaveAttribute('open', '');

  await page.locator('#managementEmptyIssueBtn').click();
  await expect(page.locator('#view-new')).toBeVisible();
  await expect(page.locator('#tenant')).toBeFocused();
});

test('prioriza um rascunho antes das ferramentas avançadas', async ({ page }) => {
  await carregarEstadoGestao(page, estadoGestao({
    draft: { amount: '950,00', tenant: 'Pessoa de Rascunho', cpf: '52998224725', property: 'Imóvel fictício do rascunho', contractCode: 'LOC-RASC-01', dueDay: '10', reference: '2026-09', payment: 'Pix', receiptDate: '2026-09-25', operator: 'Sandra Marcondes da Silva Alves', savedAt: '2026-09-25T10:00:00.000Z' }
  }));

  await expect(page.locator('#managementContinue')).toContainText('Recibo em rascunho');
  await expect(page.locator('#advancedSearchDetails')).not.toHaveAttribute('open', '');
  await page.getByRole('button', { name: /Continuar Recibo em rascunho/i }).click();
  await expect(page.locator('#view-new')).toBeVisible();
  await expect(page.locator('#tenant')).toHaveValue('Pessoa de Rascunho');
});

test('mostra documentos que exigem situação antes da busca avançada', async ({ page }) => {
  await carregarEstadoGestao(page, estadoGestao({
    history: [{ number: '01/2026', year: 2026, amount: 950, tenant: 'Pessoa Pendente', cpf: '52998224725', property: 'Imóvel fictício pendente', contractCode: 'LOC-PEND-01', dueDay: 10, reference: '2026-09', payment: 'Pix', receiptDate: '2026-09-25', operator: 'Sandra Marcondes da Silva Alves', status: 'awaiting_signature', createdAt: '2026-09-25T10:00:00.000Z' }]
  }));

  await expect(page.locator('#managementPending')).toContainText('Recibo 01/2026');
  await expect(page.locator('#managementPending')).toContainText('Aguardando assinatura');
  await expect(page.locator('#advancedSearchDetails')).not.toHaveAttribute('open', '');
});

test('oferece emissão em lote quando há dossiê apto', async ({ page }) => {
  await carregarEstadoGestao(page, estadoGestao({
    management: { dossiers: [{ id: 'dos-apto-fase2', property: 'Imóvel fictício para lote', contractCode: 'LOC-LOTE-FASE2', tenant: 'Pessoa do Lote', tenantDocument: '52998224725', amount: 950, payment: 'Pix', dueDay: 10, status: 'active', tags: [], checklist: {} }] }
  }));

  await expect(page.getByRole('button', { name: /Preparar emissão em lote \(1\)/i })).toBeVisible();
  await page.getByRole('button', { name: /Preparar emissão em lote \(1\)/i }).click();
  await expect(page.locator('#batchCard')).toHaveAttribute('open', '');
  await expect(page.locator('#batchDossierList')).toContainText('Imóvel fictício para lote');
});

test('recolhe a busca avançada sem descartar filtros preenchidos', async ({ page }) => {
  await page.locator('#advancedSearchDetails > summary').click();
  await page.locator('#advancedSearch').fill('filtro preservado');
  await page.locator('#advancedStatus').selectOption('review');
  await page.locator('#advancedSearchDetails > summary').click();
  await expect(page.locator('#advancedSearchDetails')).not.toHaveAttribute('open', '');

  await page.locator('#advancedSearchDetails > summary').click();
  await expect(page.locator('#advancedSearch')).toHaveValue('filtro preservado');
  await expect(page.locator('#advancedStatus')).toHaveValue('review');
});

test('mantém os oito destinos acessíveis no menu móvel em 767 px e 380 px', async ({ page }) => {
  for (const width of [767, 380]) {
    await page.setViewportSize({ width, height: 844 });
    const menu = page.locator('#appMenuToggle');
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(page.locator('#appTabs [role="tab"]')).toHaveCount(8);
    await page.getByRole('button', { name: 'Acompanhar', exact: true }).click();
    await page.getByRole('tab', { name: /Dossiês/i }).click();
    await expect(page.locator('#tab-management')).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#tab-management')).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('#tab-dossiers')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#tab-dossiers')).toHaveAttribute('tabindex', '0');
    await expect(page.locator('#view-dossiers')).toBeVisible();
  }
});

test('valida os dados obrigatórios antes de emitir um recibo', async ({ page }) => {
  await selecionarAba(page, /Novo documento/i);
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

  await selecionarAba(page, /Histórico/i);
  await expect(page.locator('#historyList')).toContainText('Maria da Silva');

  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.history).toHaveLength(1);
  expect(persisted.history[0]).toMatchObject({ tenant: 'Maria da Silva', status: 'issued' });

  await page.reload();
  await selecionarAba(page, /Histórico/i);
  await expect(page.locator('#historyList')).toContainText('Maria da Silva');
});

test('oferece backup após a primeira emissão e atualiza o estado ao exportar', async ({ page }) => {
  await preencherReciboValido(page);
  await page.locator('#issueBtn').click();
  await confirmarRevisao(page);

  await expect(page.locator('#backupReminder')).toBeVisible();
  await expect(page.locator('#storageIndicatorText')).toContainText('sem backup');
  await expect(page.locator('#backupReminder')).toContainText('não há uma exportação de backup registrada');

  const download = page.waitForEvent('download');
  await page.locator('#backupReminderExportBtn').click();
  expect((await download).suggestedFilename()).toMatch(/^backup-documentos-\d{4}-\d{2}-\d{2}\.json$/);

  await expect(page.locator('#backupReminder')).toBeHidden();
  await expect(page.locator('#storageIndicatorText')).toContainText('backup registrado');
  await selecionarAba(page, /Backup e segurança/i);
  await expect(page.locator('#backupStatus')).toHaveClass(/current/);
  await expect(page.locator('#backupStatusText')).toContainText('Última exportação registrada');
  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.meta.lastBackupAt).toBeTruthy();
});

test('comunica backup ausente, atual e desatualizado na segurança e na gestão', async ({ page }) => {
  const receipt = { number: '01/2026', year: 2026, amount: 950, tenant: 'Pessoa de Backup', cpf: '52998224725', property: 'Imóvel fictício de backup', contractCode: 'LOC-BACKUP-01', dueDay: 10, reference: '2026-09', payment: 'Pix', receiptDate: '2026-09-25', operator: 'Sandra Marcondes da Silva Alves', status: 'issued', createdAt: '2026-09-25T10:00:00.000Z' };
  await carregarEstadoGestao(page, estadoGestao({ history: [receipt] }));
  await expect(page.locator('#storageIndicatorText')).toContainText('sem backup');
  await selecionarAba(page, /Backup e segurança/i);
  await expect(page.locator('#backupStatus')).toHaveClass(/warning/);
  await expect(page.locator('#backupStatusText')).toContainText('Nenhuma exportação de backup foi registrada');
  await selecionarAba(page, /Gestão/i);
  await page.locator('#governanceDetails > summary').click();
  await expect(page.locator('#managementGovernance')).toContainText('Não registrado');
  await expect(page.getByRole('button', { name: 'Exportar backup agora' })).toBeVisible();

  await carregarEstadoGestao(page, estadoGestao({ history: [receipt], meta: { ...estadoGestao().meta, lastBackupAt: new Date().toISOString() } }));
  await expect(page.locator('#storageIndicatorText')).toContainText('backup registrado');
  await selecionarAba(page, /Backup e segurança/i);
  await expect(page.locator('#backupStatus')).toHaveClass(/current/);
  await expect(page.locator('#safetyLastBackup')).not.toHaveText('Não registrado');

  await carregarEstadoGestao(page, estadoGestao({ history: [receipt], meta: { ...estadoGestao().meta, lastBackupAt: new Date(Date.now() - 8 * 86400000).toISOString() } }));
  await expect(page.locator('#storageIndicatorText')).toContainText('backup a renovar');
  await selecionarAba(page, /Backup e segurança/i);
  await expect(page.locator('#backupStatus')).toHaveClass(/warning/);
  await expect(page.locator('#backupStatusText')).toContainText('Exporte uma cópia atualizada');
  await selecionarAba(page, /Gestão/i);
  await page.locator('#governanceDetails > summary').click();
  await expect(page.locator('#managementGovernance')).toContainText('A renovar');
});

test('mantém a exportação, importação e recuperação dos dados locais', async ({ page }) => {
  const importedReceipt = { number: '01/2026', year: 2026, amount: 875, tenant: 'Pessoa de Importação', cpf: '52998224725', property: 'Imóvel fictício importado', contractCode: 'LOC-IMPORT-01', dueDay: 8, reference: '2026-09', payment: 'Pix', receiptDate: '2026-09-25', operator: 'Sandra Marcondes da Silva Alves', status: 'issued', createdAt: '2026-09-25T10:00:00.000Z' };
  const payload = { app: 'Gerador de Documentos - Paraíba Imóveis', version: 11, state: estadoGestao({ history: [importedReceipt] }) };

  await selecionarAba(page, /Backup e segurança/i);
  await page.locator('#importFile').setInputFiles({ name: 'backup-de-teste.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  await expect(page.getByRole('heading', { name: 'Importar este backup?' })).toBeVisible();
  const safetyCopy = page.waitForEvent('download');
  await page.locator('#actionModalConfirm').click();
  expect((await safetyCopy).suggestedFilename()).toMatch(/^backup-antes-importacao-\d{4}-\d{2}-\d{2}\.json$/);
  await selecionarAba(page, /Histórico/i);
  await expect(page.locator('#historyList')).toContainText('Pessoa de Importação');

  await page.evaluate((key) => localStorage.setItem(key, '{dados locais inválidos'), storageKey);
  await page.reload();
  await selecionarAba(page, /Backup e segurança/i);
  await expect(page.locator('#recoveryPanel')).toBeVisible();
  await expect(page.locator('#storageIndicatorText')).toContainText('Dados exigem recuperação');
  const recovery = page.waitForEvent('download');
  await page.locator('#downloadRecoveryBtn').click();
  expect((await recovery).suggestedFilename()).toMatch(/^dados-corrompidos-recibos-\d{4}-\d{2}-\d{2}\.json$/);
});

test('exibe e persiste a dispensa das dicas contextuais', async ({ page }) => {
  async function dismissAndVerify(selector, openAfterReload) {
    await expect(page.locator(selector)).toBeVisible();
    await page.locator(selector).getByRole('button', { name: 'Dispensar dica' }).click();
    await expect(page.locator(selector)).toBeHidden();
    await page.reload();
    await openAfterReload();
    await expect(page.locator(selector)).toBeHidden();
  }

  await selecionarAba(page, /Novo documento/i);
  await dismissAndVerify('#firstReceiptTip', async () => selecionarAba(page, /Novo documento/i));
  await dismissAndVerify('#competenceTip', async () => selecionarAba(page, /Novo documento/i));

  await page.getByRole('button', { name: 'Declaração', exact: true }).click();
  await dismissAndVerify('#letterheadTip', async () => { await selecionarAba(page, /Novo documento/i); await page.getByRole('button', { name: 'Declaração', exact: true }).click(); });

  await selecionarAba(page, /Histórico/i);
  await dismissAndVerify('#historyRecoveryTip', async () => selecionarAba(page, /Histórico/i));

  await selecionarAba(page, /Dossiês/i);
  await page.locator('#toggleDossierForm').click();
  await dismissAndVerify('#dossierCreationTipSlot .contextual-tip', async () => { await selecionarAba(page, /Dossiês/i); await page.locator('#toggleDossierForm').click(); });

  await selecionarAba(page, /Gestão/i);
  await page.locator('#advancedSearchDetails > summary').click();
  await dismissAndVerify('#savedViewsTipSlot .contextual-tip', async () => { await selecionarAba(page, /Gestão/i); await page.locator('#advancedSearchDetails > summary').click(); });

  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.management.settings.dismissedContextualTips).toMatchObject({
    'first-receipt': true,
    competence: true,
    letterhead: true,
    'document-recovery': true,
    'dossier-creation': true,
    'saved-views': true
  });
});

test('volta da revisão sem perder dados nem reservar numeração', async ({ page }) => {
  await preencherReciboValido(page);
  await page.locator('#issueBtn').click();
  await expect(page.locator('#confirmFields')).toContainText('01/2026');

  await page.getByRole('button', { name: 'Voltar e revisar' }).click();

  await expect(page.locator('#confirmModal')).toBeHidden();
  await expect(page.locator('#tenant')).toHaveValue('Maria da Silva');
  await expect(page.locator('#amount')).toHaveValue('1.500,50');
  await expect(page.locator('#issueBtn')).toBeFocused();
  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.history).toEqual([]);
  expect(persisted.counters).toEqual({});
});

test('mantém a revisão aberta e não anuncia sucesso quando a persistência falha', async ({ page }) => {
  await preencherReciboValido(page);
  await page.locator('#issueBtn').click();
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(name, value) {
      if (name === key) throw new DOMException('Cota indisponível', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, storageKey);

  await page.locator('#confirmIssueBtn').click();

  await expect(page.locator('#confirmModal')).toBeVisible();
  await expect(page.locator('#confirmError')).toContainText('Não foi possível registrar');
  await expect(page.locator('#documentStatus')).not.toContainText('emitido e registrado');
  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.history).toEqual([]);
});

test('exige nova revisão quando outro registro usa o número proposto', async ({ page }) => {
  await preencherReciboValido(page);
  await page.locator('#issueBtn').click();
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key));
    saved.history.push({
      number: '01/2026', year: 2026, amount: 100, tenant: 'Registro concorrente', cpf: '529.982.247-25',
      property: 'Imóvel de teste', contractCode: '', dueDay: 0, reference: '2026-09', payment: 'Dinheiro',
      receiptDate: '2026-09-25', operator: 'Sandra Marcondes da Silva Alves', status: 'issued', createdAt: new Date().toISOString()
    });
    saved.counters['2026'] = 2;
    localStorage.setItem(key, JSON.stringify(saved));
  }, storageKey);

  await page.locator('#confirmIssueBtn').click();

  await expect(page.locator('#confirmModal')).toBeHidden();
  await expect(page.locator('#toast')).toContainText('numeração mudaram');
  await expect(page.locator('#pNumber')).toContainText('02/2026');
  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.history).toHaveLength(1);
  expect(persisted.counters['2026']).toBe(2);
});

test('não aceita CPF inválido', async ({ page }) => {
  await preencherReciboValido(page);
  await page.locator('#cpf').fill('11111111111');
  await page.locator('#issueBtn').click();

  await expect(page.locator('#cpfError')).toContainText('não é válido');
  await expect(page.locator('#confirmModal')).toBeHidden();
});

test('emite uma declaração e preserva sua numeração', async ({ page }) => {
  await selecionarAba(page, /Novo documento/i);
  await page.getByRole('button', { name: 'Declaração', exact: true }).click();
  await page.locator('#docTitle').fill('DECLARAÇÃO DE RESIDÊNCIA');
  await page.locator('#docDate').fill('2026-09-25');
  await page.locator('#docCity').fill('Araçariguama/SP');
  await page.locator('#docDeclarant').fill('Maria da Silva');
  await page.locator('#docDeclarantDocument').fill('52998224725');
  await page.locator('#docSubject').fill('Comprovação de residência');
  await page.locator('#docBody').fill('Declaramos que Maria da Silva reside no endereço informado nesta declaração.');

  await page.locator('#genericIssueBtn').click();
  await expect(page.getByRole('heading', { name: 'Revisar emissão de declaração' })).toBeVisible();
  await expect(page.locator('#confirmFields')).toContainText('DECL-001/2026');
  await expect(page.locator('#confirmFields')).toContainText('Maria da Silva');
  await confirmarRevisao(page);

  await expect(page.locator('#genericStatus')).toContainText('emitido');
  await expect(page.locator('#genericPrintBtn')).toBeEnabled();
  await expect(page.locator('#dpNumber')).toContainText('DECL-001/2026');
});

test('revisa e emite termo e contrato com sequências independentes', async ({ page }) => {
  await selecionarAba(page, /Novo documento/i);
  await page.getByRole('button', { name: 'Termo', exact: true }).click();
  await page.locator('#docDate').fill('2026-09-25');
  await page.locator('#docPartyOne').fill('Pessoa Cedente de Teste');
  await page.locator('#docProperty').fill('Imóvel demonstrativo, Rua de Exemplo, 10');
  await page.locator('#docObligations').fill('Entrega das chaves e conservação do imóvel conforme vistoria demonstrativa.');
  await page.locator('#genericIssueBtn').click();
  await expect(page.getByRole('heading', { name: 'Revisar emissão de termo' })).toBeVisible();
  await expect(page.locator('#confirmFields')).toContainText('TERMO-001/2026');
  await confirmarRevisao(page);

  await page.locator('#genericNewBtn').click();
  await page.getByRole('button', { name: 'Contrato', exact: true }).click();
  await page.locator('#docDate').fill('2026-09-25');
  await page.locator('#docLandlord').fill('Pessoa Locadora de Teste');
  await page.locator('#docTenantParty').fill('Pessoa Locatária de Teste');
  await page.locator('#docContractProperty').fill('Apartamento demonstrativo, Rua de Teste, 20');
  await page.locator('#docCustomClauses').fill('Cláusula demonstrativa suficiente para validar a emissão segura do contrato.');
  await page.locator('#genericIssueBtn').click();
  await expect(page.getByRole('heading', { name: 'Revisar emissão de contrato' })).toBeVisible();
  await expect(page.locator('#confirmFields')).toContainText('CONT-001/2026');
  await expect(page.locator('#confirmFields')).toContainText('Pessoa Locatária de Teste');
  await confirmarRevisao(page);

  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.documents.map((record) => record.number)).toEqual(['TERMO-001/2026', 'CONT-001/2026']);
  expect(persisted.documentCounters).toMatchObject({ 'term|2026': 2, 'contract|2026': 2 });
});

test('cadastra clientes PF e PJ e aplica a qualificação completa no contrato', async ({ page }) => {
  await selecionarAba(page, /Clientes/i);
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
  expect(saved.meta.schemaVersion).toBe(11);
  expect(saved.clients).toHaveLength(2);
  const companyId = saved.clients.find(client => client.kind === 'company').id;

  await selecionarAba(page, /Novo documento/i);
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

test('pagina contratos longos e quebra campos extensos na prévia e na impressão', async ({ page }) => {
  await selecionarAba(page, /Novo documento/i);
  await page.getByRole('button', { name: 'Contrato', exact: true }).click();

  const tokenLongo = 'CAMPOSEMESPACO'.repeat(45);
  const clausulaMaiorQueUmaPagina = 'Trecho extenso de uma mesma cláusula para validar a continuação entre folhas. '.repeat(220);
  const clausulas = [clausulaMaiorQueUmaPagina, ...Array.from({ length: 12 }, (_, index) =>
    `${index + 1}. Cláusula demonstrativa com conteúdo suficiente para validar a paginação automática do documento. `.repeat(4)
  )].join('\n\n');

  await page.locator('#docLandlord').fill('Pessoa Locadora de Teste');
  await page.locator('#docTenantParty').fill('Pessoa Locatária de Teste');
  await page.locator('#docGuarantors').fill(tokenLongo);
  await page.locator('#docContractProperty').fill(`Imóvel demonstrativo ${tokenLongo}`);
  await page.locator('#docCustomClauses').fill(clausulas);
  await page.locator('#docFooterEnabled').setChecked(true, { force: true });

  await expect(page.locator('#genericPageWarning')).toContainText(/\b[2-9]\d* páginas A4\b/);

  const preview = await page.locator('#documentPagesPreview').evaluate((container) => {
    const pages = [...container.querySelectorAll('[data-document-preview-page]')];
    const overflowing = pages.flatMap((sheet, pageIndex) =>
      [...sheet.querySelectorAll('p, li, strong, span, h1, h2, .data-block')]
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => ({ pageIndex, text: element.textContent.slice(0, 40) }))
    );
    const verticallyClipped = pages
      .map((sheet, pageIndex) => ({ pageIndex, clientHeight: sheet.clientHeight, scrollHeight: sheet.scrollHeight }))
      .filter(({ clientHeight, scrollHeight }) => scrollHeight > clientHeight + 1);
    return { pageCount: pages.length, overflowing, verticallyClipped };
  });

  expect(preview.pageCount).toBeGreaterThan(1);
  expect(preview.overflowing).toEqual([]);
  expect(preview.verticallyClipped).toEqual([]);

  await page.evaluate(() => {
    document.documentElement.classList.add('printing-generic');
    document.body.classList.add('printing-generic');
  });
  await page.emulateMedia({ media: 'print' });
  const printLayout = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('[data-document-preview-page]')];
    return {
      menuDisplay: getComputedStyle(document.querySelector('#appMenuToggle')).display,
      navigationDisplay: getComputedStyle(document.querySelector('.app-tabs-shell')).display,
      pageCount: pages.length,
      footers: pages.map((sheet) => {
        const footer = sheet.querySelector('.document-footer');
        const sheetRect = sheet.getBoundingClientRect();
        const footerRect = footer?.getBoundingClientRect();
        return {
          count: sheet.querySelectorAll('.document-footer').length,
          position: footer ? getComputedStyle(footer).position : '',
          bottomGap: footerRect ? sheetRect.bottom - footerRect.bottom : -1
        };
      })
    };
  });

  expect(printLayout.menuDisplay).toBe('none');
  expect(printLayout.navigationDisplay).toBe('none');
  expect(printLayout.footers.every(({ count, position, bottomGap }) =>
    count === 1 && position === 'absolute' && bottomGap > 30 && bottomGap < 45
  )).toBe(true);

  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
  const pdfText = pdf.toString('latin1');
  expect((pdfText.match(/\/Type\s*\/Page\b/g) || []).length).toBe(printLayout.pageCount);
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
  expect(migrated.meta.schemaVersion).toBe(11);
  expect(migrated.contacts).toHaveLength(1);
  expect(migrated.clients).toEqual([]);
  await expect(page.locator('#savedTenant')).toContainText('Pessoa de Migração');
  expect(migrated.meta.templateEngineMigration).toBe(1);
  const backup = await page.evaluate((key) => localStorage.getItem(`${key}_antes_schema_11`), storageKey);
  expect(backup).toContain('Pessoa de Migração');
});

test('quebra o menu no tablet e o recolhe em um controle expansível no celular', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await expect(page.locator('#appMenuToggle')).toBeHidden();
  await expect(page.locator('#appTabs')).toBeVisible();
  const tabletMenu = await page.locator('#appTabs').evaluate(menu => ({
    height: menu.getBoundingClientRect().height,
    client: menu.clientWidth,
    scroll: menu.scrollWidth
  }));
  expect(tabletMenu.height).toBeGreaterThan(50);
  expect(tabletMenu.scroll).toBeLessThanOrEqual(tabletMenu.client);

  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = page.locator('#appMenuToggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#appTabs')).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#appTabs')).toBeVisible();
  await page.getByRole('button', { name: 'Emitir', exact: true }).click();
  await page.getByRole('tab', { name: /Novo documento/i }).focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#view-new')).toBeVisible();
});

test('condensa os destinos em menus dropdown acessíveis', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const emitir = page.getByRole('button', { name: 'Emitir', exact: true });
  const acompanhar = page.getByRole('button', { name: 'Acompanhar', exact: true });
  const administrar = page.getByRole('button', { name: 'Administrar', exact: true });

  await expect(emitir).toBeVisible();
  await expect(acompanhar).toBeVisible();
  await expect(administrar).toBeVisible();
  await expect(page.getByRole('tab', { name: /Histórico/i })).toBeHidden();

  await acompanhar.click();
  await expect(acompanhar).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('tab', { name: /Gestão/i })).toBeVisible();
  await administrar.click();
  await expect(acompanhar).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('tab', { name: /Cadastros/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(administrar).toHaveAttribute('aria-expanded', 'false');
  await expect(administrar).toBeFocused();
});

test('mantém os controles essenciais visíveis sem rolagem horizontal', async ({ page, isMobile }) => {
  await selecionarAba(page, /Novo documento/i);
  if (isMobile) {
    await expect(page.locator('#previewMobileBtn')).toBeVisible();
  } else {
    await expect(page.locator('#receipt')).toBeVisible();
  }

  await expect(isMobile ? page.locator('#appMenuToggle') : page.getByRole('button', { name: 'Emitir', exact: true })).toBeVisible();
  const pageWidth = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.client);
});

test('cria um dossiê local e o preserva no mesmo armazenamento da aplicação', async ({ page }) => {
  await selecionarAba(page, /Dossiês/i);
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
  await selecionarAba(page, /Dossiês/i);
  await page.getByRole('button', { name: 'Novo dossiê' }).click();
  await page.locator('#dossierProperty').fill('Apartamento fictício, Rua de Teste, 20');
  await page.locator('#dossierContractCode').fill('LOC-LOTE-001');
  await page.locator('#dossierTenant').fill('Pessoa de Teste');
  await page.locator('#dossierTenantDocument').fill('52998224725');
  await page.locator('#dossierAmount').fill('950,00');
  await page.locator('#dossierDueDay').fill('10');
  await page.getByRole('button', { name: 'Salvar dossiê' }).click();

  await selecionarAba(page, /Gestão/i);
  await page.locator('#batchCard > summary').click();
  for (const checkbox of await page.locator('#batchDossierList input').all()) await checkbox.check();
  await page.locator('#buildBatchBtn').click();
  await expect(page.locator('#batchPreview')).toContainText('R$ 950,00');
  await expect(page.locator('#issueBatchBtn')).toBeEnabled();

  await page.locator('#issueBatchBtn').click();
  await expect(page.getByRole('heading', { name: 'Revisar emissão de 1 recibo' })).toBeVisible();
  await expect(page.locator('#confirmFields')).toContainText('01/2026');
  await expect(page.locator('#confirmFields')).toContainText('Pessoa de Teste');
  await page.getByRole('button', { name: 'Voltar e revisar' }).click();
  const beforeConfirmation = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(beforeConfirmation.history).toHaveLength(0);
  expect(beforeConfirmation.counters).toEqual({});
  await expect(page.locator('#batchDossierList input')).toBeChecked();
  await page.locator('#issueBatchBtn').click();
  await confirmarRevisao(page);
  const emitted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(emitted.history).toHaveLength(1);
  expect(emitted.management.audit.some(event => event.action === 'emitido em lote')).toBeTruthy();

  await selecionarAba(page, /Dossiês/i);
  await page.locator('#dossierDetail').getByText(/Recibo/).click();
  await page.locator('#managementStatusSelect').selectOption('sent');
  await page.locator('#confirmManagementStatusBtn').click();
  const updated = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(updated.history[0].status).toBe('sent');
});

test('bloqueia o lote inteiro quando um dos dossiês é inválido', async ({ page }) => {
  await selecionarAba(page, /Dossiês/i);
  await page.getByRole('button', { name: 'Novo dossiê' }).click();
  await page.locator('#dossierProperty').fill('Imóvel válido de teste');
  await page.locator('#dossierTenant').fill('Pessoa Válida de Teste');
  await page.locator('#dossierTenantDocument').fill('52998224725');
  await page.locator('#dossierAmount').fill('800,00');
  await page.getByRole('button', { name: 'Salvar dossiê' }).click();

  await page.getByRole('button', { name: 'Novo dossiê' }).click();
  await page.locator('#dossierProperty').fill('Imóvel inválido de teste');
  await page.locator('#dossierTenant').fill('Pessoa Inválida de Teste');
  await page.locator('#dossierTenantDocument').fill('11111111111');
  await page.locator('#dossierAmount').fill('900,00');
  await page.getByRole('button', { name: 'Salvar dossiê' }).click();

  await selecionarAba(page, /Gestão/i);
  await page.locator('#batchCard > summary').click();
  for (const checkbox of await page.locator('#batchDossierList input').all()) await checkbox.check();
  await page.locator('#buildBatchBtn').click();

  await expect(page.locator('#batchPreview')).toContainText('CPF ou CNPJ');
  await expect(page.locator('#issueBatchBtn')).toBeDisabled();
  await expect(page.locator('#confirmModal')).toBeHidden();
  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.history).toEqual([]);
  expect(persisted.counters).toEqual({});
});

test('cria template HTML, gera formulário dinâmico e congela snapshot na emissão', async ({ page, isMobile }) => {
  await selecionarAba(page, /Modelos/i);
  await expect(page.locator('#templateStudio')).toBeVisible();

  await page.locator('#newTemplateBtn').click();
  const suffix = `${isMobile ? 'mobile' : 'desktop'}-${Date.now()}`;
  const templateId = `teste-dinamico-${suffix}`;
  await page.locator('#templateId').fill(templateId);
  await page.locator('#templateName').fill('Comprovante dinâmico de teste');
  await page.locator('#templateKind').selectOption('custom');
  const field = page.locator('#templateFields .template-field-row').first();
  await field.getByLabel('Identificador').fill('pagamento');
  await field.getByLabel('Nome do campo').fill('Forma de pagamento');
  await field.getByLabel('Tipo').selectOption('select');
  await field.getByLabel('Obrigatório').check();
  await field.getByLabel('Opções do combobox').fill('Pix=pix\nBoleto=boleto');
  await page.locator('#templateSourceToggle').click();
  await page.locator('#templateHtmlSource').fill('<!doctype html><html><body><h1>Comprovante</h1><p>Pagamento: {{FORMA_DE_PAGAMENTO}}</p></body></html>');
  await page.locator('#saveTemplateBtn').click();
  await expect(page.locator('#templateEngineNotice')).toContainText('salvo em resources/templates');

  const card = page.locator(`.template-resource-card[data-template-id="${templateId}"]`);
  await card.getByRole('button', { name: 'Usar documento' }).click();
  await expect(page.locator('#dynamicDocumentHost')).toBeVisible();
  await page.getByRole('button', { name: 'Emitir documento' }).click();
  await expect(page.locator('#dynamic-error-pagamento')).toContainText('obrigatório');
  await expect(page.locator('#dynamicValidationSummary')).toContainText('Forma de pagamento');
  await page.locator('#dynamicValidationSummary').getByRole('button', { name: 'Forma de pagamento' }).click();
  await expect(page.locator('#dynamic-pagamento')).toBeFocused();
  await expect(page.locator('#confirmModal')).toBeHidden();
  await page.locator('#dynamic-pagamento').selectOption('pix');
  await page.getByRole('button', { name: 'Emitir documento' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar emissão de documento livre' })).toBeVisible();
  await expect(page.locator('#confirmFields')).toContainText('Comprovante dinâmico de teste');
  await expect(page.locator('#confirmFields')).toContainText('Sem numeração');
  await confirmarRevisao(page);
  await expect(page.locator('#templateEngineNotice')).toContainText(/emitido.*congelado/);

  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  const dynamic = persisted.documents.find((record) => record.dynamic === true);
  expect(dynamic.number).toBe('');
  expect(dynamic.templateSnapshot.definition.fields[0].tag).toBe('{{FORMA_DE_PAGAMENTO}}');
  expect(dynamic.templateSnapshot.renderedHtml).toContain('Pix');

  const originalSnapshot = dynamic.templateSnapshot.renderedHtml;
  await selecionarAba(page, /Modelos/i);
  const savedCard = page.locator(`.template-resource-card[data-template-id="${templateId}"]`);
  await savedCard.getByRole('button', { name: 'Editar' }).click();
  await expect(page.locator('#templateId')).toHaveValue(templateId);
  await page.locator('#templateSourceToggle').click();
  await page.locator('#templateHtmlSource').fill('<!doctype html><html><body><h1>Template alterado</h1><p>{{FORMA_DE_PAGAMENTO}}</p></body></html>');
  await page.locator('#saveTemplateBtn').click();
  await expect(page.locator('#templateEngineNotice')).toContainText('salvo em resources/templates');

  const afterTemplateEdit = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  const frozen = afterTemplateEdit.documents.find((record) => record.id === dynamic.id);
  expect(frozen.templateSnapshot.renderedHtml).toBe(originalSnapshot);
});

test('imprime o snapshot emitido pelo menu do histórico', async ({ page }) => {
  const templateName = 'Documento dinâmico para impressão';
  const snapshotHtml = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif}</style></head><body><h1>Snapshot para impressão</h1></body></html>';
  await carregarEstadoGestao(page, estadoGestao({
    documents: [{
      id: 'documento-dinamico-impressao', type: 'custom', dynamic: true, dynamicLabel: templateName,
      templateId: 'template-impressao', templateVersion: 1, number: '', year: 2026, status: 'issued', fields: {},
      templateSnapshot: {
        definition: { schemaVersion: 1, id: 'template-impressao', name: templateName, documentKind: 'custom', status: 'active', revision: 1, fields: [] },
        html: snapshotHtml,
        renderedHtml: snapshotHtml
      },
      operator: 'Sandra Marcondes da Silva Alves', createdAt: '2026-09-29T12:00:00.000Z', updatedAt: '2026-09-29T12:00:00.000Z', printCount: 0, lastPrintedAt: ''
    }]
  }));

  await selecionarAba(page, /Histórico/i);
  const row = page.locator('.history-item').filter({ hasText: templateName });
  await row.locator('summary').click();
  await row.getByRole('button', { name: 'Imprimir snapshot' }).click();

  await expect(page.locator('.dynamic-print-frame')).toHaveAttribute('sandbox', /allow-same-origin/);
  await expect(page.locator('.dynamic-print-frame')).toHaveCount(0, { timeout: 1_500 });
});

test('guia pendências do template, mantém rascunho editável e emite somente os campos declarados', async ({ page, isMobile }) => {
  await selecionarAba(page, /Modelos/i);
  await page.locator('#newTemplateBtn').click();
  const suffix = `${isMobile ? 'mobile' : 'desktop'}-${Date.now()}`;
  const templateId = `revisao-dinamica-${suffix}`;
  const templateName = 'Contrato dinâmico guiado';
  await page.locator('#templateId').fill(templateId);
  await page.locator('#templateName').fill(templateName);
  await page.locator('#templateKind').selectOption('contract');

  async function configurarCampo(index, { id, name, type, required = false }) {
    const row = page.locator('#templateFields .template-field-row').nth(index);
    await row.getByLabel('Identificador').fill(id);
    await row.getByLabel('Nome do campo').fill(name);
    await row.getByLabel('Tipo').selectOption(type);
    if (required) await row.getByLabel('Obrigatório').check();
  }

  await configurarCampo(0, { id: 'locatario', name: 'Locatário do teste', type: 'text', required: true });
  await page.locator('#addTemplateField').click();
  await configurarCampo(1, { id: 'data_assinatura', name: 'Data da assinatura', type: 'date', required: true });
  await page.locator('#addTemplateField').click();
  await configurarCampo(2, { id: 'aceite_vistoria', name: 'Aceite da vistoria', type: 'checkbox', required: true });
  await page.locator('#addTemplateField').click();
  await configurarCampo(3, { id: 'observacao_livre', name: 'Observação livre', type: 'textarea' });
  await expect(page.locator('#templateJsonPreview')).toHaveValue(/"required": true/);
  await expect(page.locator('.template-toolbar')).toHaveAttribute('aria-label', /Contrato dinâmico guiado/);
  await expect(page.getByText(/Uma tag insere o valor do campo no texto do documento/i)).toBeVisible();

  await page.locator('#templateSourceToggle').click();
  await page.locator('#templateHtmlSource').fill('<!doctype html><html><body><h1>Contrato guiado</h1><p>{{LOCATARIO_DO_TESTE}}</p><p>{{DATA_DA_ASSINATURA}}</p><p>{{ACEITE_DA_VISTORIA}}</p><p>{{OBSERVACAO_LIVRE}}</p></body></html>');
  await page.locator('#saveTemplateBtn').click();
  await expect(page.locator('#templateEngineNotice')).toContainText('salvo em resources/templates');

  const card = page.locator(`.template-resource-card[data-template-id="${templateId}"]`);
  await card.getByRole('button', { name: 'Usar documento' }).click();
  await expect(page.locator('#dynamicCompletionStatus')).toContainText('0 de 3 campos obrigatórios preenchidos');
  await expect(page.locator('#dynamicCompletionStatus')).toContainText('Locatário do teste');
  await expect(page.locator('#dynamicPendingList')).toContainText('Aceite da vistoria');

  await page.locator('#saveDynamicDraftBtn').click();
  await expect(page.locator('#dynamicDraftState')).toContainText('Rascunho salvo');
  await expect(page.getByRole('button', { name: 'Atualizar rascunho' })).toBeVisible();
  let persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.draftDocuments).toHaveLength(1);
  expect(persisted.draftDocuments[0].number).toBe('');
  expect(persisted.documentCounters).toEqual({});
  await page.locator('#discardDynamicDraftBtn').click();
  await expect(page.locator('#actionModal')).toBeVisible();
  await page.locator('#actionModalConfirm').click();
  await expect(page.locator('#dynamicDraftState')).toContainText('Nenhum rascunho salvo');
  persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.draftDocuments).toHaveLength(0);
  expect(persisted.documentCounters).toEqual({});
  await page.locator('#saveDynamicDraftBtn').click();

  await page.reload();
  await selecionarAba(page, /Histórico/i);
  const draftRow = page.locator('.history-item').filter({ hasText: templateName });
  await draftRow.locator('summary').click();
  await draftRow.getByRole('button', { name: 'Editar rascunho' }).click();
  await expect(page.locator('#dynamic-locatario')).toHaveValue('');

  await page.getByRole('button', { name: 'Emitir e numerar' }).click();
  await expect(page.locator('#dynamicValidationSummary')).toContainText('Locatário do teste');
  await expect(page.locator('#confirmModal')).toBeHidden();
  persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.documents).toHaveLength(0);
  expect(persisted.documentCounters).toEqual({});

  await page.locator('#dynamicPendingList').getByRole('button', { name: 'Locatário do teste' }).click();
  await expect(page.locator('#dynamic-locatario')).toBeFocused();
  await page.locator('#dynamic-locatario').fill('Pessoa de teste');
  await expect(page.locator('#dynamicCompletionStatus')).toContainText('1 de 3 campos obrigatórios preenchidos');
  await expect(page.locator('#dynamicCompletionStatus')).toContainText('Data da assinatura');
  await page.getByRole('button', { name: 'Emitir e numerar' }).click();
  await expect(page.locator('#dynamicValidationSummary')).toContainText('Data da assinatura');

  await page.locator('#dynamic-data_assinatura').fill('2026-09-29');
  await expect(page.locator('#dynamicCompletionStatus')).toContainText('2 de 3 campos obrigatórios preenchidos');
  await page.getByRole('button', { name: 'Emitir e numerar' }).click();
  await expect(page.locator('#dynamicValidationSummary')).toContainText('Aceite da vistoria');
  await page.locator('#dynamicPendingList').getByRole('button', { name: 'Aceite da vistoria' }).click();
  await expect(page.locator('#dynamic-aceite_vistoria')).toBeFocused();
  await page.locator('#dynamic-aceite_vistoria').check();
  await expect(page.locator('#dynamicCompletionStatus')).toContainText('3 de 3 campos obrigatórios preenchidos');

  await page.getByRole('button', { name: 'Emitir e numerar' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar emissão de contrato' })).toBeVisible();
  await confirmarRevisao(page);
  await expect(page.locator('#templateEngineNotice')).toContainText(/emitido.*congelado/);
  persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  const issued = persisted.documents.find(record => record.dynamic && record.templateId === templateId);
  expect(issued.number).toMatch(/^CONT-\d{3}\/2026$/);
  expect(persisted.draftDocuments).toHaveLength(0);
  expect(issued.templateSnapshot.definition.fields.map(field => field.required)).toEqual([true, true, true, false]);
  expect(issued.templateSnapshot.renderedHtml).toContain('Pessoa de teste');
  const frozenHtml = issued.templateSnapshot.renderedHtml;

  await page.reload();
  persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.documents.find(record => record.id === issued.id).templateSnapshot.renderedHtml).toBe(frozenHtml);
  await selecionarAba(page, /Modelos/i);
  await page.locator(`.template-resource-card[data-template-id="${templateId}"]`).getByRole('button', { name: 'Editar' }).click();
  await page.locator('#templateSourceToggle').click();
  await page.locator('#templateHtmlSource').fill('<!doctype html><html><body><h1>Contrato alterado depois da emissão</h1></body></html>');
  await page.locator('#saveTemplateBtn').click();
  persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.documents.find(record => record.id === issued.id).templateSnapshot.renderedHtml).toBe(frozenHtml);
});

test('mantém o foco contido no modal, fecha com Escape e devolve o foco sem perder o rascunho', async ({ page }) => {
  await preencherReciboValido(page);
  const trigger = page.locator('#issueBtn');
  await trigger.click();

  await expect(page.locator('#confirmIssueBtn')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#cancelIssueBtn')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#confirmIssueBtn')).toBeFocused();
  expect(await page.evaluate(() => document.querySelector('#confirmModal').contains(document.activeElement))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.locator('#confirmModal')).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator('#tenant')).toHaveValue('Maria da Silva');
  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.history).toEqual([]);
  expect(persisted.counters).toEqual({});
});

test('cancela o modal de cancelamento com Escape sem alterar o recibo', async ({ page }) => {
  await preencherReciboValido(page);
  await page.locator('#issueBtn').click();
  await confirmarRevisao(page);
  await selecionarAba(page, /Histórico/i);
  const item = page.locator('.history-item').filter({ hasText: '01/2026' });
  await item.locator('summary').click();
  const trigger = item.getByRole('button', { name: 'Cancelar recibo' });
  await trigger.click();

  await expect(page.locator('#cancelReason')).toBeFocused();
  await page.locator('#cancelOperator').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#confirmCancelBtn')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#cancelOperator')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#cancelModal')).toBeHidden();
  await expect(trigger).toBeFocused();
  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.history[0].status).toBe('issued');
  expect(persisted.history[0].cancelReason || '').toBe('');
});

test('navega por todas as abas, inclusive Gestão e Dossiês, com setas, Home e End', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  const management = page.getByRole('tab', { name: /Gestão/i });
  const create = page.getByRole('tab', { name: /Novo documento/i });
  const dossiers = page.getByRole('tab', { name: /Dossiês/i });
  const safety = page.getByRole('tab', { name: /Backup e segurança/i });

  await page.getByRole('button', { name: 'Acompanhar', exact: true }).click();
  await management.focus();
  await page.keyboard.press('ArrowRight');
  await expect(dossiers).toBeFocused();
  await expect(page.locator('#view-dossiers')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Histórico/i })).toBeFocused();
  await expect(page.locator('#view-history')).toBeVisible();
  await page.keyboard.press('End');
  await expect(safety).toBeFocused();
  await expect(page.locator('#view-safety')).toBeVisible();
  await page.keyboard.press('Home');
  await expect(create).toBeFocused();
  await expect(page.locator('#view-new')).toBeVisible();
});

test('salva uma visão por modal próprio sem abrir diálogo nativo', async ({ page }) => {
  const nativeDialogs = [];
  page.on('dialog', dialog => nativeDialogs.push(dialog.type()));
  await selecionarAba(page, /Gestão/i);
  await page.locator('#advancedSearchDetails > summary').click();
  await page.locator('#advancedSearch').fill('contrato de teste');
  const trigger = page.locator('#saveViewBtn');
  await trigger.click();

  await expect(page.getByRole('heading', { name: 'Salvar visão de pesquisa' })).toBeVisible();
  await expect(page.getByLabel('Nome da visão')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#actionModal')).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByLabel('Nome da visão').fill('Contratos em revisão');
  await page.locator('#actionModalConfirm').click();
  await expect(page.locator('#savedViewSelect')).toContainText('Contratos em revisão');
  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.management.savedViews).toHaveLength(1);
  expect(nativeDialogs).toEqual([]);
});

test('mantém a justificativa obrigatória dentro do modal de situação e devolve o foco', async ({ page }) => {
  const nativeDialogs = [];
  page.on('dialog', dialog => nativeDialogs.push(dialog.type()));
  await preencherReciboValido(page);
  await page.locator('#issueBtn').click();
  await confirmarRevisao(page);
  await selecionarAba(page, /Dossiês/i);

  const trigger = page.getByRole('button', { name: /Atualizar situação de Recibo 01\/2026/i });
  await trigger.click();
  await page.locator('#managementStatusSelect').selectOption('canceled');
  await page.locator('#confirmManagementStatusBtn').click();
  await expect(page.locator('#managementStatusModal')).toBeVisible();
  await expect(page.locator('#managementStatusReasonError')).toContainText('pelo menos 3 caracteres');
  await expect(page.locator('#managementStatusReason')).toHaveAttribute('aria-invalid', 'true');

  await page.locator('#managementStatusReason').fill('Solicitação de teste');
  await page.locator('#confirmManagementStatusBtn').click();
  await expect(page.locator('#managementStatusModal')).toBeHidden();
  await expect(trigger).toBeFocused();
  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.history[0]).toMatchObject({ status: 'canceled', cancelReason: 'Solicitação de teste' });
  expect(nativeDialogs).toEqual([]);
});

test('configura o bloqueio local em um único modal validado e cancelável', async ({ page }) => {
  const nativeDialogs = [];
  page.on('dialog', dialog => nativeDialogs.push(dialog.type()));
  await selecionarAba(page, /Gestão/i);
  await page.locator('#governanceDetails > summary').click();
  const trigger = page.getByRole('button', { name: 'Configurar bloqueio local' });
  await trigger.click();
  await expect(page.getByRole('heading', { name: 'Configurar bloqueio local' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#actionModal')).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByLabel('Nova senha local').fill('senha-segura');
  await page.getByLabel('Repita a senha').fill('senha-diferente');
  await page.getByLabel('Minutos sem atividade').fill('15');
  await page.locator('#actionModalConfirm').click();
  await expect(page.getByText('As senhas não coincidem.')).toBeVisible();
  await page.getByLabel('Repita a senha').fill('senha-segura');
  await page.locator('#actionModalConfirm').click();
  await expect(page.locator('#toast')).toContainText('Bloqueio local configurado');
  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.management.settings.localLock).toMatchObject({ enabled: true, timeoutMinutes: 15 });

  await page.evaluate((key) => { const saved = JSON.parse(localStorage.getItem(key)); saved.management.settings.localLock.timeoutMinutes = 0.001; localStorage.setItem(key, JSON.stringify(saved)); }, storageKey);
  await page.reload();
  await expect(page.locator('#managementLockModal')).toBeVisible();
  await expect(page.locator('#managementUnlockPassword')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#managementLockModal')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('#unlockManagementBtn')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#managementUnlockPassword')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#unlockManagementBtn')).toBeFocused();
  await page.locator('#managementUnlockPassword').fill('senha-segura');
  await page.evaluate((key) => { const saved = JSON.parse(localStorage.getItem(key)); saved.management.settings.localLock.timeoutMinutes = 120; localStorage.setItem(key, JSON.stringify(saved)); }, storageKey);
  await page.locator('#unlockManagementBtn').click();
  await expect(page.locator('#managementLockModal')).toBeHidden();
  expect(nativeDialogs).toEqual([]);
});

test('expõe nomes acessíveis na formatação e na reordenação de campos', async ({ page }) => {
  await selecionarAba(page, /Modelos/i);
  await expect(page.getByRole('button', { name: 'Negrito' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Itálico' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sublinhado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mover campo 1 para cima' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mover campo 1 para baixo' })).toBeVisible();
});

test('cancela e arquiva documentos sem diálogos nativos', async ({ page }) => {
  const nativeDialogs = [];
  page.on('dialog', dialog => nativeDialogs.push(dialog.type()));
  await selecionarAba(page, /Novo documento/i);
  await page.getByRole('button', { name: 'Declaração', exact: true }).click();
  await page.locator('#docTitle').fill('DECLARAÇÃO DE TESTE');
  await page.locator('#docDate').fill('2026-09-25');
  await page.locator('#docCity').fill('Araçariguama/SP');
  await page.locator('#docDeclarant').fill('Pessoa de Teste');
  await page.locator('#docDeclarantDocument').fill('52998224725');
  await page.locator('#docSubject').fill('Fluxo seguro');
  await page.locator('#docBody').fill('Texto demonstrativo suficiente para emitir e testar ações posteriores.');
  await page.locator('#genericIssueBtn').click();
  await confirmarRevisao(page);
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key));
    const original = saved.documents[0];
    saved.documents.push({ ...original, id: `${original.id}-arquivo`, number: 'DECL-002/2026', createdAt: new Date(Date.now() + 1000).toISOString() });
    saved.documentCounters['declaration|2026'] = 3;
    localStorage.setItem(key, JSON.stringify(saved));
  }, storageKey);
  await page.reload();
  await selecionarAba(page, /Histórico/i);

  const cancelItem = page.locator('.history-item').filter({ hasText: 'DECL-001/2026' });
  await cancelItem.locator('summary').click();
  await cancelItem.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cancelar DECL-001/2026?' })).toBeVisible();
  await page.locator('#actionModal').getByLabel('Motivo do cancelamento').fill('Solicitação de teste');
  await page.locator('#actionModalConfirm').click();
  await expect(cancelItem).toContainText('Cancelado');

  const archiveItem = page.locator('.history-item').filter({ hasText: 'DECL-002/2026' });
  await archiveItem.locator('summary').click();
  await archiveItem.getByRole('button', { name: 'Arquivar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Arquivar DECL-002/2026?' })).toBeVisible();
  await page.locator('#actionModalConfirm').click();
  await expect(archiveItem).toContainText('Arquivado');

  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.documents.find(record => record.number === 'DECL-001/2026').status).toBe('canceled');
  expect(persisted.documents.find(record => record.number === 'DECL-002/2026').status).toBe('archived');
  expect(nativeDialogs).toEqual([]);
});
