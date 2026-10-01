import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
  const aba = page.locator('.app-tabs [data-view]').filter({ hasText: name }).first();
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

async function esperarSemViolacoesAxeGraves(page, include) {
  let builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .setLegacyMode(true);
  for (const selector of Array.isArray(include) ? include : include ? [include] : []) builder = builder.include(selector);
  const results = await builder.analyze();
  const violations = results.violations
    .filter(({ impact }) => impact === 'critical' || impact === 'serious')
    .map(({ id, impact, help, nodes }) => ({
      id,
      impact,
      help,
      targets: nodes.map(node => node.target)
    }));
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

test('carrega o gerador com a gestão como centro de navegação', async ({ page }) => {
  await expect(page).toHaveTitle(/Gerador e Gestão de Documentos/i);
  await expect(page.getByRole('heading', { name: 'Gerador e Gestão de Documentos' })).toBeVisible();
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

test('carrega o editor de templates sob demanda e usa o logo como recurso externo', async ({ page }) => {
  const initialState = await page.evaluate(() => ({
    engine: typeof window.TemplateDocumentEngine,
    templateRequests: performance.getEntriesByType('resource').filter(entry => entry.name.includes('template-engine.js')).length
  }));
  expect(initialState).toEqual({ engine: 'undefined', templateRequests: 0 });

  const logo = page.locator('#receipt .logo');
  await expect(logo).toHaveAttribute('src', 'assets/paraiba-imoveis-logo.png');
  await expect(logo).toHaveAttribute('width', '586');
  await expect(logo).toHaveAttribute('height', '426');
  await expect.poll(() => logo.evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight })))
    .toEqual({ width: 586, height: 426 });

  await selecionarAba(page, /Modelos/i);
  await expect(page.locator('#templateStudio')).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof window.TemplateDocumentEngine)).toBe('object');
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('template-engine.js')))).toBe(true);
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
    await expect(page.locator('#appTabs [data-view]')).toHaveCount(8);
    await page.getByRole('button', { name: 'Acompanhar', exact: true }).click();
    await page.getByRole('button', { name: /Dossiês/i }).click();
    await expect(page.locator('#tab-management')).not.toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#tab-dossiers')).toHaveAttribute('aria-current', 'page');
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

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#backupReminder')).toBeHidden();
  await expect(page.locator('#receipt')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });

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
  if (await page.locator('#previewMobileBtn').isVisible()) await page.locator('#previewMobileBtn').click();

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
    return {
      pageCount: pages.length,
      overflowing,
      verticallyClipped,
      flowText: pages.map(sheet => sheet.querySelector('.document-page-flow')?.textContent || '').join('\n'),
      signatures: pages.flatMap(sheet => [...sheet.querySelectorAll('.document-signature strong')].map(element => element.textContent)),
      footerCounts: pages.map(sheet => sheet.querySelectorAll('.document-footer').length)
    };
  });

  expect(preview.pageCount).toBeGreaterThan(1);
  expect(preview.overflowing).toEqual([]);
  expect(preview.verticallyClipped).toEqual([]);
  expect(preview.flowText.indexOf('Trecho extenso')).toBeLessThan(preview.flowText.indexOf('12. Cláusula demonstrativa'));
  expect(preview.signatures).toEqual(expect.arrayContaining(['Pessoa Locadora de Teste', 'Pessoa Locatária de Teste']));
  expect(preview.footerCounts.every(count => count === 1)).toBe(true);

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
  await page.locator('#tab-new').focus();
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
  await expect(page.getByRole('button', { name: /Histórico/i })).toBeHidden();

  await acompanhar.click();
  await expect(acompanhar).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: /Gestão/i })).toBeVisible();
  await administrar.click();
  await expect(acompanhar).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: /Cadastros/i })).toBeVisible();
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

test('mantém a interface operacional legível e sem rolagem horizontal nas larguras de referência', async ({ page }) => {
  for (const width of [1280, 900, 767, 380, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await selecionarAba(page, /Novo documento/i);

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    expect(layout.scrollWidth, `rolagem horizontal em ${width}px`).toBeLessThanOrEqual(layout.clientWidth);

    const samples = await page.locator([
      '.version-chip',
      '.storage-indicator',
      '.field .hint',
      '.optional',
      '.form-section > summary small',
      '.issue-summary span',
      '.status-note'
    ].join(',')).evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => ({
      selector: element.className,
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize)
    })));
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every(sample => sample.fontSize >= 12), JSON.stringify(samples)).toBe(true);
  }
});

