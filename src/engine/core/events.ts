/** Engine 嘅輸入（Event）同輸出（Effect）介面，對應 implementation-plan §2.3。 */
import type { JsonValue } from './eventQueue';
import type { GameState } from './state';

export type CoreIntent =
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'SET_SPEED'; speed: number }
  | { type: 'PLACE_ORDER'; patientId: string; catalogId: string; durationSec: number }
  | {
      type: 'PLACE_CATALOG';
      patientId: string;
      catalogId: string;
      /** 聊天顯示嘅句子。engine 唔解析佢，亦唔交俾模型認 order。 */
      text: string;
      params: {
        drugFormularyId: string | null;
        dose: { value: number; unit: string } | null;
        route: string | null;
        frequency?: string;
        times?: number;
        rate?: { value: number; unit: string };
        treatmentDrugId?: string;
        /** 行動記錄與護士確認用的短標籤。引擎不解析這句。 */
        summary?: string;
      };
    }
  | { type: 'CANCEL_ORDER'; orderId: string }
  | { type: 'INSIST_ORDER'; orderId: string }
  | { type: 'SAVE_GAME'; slot: number }
  | { type: 'SUBMIT_CHAT'; patientId: string; text: string }
  | { type: 'ENTER_BED'; patientId: string }
  | { type: 'LEAVE_BED'; patientId: string }
  | { type: 'MEASURE_NIBP'; patientId: string };

/** 後續 milestone 嘅 module 於自己嘅 typed intent 加入 core union 之前，可經呢條通道收 intent */
export interface ExtensionIntent {
  type: 'EXTENSION';
  module: string;
  name: string;
  payload: JsonValue;
}

export type PlayerIntent = CoreIntent | ExtensionIntent;

export const AI_FAILURE_REASONS = ['TIMEOUT', 'AUTH', 'NETWORK', 'FORMAT', 'GUARD'] as const;
export type AiFailureReason = (typeof AI_FAILURE_REASONS)[number];

export type EngineEvent =
  | { type: 'TICK'; dtRealMs: number }
  | { type: 'PLAYER_INTENT'; intent: PlayerIntent }
  | { type: 'AI_RESULT'; reqId: string; payload: JsonValue }
  | { type: 'AI_FAILURE'; reqId: string; reason: AiFailureReason }
  | { type: 'RESUME_FROM_FAILURE'; reqId: string };

export type SaveTarget =
  { kind: 'AUTO' } | { kind: 'MANUAL'; slot: number } | { kind: 'AI_FAILURE' };

export type SaveReason = 'INTERVAL' | 'PAUSE' | 'MANUAL' | 'AI_FAILURE';

export type NoticeKind =
  | 'ORDER_BLOCKED_PAUSED'
  | 'ORDER_INVALID'
  | 'ORDER_UNKNOWN'
  | 'ORDER_NOT_CANCELLABLE'
  | 'INSIST_NOT_AVAILABLE'
  | 'SPEED_INVALID'
  | 'SAVE_SLOT_INVALID'
  | 'RESUME_BLOCKED_AI_FAILURE'
  | 'RESUME_NOT_PAUSED_BY_FAILURE'
  | 'CHAT_EMPTY'
  | 'CHAT_TOO_LONG'
  | 'PATIENT_UNKNOWN'
  | 'NOT_AT_BED'
  | 'PLAYER_MOVING'
  | 'CALL_UNKNOWN'
  | 'CALL_NOT_ACTIVE'
  | 'CALL_RINGING'
  | 'CALL_MISSED'
  | 'CALL_TARGET_INVALID'
  | 'SBAR_INVALID'
  | 'CONSULT_ARRIVED'
  | 'CONSULT_REFUSED'
  | 'DEATH_STEP_VIA_PHONE'
  | 'DELEGATE_NO_SUB'
  | 'DELEGATE_BUSY'
  | 'DELEGATE_INVALID'
  | 'DELEGATE_STARTED'
  | 'DELEGATE_DONE'
  | 'DELEGATE_FAILED'
  | 'SHIFT_NOT_ACTIVE'
  | 'OVERTIME_FROZEN'
  | 'ROUND_ACTIVE'
  | 'ROUND_NOT_OFFERED'
  | 'ROUND_OFFERED'
  | 'ROUND_STARTED'
  | 'ROUND_ENDED'
  | 'ROUND_ANSWER_INVALID'
  | 'SELF_CARE_BUSY'
  | 'SELF_CARE_UNAVAILABLE'
  | 'REST_NUDGE'
  | 'HANDOVER_NOT_AVAILABLE'
  | 'FAINTED'
  | 'OVERTIME_STARTED'
  | 'FORCED_HANDOVER';

export type Effect =
  | { type: 'AI_REQUEST'; reqId: string; kind: string; context: JsonValue }
  | { type: 'SAVE'; target: SaveTarget; reason: SaveReason }
  | { type: 'NOTICE'; kind: NoticeKind; tone: 'info' | 'warn' | 'error' }
  | { type: 'SET_SPEED'; speed: number };

export interface Reduction {
  state: GameState;
  effects: Effect[];
}
