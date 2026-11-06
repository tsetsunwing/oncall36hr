import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ui } from '../src/i18n';

const MOCK_BASE_URL = 'http://127.0.0.1:8787/v1';

async function fillSettings(page: Page, values: { key: string; model?: string }) {
  await page.getByLabel(ui.settings.baseUrlLabel, { exact: true }).fill(MOCK_BASE_URL);
  await page.getByLabel(ui.settings.apiKeyLabel, { exact: true }).fill(values.key);
  await page.getByLabel(ui.settings.modelLabel, { exact: true }).fill(values.model ?? 'mock-ok');
}

test.describe('M0 acceptance', () => {
  test('without a key the game cannot start; settings persist in localStorage; start unlocks', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('start-blocked')).toContainText(ui.start.blockedMissingKey);
    await expect(page.getByRole('button', { name: ui.start.startButton })).toBeDisabled();

    await page.goto('/#/game');
    await expect(page.getByTestId('start-blocked')).toBeVisible();
    await expect(page.getByTestId('game-screen')).toHaveCount(0);

    await page.getByRole('link', { name: ui.start.settingsLink }).click();
    await fillSettings(page, { key: 'test-key' });
    await page.getByRole('button', { name: ui.settings.save }).click();
    await expect(page.getByTestId('settings-notice')).toHaveText(ui.settings.saved);

    const stored = await page.evaluate(() => localStorage.getItem('dandu.settings.v1'));
    expect(JSON.parse(stored ?? '{}')).toMatchObject({
      baseUrl: MOCK_BASE_URL,
      apiKey: 'test-key',
      model: 'mock-ok',
    });

    await page.reload();
    await expect(page.getByLabel(ui.settings.apiKeyLabel, { exact: true })).toHaveValue('test-key');

    await page.getByRole('link', { name: ui.nav.start }).click();
    await page.getByRole('button', { name: ui.start.startButton }).click();
    await expect(page.getByTestId('game-screen')).toBeVisible();
  });

  test('connection test: success, wrong key, and server error', async ({ page }) => {
    await page.goto('/#/settings');
    const result = page.getByTestId('connection-result');

    await fillSettings(page, { key: 'test-key' });
    await page.getByRole('button', { name: ui.settings.testConnection }).click();
    await expect(result).toHaveAttribute('data-ok', 'true');
    await expect(result).toHaveText(ui.settings.testResult.ok);

    await page.getByLabel(ui.settings.apiKeyLabel, { exact: true }).fill('wrong-key');
    await page.getByRole('button', { name: ui.settings.testConnection }).click();
    await expect(result).toHaveAttribute('data-ok', 'false');
    await expect(result).toContainText(ui.settings.testResult.auth);

    await fillSettings(page, { key: 'test-key', model: 'mock-5xx' });
    await page.getByRole('button', { name: ui.settings.testConnection }).click();
    await expect(result).toContainText(`${ui.settings.testResult.http}500`);

    await page.getByLabel(ui.settings.baseUrlLabel, { exact: true }).fill('http://127.0.0.1:9/v1');
    await page.getByRole('button', { name: ui.settings.testConnection }).click();
    await expect(result).toContainText(ui.settings.testResult.network);
  });

  for (const route of ['/#/', '/#/settings']) {
    test(`axe: no violations on ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