test('mantém contraste AA nos textos auxiliares e estados operacionais', async ({ page }) => {
  await selecionarAba(page, /Novo documento/i);
  const results = await page.locator([
    '.version-chip',
    '.storage-indicator',
    '.contextual-tip p',
    '.field .hint',
    '.optional',
    '.issue-summary span',
    '.status-note'
  ].join(',')).evaluateAll(elements => {
    const parse = value => {
      const channels = value.match(/[\d.]+/g)?.map(Number) || [];
      return { rgb: channels.slice(0, 3), alpha: channels[3] ?? 1 };
    };
    const background = element => {
      const layers = [];
      for (let node = element; node; node = node.parentElement) layers.push(parse(getComputedStyle(node).backgroundColor));
      let result = [255, 255, 255];
      for (const layer of layers.reverse()) {
        if (!layer.rgb.length || layer.alpha === 0) continue;
        result = layer.rgb.map((channel, index) => channel * layer.alpha + result[index] * (1 - layer.alpha));
      }
      return result;
    };
    const luminance = rgb => {
      const channels = rgb.map(channel => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    return elements.filter(element => element.getClientRects().length).map(element => {
      const foreground = parse(getComputedStyle(element).color).rgb;
      const foreLum = luminance(foreground);
      const backLum = luminance(background(element));
      return {
        text: element.textContent.trim().slice(0, 40),
        ratio: (Math.max(foreLum, backLum) + 0.05) / (Math.min(foreLum, backLum) + 0.05)
      };
    });
  });
  expect(results.length).toBeGreaterThan(0);
  expect(results.every(result => result.ratio >= 4.5), JSON.stringify(results)).toBe(true);
});

test('oferece controles primários com área de toque e foco visível de pelo menos 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 844 });
  await selecionarAba(page, /Novo documento/i);

  const controls = page.locator('#appMenuToggle, #previewMobileBtn, #clearBtn, #saveDraftBtn, #issueBtn');
  await expect(controls).toHaveCount(5);
  for (const control of await controls.all()) {
    const box = await control.boundingBox();
    expect(box?.height || 0).toBeGreaterThanOrEqual(44);
  }

  await page.locator('#previewMobileBtn').focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('#previewMobileBtn')).toBeFocused();
  const focus = await page.locator('#previewMobileBtn').evaluate(element => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
  });
  expect(focus.outlineStyle).not.toBe('none');
  expect(focus.outlineWidth).toBeGreaterThanOrEqual(3);
});

test('documenta atalhos seguros e os desativa durante a digitação', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  const shortcuts = page.getByRole('note', { name: 'Atalhos de teclado' });
  await expect(shortcuts).toContainText('Alt+N');
  await expect(shortcuts).toContainText('Alt+H');
  await expect(shortcuts).toContainText('Alt+P');
  await expect(page.locator('#tab-new')).toHaveAttribute('aria-keyshortcuts', 'Alt+N');
  await expect(page.locator('#tab-history')).toHaveAttribute('aria-keyshortcuts', 'Alt+H');
  await expect(page.locator('#previewMobileBtn')).toHaveAttribute('aria-keyshortcuts', 'Alt+P');

  await page.keyboard.press('Alt+H');
  await expect(page.locator('#view-history')).toBeVisible();
  await page.keyboard.press('Alt+N');
  await expect(page.locator('#view-new')).toBeVisible();
  await page.keyboard.press('Alt+P');
  await expect(page.locator('.workspace')).toBeFocused();

  await page.locator('#tenant').fill('Texto preservado');
  await page.keyboard.press('Alt+H');
  await expect(page.locator('#view-new')).toBeVisible();
  await expect(page.locator('#tenant')).toHaveValue('Texto preservado');

  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(persisted.history).toEqual([]);
  expect(persisted.documents).toEqual([]);
});

