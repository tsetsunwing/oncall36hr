/**
 * 疼痛分數：由病例狀態表（case-fsm 每個 state 的 pain）決定，唔由 AI 產生。
 * 未評估＝null；評估後只會因止痛藥而下降，唔會自己變。
 */
import type { GameState } from '../core/state';
import type { Patient } from './patient';
import type { EngineTables } from './tables';

/** 止痛藥生效時間窗（遊戲秒）。 */
export const ANALGESIA_WINDOW_SEC = 4 * 3600;
/** 止痛藥評估時扣減的分數。 */
export const ANALGESIA_RELIEF = 3;

function isAnalgesic(drugClass: string): boolean {
  return /analgesic|opioid/i.test(drugClass) && !/antagonist/i.test(drugClass);
}

/** 四小時內有完成過的止痛藥，評估時就扣分。未完成或已取消唔算。 */
export function analgesiaActive(
  state: GameState,
  patientId: string,
  tables: EngineTables,
  now: number,
): boolean {
  return Object.values(state.orders).some((order) => {
    if (order.patientId !== patientId || order.status !== 'DONE') return false;
    const drug = tables.formulary.find((row) => row.id === order.params.drugFormularyId);
    if (!drug || !isAnalgesic(drug.drugClass)) return false;
    return order.completesAt <= now && now - order.completesAt <= ANALGESIA_WINDOW_SEC;
  });
}

export type SymptomKind = 'pain' | 'agitation' | 'nausea';

/** 病人現時狀態對應的分數；表格冇寫就當 0。只有疼痛會因止痛藥扣分。 */
export function symptomFor(
  state: GameState,
  patient: Patient,
  tables: EngineTables,
  kind: SymptomKind,
): number {
  const template = tables['case-templates'].find((row) => row.id === patient.hidden.caseTemplateId);
  const fsm = tables['case-fsm'].find((row) => row.id === template?.fsmId);
  const row = fsm?.states[patient.hidden.fsm.state];
  const base =
    (kind === 'pain' ? row?.pain : kind === 'agitation' ? row?.agitation : row?.nausea) ?? 0;
  if (kind !== 'pain') return base;
  const relief = analgesiaActive(state, patient.id, tables, state.clock.t) ? ANALGESIA_RELIEF : 0;
  return Math.max(0, base - relief);
}

/** 疼痛分數 0–10；未評估時病人身上仍然是 null。 */
export function painFor(state: GameState, patient: Patient, tables: EngineTables): number {
  return symptomFor(state, patient, tables, 'pain');
}
