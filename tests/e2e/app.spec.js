import { expect, test } from '@playwright/test';

const storageKey = 'paraibaImoveisRecibosV3';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => localStorage.removeItem(key), storageKey);
  await page.goto('/');
});

async function preencherReciboValido(page) {
  await page.locator('#tenant').fill('Maria da Silva');
  await page.locator('#cpf').fill('52998224725');
  await page.locator('#property').fill('Rua das Acácias, 100, Centro');
  await page.locator('#amount').fill('1500,50');
  await page.locator('#reference').fill('2026-09');
  await page.locator('#receiptDate').fill('2026-09-25');
}

test('carrega o gerador e permite navegar pelas áreas principais', async ({ page }) => {
  await expect(page).toHaveTitle(/Gerador de Recibos de Aluguel/i);
  await expect(page.getByRole('heading', { name: 'Gerador de documentos' })).toBeVisible();
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

test('mantém os controles essenciais visíveis sem rolagem horizontal', async ({ page, isMobile }) => {
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
