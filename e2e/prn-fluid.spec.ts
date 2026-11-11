import { expect, test, type Page } from '@playwright/test';

const mockOrigin = `http://127.0.0.1:${process.env.MOCK_AI_PORT ?? '8787'}`;

async function openBed(page: Page) {
  await page.request.post(`${mockOrigin}/__reset`);
  await page.addInitScript((baseUrl) => {
    localStorage.setItem(
      'dandu.settings.v1',
      JSON.stringify({
        baseUrl,
        apiKey: 'test-key',
        model: 'mock-ok',
        nurseConfirmHighRisk: false,
      }),
    );
  }, `${mockOrigin}/v1`);
  await page.goto('/#/game?seed=prn-fluid-ui&mode=NIGHT&difficulty=MEDIUM&rank=MO&realsec=0.5');
  await expect(page.getByTestId('game-screen')).toBeVisible();
  if (!(await page.getByTestId('floor-plan').isVisible()))
    await page.getByTestId('open-beds').click();
  await page.locator('[data-testid^="bed-"]:not([data-level="EMPTY"])').first().click();
  await expect(page.getByTestId('monitor')).toBeVisible({ timeout: 30_000 });
  if (await page.getByTestId('close-beds').isVisible())
    await page.getByTestId('close-beds').click();
}
async function openRecord(page: Page) {
  if (!(await page.getByTestId('open-medical-record').isVisible()))
    await page.getByTestId('open-beds').click();
  await page.getByTestId('open-medical-record').click();
  return page.getByTestId('medical-record');
}

test('continuous fluid order cycles and records bags in the medical record', async ({ page }) => {
  await openBed(page);
  await page.getByRole('button', { name: '治療', exact: true }).click();
  await page.getByTestId('treat-fluid').click();
  await page.getByLabel('每瓶容量 mL').fill('500');
  await page.getByLabel('每瓶輸注時間（小時）').fill('0.01');
  await page.getByLabel('最多瓶數').fill('2');
  await page.getByTestId('continuous-fluid-form').getByRole('button', { name: '確認' }).click();
  const record = await openRecord(page);
  await expect(record).toContainText('D5 → D5 → NS');
  await expect(record.getByText(/D5 · 500 mL · 開始/)).toHaveCount(2, { timeout: 15_000 });
  await expect(record).toContainText('完成');
});

test('PRN fever order shows nurse assessment when condition is not met', async ({ page }) => {
  await openBed(page);
  await page.getByRole('button', { name: '治療', exact: true }).click();
  await page.getByTestId('treat-drug').click();
  await page.getByTestId('drug-order-name').fill('paracetamol');
  await page
    .getByRole('option', { name: /Paracetamol/i })
    .first()
    .click();
  await page.getByTestId('drug-order-route').selectOption({ label: 'PO (Oral)' });
  await page.getByTestId('drug-order-dose').fill('500');
  await page.getByTestId('drug-order-unit').selectOption({ label: 'mg' });
  await page.getByTestId('drug-order-frequency').selectOption({ label: 'Q4H' });
  await page.getByTestId('drug-order-prn').selectOption({ label: 'Fever' });
  await page.getByTestId('drug-order-prn-comparison').selectOption('≥');
  await page.getByTestId('drug-order-prn-threshold').fill('38');
  await page.getByTestId('drug-order-confirm').click();
  const record = await openRecord(page);
  await expect(record).toContainText('PRN Fever >= 38');
  await expect(record).toContainText('未達條件', { timeout: 30_000 });
  await expect(record).not.toContainText('已給');
});
