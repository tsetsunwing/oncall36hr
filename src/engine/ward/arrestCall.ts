/**
 * 病人喺玩家唔喺床邊嗰刻心臟停頓：護士打電話嚟（M5 未決問題）。
 * 呢個係普通來電（共用電話列表，EMERGENCY），回應同後果同其他來電一樣；
 * 玩家自己行到嗰張床，來電就自動標記為「已到床邊」，唔會再算漏接。
 * 葉模組：只可依賴 callStore／nurses，方便 acls 呼叫而唔造成循環 import。
 */
import { patientTokens } from '../chat/dialogue';
import type { Effect } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import {
  ARREST_TEMPLATE_ID,
  arrestAlertRow,
  CALL_EXPIRE_EVENT,
  notice,
  putCall,
  scheduleCallEvent,
} from './callStore';
import { nurseForBed } from './nurses';
import type { Call } from './wardTypes';

const isOpen = (call: Call) => call.status === 'RINGING' || call.status === 'DEFERRED';

export function raiseArrestCall(
  state: GameState,
  patientId: string,
  rearrest: boolean,
  ctx: EngineContext,
): { state: GameState; effects: Effect[] } {
  const patient = state.patients[patientId];
  const row = arrestAlertRow(ctx);
  if (!state.ward.enabled || !patient || !row) return { state, effects: [] };
  if (state.ward.location.bed === patient.bed) return { state, effects: [] };
  const existing = state.ward.calls.some(
    (c) => c.templateId === ARREST_TEMPLATE_ID && c.patientId === patientId && isOpen(c),
  );
  if (existing) return { state, effects: [] };

  const t = state.clock.t;
  const id = `k${String(state.ward.counters.call + 1)}`;
  const callerName = nurseForBed(state, ctx, patient.bed)?.name ?? '';
  const tokenValues = patientTokens(patient);
  const expiresAt = t + ctx.config.phone.expireSec.EMERGENCY;
  const call: Call = {
    id,
    templateId: ARREST_TEMPLATE_ID,
    direction: 'IN',
    tag: 'NURSE',
    priority: 'EMERGENCY',
    callerName,
    callerRank: null,
    patientId,
    deptId: null,
    target: null,
    status: 'RINGING',
    resolution: null,
    arrivedAt: t,
    expiresAt,
    ringAgainAt: null,
    defers: 0,
    delegable: false,
    sbar: null,
    outcome: null,
    lines: [
      {
        t,
        speaker: 'CALLER',
        name: callerName,
        template: rearrest ? row.rearrestText : row.text,
        tokenValues,
      },
    ],
    purpose: 'ARREST',
    exchange: null,
  };
  let next: GameState = {
    ...state,
    ward: {
      ...state.ward,
      counters: { ...state.ward.counters, call: state.ward.counters.call + 1 },
    },
  };
  next = putCall(next, call);
  next = scheduleCallEvent(next, expiresAt, CALL_EXPIRE_EVENT, { callId: id });
  return { state: next, effects: [notice('CALL_RINGING', 'info')] };
}

/**
 * 玩家到咗該床：護士、駐院醫生同停頓來電都唔使再響（唔扣分）。
 * 人已經喺床邊，佢哋可以直接講，唔使再打同一個病人嘅電話。
 */
export function resolveArrestCallsAtBed(state: GameState, patientId: string): GameState {
  const pending = (call: Call) =>
    call.patientId === patientId &&
    isOpen(call) &&
    (call.tag === 'NURSE' || call.tag === 'JUNIOR' || call.templateId === ARREST_TEMPLATE_ID);
  if (!state.ward.calls.some(pending)) return state;
  const calls = state.ward.calls.map((call) =>
    pending(call)
      ? { ...call, status: 'DONE' as const, resolution: 'ATTENDED', ringAgainAt: null }
      : call,
  );
  return { ...state, ward: { ...state.ward, calls } };
}
