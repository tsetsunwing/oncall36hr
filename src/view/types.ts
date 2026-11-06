import type { WaveSpec } from './waveform';

export type VitalName = 'hr' | 'bp' | 'spo2' | 'rr' | 'temp' | 'map';
export type AlarmLevel = 'NORMAL' | 'CAUTION' | 'ALARM';
export type Direction = 'LOW' | 'HIGH' | null;

export interface VitalReadout {
  /** 顯示字串（已格式化）；數值來自 engine 狀態，永不來自 AI 文字 */
  text: string;
  level: AlarmLevel;
  direction: Direction;
}

export interface MonitorView {
  hr: VitalReadout;
  bp: VitalReadout & { sbp: number; dbp: number };
  map: VitalReadout;
  spo2: VitalReadout;
  rr: VitalReadout;
  temp: VitalReadout;
  rhythmId: string;
  rhythmLabel: string;
  hrValue: number;
  pulseAmplitude: number;
  wave: WaveSpec | null;
  mews: {
    score: number;
    bandId: string;
    level: AlarmLevel;
    components: { key: string; score: number }[];
    reviewPending: boolean;
  };
  consciousness: 'A' | 'V' | 'P' | 'U';
  sweepSeconds: number;
  targetFps: number;
  asOfLabel: string;
}

export interface PatientView {
  id: string;
  bed: number;
  name: string;
  age: number;
  sex: 'M' | 'F';
  code: 'FULL' | 'DNR';
  complaint: string;
  allergies: string[];
}

export type ChatLineKind = 'PLAYER' | 'NURSE' | 'PATIENT' | 'SYSTEM' | 'PHARMACY';

export interface ChatLineView {
  id: string;
  kind: ChatLineKind;
  speakerId: string;
  speakerName: string;
  /** NURSE／PATIENT：{{token}} 已用 engine 凍結值解析；PLAYER：玩家原文；SYSTEM：null（由 UI 按 code 顯示） */
  text: string | null;
  systemCode: string | null;
  timeLabel: string;
  orderId: string | null;
  /** PHONE＝電話（藥房）；UI 會標明來源 */
  source: 'BEDSIDE' | 'PHONE';
}

export interface PresentView {
  id: string;
  kind: 'NURSE' | 'PATIENT';
  name: string;
  mentionName: string;
  typing: boolean;
}

export interface ChatView {
  patientId: string;
  lines: ChatLineView[];
  present: PresentView[];
  /** 上次離開之後嘅第一行 index；冇離開紀錄＝null */
  lastLeftDividerIndex: number | null;
  unreadSinceLeave: number;
  playerTextMaxChars: number;
}

export type OrderStatusCode =
  'PENDING_PARSE' | 'GATED' | 'QUEUED' | 'RUNNING' | 'DONE' | 'CANCELLED' | 'FAILED';

export interface OrderRowView {
  id: string;
  patientId: string;
  label: string;
  status: OrderStatusCode;
  executorName: string | null;
  executorKind: 'NURSE' | 'SUBORDINATE' | 'PLAYER' | null;
  timeLabel: string;
  etaSeconds: number | null;
  cancellable: boolean;
  /** 化驗／檢查：PENDING＝等報告；REPORTED＝報告已出；其他 order＝null */
  resultStatus: 'PENDING' | 'REPORTED' | null;
}

export type GateRoleView = 'PHARMACY' | 'NURSE';
export type GatePhaseView = 'REVIEW' | 'DECISION' | 'RECONFIRM' | 'RATING';

export interface GateConcernView {
  by: GateRoleView;
  byName: string;
  category: string;
  text: string;
}

/** 等把關嘅 order：審視中，或者等玩家取消／堅持 */
export interface GateCardView {
  orderId: string;
  label: string;
  phase: GatePhaseView;
  concerns: GateConcernView[];
  insistCount: number;
  required: number;
  canInsist: boolean;
}

export interface ReportItemView {
  label: string;
  valueText: string;
  refText: string;
  flag: 'H' | 'L' | null;
}

export interface ReportView {
  id: string;
  orderId: string;
  label: string;
  timeLabel: string;
  kind: 'PANEL' | 'REPORT';
  abnormal: boolean;
  items: ReportItemView[];
  text: string | null;
  /** 數值係佔位，未經臨床審閱（PENDING_CLINICAL_REVIEW） */
  reviewPending: boolean;
}

export interface ActionRowView {
  id: string;
  timeLabel: string;
  patientId: string | null;
  bed: number | null;
  kind: 'ORDER' | 'EVENT';
  /** ORDER：order 標籤（content）；EVENT：null，由 UI 按 eventCode 顯示 */
  label: string | null;
  eventCode: string | null;
  status: OrderStatusCode | null;
  executorName: string | null;
  reasonCode: string | null;
  resultText: string | null;
  nurseNote: string | null;
}

export interface QuickChipView {
  id: string;
  label: string;
  text: string;
}

export interface GameView {
  clock: {
    label: string;
    seconds: number;
    speed: number;
    speeds: number[];
    paused: boolean;
    pausedBy: 'player' | 'ai-failure' | 'forced' | null;
  };
  patient: PatientView | null;
  monitor: MonitorView | null;
  chat: ChatView | null;
  orders: OrderRowView[];
  gates: GateCardView[];
  reports: ReportView[];
  actionLog: { all: ActionRowView[]; patient: ActionRowView[] };
  quickChips: QuickChipView[];
  pendingAiCount: number;
  aiFailure: { reqId: string; reason: string | null } | null;
  /** 最近一次被 engine 拒絕嘅玩家動作（暫停中落 order 等）；下一個動作時清除 */
  notice: { kind: string; tone: 'info' | 'warn' | 'error' } | null;
}

/** UI 通過呢個介面嘅動作同 engine 溝通（UI 唔直接 import engine） */
export interface GameActions {
  submitChat: (patientId: string, text: string) => void;
  togglePause: () => void;
  setSpeed: (speed: number) => void;
  cancelOrder: (orderId: string) => void;
  insistOrder: (orderId: string) => void;
  retryAi: () => void;
}
