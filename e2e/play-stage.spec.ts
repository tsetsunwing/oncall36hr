import { expect, test, type Page } from '@playwright/test';
import { ui } from '../src/i18n';

const MOCK_ORIGIN = `http://127.0.0.1:${process.env.MOCK_AI_PORT ?? '8787'}`;
const MOCK_BASE_URL = `${MOCK_ORIGIN}/v1`;

async function assertStageFills(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  const stage = page.getByTestId('play-frame');
  await expect(stage).toHaveAttribute('data-frame', 'desktop');
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  expect(box?.width).toBeGreaterThan(size.width - 20);
  expect(box?.width).toBeLessThan(size.width + 20);
  expect(box?.height).toBeGreaterThan(size.height - 20);
  expect(box?.height).toBeLessThan(size.height + 20);
}

test.describe('desktop play stage', () => {
  test('start page and game fill the window instead of a locked 1280×800 frame', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop play stage only');

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
    await page.goto('/');
    await expect(page.getByRole('heading', { name: ui.start.heading })).toBeVisible();
    await assertStageFills(page, { width: 1920, height: 1080 });
    await assertStageFills(page, { width: 1100, height: 720 });
    await expect(page.getByRole('heading', { name: ui.start.heading })).toBeVisible();

    await page.goto('/#/game');
    await expect(page.getByTestId('game-screen')).toBeVisible();
    await assertStageFills(page, { width: 1920, height: 1080 });
    await assertStageFills(page, { width: 1100, height: 720 });
    await expect(page.getByTestId('game-screen')).toBeVisible();
  });
});
