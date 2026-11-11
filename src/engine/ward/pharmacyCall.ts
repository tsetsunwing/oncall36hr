/**
 * 藥房把關來電（由 calls.ts 抽出）。
 * 抽出原因：orders/placement.ts 與 gate/gate.ts 要開藥房來電，但 placement 被 bedside 引用；
 * 若直接 import ward/calls.ts，會形成 bedside → placement → calls → bedside 的循環依賴。
 * 這個檔只依賴 callStore、callLog、chat 與型別，不會回頭 import bedside／generate／movement。
 */
import { patientTokens, vitalTokens } from '../chat/dialogue';
import type { Priority } from '../case/tables';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import { callTemplates, CALL_EXPIRE_EVENT, putCall, scheduleCallEvent } from './callStore';
import { logIncomingCall } from './callLog';
import type { Call } from './wardTypes';

/** 藥房來電唔再隨機響。只係玩家落咗要核對嘅藥單先開。 */
export function pharmacyCheckReason(
  missing: { dose: boolean; route: boolean },
  categories: readonly string[],
): string | null {
  const bits: string[] = [];
  if (missing.dose) bits.push('冇寫劑量');
  if (missing.route) bits.push('冇寫途徑');
  if (categories.includes('DOSE_HIGH') || categories.includes('DOSE_LOW'))
    bits.push('劑量可能唔啱');
  if (categories.includes('WRONG_ROUTE')) bits.push('途徑可能唔啱');
  if (categories.includes('INTERACTION')) bits.push('可能有藥物相互作用');
  if (categories.includes('OTHER')) bits.push('製劑或者用藥次數要再核對');
  return bits.length > 0 ? bits.join('、') : null;
}

export function openPharmacyCheckCall(
  state: GameState,
  patientId: string,
  orderLabel: string,
  reason: string,
  ctx: EngineContext,
): GameState {
  const already = state.ward.calls.some(
    (c) =>
      c.tag === 'PHARMACY' &&
      c.patientId === patientId &&
      (c.status === 'RINGING' || c.status === 'DEFERRED'),
  );
  const row = callTemplates(ctx).find((r) => r.id === 'PHARMACY_QUERY');
  const patient = state.patients[patientId];
  if (already || !row || !patient) return state;
  const callerName = ctx.config.gate.pharmacyName;
  const tokenValues: Record<string, string> = {
    ...vitalTokens(patient, ctx.tables),
    ...patientTokens(patient),
    'caller.name': callerName,
    'order.label': orderLabel,
    'pharmacy.reason': reason,
  };
  const id = `k${String(state.ward.counters.call + 1)}`;
  const t = state.clock.t;
  const call: Call = {
    id,
    templateId: row.id,
    direction: 'IN',
    tag: 'PHARMACY',
    priority: row.priority,
    callerName,
    callerRank: null,
    patientId,
    deptId: null,
    target: null,
    status: 'RINGING',
    resolution: null,
    arrivedAt: t,
    expiresAt: t + ctx.config.phone.expireSec[row.priority],
    ringAgainAt: null,
    defers: 0,
    delegable: row.delegable,
    sbar: null,
    outcome: null,
    lines: [{ t, speaker: 'CALLER', name: callerName, template: row.text, tokenValues }],
    purpose: 'GENERAL',
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
  next = logIncomingCall(next, call);
  next = scheduleCallEvent(next, call.expiresAt, CALL_EXPIRE_EVENT, { callId: id });
  return interrupt(next, row.priority, ctx);
}

export function interrupt(state: GameState, priority: Priority, ctx: EngineContext): GameState {
  if (!ctx.config.phone.interruptPriorities.includes(priority)) return state;
  if (state.clock.cprSlow || state.clock.speed <= ctx.config.clock.speedAfterInterrupt)
    return state;
  return { ...state, clock: { ...state.clock, speed: ctx.config.clock.speedAfterInterrupt } };
}
