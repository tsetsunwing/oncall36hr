import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ui } from '../src/i18n';

const MOCK_ORIGIN = `http://127.0.0.1:${process.env.MOCK_AI_PORT ?? '8787'}`;
const MOCK_BASE_URL = `${MOCK_ORIGIN}/v1`;
const SHOTS = process.env.M2_SHOTS;

async function openWard(page: Page, query: string) {
  await page.request.post(`${MOCK_ORIGIN}/__reset`);
  await page.addInitScript(
    ({ baseUrl }) => {
      localStorage.setItem(
        'dandu.settings.v1',
        JSON.stringify({
          baseUrl,
          apiKey: 'test-key',
          model: 'mock-ok',
          nurseConfirmHighRisk: true,
        }),
      );
    },
    { baseUrl: MOCK_BASE_URL },
  );
  await page.goto(`/#/game?${query}`);
  const plan = page.getByTestId('floor-plan');
  if (!(await plan.isVisible())) await page.getByTestId('open-beds').click();
  await expect(plan).toBeVisible();
}

async function closeBeds(page: Page) {
  const close = page.getByTestId('close-beds');
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
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

async function waitForCall(page: Page) {
  await page.getByRole('button', { name: ui.game.speedOption(4) }).click();
  await expect(page.getByTestId('phone-count')).toBeVisible({ timeout: 45_000 });
  await page.getByTestId('tab-phone').click();
  await expect(page.getByTestId('call-row').first()).toBeVisible();
}

test.describe('M4 ward, phone and delegation', () => {
  test('floor plan shows 20 beds with occupancy, walking to a bed opens its monitor; axe clean', async ({
    page,
  }) => {
    await openWard(page, 'seed=e2e-ward&mode=NIGHT&difficulty=MEDIUM&rank=MO');
    await expect(page.locator('[data-testid^="bed-"]')).toHaveCount(20);
    await expect(page.getByTestId('occupancy')).toContainText(/\d+/);
    await expect(page.getByTestId('not-at-bed')).toBeVisible();
    await shot(page, 'floor-plan');
    await expectAxeClean(page);

    await page.getByRole('button', { name: ui.game.speedOption(4) }).click();
    await page.locator('[data-testid^="bed-"]:not([data-level="EMPTY"])').first().click();
    await expect(page.getByTestId('monitor')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('not-at-bed')).toHaveCount(0);
    await page.getByTestId('pause-toggle').click();
    await shot(page, 'floor-plan-at-bed');
    await expectAxeClean(page);
  });

  test('shared phone list labels callers; GO_NOW response resolves the call; axe clean', async ({
    page,
  }) => {
    await openWard(page, 'seed=e2e-phone&mode=NIGHT&difficulty=MEDIUM&rank=MO&callrate=60');
    await closeBeds(page);
    await waitForCall(page);
    await page.getByTestId('pause-toggle').click();
    await expect(page.getByTestId('call-row').first()).toContainText(/.+/);
    await expect(page.getByTestId('call-detail')).toBeVisible();
    await shot(page, 'phone-list');
    await expectAxeClean(page);

    await page.getByTestId('pause-toggle').click();
    const ringing = page.locator('[data-testid="call-row"][data-status="RINGING"]').first();
    if ((await ringing.count()) > 0) {
      await ringing.click();
      await page.getByTestId('respond-go-now').click();
      await expect(page.getByTestId('call-status')).not.toHaveAttribute('data-status', 'RINGING');
    }
  });

  test('SBAR escalation skipping a rank warns, prefills, sends and shows the reply; axe clean', async ({
    page,
  }) => {
    await openWard(page, 'seed=e2e-sbar&mode=NIGHT&difficulty=MEDIUM&rank=HO');
    await closeBeds(page);
    await page.getByTestId('tab-phone').click();
    await page.getByTestId('call-rank-RES').click();
    await expect(page.getByTestId('sbar-panel')).toBeVisible();
    await expect(page.getByTestId('sbar-skip')).toBeVisible();
    await expect(page.getByTestId('sbar-S')).not.toHaveValue('');
    await shot(page, 'sbar-call');
    await expectAxeClean(page);

    await page.getByTestId('sbar-send').click();
    await expect(page.getByTestId('sbar-panel')).toHaveCount(0);
    await expect(page.getByTestId('call-detail')).toBeVisible();
    await expect(page.getByTestId('call-resolution')).toBeVisible({ timeout: 30_000 });
    await expectAxeClean(page);
  });

  test('delegation dialog hides ability, runs a task and reports only the outcome; axe clean', async ({
    page,
  }) => {
    await openWard(page, 'seed=e2e-delegate&mode=NIGHT&difficulty=MEDIUM&rank=MO');
    await closeBeds(page);
    await page.getByTestId('open-delegation').click();
    const dialog = page.getByTestId('delegation-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('sub-name')).toBeVisible();
    await expect(dialog).not.toContainText(/可靠度|NOVICE|SENIOR|reliability|[0-9]+%/i);
    await shot(page, 'delegation');
    await expectAxeClean(page);

    await page.getByTestId('delegate-submit').click();
    await expect(dialog).toBeHidden();
    await page.getByTestId('open-delegation').click();
    await expect(page.getByTestId('sub-status')).toHaveAttribute('data-busy', 'true');
    await expect(page.getByTestId('delegation-history').locator('li').first()).toBeVisible();
    await shot(page, 'delegation-running');
  });
});
