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

export type RankCode = 'HO' | 'MO' | 'RES' | 'AC' | 'COS';
export type CallTagCode = 'NURSE' | 'JUNIOR' | 'LAB' | 'XRAY' | 'PHARMACY' | 'DEPT' | 'OUTGOING';
export type PriorityCode = 'ROUTINE' | 'URGENT' | 'EMERGENCY';
export type CallResponseCode = 'GO_NOW' | 'LATER' | 'CONTINUE';
export type DelegationTaskCode =
  'PROCEDURE' | 'ORDER_NOTE' | 'ADMISSION' | 'SIMPLE_CALL' | 'ROUND_PREP';

export interface BedView {
  bed: number;
  zone: string;
  row: number;
  col: number;
  patientId: string | null;
  name: string | null;
  age: number | null;
  sex: 'M' | 'F' | null;
  mewsScore: number | null;
  mewsBandId: string | null;
  level: AlarmLevel;
  /** 新入院、尚未接收 */
  newAdmission: boolean;
  /** 護士名（區內負責護士） */
  nurseName: string | null;
  here: boolean;
}

export interface CallLineView {
  speaker: 'CALLER' | 'CALLEE' | 'PLAYER';
  name: string;
  /** 已用凍結 token 解析嘅文字；系統碼（@XXX）行為 null，由 UI 按 code 顯示 */
  text: string | null;
  code: string | null;
  timeLabel: string;
}

export interface CallRowView {
  id: string;
  direction: 'IN' | 'OUT';
  tag: CallTagCode;
  priority: PriorityCode;
  callerName: string;
  callerRank: RankCode | null;
  patientId: string | null;
  bed: number | null;
  patientName: string | null;
  deptId: string | null;
  deptLabel: string | null;
  text: string;
  status: 'RINGING' | 'DEFERRED' | 'DONE' | 'MISSED' | 'DELEGATED';
  resolution: string | null;
  outcome: string | null;
  timeLabel: string;
  /** 剩餘秒數（未接／延後來電） */
  remainingSec: number | null;
  defers: number;
  canRespond: boolean;
  canDelegate: boolean;
  sbar: { S: string; B: string; A: string; R: string } | null;
  lines: CallLineView[];
}

export interface LadderStepView {
  rank: RankCode;
  /** 玩家可以致電（職級高過自己） */
  reachable: boolean;
  /** 如果而家直接致電呢一級，會越過邊啲未聯絡嘅職級 */
  skips: RankCode[];
  contacted: boolean;
}

export interface SbarDraftView {
  patientId: string;
  bed: number;
  patientName: string;
  target: { kind: 'RANK'; rank: RankCode } | { kind: 'DEPT'; deptId: string; label: string };
  sbar: { S: string; B: string; A: string; R: string };
  maxChars: number;
  skips: RankCode[];
}

export interface DelegationItemView {
  id: string;
  label: string;
  needsPatient: boolean;
  needsTag: string | null;
}

export interface DelegationGroupView {
  task: DelegationTaskCode;
  items: DelegationItemView[];
}

export interface DelegationTaskView {
  id: string;
  task: DelegationTaskCode;
  label: string;
  bed: number | null;
  /** 只顯示實際結果：RUNNING 時冇預計完成時間（B7） */
  status: 'RUNNING' | 'DONE' | 'FAILED';
  startLabel: string;
  doneLabel: string | null;
  elapsedSec: number | null;
  failureCode: string | null;
}

export interface DelegationView {
  /** HO 冇下屬（S-1 A） */
  hasSubordinate: boolean;
  subordinate: { name: string; rank: RankCode; busy: boolean } | null;
  groups: DelegationGroupView[];
  tasks: DelegationTaskView[];
}

export interface PhoneView {
  ringing: number;
  calls: CallRowView[];
  /** 每位病人一條職級階梯（越級預覽按該病人已聯絡嘅職級計） */
  ladders: Record<string, LadderStepView[]>;
  depts: { id: string; label: string }[];
  draft: SbarDraftView | null;
}

export interface WardView {
  beds: BedView[];
  /** 你而家喺邊張床；null＝護士站／行緊 */
  locationBed: number | null;
  movingToBed: number | null;
  arriveInSec: number | null;
  playerRank: RankCode;
  phone: PhoneView;
  delegation: DelegationView;
  occupied: number;
  total: number;
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
  /** 多病人病房（M4）；舊式單一病人時為 null */
  ward: WardView | null;
}

/** UI 通過呢個介面嘅動作同 engine 溝通（UI 唔直接 import engine） */
export interface GameActions {
  submitChat: (patientId: string, text: string) => void;
  togglePause: () => void;
  setSpeed: (speed: number) => void;
  cancelOrder: (orderId: string) => void;
  insistOrder: (orderId: string) => void;
  retryAi: () => void;
  goToBed: (bed: number | null) => void;
  respondCall: (callId: string, response: CallResponseCode) => void;
  prepareCall: (
    patientId: string,
    target: { kind: 'RANK'; rank: RankCode } | { kind: 'DEPT'; deptId: string },
  ) => void;
  sendCall: (sbar: { S: string; B: string; A: string; R: string }) => void;
  discardCall: () => void;
  delegate: (request: {
    task: DelegationTaskCode;
    itemId: string;
    patientId: string | null;
    callId: string | null;
  }) => void;
}
