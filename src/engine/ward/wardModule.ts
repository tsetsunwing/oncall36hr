/**
 * Ward 模組（M4）：病房生成、玩家位置、電話、上報、委派。
 * 所有 M4 玩家動作經 `EXTENSION` intent（module: 'ward'）進入；暫停時唔接受。
 */
import { z } from 'zod';
import type { Effect, PlayerIntent, Reduction } from '../core/events';
import type { EngineContext, EngineModule } from '../core/module';
import type { GameState } from '../core/state';
import {
  CALL_EXPIRE_EVENT,
  CALL_RING_AGAIN_EVENT,
  CONSULT_ARRIVAL_EVENT,
  handleCallArrival,
  handleCallExpire,
  handleConsultArrival,
  handleRingAgain,
  respondToCall,
  sendEscalation,
  targetValid,
} from './calls';
import { DELEGATION_COMPLETE_EVENT, delegate, handleDelegationComplete } from './delegation';
import { CALL_ARRIVAL_EVENT, generateWard } from './generate';
import { arriveAt, moveTo, PLAYER_ARRIVE_EVENT } from './movement';
import { buildSbarDraft } from './sbar';
import { CALL_RESPONSES, DELEGATION_TASKS, RANKS, sbarSchema } from './wardTypes';

export const WARD_MODULE = 'ward';

const blocked = (state: GameState): Reduction => ({
  state,
  effects: [{ type: 'NOTICE', kind: 'ORDER_BLOCKED_PAUSED', tone: 'warn' }],
});

const reject = (
  state: GameState,
  kind: Extract<Effect, { type: 'NOTICE' }>['kind'],
): Reduction => ({
  state,
  effects: [{ type: 'NOTICE', kind, tone: 'warn' }],
});

const payloads = {
  GO_TO_BED: z.object({ bed: z.number().int().min(0).nullable() }).strict(),
  RESPOND_CALL: z.object({ callId: z.string().min(1), response: z.enum(CALL_RESPONSES) }).strict(),
  PREPARE_CALL: z
    .object({
      patientId: z.string().min(1),
      target: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('RANK'), rank: z.enum(RANKS) }).strict(),
        z.object({ kind: z.literal('DEPT'), deptId: z.string().min(1) }).strict(),
      ]),
    })
    .strict(),
  SEND_CALL: z.object({ sbar: sbarSchema }).strict(),
  DISCARD_CALL: z.object({}).strict(),
  DELEGATE: z
    .object({
      task: z.enum(DELEGATION_TASKS),
      itemId: z.string().min(1),
      patientId: z.string().nullable(),
      callId: z.string().nullable(),
    })
    .strict(),
} as const;

function handleExtension(
  state: GameState,
  name: string,
  payload: unknown,
  ctx: EngineContext,
): Reduction | undefined {
  if (!state.ward.enabled) return undefined;
  switch (name) {
    case 'GO_TO_BED': {
      const parsed = payloads.GO_TO_BED.safeParse(payload);
      if (!parsed.success) return reject(state, 'PATIENT_UNKNOWN');
      if (state.paused) return blocked(state);
      return moveTo(state, parsed.data.bed === 0 ? null : parsed.data.bed, ctx);
    }
    case 'RESPOND_CALL': {
      const parsed = payloads.RESPOND_CALL.safeParse(payload);
      if (!parsed.success) return reject(state, 'CALL_UNKNOWN');
      if (state.paused) return blocked(state);
      return respondToCall(state, parsed.data.callId, parsed.data.response, ctx);
    }
    case 'PREPARE_CALL': {
      const parsed = payloads.PREPARE_CALL.safeParse(payload);
      if (!parsed.success) return reject(state, 'CALL_TARGET_INVALID');
      if (state.paused) return blocked(state);
      const { patientId, target } = parsed.data;
      if (!state.patients[patientId]) return reject(state, 'PATIENT_UNKNOWN');
      if (!targetValid(state, target, ctx)) return reject(state, 'CALL_TARGET_INVALID');
      const sbar = buildSbarDraft(state, patientId, target, ctx);
      if (!sbar) return reject(state, 'SBAR_INVALID');
      return {
        state: {
          ...state,
          ward: { ...state.ward, draft: { patientId, target, sbar, createdAt: state.clock.t } },
        },
        effects: [],
      };
    }
    case 'SEND_CALL': {
      const parsed = payloads.SEND_CALL.safeParse(payload);
      if (!parsed.success) return reject(state, 'SBAR_INVALID');
      if (state.paused) return blocked(state);
      return sendEscalation(state, parsed.data.sbar, ctx);
    }
    case 'DISCARD_CALL':
      return { state: { ...state, ward: { ...state.ward, draft: null } }, effects: [] };
    case 'DELEGATE': {
      const parsed = payloads.DELEGATE.safeParse(payload);
      if (!parsed.success) return reject(state, 'DELEGATE_INVALID');
      if (state.paused) return blocked(state);
      return delegate(state, parsed.data, ctx);
    }
    default:
      return undefined;
  }
}

function handleBedIntents(
  state: GameState,
  intent: PlayerIntent,
  ctx: EngineContext,
): Reduction | undefined {
  switch (intent.type) {
    case 'ENTER_BED': {
      const patient = state.patients[intent.patientId];
      if (!patient) return reject(state, 'PATIENT_UNKNOWN');
      return moveTo(state, patient.bed, ctx);
    }
    case 'LEAVE_BED':
      return moveTo(state, null, ctx);
    case 'SUBMIT_CHAT': {
      const patient = state.patients[intent.patientId];
      if (patient && state.ward.location.bed !== patient.bed) return reject(state, 'NOT_AT_BED');
      return undefined;
    }
    default:
      return undefined;
  }
}

export const wardModule: EngineModule = {
  name: WARD_MODULE,

  init(state, params, ctx) {
    return params.ward ? generateWard(state, ctx) : state;
  },

  handleIntent(state, intent, ctx) {
    if (!state.ward.enabled) return undefined;
    if (intent.type === 'EXTENSION') {
      if (intent.module !== WARD_MODULE) return undefined;
      return handleExtension(state, intent.name, intent.payload, ctx);
    }
    return handleBedIntents(state, intent, ctx);
  },

  handleScheduled(state, event, ctx) {
    const payload = event.payload;
    const idOf = (key: string): string | null =>
      typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? typeof payload[key] === 'string'
          ? payload[key]
          : null
        : null;
    switch (event.kind) {
      case CALL_ARRIVAL_EVENT:
        return handleCallArrival(state, ctx);
      case CALL_EXPIRE_EVENT: {
        const id = idOf('callId');
        return id ? handleCallExpire(state, id, ctx) : { state, effects: [] };
      }
      case CALL_RING_AGAIN_EVENT: {
        const id = idOf('callId');
        return id ? handleRingAgain(state, id, ctx) : { state, effects: [] };
      }
      case CONSULT_ARRIVAL_EVENT: {
        const id = idOf('callId');
        return id ? handleConsultArrival(state, id, ctx) : { state, effects: [] };
      }
      case DELEGATION_COMPLETE_EVENT: {
        const id = idOf('taskId');
        return id ? handleDelegationComplete(state, id, ctx) : { state, effects: [] };
      }
      case PLAYER_ARRIVE_EVENT: {
        const bed =
          typeof payload === 'object' && payload !== null && !Array.isArray(payload)
            ? payload.bed
            : null;
        return {
          state: arriveAt(state, typeof bed === 'number' ? bed : null, ctx),
          effects: [],
        };
      }
      default:
        return undefined;
    }
  },
};
