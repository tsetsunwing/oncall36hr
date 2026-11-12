import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ui } from '../src/i18n';

const MOCK_ORIGIN = `http://127.0.0.1:${process.env.MOCK_AI_PORT ?? '8787'}`;
const MOCK_BASE_URL = `${MOCK_ORIGIN}/v1`;
const SHOTS = process.env.M3_SHOTS;

async function openGame(page: Page, model: string, seed: string, extraQuery = '') {
  await page.request.post(`${MOCK_ORIGIN}/__reset`);
  await page.addInitScript(
    ({ baseUrl, model: m }) => {
      localStorage.setItem(
        'dandu.settings.v1',
        JSON.stringify({ baseUrl, apiKey: 'test-key', model: m, nurseConfirmHighRisk: true }),
      );
    },
    { baseUrl: MOCK_BASE_URL, model },
  );
  await page.goto(`/#/game?seed=${seed}&case=pna-sepsis-01${extraQuery}`);
  await expect(page.getByTestId('monitor')).toBeVisible();
}

async function send(page: Page, text: string) {
  await page.getByLabel(ui.game.chat.inputLabel).fill(text);
  await page.getByRole('button', { name: ui.game.chat.send, exact: true }).click();
}

async function openSidePanel(page: Page) {
  const toggle = page.getByRole('button', { name: ui.game.log.open });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.getByTestId('side-panel')).toBeVisible();
}

async function closeSidePanel(page: Page) {
  const close = page.getByRole('button', { name: ui.game.log.close });
  if (await close.isVisible()) await close.click();
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.screenshot({
    path: `${SHOTS}/${name}-${test.info().project.name}.png`,
    fullPage: true,
  });
}

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .exclude('[data-testid="mews-badge"]')
    .exclude('.present-chip-hit')
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe('M3 order + gate flow', () => {
  test('Augmentin with penicillin allergy: objections, two insists, release; axe clean', async ({
    page,
  }) => {
    await openGame(page, 'mock-ok', 'e2e-gate');
    await page.getByRole('button', { name: ui.game.speedOption(4) }).click();
    await send(page, 'augmentin 1.2 g iv');

    const card = page.getByTestId('gate-card');
    await expect(card).toHaveAttribute('data-phase', 'DECISION', { timeout: 20_000 });
    await expect(card).toContainText('Amoxicillin-clavulanate');
    await expect(card).toContainText(ui.game.gate.category.ALLERGY ?? '');
    await expect(card).toContainText('Penicillin');
    await expect(page.locator('[data-kind="PHARMACY"]').first()).toContainText(ui.game.chat.phone);
    await page.getByTestId('pause-toggle').click();
    await shot(page, 'gate-decision');
    await expectAxeClean(page);
    await page.getByTestId('pause-toggle').click();

    await page.getByTestId('insist-button').click();
    await expect(card).toHaveAttribute('data-phase', 'RECONFIRM', { timeout: 20_000 });
    await expect(page.locator('[data-kind="PHARMACY"]')).toHaveCount(2, { timeout: 20_000 });
    await page.getByTestId('pause-toggle').click();
    await shot(page, 'gate-reconfirm');
    await expectAxeClean(page);
    await page.getByTestId('pause-toggle').click();

    await page.getByTestId('insist-button').click();
    await expect(page.getByTestId('gate-card')).toHaveCount(0, { timeout: 20_000 });
    await openSidePanel(page);
    await expect(page.getByTestId('order-row').first()).toContainText('Amoxicillin-clavulanate');
    await expect(page.getByTestId('order-row').first()).not.toHaveAttribute('data-status', 'GATED');
    await expect(
      page.locator('[data-kind="NURSE"]').filter({ hasText: 'Amoxicillin-clavulanate' }).first(),
    ).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('pause-toggle').click();
    await shot(page, 'gate-released');
    await expectAxeClean(page);
  });

  test('cancelling a gated order removes the card and never starts the order', async ({ page }) => {
    await openGame(page, 'mock-ok', 'e2e-gate-cancel');
    await send(page, 'augmentin 1.2 g iv');
    const card = page.getByTestId('gate-card');
    await expect(card).toHaveAttribute('data-phase', 'DECISION', { timeout: 20_000 });
    await page.getByTestId('pause-toggle').click();
    await card.getByRole('button', { name: /^取消/ }).click();
    await expect(page.getByTestId('gate-card')).toHaveCount(0);
    await openSidePanel(page);
    await expect(page.getByTestId('order-row').first()).toHaveAttribute('data-status', 'CANCELLED');
  });

  test('lab order: report arrives after the table delay, with flags, reference ranges and the placeholder notice', async ({
    page,
  }) => {
    await openGame(page, 'mock-ok', 'e2e-lab', '&realsec=1');
    await page.getByRole('button', { name: ui.game.speedOption(4) }).click();
    await send(page, 'cbc');
    await openSidePanel(page);
    const reports = page.getByTestId('reports');
    await expect(reports.getByTestId('report-row')).toHaveCount(1, { timeout: 40_000 });
    await expect(reports.getByRole('table')).toContainText('WBC');
    await expect(reports).toContainText(ui.game.reports.pending);
    await page.getByTestId('pause-toggle').click();
    await expect(page.getByTestId('order-row').first()).toContainText(
      ui.game.orders.resultStatus.REPORTED,
    );
    await shot(page, 'lab-report');
    await expectAxeClean(page);
    await closeSidePanel(page);
    await expect(page.locator('[data-kind="NURSE"]').filter({ hasText: '報告出咗' })).toBeVisible();
  });
});
