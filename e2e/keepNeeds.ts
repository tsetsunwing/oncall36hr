import { expect, type Page } from '@playwright/test';

type NeedTarget = {
  chip: 'landmark-pantry' | 'landmark-rest' | 'landmark-wc';
  room: 'room-PANTRY' | 'room-REST' | 'room-WC';
  action: 'selfcare-WATER' | 'selfcare-NAP' | 'selfcare-TOILET';
};

function targetFor(fatigue: number, hunger: number, bladder: number): NeedTarget {
  if (fatigue >= hunger && fatigue >= bladder) {
    return { chip: 'landmark-rest', room: 'room-REST', action: 'selfcare-NAP' };
  }
  if (hunger >= bladder) {
    return { chip: 'landmark-pantry', room: 'room-PANTRY', action: 'selfcare-WATER' };
  }
  return { chip: 'landmark-wc', room: 'room-WC', action: 'selfcare-TOILET' };
}

/** 頂欄地標只負責去房；恢復掣喺房內，手機仲要打開床位面板先睇到。 */
export async function keepNeedsDownUntil(page: Page, testId: string, timeout: number) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await page.getByTestId(testId).count()) > 0) return;
    if ((await page.getByTestId('selfcare-active').count()) > 0) {
      await page.waitForTimeout(200);
      continue;
    }
    const fatigue = Number(
      (await page.getByTestId('need-fatigue').getAttribute('aria-valuenow')) ?? '0',
    );
    const hunger = Number(
      (await page.getByTestId('need-hunger').getAttribute('aria-valuenow')) ?? '0',
    );
    const bladder = Number(
      (await page.getByTestId('need-bladder').getAttribute('aria-valuenow')) ?? '0',
    );
    const target = targetFor(fatigue, hunger, bladder);
    const action = page.getByTestId(target.action);
    if ((await action.isVisible()) && (await action.isEnabled())) {
      await action.click();
      await page.waitForTimeout(200);
      continue;
    }
    const chip = page.getByTestId(target.chip);
    if ((await chip.count()) > 0) await chip.click();
    const room = page.getByTestId(target.room);
    if (!(await room.isVisible())) {
      const openBeds = page.getByTestId('open-beds');
      if (await openBeds.isVisible()) await openBeds.click();
    }
    await page.waitForTimeout(200);
  }
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: 1_000 });
}
