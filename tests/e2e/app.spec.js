import { expect, test } from '@playwright/test';

const storageKey = 'paraibaImoveisRecibosV3';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => localStorage.removeItem(key), storageKey);
  await page.goto('/');
});

async function selecionarAba(page, name) {
  const toggle = page.locator('#appMenuToggle');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') {
    await toggle.click();
  }
  await page.getByRole('tab', { name }).click();
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

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#genericIssueBtn').click();

  await expect(page.locator('#genericStatus')).toContainText('emitido');
  await expect(page.locator('#genericPrintBtn')).toBeEnabled();
  await expect(page.locator('#dpNumber')).toContainText('DECL-001/2026');
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
  expect(saved.meta.schemaVersion).toBe(10);
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
  expect(migrated.meta.schemaVersion).toBe(10);
  expect(migrated.contacts).toHaveLength(1);
  expect(migrated.clients).toEqual([]);
  await expect(page.locator('#savedTenant')).toContainText('Pessoa de Migração');
  const backup = await page.evaluate((key) => localStorage.getItem(`${key}_antes_schema_10`), storageKey);
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
  await page.getByRole('tab', { name: /Novo documento/i }).focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#view-new')).toBeVisible();
});

test('mantém os controles essenciais visíveis sem rolagem horizontal', async ({ page, isMobile }) => {
  await selecionarAba(page, /Novo documento/i);
  if (isMobile) {
    await expect(page.locator('#previewMobileBtn')).toBeVisible();
  } else {
    await expect(page.locator('#receipt')).toBeVisible();
  }

  await expect(isMobile ? page.locator('#appMenuToggle') : page.getByRole('tab', { name: /Novo documento/i })).toBeVisible();
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
  await page.locator('#batchDossierList input').check();
  await page.locator('#buildBatchBtn').click();
  await expect(page.locator('#batchPreview')).toContainText('R$ 950,00');
  await expect(page.locator('#issueBatchBtn')).toBeEnabled();

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#issueBatchBtn').click();
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
