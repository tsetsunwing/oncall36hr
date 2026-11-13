import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ui } from '../src/i18n';
import { keepNeedsDownUntil } from './keepNeeds';

const MOCK_ORIGIN = `http://127.0.0.1:${process.env.MOCK_AI_PORT ?? '8787'}`;
const MOCK_BASE_URL = `${MOCK_ORIGIN}/v1`;
const SHOTS = process.env.M7_SHOTS;
const SUBSCORES = [
  'CLINICAL_OUTCOME',
  'TIMELINESS',
  'SAFETY',
  'COMMUNICATION',
  'PRIORITISATION',
  'SELF_CARE',
] as const;
const SHAMING = /愚蠢|無能|失敗者|廢物|差勁|垃圾|不合格|不及格|活該|你害死/u;

async function openGame(page: Page, query: string) {
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
  await expect(page.getByTestId('game-screen')).toBeVisible();
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.screenshot({
    path: `${SHOTS}/${name}-${test.info().project.name}.png`,
    fullPage: !name.endsWith('-fold'),
  });
}

async function shotSection(page: Page, name: string, testId: string) {
  if (!SHOTS) return;
  await page.getByTestId(testId).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/${name}-${test.info().project.name}.png` });
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

test.describe('M7 result screen and review page', () => {
  test('overtime result: six graded sub-scores, no total, review page reconstructs the shift', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await openGame(page, 'seed=e2e-m7-ot&mode=DAY&difficulty=MEDIUM&rank=MO&realsec=0.15');
    await fastForward(page);
    await keepNeedsDownUntil(page, 'result-page', 90_000);
    await expect(page.getByTestId('result-page')).toBeVisible();
    await expect(page.getByTestId('result-tag')).toHaveText(ui.shift.result.tag.OVERTIME ?? '');

    for (const id of SUBSCORES) {
      await expect(page.getByTestId(`subscore-${id}`)).toBeVisible();
      const grade = await page.getByTestId(`grade-${id}`).textContent();
      expect(Object.values(ui.shift.result.grade)).toContain(grade);
      await expect(page.getByTestId(`subscore-${id}`).getByRole('img')).toBeVisible();
    }
    await expect(page.getByText(ui.shift.result.noTotal)).toBeVisible();
    await expect(page.getByTestId('result-ai')).toBeVisible();
    await expect(page.getByTestId('result-preview')).toBeVisible();
    await expect(page.getByTestId('result-disclaimer')).toHaveText(ui.shift.result.disclaimer);
    await expect(page.getByTestId('result-save')).toBeVisible();
    expect(await page.getByTestId('result-page').textContent()).not.toMatch(SHAMING);
    await shot(page, 'result');
    await expectAxeClean(page);

    const download = page.waitForEvent('download');
    await page.getByTestId('result-save').click();
    expect((await download).suggestedFilename()).toBe(ui.shift.result.saveFileName);

    await page.getByTestId('result-review').click();
    await expect(page.getByTestId('review-page')).toBeVisible();
    for (const id of SUBSCORES) await expect(page.getByTestId(`review-table-${id}`)).toBeVisible();
    await expect(page.getByTestId('review-timeline')).toBeVisible();
    expect(await page.getByTestId('review-timeline-row').count()).toBeGreaterThan(0);
    await expect(page.getByTestId('review-disclaimer')).toHaveText(ui.shift.review.disclaimer);
    expect(await page.getByTestId('review-page').textContent()).not.toMatch(SHAMING);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await shot(page, 'review-top-fold');
    await shotSection(page, 'review-whatif', 'review-whatif');
    await shotSection(page, 'review-timeline', 'review-timeline');
    await page.getByTestId('timeline-filter-CALL').click();
    await expect(page.getByTestId('timeline-filter-CALL')).toHaveAttribute('aria-pressed', 'true');
    for (const row of await page.getByTestId('review-timeline-row').all()) {
      await expect(row).toHaveAttribute('data-kind', 'CALL');
    }
    await page.getByTestId('timeline-filter-ALL').click();
    await expectAxeClean(page);

    await page.getByTestId('review-back').click();
    await expect(page.getByTestId('result-page')).toBeVisible();
    await page.getByTestId('result-review').click();
    await page.getByTestId('review-home').click();
    await expect(page).toHaveURL(/#\/$/);
  });

  test('faint result keeps only the faint tag and still opens the review; axe clean', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openGame(page, 'seed=e2e-m7-faint&mode=ONCALL&difficulty=EASY&rank=MO&realsec=0.02');
    await fastForward(page);
    await expect(page.getByTestId('result-page')).toBeVisible({ timeout: 150_000 });
    await expect(page.getByTestId('result-page')).toHaveAttribute('data-reason', 'FAINT');
    await expect(page.getByTestId('result-tag')).toHaveCount(1);
    await expect(page.getByTestId('result-tag')).toHaveText(ui.shift.result.tag.FAINT ?? '');
    await shot(page, 'result-faint');
    await page.getByTestId('result-review').click();
    await expect(page.getByTestId('review-page')).toBeVisible();
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await shot(page, 'review-faint-fold');
    await expectAxeClean(page);
  });
});
