/**
 * 更次模組（M6）：時間線、巡房、超時凍結、交更、精力同自我照顧。
 * 排喺 defaultModules 第一位：負責喺超時凍結、巡房抑制時攔截其他模組嘅排程事件同玩家 intent。
 * 所有玩家動作經 `EXTENSION` intent（module: 'shift'）進入。
 */
import { z } from 'zod';
import { VITALS_SAMPLE_EVENT } from '../case/caseModule';
import { SELF_CARE_IDS } from '../case/tables';
import { enqueue, type ScheduledEvent } from '../core/eventQueue';
import type { Effect, PlayerIntent, Reduction } from '../core/events';
import type { EngineContext, EngineModule } from '../core/module';
import type { GameState } from '../core/state';
import { CONSEQUENCE_ONSET_EVENT_KIND } from '../gate/gate';
import { CALL_EXPIRE_EVENT, CALL_RING_AGAIN_EVENT, CONSULT_ARRIVAL_EVENT } from '../ward/calls';
import { moveTo } from '../ward/movement';
import { CALL_ARRIVAL_EVENT } from '../ward/generate';
import { applyRule } from '../score/scoring';
import { none, noticeEffect, reject, SHIFT_MODULE, withShift } from './common';
import {
  actionCostOf,
  applyDecay,
  changeEnergy,
  energyModel,
  relieveNeed,
  shouldNudge,
} from './energy';
import { confirmHandover, faint, forceOvertimeEnd, workInFlight } from './handover';
import {
  answerRound,
  beginRound,
  handleRoundAiResult,
  handleRoundStart,
  handleRoundTimer,
  nextRound,
  passRound,
  ROUND_EVENT_PRIORITY,
  ROUND_START_EVENT,
  ROUND_TIMER_EVENT,
} from './rounds';
import { completeSelfCare, SELF_CARE_END_EVENT, startSelfCare, stopSelfCare } from './selfCare';
import { interruptsSuppressed } from './suppress';
import { regularSecondsOf, roundTimes } from './timeline';

export { SHIFT_MODULE };

export const SHIFT_END_EVENT = 'SHIFT_END';
export const OVERTIME_DEADLINE_EVENT = 'OVERTIME_DEADLINE';
export const ENERGY_TICK_EVENT = 'ENERGY_TICK';
const SHIFT_EVENT_PRIORITY = 0;
const ENERGY_PRIORITY = 3;

const payloads = {
  ROUND_ANSWER: z.object({ text: z.string(), viaHint: z.boolean().optional() }).strict(),
  SELF_CARE_START: z.object({ actionId: z.enum(SELF_CARE_IDS) }).strict(),
  ENTER_PLACE: z.object({ place: z.enum(['STATION', 'PANTRY', 'REST', 'WC']) }).strict(),
  HANDOVER_TOGGLE: z.object({ patientId: z.string().min(1) }).strict(),
} as const;

const OVERTIME_BLOCKED_WARD = ['DELEGATE', 'PREPARE_CALL', 'SEND_CALL'];

function schedule(
  state: GameState,
  time: number,
  kind: string,
  priority: number,
  payload?: ScheduledEvent['payload'],
): GameState {
  return {
    ...state,
    scheduler: enqueue(state.scheduler, { time, priority, kind, payload: payload ?? null }),
  };
}

function checkFaint(result: Reduction, ctx: EngineContext): Reduction {
  const { state } = result;
  if (state.clock.phase === 'ENDED' || state.shift.energy.percent > 0) return result;
  if (!energyModel(ctx)) return result;
  const fainted = faint(state, ctx);
  return { state: fainted.state, effects: [...result.effects, ...fainted.effects] };
}