test('mantém o último controle editável acima da barra de ações móvel', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 844 });
  await selecionarAba(page, /Novo documento/i);
  await page.locator('.form-section').last().evaluate(element => { element.open = true; });
  const lastEditable = page.locator('#operator');
  await lastEditable.scrollIntoViewIfNeeded();

  const geometry = await page.evaluate(() => {
    const field = document.querySelector('#operator').getBoundingClientRect();
    const actions = [...document.querySelectorAll('.actions')].find(element => element.getClientRects().length)?.getBoundingClientRect();
    return { fieldBottom: field.bottom, actionsTop: actions?.top || innerHeight };
  });
  expect(geometry.fieldBottom).toBeLessThanOrEqual(geometry.actionsTop);
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
  await expect(page.locator('#view-new > .app')).toHaveCSS('display', 'none');
  await expect(page.locator('#dynamicCompletionStatus')).toContainText('0 de 3 campos obrigatórios preenchidos');
  await expect(page.locator('#dynamicCompletionStatus')).toContainText('Locatário do teste');
  await expect(page.locator('#dynamicPendingList')).toContainText('Aceite da vistoria');
  const dynamicTextarea = page.locator('.dynamic-document-form textarea').first();
  await expect(dynamicTextarea).toBeVisible();
  expect(await dynamicTextarea.evaluate(element => {
    const width = element.getBoundingClientRect().width;
    const fieldWidth = element.closest('.field').getBoundingClientRect().width;
    return width >= fieldWidth - 2;
  })).toBe(true);

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

test('mantém navegação comum por Tab, Shift+Tab e Enter sem capturar setas', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  const management = page.getByRole('button', { name: /Gestão/i });
  const dossiers = page.getByRole('button', { name: /Dossiês/i });

  await page.getByRole('button', { name: 'Acompanhar', exact: true }).click();
  await management.focus();
  await page.keyboard.press('ArrowRight');
  await expect(management).toBeFocused();
  await expect(page.locator('#view-management')).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(dossiers).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(management).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('#view-dossiers')).toBeVisible();
  await expect(page.locator('#tab-dossiers')).toHaveAttribute('aria-current', 'page');
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

