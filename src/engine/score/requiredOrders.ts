/**
 * 必要處置時間窗（T1b required-actions）：由病人進入該 case 狀態起計，
 * 玩家落單（放行時）喺窗內 → 準時，超過 → 遲；離開狀態或完結仍未做 → 漏。全部落「時效」分項。
 */
import type { RequiredActionRow } from '../case/tables';
import type { Patient } from '../case/patient';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import type { Order } from '../orders/orderTypes';
import { applyRule } from './scoring';

export function fsmIdOf(patient: Patient, ctx: EngineContext): string | null {
  const template = ctx.tables['case-templates'].find((t) => t.id === patient.hidden.caseTemplateId);
  return template?.fsmId ?? null;
}

export function requiredItemsFor(patient: Patient, ctx: EngineContext): RequiredActionRow[] {
  const fsmId = fsmIdOf(patient, ctx);
  if (!fsmId) return [];
  return ctx.tables['required-actions'].filter(
    (row) => row.fsmId === fsmId && row.state === patient.hidden.fsm.state,
  );
}

export const requiredKey = (item: RequiredActionRow, patient: Patient) =>
  `req:${item.id}:${patient.id}:${String(patient.hidden.fsm.enteredAt)}`;

const credited = (state: GameState, key: string) =>
  state.scoreLedger.some((e) => e.evidenceRef === key);

/** order 真正放行（唔使把關，或把關放行）時：對應必要處置按延遲記準時／遲 */
export function scoreOrderCommitted(state: GameState, order: Order, ctx: EngineContext): GameState {
  const patient = state.patients[order.patientId];
  if (!patient) return state;
  let next = state;
  for (const item of requiredItemsFor(patient, ctx)) {
    if (!item.catalogIds.includes(order.catalogId)) continue;
    const key = requiredKey(item, patient);
    if (patient.hidden.fsm.flags.includes(item.flag) || credited(next, key)) continue;
    const delaySec = Math.max(0, order.createdAt - patient.hidden.fsm.enteredAt);
    next = applyRule(
      next,
      delaySec <= item.windowSec ? 'REQUIRED_ORDER_ON_TIME' : 'REQUIRED_ORDER_LATE',
      ctx,
      {
        patientId: patient.id,
        evidence: key,
        t: order.createdAt,
        facts: { itemId: item.id, orderId: order.id, delaySec, windowSec: item.windowSec },
      },
    );
  }
  return next;
}

/** 窗口已過而仍未做：每項只記一次「漏」 */
function scoreMissed(state: GameState, patient: Patient, ctx: EngineContext, t: number): GameState {
  let next = state;
  for (const item of requiredItemsFor(patient, ctx)) {
    const key = requiredKey(item, patient);
    if (patient.hidden.fsm.flags.includes(item.flag) || credited(next, key)) continue;
    const elapsed = t - patient.hidden.fsm.enteredAt;
    if (elapsed <= item.windowSec) continue;
    next = applyRule(next, 'REQUIRED_ORDER_MISSED', ctx, {
      patientId: patient.id,
      evidence: key,
      t: patient.hidden.fsm.enteredAt + item.windowSec,
      facts: { itemId: item.id, delaySec: elapsed, windowSec: item.windowSec },
    });
  }
  return next;
}

/** 病人離開 case 狀態（傳入離開前嘅病人快照） */
export function scoreStateExit(
  state: GameState,
  before: Patient,
  ctx: EngineContext,
  t: number,
): GameState {
  return scoreMissed(state, before, ctx, t);
}

export function scoreMissedAtEnd(state: GameState, ctx: EngineContext): GameState {
  let next = state;
  for (const patient of Object.values(state.patients)) {
    next = scoreMissed(next, patient, ctx, state.clock.t);
  }
  return next;
}
