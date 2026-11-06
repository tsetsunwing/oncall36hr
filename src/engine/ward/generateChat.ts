import { buildPresent } from '../bedside/bedside';
import type { Patient } from '../case/patient';
import type { ChatThread } from '../chat/chatTypes';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';

/** 新病人嘅空白床邊對話串（玩家未入床，冇 visit） */
export function buildChat(state: GameState, patient: Patient, ctx: EngineContext): ChatThread {
  return {
    patientId: patient.id,
    present: buildPresent(state, patient, ctx),
    lines: [],
    visits: [],
  };
}