test.describe('Regressões da auditoria técnica', () => {
  test('reduz deslocamentos sem remover o feedback visual de estado', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await selecionarAba(page, /Novo documento/i);
    await page.evaluate(() => window.paraibaDocumentApp.notify('Alteração salva.'));
    await expect(page.locator('#toast')).toHaveClass(/show/);
    await expect.poll(() => page.locator('#toast').evaluate(element => getComputedStyle(element).opacity)).toBe('1');

    const motion = await page.evaluate(() => {
      const view = getComputedStyle(document.querySelector('#view-new'));
      const menu = getComputedStyle(document.querySelector('.tab-group-items'));
      const toast = getComputedStyle(document.querySelector('#toast'));
      const field = getComputedStyle(document.querySelector('#tenant'));
      return {
        viewAnimation: view.animationName,
        menuTransform: menu.transform,
        menuTransition: menu.transitionProperty,
        toastTransform: toast.transform,
        toastTransition: toast.transitionProperty,
        toastOpacity: toast.opacity,
        fieldTransition: field.transitionProperty
      };
    });

    expect(motion.viewAnimation).toBe('none');
    expect(motion.menuTransform).toBe('none');
    expect(motion.menuTransition).toBe('opacity');
    expect(motion.toastTransform).toBe('none');
    expect(motion.toastTransition).toBe('opacity');
    expect(Number(motion.toastOpacity)).toBeGreaterThan(0);
    expect(motion.fieldTransition).toContain('border-color');
    expect(motion.fieldTransition).not.toContain('transform');
  });

  test('preserva o texto da Gestão com o espaçamento da WCAG 1.4.12', async ({ page }) => {
    await carregarEstadoGestao(page, estadoGestao({
      draftDocuments: [{
        id: 'rascunho-wcag-1412',
        type: 'declaration',
        status: 'draft',
        updatedAt: '2026-09-25T10:00:00.000Z',
        fields: {
          docTitle: 'Declaração demonstrativa com título operacional extenso que precisa permanecer integralmente legível'
        }
      }]
    }));
    await page.addStyleTag({ content: `
      #view-management {
        line-height: 1.5 !important;
        letter-spacing: 0.12em !important;
        word-spacing: 0.16em !important;
      }
      #view-management p { margin-bottom: 2em !important; }
    ` });

    for (const width of [1280, 900, 767, 380, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const layout = await page.locator('#managementContinue .management-row strong').evaluate(element => {
        const style = getComputedStyle(element);
        return {
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          overflow: style.overflow,
          textOverflow: style.textOverflow,
          whiteSpace: style.whiteSpace,
          rowWidth: element.parentElement.clientWidth,
          pageClientWidth: document.documentElement.clientWidth,
          pageScrollWidth: document.documentElement.scrollWidth
        };
      });

      expect(layout.overflow, `overflow em ${width}px`).not.toBe('hidden');
      expect(layout.textOverflow, `elipse em ${width}px`).not.toBe('ellipsis');
      expect(layout.whiteSpace, `quebra de linha em ${width}px`).toBe('normal');
      expect(layout.clientWidth, `título comprimido em ${width}px`).toBeGreaterThanOrEqual(layout.rowWidth * 0.65);
      expect(layout.scrollWidth, `texto horizontalmente cortado em ${width}px`).toBeLessThanOrEqual(layout.clientWidth + 1);
      expect(layout.scrollHeight, `texto verticalmente cortado em ${width}px`).toBeLessThanOrEqual(layout.clientHeight + 1);
      expect(layout.pageScrollWidth, `rolagem horizontal em ${width}px`).toBeLessThanOrEqual(layout.pageClientWidth);
    }
  });

  test('usa navegação agrupada comum sem papéis de abas nem captura de setas', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 844 });
    await selecionarAba(page, /Novo documento/i);
    const issueGroupToggle = page.getByRole('button', { name: 'Emitir', exact: true });
    if (await issueGroupToggle.getAttribute('aria-expanded') !== 'true') await issueGroupToggle.click();
    const source = page.locator('#tab-new');
    await source.focus();
    await expect(source).toBeFocused();

    const sourceGroup = await source.evaluate(element => element.closest('[role="group"]')?.getAttribute('aria-labelledby'));
    await page.keyboard.press('ArrowRight');
    const destination = await page.evaluate(() => ({
      id: document.activeElement?.id,
      current: document.activeElement?.getAttribute('aria-current')
    }));

    expect(sourceGroup).toBe('navGroupIssueToggle');
    expect(destination).toEqual({ id: 'tab-new', current: 'page' });
    await expect(page.locator('[role="tablist"], [role="tab"], [role="tabpanel"]')).toHaveCount(0);
  });

  test('não mantém labels órfãos e expõe agrupamentos de formulário coerentes', async ({ page }) => {
    const orphanLabels = await page.locator('label').evaluateAll(labels => labels
      .filter(label => {
        const control = label.htmlFor
          ? document.getElementById(label.htmlFor)
          : label.querySelector('button, input, meter, output, progress, select, textarea');
        return !control;
      })
      .map(label => label.textContent.trim().replace(/\s+/g, ' '))
    );

    expect(orphanLabels).toEqual([]);
    await expect(page.locator('#amountWords')).toHaveAttribute('for', 'amount');
    await expect(page.locator('#amountWords')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('fieldset.clause-library > legend')).toHaveText('Biblioteca de cláusulas');
    await expect(page.getByLabel('Incluir rodapé institucional no documento')).toHaveCount(1);
  });

  test('mantém controles de formatação e reordenação com pelo menos 44 por 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 844 });
    await selecionarAba(page, /Modelos/i);

    const undersizedTargets = await page
      .locator('.template-toolbar button, .template-field-actions button')
      .evaluateAll(elements => elements
        .filter(element => element.getClientRects().length)
        .map(element => {
          const rect = element.getBoundingClientRect();
          return {
            name: element.getAttribute('aria-label') || element.textContent.trim(),
            width: rect.width,
            height: rect.height
          };
        })
        .filter(({ width, height }) => width < 44 || height < 44)
      );

    expect(undersizedTargets).toEqual([]);
  });
});

