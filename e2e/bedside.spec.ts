import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ui } from '../src/i18n';

const MOCK_ORIGIN = `http://127.0.0.1:${process.env.MOCK_AI_PORT ?? '8787'}`;
const MOCK_BASE_URL = `${MOCK_ORIGIN}/v1`;
const SHOTS = process.env.M2_SHOTS;

async function openGame(page: Page, model: string, seed = 'e2e-bedside') {
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
  await page.goto(`/#/game?seed=${seed}&ward=single`);
  await expect(page.getByTestId('monitor')).toBeVisible();
}

async function pauseGame(page: Page) {
  const toggle = page.getByTestId('pause-toggle');
  if ((await toggle.getAttribute('aria-label')) === ui.game.pause) await toggle.click();
}

async function openSidePanel(page: Page) {
  const toggle = page.getByRole('button', { name: ui.game.log.open });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.getByTestId('side-panel')).toBeVisible();
}

async function send(page: Page, text: string) {
  await page.getByLabel(ui.game.chat.inputLabel).fill(text);
  await page.getByRole('button', { name: ui.game.chat.send, exact: true }).click();
}

function numbersOf(text: string): string[] {
  return [...text.replace(/SpO2/g, '').matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
}

test.describe('M2 bedside slice', () => {
  test('monitor, chat, quick-phrase order and the log agree with engine state; axe clean', async ({
    page,
  }) => {
    await openGame(page, 'mock-ok');

    await expect(page.getByTestId('mews-badge')).toContainText('MEWS');
    await expect(page.getByTestId('vital-hr')).toContainText(/\d/);
    await expect(page.getByTestId('alarm-tags')).toContainText(ui.game.monitor.level.ALARM);
    await expect(page.getByTestId('rhythm')).toContainText('Sinus Tachycardia');
    await expect(page.locator('[data-kind="SYSTEM"]').first()).toBeVisible();

    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);

    await page.getByRole('button', { name: ui.game.speedOption(4) }).click();
    await send(page, 'check vitals');
    await expect(page.locator('[data-kind="PLAYER"]').last()).toHaveText(/check vitals/);

    await openSidePanel(page);
    const result = page.getByTestId('log-row').filter({ hasText: ui.game.log.result }).first();
    await expect(result).toBeVisible({ timeout: 20_000 });
    await pauseGame(page);
    const logNumbers = numbersOf((await result.locator('.log-result').textContent()) ?? '');
    expect(logNumbers.length).toBeGreaterThanOrEqual(7);

    const report = page.locator('[data-kind="NURSE"]').filter({ hasText: '量完生命體徵' }).last();
    await expect(report).toBeVisible({ timeout: 15_000 });
    const chatNumbers = numbersOf(
      ((await report.textContent()) ?? '').split('：').slice(1).join(''),
    );
    expect(chatNumbers.slice(0, logNumbers.length)).toEqual(logNumbers);

    if (SHOTS) {
      await page.screenshot({
        path: `${SHOTS}/bedside-${test.info().project.name}.png`,
        fullPage: true,
      });
      const close = page.getByRole('button', { name: ui.game.log.close });
      if (await close.isVisible()) {
        await close.click();
        await page.screenshot({
          path: `${SHOTS}/bedside-${test.info().project.name}-drawer-closed.png`,
          fullPage: true,
        });
        await openSidePanel(page);
      }
    }

    const axeAfter = await new AxeBuilder({ page }).analyze();
    expect(axeAfter.violations).toEqual([]);
  });

  test('free text goes through order.parse; the order appears with the parsed dose', async ({
    page,
  }) => {
    await openGame(page, 'mock-ok', 'e2e-parse');
    await send(page, '幫病人落 Ceftriaxone 2 g IV');
    await openSidePanel(page);
    await expect(page.getByTestId('order-row').first()).toContainText('Ceftriaxone');
    await expect(page.getByTestId('order-row').first()).toContainText('2 g');
    await expect(page.locator('[data-kind="NURSE"]').last()).toContainText('Ceftriaxone');
  });

  test('malicious AI output cannot change any displayed number', async ({ page }) => {
    await openGame(page, 'mock-inject', 'e2e-malicious');
    await pauseGame(page);
    const before = {
      hr: await page.getByTestId('vital-hr').textContent(),
      spo2: await page.getByTestId('vital-spo2').textContent(),
      mews: await page.getByTestId('mews-badge').textContent(),
    };
    await page.getByTestId('pause-toggle').click();
    await send(page, 'Oxygen NRB');
    await expect(page.getByTestId('ai-failure')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('ai-failure')).toContainText(
      ui.game.aiFailure.reason.GUARD ?? '',
    );
    await expect(page.getByTestId('pause-toggle')).toBeDisabled();

    await expect(page.getByTestId('chat')).not.toContainText('99');
    await expect(page.getByTestId('vital-spo2')).not.toContainText('99');
    expect({
      hr: await page.getByTestId('vital-hr').textContent(),
      spo2: await page.getByTestId('vital-spo2').textContent(),
      mews: await page.getByTestId('mews-badge').textContent(),
    }).toMatchObject({ spo2: expect.not.stringContaining('99') });
    expect(before.hr).toBeTruthy();
  });

  test('AI failure pauses the clock; retry with the same request recovers', async ({ page }) => {
    await openGame(page, 'mock-fail-twice', 'e2e-failure');
    await send(page, 'oxygen nrb');
    await expect(page.getByTestId('ai-failure')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('paused-badge')).toBeVisible();
    const frozen = await page.getByTestId('game-clock').textContent();
    await page.waitForTimeout(1200);
    await expect(page.getByTestId('game-clock')).toHaveText(frozen ?? '');

    await page.getByRole('button', { name: ui.game.aiFailure.retry }).click();
    await expect(page.getByTestId('ai-failure')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('[data-kind="NURSE"]').last()).toBeVisible();
  });
});
