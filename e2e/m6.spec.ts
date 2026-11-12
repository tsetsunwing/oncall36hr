import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ui } from '../src/i18n';

const MOCK_ORIGIN = `http://127.0.0.1:${process.env.MOCK_AI_PORT ?? '8787'}`;
const MOCK_BASE_URL = `${MOCK_ORIGIN}/v1`;
const SHOTS = process.env.M6_SHOTS;

async function seedSettings(page: Page) {
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
}

async function openGame(page: Page, query: string) {
  await seedSettings(page);
  await page.goto(`/#/game?${query}`);
  await expect(page.getByTestId('game-screen')).toBeVisible();
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

async function fastForward(page: Page) {
  await page.getByRole('button', { name: ui.game.speedOption(4) }).click();
}

test.describe('M6 setup, rounds, energy, overtime and endings', () => {
  test('setup screen picks rank, difficulty and mode and starts that shift; axe clean', async ({
    page,
  }) => {
    await seedSettings(page);
    await page.goto('/#/');
    await expect(page.getByTestId('setup-summary')).toContainText('MO');
    await page.getByTestId('choice-rank-RES').click();
    await page.getByTestId('choice-difficulty-HARD').click();
    await page.getByTestId('choice-mode-DAY').click();
    await expect(page.getByTestId('setup-summary')).toContainText('RES');
    await shot(page, 'setup');
    await expectAxeClean(page);
    await page.getByRole('button', { name: ui.start.startButton }).click();
    await expect(page).toHaveURL(/mode=DAY/);
    await expect(page).toHaveURL(/difficulty=HARD/);
    await expect(page).toHaveURL(/rank=RES/);
    await expect(page.getByTestId('mode-badge')).toHaveText(ui.shift.mode.DAY ?? '');
    await expect(page.getByTestId('game-clock')).toHaveText(/^08:/);
  });

  test('day shift: ward round at 09:00 is hosted by AC, no phone calls during it; axe clean', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openGame(
      page,
      'seed=e2e-m6-round&mode=DAY&difficulty=MEDIUM&rank=MO&realsec=0.5&callrate=120',
    );
    await expect(page.getByTestId('mode-badge')).toHaveText(ui.shift.mode.DAY ?? '');
    await fastForward(page);
    await expect(page.getByTestId('begin-round')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('begin-round').click();
    await expect(page.getByTestId('round-dialog')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('round-panel')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('round-question')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('round-question')).toContainText(ui.shift.hostName);
    const ringing = async () =>
      (await page.getByTestId('phone-count').count()) === 0
        ? 0
        : Number(await page.getByTestId('phone-count').textContent());
    const ringingAtStart = await ringing();
    await page.waitForTimeout(800);
    expect(await ringing()).toBe(ringingAtStart);
    await shot(page, 'round');
    await expectAxeClean(page);

    await page.getByTestId('round-hint-0').click();
    await page.getByTestId('round-hints-submit').click();
    await expect(page.getByTestId('round-reveal')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('round-verdict')).not.toHaveText('');
    await expect(page.getByTestId('round-facts')).toBeVisible();
    await expectAxeClean(page);

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline && (await page.getByTestId('round-panel').count()) > 0) {
      const next = page.getByTestId('round-next');
      const pass = page.getByTestId('round-pass');
      if (await next.isVisible()) await next.click();
      else if (await pass.isVisible()) await pass.click();
      else await page.waitForTimeout(100);
    }
    await expect(page.getByTestId('round-panel')).toHaveCount(0);
    await expect(page.getByTestId('round-count')).toContainText(`1 ／ 2`);
  });

  test('energy bar and self-care actions restore energy; panel is axe clean', async ({ page }) => {
    await openGame(page, 'seed=e2e-m6-energy&mode=NIGHT&difficulty=EASY&rank=MO&realsec=0.5');
    await fastForward(page);
    await page.waitForTimeout(6000);
    await page.getByTestId('pause-toggle').click();
    const before = Number(
      (await page.getByTestId('need-fatigue').getAttribute('aria-valuenow')) ?? '0',
    );
    expect(before).toBeLessThan(100);
    await page.getByTestId('landmark-rest').click();
    if (!(await page.getByTestId('room-REST').isVisible())) {
      const openBeds = page.getByTestId('open-beds');
      if (await openBeds.isVisible()) await openBeds.click();
    }
    await expect(page.getByTestId('room-REST')).toBeVisible();
    await shot(page, 'energy');
    await expectAxeClean(page);
    await page.getByTestId('pause-toggle').click();
    await page.getByTestId('selfcare-NAP').click();
    await expect(page.getByTestId('selfcare-active')).toBeVisible();
    await expect(page.getByTestId('selfcare-NAP')).toBeDisabled();
    await expect(page.getByTestId('selfcare-active')).toHaveCount(0, { timeout: 30_000 });
    const after = Number(
      (await page.getByTestId('need-fatigue').getAttribute('aria-valuenow')) ?? '0',
    );
    expect(after).toBeLessThanOrEqual(before);
  });

  test('low energy: the nurse nudges a rest and the meter turns to the low level; axe clean', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await openGame(page, 'seed=e2e-m6-low&mode=ONCALL&difficulty=EASY&rank=MO&realsec=0.02');
    await fastForward(page);
    await expect(page.getByTestId('need-fatigue')).toHaveAttribute('data-level', 'LOW', {
      timeout: 100_000,
    });
    await shot(page, 'energy-low');
    await page.getByTestId('pause-toggle').click();
    await expect(page.getByTestId('need-fatigue')).toContainText(
      ui.shift.energy.need.fatigue ?? '',
    );
    await expectAxeClean(page);
  });

  test('overtime freezes the ward; the window running out forces handover with the overtime tag', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await openGame(page, 'seed=e2e-m6-ot&mode=DAY&difficulty=MEDIUM&rank=MO&realsec=0.03');
    await fastForward(page);
    await expect(page.getByTestId('overtime-banner')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('phase-badge')).toBeVisible();
    await expect(page.getByTestId('result-page')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('result-page')).toHaveAttribute('data-reason', 'OVERTIME');
    await expect(page.getByTestId('result-tag')).toHaveText(ui.shift.result.tag.OVERTIME ?? '');
    await expect(page.getByTestId('subscore-CLINICAL_OUTCOME')).toBeVisible();
    await shot(page, 'result-timeout');
    await expectAxeClean(page);
    await page.getByTestId('result-back').click();
    await expect(page).toHaveURL(/#\/$/);
  });

  test('overtime: manual handover picks patients and ends the shift without a tag', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await openGame(page, 'seed=e2e-m6-ot2&mode=DAY&difficulty=EASY&rank=MO&realsec=0.03');
    await fastForward(page);
    await expect(page.getByTestId('begin-handover')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('begin-handover').click();
    await expect(page.getByTestId('handover-panel')).toBeVisible();
    await page.locator('[data-testid^="handover-"][type="checkbox"]').first().check();
    await expectAxeClean(page);
    await page.getByTestId('confirm-handover').click();
    await expect(page.getByTestId('result-page')).toHaveAttribute('data-reason', 'NORMAL');
    await expect(page.getByTestId('result-tag')).toHaveText(ui.shift.result.noTag);
  });

  test('on call: running the energy to zero faints; the result shows only the faint tag', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openGame(page, 'seed=e2e-m6-faint&mode=ONCALL&difficulty=EASY&rank=MO&realsec=0.02');
    await fastForward(page);
    await expect(page.getByTestId('result-page')).toBeVisible({ timeout: 150_000 });
    await expect(page.getByTestId('result-page')).toHaveAttribute('data-reason', 'FAINT');
    await expect(page.getByTestId('result-tag')).toHaveText(ui.shift.result.tag.FAINT ?? '');
    await expect(page.getByTestId('result-tag')).toHaveCount(1);
    await shot(page, 'result-faint');
    await expectAxeClean(page);
  });
});