test.describe('Fase 3 — reflow, texto ampliado e toque', () => {
  test('mantém campos, filtros e labels de checkbox com alvo efetivo de 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 844 });
    const samples = [];

    for (const [view, selector, reveal] of [
      [/Novo documento/i, '#view-new .field input, #view-new .field select, #view-new .field textarea'],
      [/Histórico/i, '#view-history .filter-field input, #view-history .filter-field select', '#historyFiltersToggle'],
      [/Modelos/i, '#view-templates .template-field-control input, #view-templates .template-field-control select, #view-templates .template-field-options textarea, #view-templates .template-toolbar select']
    ]) {
      await selecionarAba(page, view);
      if (reveal) await page.locator(reveal).click();
      await page.locator(selector).first().waitFor({ state: 'visible' });
      const controls = await page.locator(selector).evaluateAll(elements => elements
        .filter(element => element.getClientRects().length && !['checkbox', 'radio'].includes(element.type))
        .map(element => ({
          name: element.getAttribute('aria-label') || element.id || element.name,
          height: element.getBoundingClientRect().height
        }))
      );
      expect(controls.length, `controles visíveis em ${view}`).toBeGreaterThan(0);
      samples.push(...controls);
    }

    expect(samples.filter(({ height }) => height < 44), JSON.stringify(samples, null, 2)).toEqual([]);

    await selecionarAba(page, /Novo documento/i);
    await page.getByRole('button', { name: 'Contrato', exact: true }).click();
    const checkboxLabel = page.locator('.clause-library .check-row').first();
    const checkbox = checkboxLabel.locator('input');
    const labelBox = await checkboxLabel.boundingBox();
    const checkboxBox = await checkbox.boundingBox();
    expect(labelBox?.height || 0).toBeGreaterThanOrEqual(44);
    expect(labelBox?.width || 0).toBeGreaterThanOrEqual(44);
    expect(checkboxBox?.width || 0).toBeLessThan(44);
    await checkboxLabel.click({ position: { x: (labelBox?.width || 44) - 8, y: (labelBox?.height || 44) / 2 } });
    await expect(checkbox).toBeChecked();
  });

  test('mantém o último controle e os erros acima da barra fixa móvel', async ({ page }) => {
    for (const width of [380, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await selecionarAba(page, /Novo documento/i);
      await page.locator('#issueBtn').click();

      for (const selector of ['#receiptDate', '#propertyError']) {
        await page.locator(selector).evaluate(element => element.scrollIntoView({ block: 'end', behavior: 'instant' }));
        const positions = await page.evaluate((targetSelector) => {
          const target = document.querySelector(targetSelector).getBoundingClientRect();
          const actions = [...document.querySelectorAll('.actions')]
            .find(element => element.getClientRects().length)
            .getBoundingClientRect();
          return { targetBottom: target.bottom, actionsTop: actions.top };
        }, selector);
        expect(positions.targetBottom, `${selector} coberto em ${width}px`).toBeLessThanOrEqual(positions.actionsTop - 8);
      }
    }
  });

  test('abre e fecha a prévia móvel sem deslocar a página e preserva as safe areas', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 844 });
    await selecionarAba(page, /Novo documento/i);
    await page.evaluate(() => window.scrollTo(0, Math.min(360, document.documentElement.scrollHeight - innerHeight)));
    const before = await page.evaluate(() => ({ scrollY, panelLeft: document.querySelector('.panel').getBoundingClientRect().left }));

    await page.locator('#previewMobileBtn').evaluate(button => button.click());
    await expect(page.locator('body')).toHaveClass(/preview-open/);
    const opened = await page.evaluate(() => {
      const workspace = document.querySelector('.workspace').getBoundingClientRect();
      return {
        scrollY,
        panelLeft: document.querySelector('.panel').getBoundingClientRect().left,
        workspaceLeft: workspace.left,
        workspaceRight: workspace.right,
        viewportWidth: innerWidth,
        actionVisible: Boolean([...document.querySelectorAll('.actions')].find(element => element.getClientRects().length)),
        viewportFit: document.querySelector('meta[name="viewport"]')?.content || '',
        safeAreaRule: [...document.styleSheets].some(sheet => {
          try {
            return [...sheet.cssRules].some(rule => rule.cssText.includes('safe-area-inset-bottom'));
          } catch {
            return false;
          }
        })
      };
    });

    expect(opened.scrollY).toBe(before.scrollY);
    expect(opened.panelLeft).toBeCloseTo(before.panelLeft, 0);
    expect(opened.workspaceLeft).toBeGreaterThanOrEqual(0);
    expect(opened.workspaceRight).toBeLessThanOrEqual(opened.viewportWidth);
    expect(opened.actionVisible).toBe(false);
    expect(opened.viewportFit).toContain('viewport-fit=cover');
    expect(opened.safeAreaRule).toBe(true);

    await page.locator('#previewCloseBtn').click();
    await expect(page.locator('body')).not.toHaveClass(/preview-open/);
    expect(await page.evaluate(() => scrollY)).toBe(before.scrollY);
  });
});

