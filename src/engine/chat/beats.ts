/**
 * 對白 beat 的型別（由 dialogue.ts 抽出）。
 * 抽出原因：shortReplies.ts 要用 Beat，而 dialogue.ts 要用 shortReplyTemplate；
 * 兩者互相 import 會形成循環依賴（dependency-cruiser no-circular）。
 * 這個檔只放型別與常數，不 import 任何 runtime，所以可以安全被兩邊引用。
 */
import type { ExecutorKind, MewsComponentKey } from '../case/tables';

// JSON 相容（有隱含 index signature）先可以放入 AI context，所以用 type 而唔係 interface
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type Abnormal = {
  key: MewsComponentKey;
  direction: 'LOW' | 'HIGH';
};

export type Beat =
  | { type: 'ACK_ORDER'; speaker: 'NURSE'; labelToken: string; executor: ExecutorKind | null }
  | { type: 'GATE_RECONFIRM'; speaker: 'NURSE' | 'PHARMACY'; labelToken: string }
  | { type: 'REPORT_LAB_READY'; speaker: 'NURSE'; labelToken: string; abnormal: boolean }
  | { type: 'ORDER_CANCELLED'; speaker: 'NURSE'; labelToken: string }
  | {
      type: 'REPORT_RESULT';
      speaker: 'NURSE';
      labelToken: string;
      tokens: string[];
      abnormal: Abnormal[];
      /** 目錄已經寫好嘅結果句。有呢句就本地講，唔再叫模型認 order。 */
      preset?: string;
    }
  | { type: 'REPORT_STATUS'; speaker: 'NURSE'; tokens: string[]; abnormal: Abnormal[] }
  | {
      type: 'ANSWER_QUESTION';
      speaker: 'NURSE';
      question: string;
      tokens: string[];
      abnormal: Abnormal[];
    }
  | { type: 'ALERT_DETERIORATION'; speaker: 'NURSE'; tokens: string[]; abnormal: Abnormal[] }
  | { type: 'PATIENT_SPEAKS'; speaker: 'PATIENT'; symptoms: string[]; question?: string }
  | { type: 'ACK_CHAT'; speaker: 'NURSE' }
  | { type: 'ASK_REPHRASE'; speaker: 'NURSE'; reason: 'UNKNOWN_ORDER' | 'UNSUPPORTED' }
  | { type: 'ARREST_ANNOUNCED'; speaker: 'NURSE'; tokens: string[]; rearrest: boolean }
  | { type: 'ACLS_CYCLE_DUE'; speaker: 'NURSE'; tokens: string[] }
  | {
      type: 'ACLS_ACTION_DONE';
      speaker: 'NURSE';
      action: AclsActionDone;
      labelToken: string | null;
    }
  | { type: 'ACLS_RHYTHM_REPORTED'; speaker: 'NURSE'; tokens: string[]; shockable: boolean }
  | { type: 'ACLS_ROSC'; speaker: 'NURSE' }
  | { type: 'ACLS_STOP_REFUSED'; speaker: 'NURSE'; tokens: string[] }
  | { type: 'ACLS_NOT_APPLICABLE'; speaker: 'NURSE'; labelToken: string }
  | { type: 'ACLS_SHOCK_REFUSED'; speaker: 'NURSE'; labelToken: string; tokens: string[] }
  | { type: 'DEATH_PRONOUNCED'; speaker: 'NURSE'; tokens: string[] };

export const ACLS_ACTIONS_DONE = [
  'CPR_STARTED',
  'CPR_RESUMED',
  'CPR_ALREADY_RUNNING',
  'SHOCK_DELIVERED',
  'DRUG_GIVEN',
] as const;
export type AclsActionDone = (typeof ACLS_ACTIONS_DONE)[number];
