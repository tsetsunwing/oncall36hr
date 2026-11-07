/**
 * 自我照顧（T21）：扣遊戲時間、回精力。進行期間玩家離開病床（唔可以做其他事），
 * 可隨時提早停止（按比例回復）。短睡有冷卻；食飯只可喺用餐窗口、每個窗口一次。
 */
import type { SelfCareId, SelfCareRow } from '../case/tables';
import { enqueue } from '../core/eventQueue';
import type { Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import { leaveVisit } from '../ward/movement';
import { patientAtBed } from '../ward/movement';
import { applyRule } from '../ward/scoring';
import { none, reject, round2, withShift } from './common';
import { changeEnergy } from './energy';
import { activeMeal, type TimelineConfig } from './timeline';

export const SELF_CARE_END_EVENT = 'SELF_CARE_END';
export const SELF_CARE_PRIORITY = 2;

export function selfCareRow(ctx: EngineContext, id: string): SelfCareRow | undefined {
  return ctx.tables['self-care-actions'].find((r) => r.id === id);
}

export function selfCareCooldownLeft(state: GameState, row: SelfCareRow): number {
  const last = state.shift.selfCare.lastEndedAt[row.id];
  if (last === undefined || row.cooldownSeconds <= 0) return 0;
  return Math.max(0, last + row.cooldownSeconds - state.clock.t);
}

export function mealWindowFor(state: GameState, ctx: { config: TimelineConfig }) {
  const meal = activeMeal(ctx.config, state.mode, state.clock.t);
  return meal && !state.shift.mealsTaken.includes(meal.index) ? meal : null;
}

export function selfCareAvailable(
  state: GameState,
  row: SelfCareRow,
  ctx: { config: TimelineConfig },
): boolean {
  if (state.clock.phase !== 'REGULAR') return false;
  if (state.shift.selfCare.active || state.shift.rounds.active) return false;
  if (state.resus?.status === 'ARREST') return false;
  if (selfCareCooldownLeft(state, row) > 0) return false;
  if (row.requires === 'MEAL_WINDOW' && !mealWindowFor(state, ctx)) return false;
  return true;
}

export function startSelfCare(state: GameState, id: SelfCareId, ctx: EngineContext): Reduction {
  const row = selfCareRow(ctx, id);
  if (!row) return reject(state, 'SELF_CARE_UNAVAILABLE');
  if (state.shift.selfCare.active) return reject(state, 'SELF_CARE_BUSY');
  if (!selfCareAvailable(state, row, ctx)) return reject(state, 'SELF_CARE_UNAVAILABLE');

  let next = state;
  const { bed } = next.ward.location;
  if (bed !== null) {
    const here = patientAtBed(next, bed);
    if (here) next = leaveVisit(next, here);
    next = {
      ...next,
      ward: { ...next.ward, location: { bed: null, movingTo: null, arriveAt: null } },
    };
  }
  const meal = row.requires === 'MEAL_WINDOW' ? mealWindowFor(next, ctx) : null;
  const endsAt = next.clock.t + row.durationSeconds;
  next = withShift(next, {
    selfCare: {
      ...next.shift.selfCare,
      active: { actionId: row.id, startedAt: next.clock.t, endsAt },
    },
    ...(meal ? { mealsTaken: [...next.shift.mealsTaken, meal.index] } : {}),
  });
  next = {
    ...next,
    scheduler: enqueue(next.scheduler, {
      time: endsAt,
      priority: SELF_CARE_PRIORITY,
      kind: SELF_CARE_END_EVENT,
      payload: { actionId: row.id, startedAt: next.shift.selfCare.active?.startedAt ?? 0 },
    }),
  };
  return none(next);
}

function finishSelfCare(state: GameState, ctx: EngineContext, fraction: number): GameState {
  const active = state.shift.selfCare.active;
  if (!active) return state;
  const row = selfCareRow(ctx, active.actionId);
  let next = withShift(state, {
    selfCare: {
      active: null,
      lastEndedAt: { ...state.shift.selfCare.lastEndedAt, [active.actionId]: state.clock.t },
    },
  });
  if (!row) return next;
  next = changeEnergy(next, round2(row.gainPercent * fraction));
  if (fraction >= 1) next = applyRule(next, row.rule, ctx);
  return next;
}

export function completeSelfCare(
  state: GameState,
  payload: { actionId: string; startedAt: number },
  ctx: EngineContext,
): Reduction {
  const active = state.shift.selfCare.active;
  if (active?.actionId !== payload.actionId || active.startedAt !== payload.startedAt) {
    return none(state);
  }
  return none(finishSelfCare(state, ctx, 1));
}

/** 提早停止：按已用時間比例回復，唔計自我照顧分數 */
export function stopSelfCare(state: GameState, ctx: EngineContext): Reduction {
  const active = state.shift.selfCare.active;
  if (!active) return none(state);
  const total = active.endsAt - active.startedAt;
  const fraction = total <= 0 ? 1 : Math.min(1, (state.clock.t - active.startedAt) / total);
  return none(finishSelfCare(state, ctx, fraction >= 1 ? 1 : fraction));
}
