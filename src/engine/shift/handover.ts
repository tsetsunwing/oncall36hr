/** 超時、交更同強制結局（spec §2.1、§19；implementation-plan §8.2）。 */
import type { Effect, Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import { applyRule } from '../ward/scoring';
import { noticeEffect, withShift } from './common';
import type { Ending } from './shiftState';

const ORDER_IN_FLIGHT = ['PENDING_PARSE', 'GATED', 'QUEUED', 'RUNNING'];

function orderOpen(order: GameState['orders'][string]): boolean {
  return (
    ORDER_IN_FLIGHT.includes(order.status) ||
    (order.status === 'DONE' && order.resultStatus === 'PENDING')
  );
}

/** 有未完成嘅工作：未完成 order／未回報報告、未處理電話、進行中委派、搶救、死亡流程 */
export function workInFlight(state: GameState): boolean {
  if (Object.values(state.orders).some(orderOpen)) return true;
  if (state.ward.calls.some((c) => c.status === 'RINGING' || c.status === 'DEFERRED')) return true;
  if (state.ward.tasks.some((t) => t.status === 'RUNNING')) return true;
  if (state.resus?.status === 'ARREST') return true;
  return state.death?.status === 'PENDING_PROCESS';
}

/** 呢個病人交班時係咪「需要提及」：MEWS 唔係無警示、有未完成 order／報告、搶救或死亡流程未完 */
export function patientNeedsHandover(
  state: GameState,
  patientId: string,
  ctx: EngineContext,
): boolean {
  const patient = state.patients[patientId];
  if (!patient) return false;
  const band = ctx.tables.mews[0]?.bands.find((b) => b.id === patient.visible.mews.band);
  if (band && band.alert !== 'NONE') return true;
  if (Object.values(state.orders).some((o) => o.patientId === patientId && orderOpen(o))) {
    return true;
  }
  if (state.resus?.patientId === patientId && state.resus.status === 'ARREST') return true;
  return state.death?.patientId === patientId && state.death.status === 'PENDING_PROCESS';
}

function finish(
  state: GameState,
  ctx: EngineContext,
  ending: Ending,
  rules: readonly string[],
  extra: Effect[],
): Reduction {
  let next = state;
  for (const rule of rules) next = applyRule(next, rule, ctx);
  next = withShift(next, {
    ending,
    rounds: { ...next.shift.rounds, active: null },
    selfCare: { ...next.shift.selfCare, active: null },
  });
  next = { ...next, clock: { ...next.clock, phase: 'ENDED' } };
  return { state: next, effects: extra };
}

function overtimeSecondsOf(state: GameState): number {
  const entered = state.shift.overtime.enteredAt;
  return entered === null ? 0 : Math.max(0, state.clock.t - entered);
}

function overtimeRules(state: GameState, ctx: EngineContext): string[] {
  const step = ctx.config.shifts.overtimePenaltyStepSeconds;
  const count = Math.floor(overtimeSecondsOf(state) / step);
  return Array.from({ length: count }, () => 'OVERTIME_MINUTES');
}

/** 玩家揀好要提及嘅病人後確認交更：記溝通分，唔影響任何病人後果 */
export function confirmHandover(state: GameState, ctx: EngineContext): Reduction {
  const selected = new Set(state.shift.handover.selected);
  let next = state;
  for (const patient of Object.values(state.patients)) {
    const needed = patientNeedsHandover(state, patient.id, ctx);
    const mentioned = selected.has(patient.id);
    let rule: string | null = null;
    if (needed && mentioned) rule = 'HANDOVER_MENTION_NEEDED';
    else if (needed) rule = 'HANDOVER_OMIT_NEEDED';
    else if (mentioned) rule = 'HANDOVER_MENTION_STABLE';
    if (rule) next = applyRule(next, rule, ctx, { patientId: patient.id });
  }
  return finish(
    next,
    ctx,
    {
      reason: 'NORMAL',
      tags: [],
      at: next.clock.t,
      forced: false,
      selected: [...selected],
      overtimeSeconds: overtimeSecondsOf(next),
    },
    overtimeRules(next, ctx),
    [],
  );
}

/** 超時窗口用盡：強制交更，結局只得「超時」標籤 */
export function forceOvertimeEnd(state: GameState, ctx: EngineContext): Reduction {
  return finish(
    state,
    ctx,
    {
      reason: 'OVERTIME',
      tags: ['OVERTIME'],
      at: state.clock.t,
      forced: true,
      selected: [],
      overtimeSeconds: overtimeSecondsOf(state),
    },
    [...overtimeRules(state, ctx), 'HANDOVER_FORCED'],
    [noticeEffect('FORCED_HANDOVER', 'error')],
  );
}

/** 精力歸零：即時暈倒、強制交更並結束；結局只得「暈倒」標籤，唔另加「超時」 */
export function faint(state: GameState, ctx: EngineContext): Reduction {
  return finish(
    state,
    ctx,
    {
      reason: 'FAINT',
      tags: ['FAINT'],
      at: state.clock.t,
      forced: true,
      selected: [],
      overtimeSeconds: 0,
    },
    ['FAINT', 'HANDOVER_FORCED'],
    [noticeEffect('FAINTED', 'error')],
  );
}
