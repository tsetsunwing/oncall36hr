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

export type ChatLineKind = 'PLAYER' | 'NURSE' | 'PATIENT' | 'SYSTEM';

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
  timeLabel: string;
  etaSeconds: number | null;
  cancellable: boolean;
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
  actionLog: { all: ActionRowView[]; patient: ActionRowView[] };
  quickChips: QuickChipView[];
  pendingAiCount: number;
  aiFailure: { reqId: string; reason: string | null } | null;
}

/** UI 通過呢個介面嘅動作同 engine 溝通（UI 唔直接 import engine） */
export interface GameActions {
  submitChat: (patientId: string, text: string) => void;
  togglePause: () => void;
  setSpeed: (speed: number) => void;
  cancelOrder: (orderId: string) => void;
  retryAi: () => void;
}
