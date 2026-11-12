import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ui } from '../src/i18n';

const MOCK_ORIGIN = `http://127.0.0.1:${process.env.MOCK_AI_PORT ?? '8787'}`;
const MOCK_BASE_URL = `${MOCK_ORIGIN}/v1`;
const SHOTS = process.env.M8_SHOTS;

async function installSettings(
  page: Page,
  settings: { baseUrl: string; model: string; apiKey?: string },
) {
  await page.addInitScript(
    (stored) => {
      localStorage.setItem('dandu.settings.v1', JSON.stringify(stored));
    },
    {
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey ?? 'test-key',
      model: settings.model,
      nurseConfirmHighRisk: true,
    },
  );
}

async function openGame(page: Page, query: string, model = 'mock-ok', baseUrl = MOCK_BASE_URL) {
  await page.request.post(`${MOCK_ORIGIN}/__reset`);
  await installSettings(page, { baseUrl, model });
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

async function atBed(page: Page) {
  const beds = page.getByTestId('open-beds');
  if (await beds.isVisible()) {
    if (!(await page.getByTestId('floor-plan').isVisible())) await beds.click();
  }
  await page.locator('[data-testid^="bed-"]:not([data-level="EMPTY"])').first().click();
  await expect(page.getByTestId('monitor')).toBeVisible({ timeout: 20_000 });
  if (await page.getByTestId('close-beds').isVisible())
    await page.getByTestId('close-beds').click();
}

test.describe('M8 mobile, shortcuts, saves and AI failure', () => {
  test('portrait tools, keyboard shortcuts, static alarms and axe', async ({ page }) => {
    test.setTimeout(60_000);
    await openGame(page, 'seed=e2e-m8-keys&mode=NIGHT&difficulty=MEDIUM&rank=MO&realsec=0.05');
    const mobile = test.info().project.name === 'mobile-portrait';
    if (mobile) {
      await expect(page.getByTestId('mobile-tools')).toBeVisible();
      await expect(page.getByTestId('floor-plan')).toBeHidden();
    } else {
      await expect(page.getByTestId('floor-plan')).toBeVisible();
    }
    await expect(page.getByTestId('rank-badge')).toHaveText(ui.game.youRank('MO'));
    await shot(page, 'ward');
    await expectAxeClean(page);

    await page.keyboard.press('2');
    await expect(page.getByTestId('tab-phone')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('3');
    await expect(page.getByTestId('tab-family')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('call-empty')).toHaveText(ui.game.ward.phone.emptyFamily);
    await page.keyboard.press('1');
    await expect(page.getByTestId('tab-chat')).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('b');
    await expect(page.getByTestId('floor-plan')).toBeVisible();
    if (mobile) {
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('floor-plan')).toBeHidden();
    }

    await page.keyboard.press('l');
    await expect(page.getByTestId('side-panel')).toBeVisible();
    if (mobile) await shot(page, 'record-drawer');
    if (mobile) {
      await page.getByTestId('open-labs').click();
      await expect(page.getByTestId('reports')).toBeVisible();
      await expect(page.locator('[data-panel="log"]')).toBeHidden();
      await shot(page, 'labs');
    } else {
      await expect(page.getByTestId('reports')).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });

    await page.keyboard.press('Space');
    await expect(page.getByTestId('paused-badge')).toBeVisible();
    await page.keyboard.press(']');
    await expect(page.getByRole('button', { name: ui.game.speedOption(1) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press(']');
    await expect(page.getByRole('button', { name: ui.game.speedOption(2) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('[');
    await expect(page.getByRole('button', { name: ui.game.speedOption(1) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByRole('button', { name: ui.game.speedOption(4) }).click();
    await atBed(page);
    await page.keyboard.press('/');
    await expect(page.locator('#chat-input')).toBeFocused();
    await shot(page, 'bedside');
    await page.locator('#chat-input').blur();
    if (!mobile) {
      const leave = page.getByTestId('leave-bed');
      if (await leave.isVisible()) await leave.click();
      await expect(page.getByTestId('floor-plan')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('open-floorplan').click();
      await expect(page.getByTestId('bed-table')).toBeVisible();
      await shot(page, 'floorplan');
      await page.getByTestId('close-beds').click();
    }

    await page.keyboard.press('Space');
    await expect(page.getByTestId('paused-badge')).toBeVisible();
    const flash = await page.evaluate(async () => {
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const nodes = [...document.body.querySelectorAll('*')].filter(
        (el) => el.tagName !== 'CANVAS',
      );
      const read = () =>
        nodes.map((el) => {
          const style = getComputedStyle(el);
          return `${style.animationName}|${style.backgroundColor}|${style.opacity}|${style.visibility}`;
        });
      const first = read();
      const animated = nodes.filter((el) => {
        const name = getComputedStyle(el).animationName;
        return name !== 'none';
      }).length;
      let changes = 0;
      for (let i = 0; i < 8; i += 1) {
        await sleep(120);
        const sample = read();
        for (let j = 0; j < sample.length; j += 1) if (sample[j] !== first[j]) changes += 1;
      }
      return { animated, changes };
    });
    expect(flash.animated).toBe(0);
    expect(flash.changes).toBe(0);
    await expectAxeClean(page);
  });

  test('reduced motion draws a static waveform', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openGame(
      page,
      'seed=e2e-m8-motion&mode=NIGHT&difficulty=EASY&rank=HO&case=pna-sepsis-01',
    );
    await expect(page.getByTestId('monitor')).toBeVisible();
    await page.getByTestId('pause-toggle').click();
    const read = () =>
      page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return '';
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 16) sum += data[i + 3] ?? 0;
        return String(sum);
      });
    const before = await read();
    await page.waitForTimeout(400);
    expect(await read()).toBe(before);
    expect(before.length).toBeGreaterThan(0);
  });

  test('the clock stays still while AI is pending, then a timeout can be retried', async ({
    page,
  }) => {
    await openGame(
      page,
      'seed=e2e-m8-wait&mode=NIGHT&difficulty=EASY&rank=HO&case=pna-sepsis-01&realsec=1',
      'mock-delay-ok',
    );
    await page.getByRole('button', { name: ui.game.speedOption(4) }).click();
    await page.getByLabel(ui.game.chat.inputLabel).fill('請講下而家情況');
    await page.getByRole('button', { name: ui.game.chat.send, exact: true }).click();
    await expect(page.getByTestId('waiting-ai-badge')).toBeVisible();
    const before = await page.getByTestId('game-clock').textContent();
    await page.waitForTimeout(700);
    expect(await page.getByTestId('game-clock').textContent()).toBe(before);
    await expect(page.getByTestId('waiting-ai-badge')).toBeHidden({ timeout: 20_000 });

    await page.goto(
      `/#/game?seed=e2e-m8-timeout&mode=NIGHT&difficulty=EASY&rank=HO&case=pna-sepsis-01&aitimeout=300`,
    );
    await installSettings(page, { baseUrl: MOCK_BASE_URL, model: 'mock-slow-twice' });
    await page.reload();
    await expect(page.getByTestId('game-screen')).toBeVisible();
    await page.getByLabel(ui.game.chat.inputLabel).fill('再講一次情況');
    await page.getByRole('button', { name: ui.game.chat.send, exact: true }).click();
    await expect(page.getByTestId('ai-failure')).toContainText(
      ui.game.aiFailure.reason.TIMEOUT ?? '',
      {
        timeout: 8_000,
      },
    );
    await expect(page.getByTestId('paused-badge')).toBeVisible();
    await expect(page.getByTestId('pause-toggle')).toBeDisabled();
    await shot(page, 'ai-timeout');
    await page.getByRole('button', { name: ui.game.aiFailure.retry }).click();
    await expect(page.getByTestId('ai-failure')).toHaveCount(0, { timeout: 8_000 });
  });

  test('supplier errors, offline and a missing key each stop the player with a label', async ({
    page,
  }) => {
    await openGame(
      page,
      'seed=e2e-m8-err&mode=NIGHT&difficulty=EASY&rank=HO&case=pna-sepsis-01&aitimeout=400',
      'mock-5xx',
    );
    await page.getByLabel(ui.game.chat.inputLabel).fill('開一份 CBC');
    await page.getByRole('button', { name: ui.game.chat.send, exact: true }).click();
    await expect(page.getByTestId('ai-failure')).toContainText(
      ui.game.aiFailure.reason.NETWORK ?? '',
      {
        timeout: 8_000,
      },
    );
    await shot(page, 'ai-error');

    await installSettings(page, { baseUrl: 'http://127.0.0.1:9/v1', model: 'mock-ok' });
    await page.goto(
      '/#/game?seed=e2e-m8-offline&mode=NIGHT&difficulty=EASY&rank=HO&case=pna-sepsis-01&aitimeout=400',
    );
    await expect(page.getByTestId('game-screen')).toBeVisible();
    await page.getByLabel(ui.game.chat.inputLabel).fill('而家離線');
    await page.getByRole('button', { name: ui.game.chat.send, exact: true }).click();
    await expect(page.getByTestId('ai-failure')).toContainText('離線', { timeout: 8_000 });

    const fresh = await page.context().newPage();
    await fresh.addInitScript(() => {
      localStorage.removeItem('dandu.settings.v1');
    });
    await fresh.goto('/#/');
    await expect(fresh.getByTestId('start-blocked')).toHaveCount(0);
    await expect(fresh.getByRole('button', { name: ui.start.startButton })).toBeDisabled();
    await shot(fresh, 'no-key');
    await fresh.close();
  });

  test('manual slots continue, delete, export and reject a failed schema migration', async ({
    page,
  }) => {
    await openGame(page, 'seed=e2e-m8-save&mode=DAY&difficulty=EASY&rank=HO&case=pna-sepsis-01');
    await page.getByTestId('open-save').click();
    await page.getByTestId('save-slot-1').click();
    await expect(page.getByTestId('save-note')).toBeVisible();
    await shot(page, 'save-dialog');
    await page.getByTestId('pause-leave').click();
    await expect(page.getByTestId('save-library')).toBeVisible();
    await expect(page.getByTestId('save-row-manual-1')).toContainText('日班');
    await shot(page, 'save-library');
    await expectAxeClean(page);

    const download = page.waitForEvent('download');
    await page.getByTestId('export-manual-1').click();
    expect((await download).suggestedFilename()).toBe('dandu-manual-1.json');

    await page.getByTestId('import-file').setInputFiles({
      name: 'future.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ format: 'dandu-save', appVersion: 'future', state: { schema: 999 } }),
      ),
    });
    await expect(page.getByTestId('save-message')).toContainText('原槽未覆寫');
    await expect(page.getByTestId('continue-manual-1')).toBeEnabled();

    await page.getByTestId('continue-manual-1').click();
    await expect(page.getByTestId('game-screen')).toBeVisible();
    await expect(page.getByTestId('paused-badge')).toBeVisible();

    await page.goto('/#/');
    await page.getByTestId('delete-manual-1').click();
    await page.getByTestId('confirm-delete-manual-1').click();
    await expect(page.getByTestId('continue-manual-1')).toBeDisabled();

    await page.goto('/#/settings');
    await expect(page.getByTestId('shortcut-table')).toContainText('Space');
    await expectAxeClean(page);
    await shot(page, 'shortcuts');
  });
});
