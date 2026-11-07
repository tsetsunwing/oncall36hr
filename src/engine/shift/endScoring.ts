/** 更次結束時一次過入帳嘅項目：漏做嘅必要處置、漏食嘅用餐窗口、結束時嘅精力水平（自我照顧分項） */
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import { scoreMissedAtEnd } from '../score/requiredOrders';
import { applyRule } from '../score/scoring';
import { energyLevel, energyModel } from './energy';
import { mealNodes } from './timeline';
import type { Ending } from './shiftState';

export function scoreAtEnd(state: GameState, ctx: EngineContext, reason: Ending['reason']) {
  let next = scoreMissedAtEnd(state, ctx);
  for (const meal of mealNodes(ctx.config, next.mode)) {
    if (meal.endSec <= next.clock.t && !next.shift.mealsTaken.includes(meal.index)) {
      next = applyRule(next, 'SELF_CARE_MEAL_MISSED', ctx, {
        t: meal.endSec,
        evidence: `meal:${String(meal.index)}`,
        facts: { kind: meal.kind },
      });
    }
  }
  if (reason !== 'FAINT') {
    const level = energyLevel(next.shift.energy.percent, energyModel(ctx));
    if (level !== 'NORMAL') {
      next = applyRule(
        next,
        level === 'VERY_LOW' ? 'SELF_CARE_ENERGY_VERY_LOW_AT_END' : 'SELF_CARE_ENERGY_LOW_AT_END',
        ctx,
        { facts: { percent: next.shift.energy.percent } },
      );
    }
  }
  return next;
}
