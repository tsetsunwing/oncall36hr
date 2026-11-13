import { expect, type Page } from '@playwright/test';
import { ui } from '../src/i18n';

interface NeedTarget {
  chip: 'landmark-pantry' | 'landmark-rest' | 'landmark-wc';
  room: 'room-PANTRY' | 'room-REST' | 'room-WC';
  action: 'selfcare-WATER' | 'selfcare-NAP' | 'selfcare-TOILET';
}

/** 低過呢個先返病房等事件；否則會留喺休息室遮住巡房／加班 banner。 */
const NEED_ACT_AT = 25;
const POLL_MS = 50;
const CLICK_MS = 1_000;

function targetFor(fatigue: number, hunger: number, bladder: number): NeedTarget {
  if (fatigue >= hunger && fatigue >= bladder) {
    return { chip: 'landmark-rest', room: 'room-REST', action: 'selfcare-NAP' };
  }
  if (hunger >= bladder) {
    return { chip: 'landmark-pantry', room: 'room-PANTRY', action: 'selfcare-WATER' };
  }
  return { chip: 'landmark-wc', room: 'room-WC', action: 'selfcare-TOILET' };
}

async function clickIfVisible(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  if (!(await locator.isVisible())) return;
  try {
    await locator.click({ timeout: CLICK_MS, force: true });
  } catch {
    // overlay / re-render; next loop retries
  }
}

/** 來電會把倍速打回 1×；keepNeeds 期間要維持 4× 先趕得切加班。 */
async function ensureFastForward(page: Page) {
  const speed4 = page.getByRole('button', { name: ui.game.speedOption(4) });
  if ((await speed4.count()) === 0) return;
  try {
    if ((await speed4.getAttribute('aria-pressed', { timeout: 500 })) === 'true') return;
    await speed4.click({ timeout: CLICK_MS, force: true });
  } catch {
    // result page / re-render
  }
}

/** 頂欄「病房」返站；手機仲要關床位面板，唔好遮住加班／巡房掣。 */
export async function returnToWard(page: Page) {
  const station = page.getByTestId('landmark-station');
  if ((await station.count()) > 0 && (await station.getAttribute('aria-pressed')) !== 'true') {
    await clickIfVisible(page, 'landmark-station');
  }
  await clickIfVisible(page, 'close-beds');
}

async function startCareIfReady(page: Page, target: NeedTarget): Promise<boolean> {
  const action = page.getByTestId(target.action);
  if ((await action.count()) === 0) return false;
  try {
    await action.click({ timeout: CLICK_MS, force: true });
  } catch {
    return false;
  }
  if ((await page.getByTestId('selfcare-active').count()) === 0) return false;
  await returnToWard(page);
  return true;
}

/** 頂欄地標只負責去房；恢復掣喺房內，完成後返病房等巡房／加班。 */
export async function keepNeedsDownUntil(page: Page, testId: string, timeout: number) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (testId !== 'result-page' && (await page.getByTestId('result-page').count()) > 0) {
      throw new Error(`ended at result-page before ${testId}`);
    }
    if ((await page.getByTestId(testId).count()) > 0) {
      await returnToWard(page);
      return;
    }
    await ensureFastForward(page);
    if ((await page.getByTestId('selfcare-active').count()) > 0) {
      await returnToWard(page);
      await page.waitForTimeout(POLL_MS);
      continue;
    }
    const fatigueMeter = page.getByTestId('need-fatigue');
    const hungerMeter = page.getByTestId('need-hunger');
    const bladderMeter = page.getByTestId('need-bladder');
    if (
      (await fatigueMeter.count()) === 0 ||
      (await hungerMeter.count()) === 0 ||
      (await bladderMeter.count()) === 0
    ) {
      await page.waitForTimeout(POLL_MS);
      continue;
    }
    let fatigue = 0;
    let hunger = 0;
    let bladder = 0;
    try {
      fatigue = Number((await fatigueMeter.getAttribute('aria-valuenow', { timeout: 500 })) ?? '0');
      hunger = Number((await hungerMeter.getAttribute('aria-valuenow', { timeout: 500 })) ?? '0');
      bladder = Number((await bladderMeter.getAttribute('aria-valuenow', { timeout: 500 })) ?? '0');
    } catch {
      await page.waitForTimeout(POLL_MS);
      continue;
    }
    if (Math.max(fatigue, hunger, bladder) < NEED_ACT_AT) {
      await returnToWard(page);
      await page.waitForTimeout(POLL_MS);
      continue;
    }
    const target = targetFor(fatigue, hunger, bladder);
    if (await startCareIfReady(page, target)) continue;
    await clickIfVisible(page, target.chip);
    if (!(await page.getByTestId(target.room).isVisible())) await clickIfVisible(page, 'open-beds');
    if (await startCareIfReady(page, target)) continue;
    await page.waitForTimeout(POLL_MS);
  }
  await returnToWard(page);
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: 1_000 });
}