test.describe('Fase 2 — semântica e acessibilidade', () => {
  test('mantém IDs únicos e todas as referências ARIA válidas', async ({ page }) => {
    const navigation = page.getByRole('navigation', { name: 'Áreas do gerador', includeHidden: true });
    await expect(navigation).toHaveCount(1);
    for (const group of ['Emitir', 'Acompanhar', 'Administrar']) {
      await expect(navigation.getByRole('group', { name: group, includeHidden: true })).toHaveCount(1);
    }

    const diagnostics = await page.evaluate(() => {
      const allIds = [...document.querySelectorAll('[id]')].map(element => element.id);
      const duplicateIds = [...new Set(allIds.filter((id, index) => allIds.indexOf(id) !== index))];
      const referenceAttributes = ['aria-controls', 'aria-describedby', 'aria-labelledby', 'aria-owns', 'for'];
      const missingReferences = [];

      document.querySelectorAll(referenceAttributes.map(attribute => `[${attribute}]`).join(',')).forEach(element => {
        referenceAttributes.forEach(attribute => {
          const value = element.getAttribute(attribute);
          if (!value) return;
          value.split(/\s+/).filter(Boolean).forEach(id => {
            if (!document.getElementById(id)) missingReferences.push({ element: element.id || element.tagName, attribute, id });
          });
        });
      });

      return { duplicateIds, missingReferences };
    });

    expect(diagnostics).toEqual({ duplicateIds: [], missingReferences: [] });
  });

  const destinations = [
    { name: /Novo documento/i, label: 'Novo documento', group: 'Emitir', id: 'tab-new' },
    { name: /^Gestão$/i, label: 'Gestão', group: 'Acompanhar', id: 'tab-management' },
    { name: /Dossiês/i, label: 'Dossiês', group: 'Acompanhar', id: 'tab-dossiers' },
    { name: /Histórico/i, label: 'Histórico', group: 'Acompanhar', id: 'tab-history' },
    { name: /Cadastros/i, label: 'Cadastros', group: 'Administrar', id: 'tab-contacts' },
    { name: /Clientes/i, label: 'Clientes', group: 'Administrar', id: 'tab-clients' },
    { name: /Modelos/i, label: 'Modelos', group: 'Administrar', id: 'tab-templates' },
    { name: /Backup e segurança/i, label: 'Backup e segurança', group: 'Administrar', id: 'tab-safety' }
  ];

  for (const destination of destinations) {
    test(`não encontra violações críticas ou sérias na área ${destination.label}`, async ({ page }) => {
      if (destination.id === 'tab-templates') test.setTimeout(60_000);
      await selecionarAba(page, destination.name);
      await expect(page.locator(`#${destination.id}`)).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.app-tabs [aria-current="page"]')).toHaveCount(1);
      const menuToggle = page.locator('#appMenuToggle');
      if (await menuToggle.isVisible() && await menuToggle.getAttribute('aria-expanded') !== 'true') await menuToggle.click();
      const groupToggle = page.getByRole('button', { name: destination.group, exact: true });
      if (await groupToggle.getAttribute('aria-expanded') !== 'true') await groupToggle.click();
      await expect(page.locator(`#${await groupToggle.getAttribute('aria-controls')}`)).toHaveCSS('opacity', '1');
      await expect(page.locator(`#view-${destination.id.replace('tab-', '')}`)).toHaveCSS('opacity', '1');
      if (destination.id === 'tab-templates') {
        await expect(page.locator('#templateCatalog .template-resource-card').first()).toBeVisible();
      }
      await esperarSemViolacoesAxeGraves(page);
      await page.keyboard.press('Escape');
    });
  }

  test('não encontra violações críticas ou sérias nos modais abertos', async ({ page }) => {
    for (const modalId of ['confirmModal', 'actionModal', 'cancelModal', 'managementStatusModal', 'managementLockModal']) {
      await page.evaluate(id => window.paraibaDocumentApp.openModal(id), modalId);
      await expect(page.locator(`#${modalId}`)).toBeVisible();
      await esperarSemViolacoesAxeGraves(page, `#${modalId}`);
      await page.evaluate(id => window.paraibaDocumentApp.closeModal(id), modalId);
      await expect(page.locator(`#${modalId}`)).toBeHidden();
    }
  });
});