function handleExtension(
  state: GameState,
  name: string,
  payload: unknown,
  ctx: EngineContext,
): Reduction {
  switch (name) {
    case 'ROUND_BEGIN':
      return beginRound(state, ctx);
    case 'ROUND_ANSWER': {
      const parsed = payloads.ROUND_ANSWER.safeParse(payload);
      if (!parsed.success) return reject(state, 'ROUND_ANSWER_INVALID');
      return answerRound(state, parsed.data, ctx);
    }
    case 'ROUND_PASS':
      return passRound(state, ctx);
    case 'ROUND_NEXT':
      return nextRound(state, ctx);
    case 'SELF_CARE_START': {
      if (state.clock.phase !== 'REGULAR') return reject(state, 'SHIFT_NOT_ACTIVE');
      const parsed = payloads.SELF_CARE_START.safeParse(payload);
      if (!parsed.success) return reject(state, 'SELF_CARE_UNAVAILABLE');
      if (state.shift.rounds.active) return reject(state, 'ROUND_ACTIVE');
      return startSelfCare(state, parsed.data.actionId, ctx);
    }
    case 'SELF_CARE_STOP':
      return stopSelfCare(state, ctx);
    case 'ENTER_PLACE': {
      const parsed = payloads.ENTER_PLACE.safeParse(payload);
      if (!parsed.success) return reject(state, 'SHIFT_NOT_ACTIVE');
      if (state.clock.phase === 'ENDED') return reject(state, 'SHIFT_NOT_ACTIVE');
      return enterPlace(state, parsed.data.place, ctx);
    }
    case 'BEGIN_HANDOVER': {
      if (state.clock.phase !== 'OVERTIME') return reject(state, 'HANDOVER_NOT_AVAILABLE');
      return none(
        withShift(
          { ...state, clock: { ...state.clock, phase: 'HANDOVER' } },
          {
            handover: { selected: [] },
          },
        ),
      );
    }
    case 'HANDOVER_TOGGLE': {
      const parsed = payloads.HANDOVER_TOGGLE.safeParse(payload);
      if (state.clock.phase !== 'HANDOVER') return reject(state, 'HANDOVER_NOT_AVAILABLE');
      if (!parsed.success || !state.patients[parsed.data.patientId]) {
        return reject(state, 'HANDOVER_NOT_AVAILABLE');
      }
      const { patientId } = parsed.data;
      const selected = state.shift.handover.selected;
      return none(
        withShift(state, {
          handover: {
            selected: selected.includes(patientId)
              ? selected.filter((id) => id !== patientId)
              : [...selected, patientId],
          },
        }),
      );
    }
    case 'HANDOVER_CONFIRM': {
      if (state.clock.phase !== 'HANDOVER') return reject(state, 'HANDOVER_NOT_AVAILABLE');
      return confirmHandover(state, ctx);
    }
    default:
      return reject(state, 'SHIFT_NOT_ACTIVE');
  }
}

/** 其他模組嘅 intent 喺超時、巡房、自我照顧期間嘅閘 */
function gateIntent(state: GameState, intent: PlayerIntent): Reduction | undefined {
  const { phase } = state.clock;
  if (phase === 'ENDED' || phase === 'HANDOVER') return reject(state, 'SHIFT_NOT_ACTIVE');

  const wardAction = intent.type === 'EXTENSION' && intent.module === 'ward';
  const bedsideOrder =
    intent.type === 'SUBMIT_CHAT' ||
    intent.type === 'PLACE_CATALOG' ||
    intent.type === 'PLACE_CATALOG_BATCH';
  const newWork =
    intent.type === 'PLACE_ORDER' ||
    bedsideOrder ||
    (wardAction && OVERTIME_BLOCKED_WARD.includes(intent.name));
  const movement =
    intent.type === 'ENTER_BED' ||
    intent.type === 'LEAVE_BED' ||
    (wardAction && intent.name === 'GO_TO_BED');

  if (phase === 'OVERTIME' && newWork) {
    if (!(state.resus?.status === 'ARREST' && bedsideOrder)) {
      return reject(state, 'OVERTIME_FROZEN');
    }
  }
  const resuscitating = state.resus?.status === 'ARREST' && bedsideOrder;
  if (state.shift.rounds.active && (newWork || movement || wardAction) && !resuscitating) {
    return reject(state, 'ROUND_ACTIVE');
  }
  if (state.shift.selfCare.active && (newWork || movement || wardAction)) {
    return reject(state, 'SELF_CARE_BUSY');
  }
  return undefined;
}

function deferEvent(state: GameState, event: ScheduledEvent, ctx: EngineContext): Reduction {
  const step = ctx.config.rounds.deferStepSeconds;
  let next = schedule(state, event.time + step, event.kind, event.priority, event.payload);
  if (event.kind === CALL_EXPIRE_EVENT) {
    const callId =
      typeof event.payload === 'object' && event.payload !== null && !Array.isArray(event.payload)
        ? event.payload.callId
        : null;
    next = {
      ...next,
      ward: {
        ...next.ward,
        calls: next.ward.calls.map((c) =>
          c.id === callId ? { ...c, expiresAt: c.expiresAt + step } : c,
        ),
      },
    };
  }
  return none(next);
}

const SUPPRESSED_DURING_ROUND = [
  CALL_ARRIVAL_EVENT,
  CALL_RING_AGAIN_EVENT,
  CALL_EXPIRE_EVENT,
  CONSULT_ARRIVAL_EVENT,
];
const FROZEN_IN_OVERTIME = [VITALS_SAMPLE_EVENT, CALL_ARRIVAL_EVENT, CONSEQUENCE_ONSET_EVENT_KIND];

function handleShiftEnd(state: GameState, ctx: EngineContext): Reduction {
  if (state.clock.phase !== 'REGULAR') return none(state);
  const inFlight = workInFlight(state);
  let next: GameState = {
    ...state,
    clock: { ...state.clock, phase: 'OVERTIME' },
  };
  next = withShift(next, { overtime: { enteredAt: state.clock.t, workInFlight: inFlight } });
  if (inFlight) next = applyRule(next, 'OVERTIME_ENTERED', ctx);
  next = schedule(
    next,
    state.clock.t + ctx.config.shifts.overtimeSeconds,
    OVERTIME_DEADLINE_EVENT,
    SHIFT_EVENT_PRIORITY,
  );
  return { state: next, effects: [noticeEffect('OVERTIME_STARTED', 'warn')] };
}

