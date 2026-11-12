import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ui } from '../src/i18n';

const MOCK_ORIGIN = `http://127.0.0.1:${process.env.MOCK_AI_PORT ?? '8787'}`;
const MOCK_BASE_URL = `${MOCK_ORIGIN}/v1`;
const SHOTS = process.env.M4B_SHOTS;

async function openWard(page: Page, query: string, model = 'mock-ok') {
  await page.request.post(`${MOCK_ORIGIN}/__reset`);
  await page.addInitScript(
    ({ baseUrl, mockModel }) => {
      localStorage.setItem(
        'dandu.settings.v1',
        JSON.stringify({
          baseUrl,
          apiKey: 'test-key',
          model: mockModel,
          nurseConfirmHighRisk: true,
        }),
      );
    },
    { baseUrl: MOCK_BASE_URL, mockModel: model },
  );
  await page.goto(`/#/game?${query}`);
  const plan = page.getByTestId('floor-plan');
  if (!(await plan.isVisible())) await page.getByTestId('open-beds').click();
  await expect(plan).toBeVisible();
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
  const results = await new AxeBuilder({ page })
    .exclude('[data-testid="mews-badge"]')
    .exclude('.present-chip-hit')
    .analyze();
  expect(results.violations).toEqual([]);
}

async function order(page: Page, chipId: string) {
  await page.getByTestId(`resus-${chipId}`).click();
}

test.describe('M4b AI 雙向通話', () => {
  test('SBAR 求助：資料不足先被追問，補充後得到結果；清晰度由 engine 決定；axe clean', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openWard(page, 'seed=e2e-consult&mode=NIGHT&difficulty=MEDIUM&rank=HO');
    await page.getByTestId('tab-phone').click();
    await page.getByTestId('call-rank-RES').click();
    await expect(page.getByTestId('sbar-panel')).toBeVisible();
    await page.getByTestId('sbar-S').fill('病人有啲唔舒服');
    await page.getByTestId('sbar-B').fill('');
    await page.getByTestId('sbar-A').fill('');
    await page.getByTestId('sbar-R').fill('');
    await page.getByTestId('sbar-send').click();

    const exchange = page.getByTestId('exchange');
    await expect(exchange).toBeVisible();
    await expect(page.getByTestId('exchange-clarity')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('exchange-clarity')).toHaveAttribute('data-clarity', '0');
    await expect(exchange).toHaveAttribute('data-phase', 'OPEN', { timeout: 30_000 });
    await expect(page.getByTestId('exchange-asks')).toBeVisible();
    await expect(page.getByTestId('call-lines')).toContainText('我想再問');
    await shot(page, 'sbar-consult-asks');
    await expectAxeClean(page);

    await page
      .getByTestId('followup-text')
      .fill('血氧 91，血壓 100/60，心跳 112，我評估係呼吸道問題，想你過嚟睇。');
    await page.getByTestId('followup-send').click();
    await expect(exchange).not.toHaveAttribute('data-phase', 'OPEN', { timeout: 30_000 });
    await expect(page.getByTestId('call-lines')).toContainText(/過嚟|收到|好/, {
      timeout: 30_000,
    });
    await expect(exchange).toHaveAttribute('data-phase', /OPEN|CLOSED/, { timeout: 30_000 });
    await shot(page, 'sbar-consult-reply');
    await expectAxeClean(page);
  });

  test('AI 回傳偽造數字：被擋、遊戲暫停並顯示 AI 失敗橫幅，唔會顯示偽造內容', async ({ page }) => {
    test.setTimeout(60_000);
    await openWard(
      page,
      'seed=e2e-consult-bad&mode=NIGHT&difficulty=MEDIUM&rank=HO',
      'mock-numbers',
    );
    await page.getByTestId('tab-phone').click();
    await page.getByTestId('call-rank-RES').click();
    await page.getByTestId('sbar-send').click();
    await expect(page.getByTestId('exchange')).toBeVisible();
    await expect(page.getByTestId('ai-failure')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('call-lines')).not.toContainText('99%');
    await expect(page.getByTestId('call-lines')).not.toContainText('77');
  });

  test('病人停頓：非床邊會收到來電，過去後來電完結；死亡後通知上級同家屬都係真電話；axe clean', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await openWard(
      page,
      'seed=e2e-m4b-death&mode=NIGHT&difficulty=MEDIUM&rank=MO&wardcase=terminal-01',
    );
    await page.getByRole('button', { name: ui.game.speedOption(4) }).click();
    await page.getByTestId('tab-phone').click();
    const arrestRow = page.getByTestId('call-row').filter({ hasText: '冇反應、冇脈搏' });
    await expect(arrestRow.first()).toBeVisible({ timeout: 90_000 });
    await arrestRow.first().click();
    await expect(page.getByTestId('call-purpose')).toContainText('心臟停頓');
    await page.getByTestId('pause-toggle').click();
    await shot(page, 'arrest-call');
    await expectAxeClean(page);
    await page.getByTestId('pause-toggle').click();
    const bed = await page.getByTestId('call-detail').getAttribute('data-bed');
    if (!bed) throw new Error('arrest call has no bed');
    await page.getByTestId(`bed-${bed}`).click();

    await expect(page.getByTestId('resus-panel')).toHaveAttribute('data-status', 'ARREST', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('call-status')).toHaveAttribute('data-status', 'DONE');

    await order(page, 'qw.cpr');
    await expect(page.getByTestId('resus-cpr')).toHaveAttribute('data-state', 'ACTIVE', {
      timeout: 30_000,
    });
    for (let i = 1; i <= 3; i += 1) {
      await order(page, 'qw.rhythm');
      await expect(page.getByTestId('resus-cycles')).toHaveText(String(i), { timeout: 30_000 });
    }
    await order(page, 'qw.stopcpr');
    const death = page.getByTestId('death-panel');
    await expect(death).toHaveAttribute('data-status', 'PENDING_PROCESS', { timeout: 30_000 });
    await expect(page.getByTestId('death-confirm-NOTIFY_SENIOR')).toHaveCount(0);

    await page.getByTestId('death-call-NOTIFY_SENIOR').click();
    await expect(page.getByTestId('sbar-panel')).toBeVisible();
    await page.getByTestId('sbar-send').click();
    await page.getByTestId('tab-phone').click();
    await expect(death).toHaveAttribute('data-status', 'PENDING_PROCESS');

    await page.getByTestId('death-call-PHONE_FAMILY').click();
    const family = page.getByTestId('family-controls');
    await expect(family).toBeVisible();
    await page.getByTestId('pause-toggle').click();
    await shot(page, 'family-call-opening');
    await expectAxeClean(page);
    await page.getByTestId('pause-toggle').click();
    await page
      .getByTestId('family-say-text')
      .fill(
        '阿嫂，我係值班醫生。我好遺憾要同你講，婆婆已經離世，我哋已經盡力搶救。我哋會陪你安排見最後一面。',
      );
    await page.getByTestId('family-say').click();
    await expect(page.getByTestId('family-informed')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('call-lines')).toContainText(
      /我明白喇|點解會咁嘅|咩事呀|講清楚/,
      {
        timeout: 30_000,
      },
    );
    await page.getByTestId('pause-toggle').click();
    await shot(page, 'family-call-informed');
    await expectAxeClean(page);
    await page.getByTestId('pause-toggle').click();
    await page.getByTestId('hang-up').click();
    await expect(page.getByTestId('exchange-ended')).toBeVisible();
  });
});