test.describe('Fase 1 — agendamento e finalização da paginação A4', () => {
  async function preencherContratoGenericoValido(page, customClauses = 'Cláusula demonstrativa suficiente para validar a emissão do contrato.') {
    await selecionarAba(page, /Novo documento/i);
    await page.getByRole('button', { name: 'Contrato', exact: true }).click();
    await page.locator('#docLandlord').fill('Pessoa Locadora de Teste');
    await page.locator('#docTenantParty').fill('Pessoa Locatária de Teste');
    await page.locator('#docContractProperty').fill('Imóvel demonstrativo para paginação');
    await page.locator('#docCustomClauses').fill(customClauses);
  }

  test('consolida dez entradas rápidas em no máximo duas paginações', async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 844 });
    await preencherContratoGenericoValido(page);
    const preview = page.locator('#documentPagesPreview');
    await expect(preview).toHaveAttribute('aria-busy', 'false');
    const session = testInfo.project.name === 'chromium' ? await context.newCDPSession(page) : null;
    if (session) await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    try {
      await page.evaluate(() => {
        window.__auditPaginationRuns = 0;
        const originalReplaceChildren = Element.prototype.replaceChildren;
        Element.prototype.replaceChildren = function (...nodes) {
          if (this.id === 'documentPagesPreview') window.__auditPaginationRuns += 1;
          return originalReplaceChildren.apply(this, nodes);
        };
        const field = document.querySelector('#docCustomClauses');
        const start = performance.now();
        window.__auditPaginationResult = new Promise(resolve => {
          document.addEventListener('document-preview:paginated', () => resolve({
            runs: window.__auditPaginationRuns,
            elapsed: performance.now() - start,
            text: document.querySelector('#documentPagesPreview').textContent
          }), { once: true });
        });
        for (let index = 1; index <= 10; index += 1) {
          field.value = `Entrada rápida final ${index}`;
          field.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      await expect(preview).toHaveAttribute('aria-busy', 'true');
      const result = await page.evaluate(() => window.__auditPaginationResult);
      await expect(preview).toHaveAttribute('aria-busy', 'false');

      expect(result.runs).toBeGreaterThan(0);
      expect(result.runs).toBeLessThanOrEqual(2);
      expect(result.elapsed).toBeLessThan(300);
      expect(result.text).toContain('Entrada rápida final 10');
    } finally {
      if (session) {
        await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await session.detach();
      }
    }
  });

  test('finaliza a paginação pendente antes de abrir a revisão', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 844 });
    await preencherContratoGenericoValido(page);
    await expect(page.locator('#documentPagesPreview')).toHaveAttribute('aria-busy', 'false');

    const stateAtReview = await page.evaluate(() => {
      window.__auditPaginationRuns = 0;
      const originalReplaceChildren = Element.prototype.replaceChildren;
      Element.prototype.replaceChildren = function (...nodes) {
        if (this.id === 'documentPagesPreview') window.__auditPaginationRuns += 1;
        return originalReplaceChildren.apply(this, nodes);
      };
      const field = document.querySelector('#docCustomClauses');
      field.value = 'Cláusula final presente na revisão e na prévia definitiva.';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#genericIssueBtn').click();
      const preview = document.querySelector('#documentPagesPreview');
      return {
        modalVisible: !document.querySelector('#confirmModal').hidden,
        paginationRuns: window.__auditPaginationRuns,
        busy: preview.getAttribute('aria-busy'),
        previewText: preview.textContent
      };
    });

    expect(stateAtReview).toMatchObject({
      modalVisible: true,
      paginationRuns: 1,
      busy: 'false'
    });
    expect(stateAtReview.previewText).toContain('Cláusula final presente na revisão');
  });

  test('mantém a paginação suspensa no mobile e a conclui ao abrir a prévia', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 844 });
    await selecionarAba(page, /Novo documento/i);
    await page.getByRole('button', { name: 'Contrato', exact: true }).click();

    const stateWhileClosed = await page.evaluate(async () => {
      window.__auditPaginationRuns = 0;
      const originalReplaceChildren = Element.prototype.replaceChildren;
      Element.prototype.replaceChildren = function (...nodes) {
        if (this.id === 'documentPagesPreview') window.__auditPaginationRuns += 1;
        return originalReplaceChildren.apply(this, nodes);
      };
      const field = document.querySelector('#docCustomClauses');
      for (let index = 1; index <= 10; index += 1) {
        field.value = `Conteúdo mobile mais recente ${index}`;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const footer = document.querySelector('#docFooterEnabled');
      footer.checked = !footer.checked;
      footer.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        runs: window.__auditPaginationRuns,
        busy: document.querySelector('#documentPagesPreview').getAttribute('aria-busy')
      };
    });

    expect(stateWhileClosed).toEqual({ runs: 0, busy: 'true' });
    await page.locator('#previewMobileBtn').click();
    await expect(page.locator('#documentPagesPreview')).toHaveAttribute('aria-busy', 'false');
    const stateAfterOpen = await page.evaluate(() => ({
      runs: window.__auditPaginationRuns,
      text: document.querySelector('#documentPagesPreview').textContent
    }));
    expect(stateAfterOpen.runs).toBe(1);
    expect(stateAfterOpen.text).toContain('Conteúdo mobile mais recente 10');
  });

  test('finaliza uma paginação pendente uma única vez antes de imprimir', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 844 });
    await preencherContratoGenericoValido(page);
    await page.locator('#genericIssueBtn').click();
    await confirmarRevisao(page);
    await expect(page.locator('#genericPrintBtn')).toBeEnabled();
    await expect(page.locator('#documentPagesPreview')).toHaveAttribute('aria-busy', 'false');

    const printEvents = await page.evaluate(async () => {
      const events = [];
      const originalReplaceChildren = Element.prototype.replaceChildren;
      Element.prototype.replaceChildren = function (...nodes) {
        if (this.id === 'documentPagesPreview') events.push('paginate');
        return originalReplaceChildren.apply(this, nodes);
      };
      window.print = () => events.push('print');
      const field = document.querySelector('#docTitle');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#genericPrintBtn').click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return events;
    });

    expect(printEvents).toEqual(['paginate', 'print']);
  });

  test('pagina uma atualização longa abaixo de 200 ms com CPU 4×', async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 844 });
    const clauses = Array.from({ length: 10 }, (_, index) =>
      `${index + 1}. Cláusula extensa para medir a paginação final sob limitação de CPU. `.repeat(6)
    ).join('\n\n');
    await preencherContratoGenericoValido(page, clauses);
    await expect(page.locator('#documentPagesPreview')).toHaveAttribute('aria-busy', 'false');
    if (testInfo.project.name !== 'chromium') {
      expect(await page.locator('[data-document-preview-page]').count()).toBeGreaterThan(1);
      return;
    }

    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    try {
      const metrics = [];
      for (const enabled of [true, false, true]) {
        await page.evaluate(() => {
          window.__nextPaginationMetric = new Promise(resolve =>
            document.addEventListener('document-preview:paginated', event => resolve(event.detail), { once: true })
          );
        });
        await page.locator('#docFooterEnabled').setChecked(enabled);
        metrics.push(await page.evaluate(() => window.__nextPaginationMetric));
      }
      expect(metrics.every(metric => metric.pageCount > 1)).toBe(true);
      const durations = metrics.map(metric => metric.duration).sort((a, b) => a - b);
      expect(durations[1]).toBeLessThan(200);
      expect(durations[2]).toBeLessThan(300);
    } finally {
      await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await session.detach();
    }
  });
});