const PLACE_NEED = { PANTRY: 'hunger', REST: 'fatigue', WC: 'bladder' } as const;

function enterPlace(
  state: GameState,
  place: 'STATION' | 'PANTRY' | 'REST' | 'WC',
  ctx: EngineContext,
): Reduction {
  let next = state;
  if (place !== 'STATION') {
    const model = energyModel(ctx);
    const last = next.shift.energy.placeAt[place];
    const cooled = !model || last === null || next.clock.t - last >= model.placeCooldownSeconds;
    if (model && cooled) {
      next = relieveNeed(next, PLACE_NEED[place], model.placeReliefPercent);
      next = withShift(next, {
        energy: {
          ...next.shift.energy,
          placeAt: { ...next.shift.energy.placeAt, [place]: next.clock.t },
        },
      });
    }
  }
  next = withShift(next, { energy: { ...next.shift.energy, place } });
  if (next.ward.location.bed === null && next.ward.location.movingTo === null) {
    return none(next);
  }
  const moved = moveTo(next, null, ctx);
  return { state: moved.state, effects: moved.effects };
}

function handleEnergyTick(state: GameState, ctx: EngineContext): Reduction {
  const model = energyModel(ctx);
  if (!model) return none(state);
  let next = schedule(
    applyDecay(state, ctx),
    state.clock.t + model.tickSeconds,
    ENERGY_TICK_EVENT,
    ENERGY_PRIORITY,
  );
  const effects: Effect[] = [];
  if (shouldNudge(next, ctx)) {
    next = withShift(next, { energy: { ...next.shift.energy, lastNudgeAt: next.clock.t } });
    effects.push(noticeEffect('REST_NUDGE', 'info'));
  }
  return checkFaint({ state: next, effects }, ctx);
}

export const shiftModule: EngineModule = {
  name: SHIFT_MODULE,

  init(state, params, ctx) {
    let next = state;
    const model = energyModel(ctx);
    if (model) {
      const need = Math.round((100 - model.startPercent) * 100) / 100;
      next = withShift(next, {
        energy: {
          percent: model.startPercent,
          fatigue: need,
          hunger: need,
          bladder: need,
          lastNudgeAt: null,
          place: null,
          placeAt: { PANTRY: null, REST: null, WC: null },
        },
      });
      next = schedule(next, model.tickSeconds, ENERGY_TICK_EVENT, ENERGY_PRIORITY);
    }
    next = schedule(
      next,
      regularSecondsOf(ctx.config, params.mode),
      SHIFT_END_EVENT,
      SHIFT_EVENT_PRIORITY,
    );
    for (const time of roundTimes(ctx.config, params.mode)) {
      next = schedule(next, time, ROUND_START_EVENT, ROUND_EVENT_PRIORITY);
    }
    return next;
  },

  handleIntent(state, intent, ctx) {
    if (intent.type === 'EXTENSION' && intent.module === SHIFT_MODULE) {
      return handleExtension(state, intent.name, intent.payload, ctx);
    }
    return gateIntent(state, intent);
  },

  handleScheduled(state, event, ctx) {
    switch (event.kind) {
      case SHIFT_END_EVENT:
        return handleShiftEnd(state, ctx);
      case OVERTIME_DEADLINE_EVENT:
        return state.clock.phase === 'OVERTIME' ? forceOvertimeEnd(state, ctx) : none(state);
      case ROUND_START_EVENT:
        return handleRoundStart(state, event.payload, ctx);
      case ROUND_TIMER_EVENT:
        return handleRoundTimer(state, event.payload, ctx);
      case ENERGY_TICK_EVENT:
        return handleEnergyTick(state, ctx);
      case SELF_CARE_END_EVENT: {
        const parsed = z
          .object({ actionId: z.string(), startedAt: z.number() })
          .safeParse(event.payload);
        return parsed.success ? completeSelfCare(state, parsed.data, ctx) : none(state);
      }
      default:
        break;
    }
    if (state.clock.phase !== 'REGULAR' && FROZEN_IN_OVERTIME.includes(event.kind)) {
      return none(state);
    }
    if (interruptsSuppressed(state, ctx.config) && SUPPRESSED_DURING_ROUND.includes(event.kind)) {
      return deferEvent(state, event, ctx);
    }
    return undefined;
  },

  handleAiResult(state, reqId, payload, ctx, pending) {
    if (state.clock.phase === 'ENDED') return none(state);
    return handleRoundAiResult(state, reqId, payload, ctx, pending);
  },

  afterIntent(before, after, intent, ctx) {
    if (after.state.clock.phase === 'ENDED') return undefined;
    const cost = actionCostOf(before, after.state, intent, ctx);
    if (cost <= 0) return undefined;
    const charged = changeEnergy(after.state, -cost);
    return checkFaint({ state: charged, effects: after.effects }, ctx);
  },
};

export function shiftIntent(name: string, payload: Record<string, unknown> = {}): PlayerIntent {
  return {
    type: 'EXTENSION',
    module: SHIFT_MODULE,
    name,
    payload: payload as never,
  };
}
