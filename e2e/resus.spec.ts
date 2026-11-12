import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ui } from '../src/i18n';

const MOCK_ORIGIN = `http://127.0.0.1:${process.env.MOCK_AI_PORT ?? '8787'}`;
const MOCK_BASE_URL = `${MOCK_ORIGIN}/v1`;
const SHOTS = process.env.M5_SHOTS;

async function openGame(page: Page, seed: string, caseId: string) {
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
  await page.goto(`/#/game?seed=${seed}&case=${caseId}`);
  await expect(page.getByTestId('monitor')).toBeVisible();
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

async function order(page: Page, chipId: string) {
  await page.getByTestId(`resus-${chipId}`).click();
}

async function waitForCycles(page: Page, count: number) {
  await expect(page.getByTestId('resus-cycles')).toHaveText(String(count), { timeout: 30_000 });
}

test.describe('M5 ACLS／CPR／死亡流程', () => {
  test('VF 心臟停頓：靜態警報、護士 CPR 慢速、電擊同藥物；axe clean', async ({ page }) => {
    test.setTimeout(90_000);
    await openGame(page, 'e2e-vf', 'acs-vf-01&realsec=0.05');
    await page.getByRole('button', { name: ui.game.speedOption(4) }).click();

    const panel = page.getByTestId('resus-panel');
    await expect(panel).toHaveAttribute('data-status', 'ARREST', { timeout: 30_000 });
    await expect(page.getByTestId('resus-rhythm')).toContainText(ui.game.resus.shockable);
    await expect(page.getByTestId('rhythm-alarm-tag')).toContainText(
      ui.game.monitor.rhythmAlarm.ALARM,
    );
    await expect(page.getByTestId('vital-hr')).toContainText('—');
    await expect(page.getByTestId('monitor')).toHaveAttribute('data-level', 'ALARM');
    await expect(page.getByTestId('cpr-slow-badge')).toHaveCount(0);
    await expect(page.getByTestId('resus-cpr')).toHaveAttribute('data-state', 'NOT_STARTED');

    await order(page, 'qw.cpr');
    await expect(page.getByTestId('resus-cpr')).toHaveAttribute('data-state', 'ACTIVE', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('cpr-slow-badge')).toBeVisible();
    for (const speed of [1, 2, 4]) {
      await expect(page.getByRole('button', { name: ui.game.speedOption(speed) })).toBeDisabled();
    }

    await order(page, 'qw.adrenaline');
    const drugOrder = page.getByTestId('drug-order');
    await drugOrder.getByTestId('drug-order-route').selectOption('IV (Intravenous bolus/push)');
    await drugOrder.getByRole('textbox', { name: ui.game.chat.drugOrder.dose }).fill('1');
    await drugOrder.getByLabel(ui.game.chat.drugOrder.unit).selectOption('mg');
    await drugOrder.getByTestId('drug-order-frequency').selectOption('STAT');
    await drugOrder.getByTestId('drug-order-confirm').click();
    await expect(panel.locator('.resus-drugs li')).toContainText('Adrenaline', {
      timeout: 30_000,
    });
    await order(page, 'qw.rhythm');
    await waitForCycles(page, 1);
    await expect(panel).toHaveAttribute('data-status', 'ARREST');

    await page.getByTestId('pause-toggle').click();
    await shot(page, 'arrest-cpr');
    await expectAxeClean(page);
    await page.getByTestId('pause-toggle').click();

    await order(page, 'qw.defib200');
    const shockPrompt = page.getByTestId('chip-prompt');
    await expect(shockPrompt).toBeVisible();
    await shockPrompt.locator('input[type="number"]').fill('200');
    await expect(page.getByTestId('chip-prompt-confirm')).toBeEnabled();
    await shockPrompt.press('Enter');
    await expect(page.getByTestId('resus-shocks')).toHaveText('1', { timeout: 30_000 });
    await expect(panel).not.toHaveAttribute('data-status', 'STOPPED');
    if ((await panel.getAttribute('data-status')) === 'ROSC') {
      await expect(page.getByTestId('postrosc')).toBeVisible();
      await expect(page.getByTestId('cpr-slow-badge')).toHaveCount(0);
      await page.getByTestId('pause-toggle').click();
      await shot(page, 'rosc-postrosc');
      await expectAxeClean(page);
    }
  });

  test('不可挽救個案：停止搶救後死亡流程未完成前床位唔釋放；axe clean', async ({ page }) => {
    await openGame(page, 'e2e-death', 'terminal-01');
    await page.getByRole('button', { name: ui.game.speedOption(4) }).click();
    await expect(page.getByTestId('resus-panel')).toHaveAttribute('data-status', 'ARREST', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('resus-rhythm')).toContainText(ui.game.resus.notShockable);

    await order(page, 'qw.cpr');
    await expect(page.getByTestId('resus-cpr')).toHaveAttribute('data-state', 'ACTIVE', {
      timeout: 30_000,
    });
    for (let i = 1; i <= 3; i += 1) {
      await order(page, 'qw.rhythm');
      await waitForCycles(page, i);
    }
    await order(page, 'qw.stopcpr');

    const death = page.getByTestId('death-panel');
    await expect(death).toHaveAttribute('data-status', 'PENDING_PROCESS', { timeout: 30_000 });
    await expect(page.getByTestId('death-status')).toContainText(
      ui.game.death.status.PENDING_PROCESS,
    );
    await expect(page.getByTestId('cpr-slow-badge')).toHaveCount(0);

    await page.getByTestId('death-confirm-CERTIFICATE').click();
    await page.getByTestId('death-confirm-NOTIFY_SENIOR').click();
    await page.getByTestId('death-confirm-PHONE_FAMILY').click();
    await expect(death).toHaveAttribute('data-status', 'PENDING_PROCESS');
    await page.getByTestId('pause-toggle').click();
    await shot(page, 'death-flow-pending');
    await expectAxeClean(page);
    await page.getByTestId('pause-toggle').click();

    await page.getByTestId('death-confirm-RECORD').click();
    await expect(death).toHaveAttribute('data-status', 'COMPLETE');
    await expect(page.getByTestId('death-status')).toContainText(ui.game.death.status.COMPLETE);
    await page.getByTestId('pause-toggle').click();
    await shot(page, 'death-flow-complete');
    await expectAxeClean(page);
  });
});
