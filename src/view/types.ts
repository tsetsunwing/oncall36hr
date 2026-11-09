import type { VitalBand } from './vitalBands';
import type { WaveSpec } from './waveform';

export type VitalName = 'hr' | 'bp' | 'spo2' | 'rr' | 'temp';

/** 監察儀騰出嘅一格：只有指定導管在位才顯示。規格冇 A-line／CVP 數值，所以唔帶數字。 */
export interface LineSlotView {
  kind: 'ALINE' | 'CVP' | null;
  /** 有導管但冇經審核嘅讀數時為 true（PENDING_CLINICAL_REVIEW） */
  reviewPending: boolean;
}

export type { VitalBand };
export type AlarmLevel = 'NORMAL' | 'CAUTION' | 'ALARM';
export type Direction = 'LOW' | 'HIGH' | null;

export interface VitalReadout {
  /** 顯示字串（已格式化）；數值來自 engine 狀態，永不來自 AI 文字 */
  text: string;
  level: AlarmLevel;
  direction: Direction;
  band: VitalBand;
}

export interface MonitorView {
  hr: VitalReadout;
  /** 一格：SBP/DBP (MAP)。MAP 由狀態機嘅 SBP、DBP 計算。 */
  bp: VitalReadout & { sbp: number; dbp: number };
  /** A-line 或 CVP。冇對應導管時 kind 為 null，畫面留空。 */
  lineSlot: LineSlotView;
  /** 額外波形：冇對應導管或插管時不可顯示。 */
  lines: { abp: boolean; cvp: boolean; etco2: boolean };
  spo2: VitalReadout;
  rr: VitalReadout;
  temp: VitalReadout;
  rhythmId: string;
  rhythmLabel: string;
  /** 節律本身嘅靜態警示等級（顏色＋文字，唔閃爍）；NORMAL＝冇節律警示 */
  rhythmAlarm: AlarmLevel;
  /** 無脈搏（心臟停頓）：HR／血壓／SpO₂／RR 顯示「—」 */
  pulseless: boolean;
  /** 波形用嘅速率：有脈搏＝HR；無脈搏＝rhythm 表嘅示意電活動速率 */
  waveRate: number;
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
  /** 即時完成嘅 order（例如量生命體徵）嘅結果文字；等報告嘅 order 用 reports */
  resultText: string | null;
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
  /** 報告分類：化驗、影像或即場，再用 section 分部門 */
  bucket: 'laboratory' | 'radiology' | 'poct';
  section: string;
}

export interface ActionRowView {
  id: string;
  timeLabel: string;
  patientId: string | null;
  bed: number | null;
  kind: 'ORDER' | 'EVENT';
  /** ORDER：預設名稱；EVENT：委派等可對上的名稱，否則 null */
  label: string | null;
  /** 觀察、治療、檢查、搶救。對得上預設醫囑時先有。 */
  group: 'observe' | 'treat' | 'tests' | 'resus' | null;
  eventCode: string | null;
  status: OrderStatusCode | null;
  executorName: string | null;
  reasonCode: string | null;
  resultText: string | null;
  nurseNote: string | null;
}

export type QuickChipCategory = 'observe' | 'treat' | 'tests' | 'procedure' | 'resus';

export type QuickPromptFieldId =
  'dose' | 'route' | 'frequency' | 'times' | 'volume' | 'rate' | 'energy' | 'flow' | 'transfusion';

export interface QuickChipAmountField {
  id: 'dose' | 'volume' | 'rate' | 'energy' | 'flow' | 'transfusion';
  kind: 'amount';
  units: readonly string[];
  value: number | null;
  unit: string;
  required: boolean;
  min?: number;
  max?: number;
}

export interface QuickChipSelectField {
  id: 'route' | 'times';
  kind: 'select';
  options: readonly string[];
  value: string | null;
  required: boolean;
}

export interface QuickChipFrequencyField {
  id: 'frequency';
  kind: 'frequency';
  value: 'stat' | 'TDS' | 'prn' | 'Q_H' | 'Q_min' | null;
  every: number | null;
  required: boolean;
}

export type QuickChipPromptField =
  QuickChipAmountField | QuickChipSelectField | QuickChipFrequencyField;

export interface QuickChipPrompt {
  stem: string;
  fields: readonly QuickChipPromptField[];
}

export interface MedicationOption {
  id: string;
  label: string;
  stem: string;
  catalogId: string;
  /** 遊戲藥典別名，只用於搜尋，唔顯示。 */
  aliases?: readonly string[];
}

/** 菜單或藥物表直接落單嘅欄位。自由文字唔用呢個。 */
export interface PlacedOrderParams {
  drugFormularyId: string | null;
  dose: { value: number; unit: string } | null;
  route: string | null;
  frequency?: string;
  times?: number;
  rate?: { value: number; unit: string };
}

export interface QuickChipView {
  id: string;
  label: string;
  text: string;
  category: QuickChipCategory;
  catalogId?: string;
  /** 檢查對應報告面板的組別與部門。 */
  report?: { bucket: 'laboratory' | 'radiology' | 'poct'; section: string };
  /** 藥物：按鈕只開醫囑表，藥名預填，其餘留空。 */
  medicationId?: string;
  /** 有值時先彈小窗，唔直接落單。氧氣、點滴、能量沿用。 */
  prompt?: QuickChipPrompt;
}

export type RankCode = 'HO' | 'MO' | 'RES' | 'AC' | 'COS';
export type CallTagCode =
  'NURSE' | 'JUNIOR' | 'LAB' | 'XRAY' | 'PHARMACY' | 'DEPT' | 'OUTGOING' | 'FAMILY';
export type CallPurposeCode = 'GENERAL' | 'DEATH_SENIOR' | 'DEATH_FAMILY' | 'ARREST';
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
  /** 主訴，床格上年齡性別下面的一行 */
  complaint: string | null;
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

export interface FamilyCallView {
  stage: 'OPENING' | 'FOLLOWUP';
  informed: boolean;
  /** 預設講法（T27）；engine 預先知道訊號，所以唔使 AI */
  options: { id: string; label: string }[];
  canSay: boolean;
  maxChars: number;
  turnsLeft: number;
}

/** 雙向對話（會診／上報／家屬）狀態；清晰度係 engine 按 SBAR 清單計出嚟 */
export interface CallExchangeView {
  phase: 'ASSESSING' | 'AWAITING_REPLY' | 'OPEN' | 'CLOSED';
  /** 正等緊對方回覆（AI 措辭中） */
  waiting: boolean;
  /** SBAR 清晰度 0–3（家屬電話為 null） */
  clarity: number | null;
  /** 對方仍然想知道嘅項目（SBAR 清單 id） */
  asks: string[];
  canFollowUp: boolean;
  followupsLeft: number;
  followupMaxChars: number;
  canHangUp: boolean;
  family: FamilyCallView | null;
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
  purpose: CallPurposeCode;
  exchange: CallExchangeView | null;
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
  purpose: CallPurposeCode;
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
  /** 仍然進行緊嘅外撥對話（自動聚焦） */
  focusCallId: string | null;
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

export type CprState = 'NOT_STARTED' | 'ACTIVE' | 'PAUSED';

export interface ResusCauseView {
  id: string;
  label: string;
  group: 'H' | 'T';
  /** 已完成檢查 order；唔透露個病人實際有冇呢個病因 */
  checked: boolean;
  treated: boolean;
}

export interface ResusView {
  patientId: string;
  status: 'ARREST' | 'ROSC' | 'RECOVERED' | 'STOPPED';
  episode: number;
  rhythmLabel: string;
  /** 由 monitor 上可見嘅節律推出（唔係隱藏資料） */
  shockable: boolean;
  cpr: CprState;
  elapsedSec: number;
  cycleSeconds: number;
  /** 呢輪 CPR 已經做咗幾耐；唔喺 CPR 中＝null */
  cycleElapsedSec: number | null;
  cycles: number;
  minCyclesBeforeStop: number;
  canStop: boolean;
  shocks: number;
  /** 冇血流／手停累計秒數（含進行中） */
  handsOffSec: number;
  drugs: { label: string; timeLabel: string }[];
  causes: ResusCauseView[];
  postRosc: {
    windowRemainingSec: number;
    bundle: { id: string; label: string; done: boolean }[];
  } | null;
}

export type DeathStepCode = 'CERTIFICATE' | 'NOTIFY_SENIOR' | 'PHONE_FAMILY' | 'RECORD';

export interface DeathStepView {
  step: DeathStepCode;
  done: boolean;
  completedLabel: string | null;
  /** 預填欄位（T23）；內容見 DeathView.prefill */
  fields: string[];
  /** 病房模式：呢一步要透過電話完成 */
  viaPhone: boolean;
}

export interface DeathView {
  patientId: string;
  status: 'PENDING_PROCESS' | 'COMPLETE';
  diedAtLabel: string;
  prefill: {
    name: string;
    bed: number;
    age: number;
    sex: 'M' | 'F';
    cause: string;
    seniorRank: string;
    resusSummary: { cycles: number; shocks: number; drugs: number };
  };
  steps: DeathStepView[];
  /** 已被扣過幾次「拖延」分 */
  delayCharges: number;
  /** 四步完成之前床位唔釋放 */
  bedReleased: boolean;
}

export type ModeCode = 'DAY' | 'NIGHT' | 'ONCALL';
export type PhaseCode = 'REGULAR' | 'OVERTIME' | 'HANDOVER' | 'ENDED';
export type EnergyLevelCode = 'NORMAL' | 'LOW' | 'VERY_LOW';
export type RoundPhaseCode = 'LOADING' | 'ASKING' | 'GRADING' | 'REVEAL';
export type RoundVerdictCode = 'CORRECT' | 'PARTIAL' | 'WRONG' | 'UNANSWERED';
export type RoundCategoryCode = 'HISTORY' | 'PATHOLOGY' | 'PHARMACOLOGY';
export type SelfCareCode = 'MEAL' | 'NAP' | 'TOILET' | 'WATER' | 'PHONE_CHAT' | 'MUSIC';
export type SubscoreCode =
  'CLINICAL_OUTCOME' | 'TIMELINESS' | 'SAFETY' | 'COMMUNICATION' | 'PRIORITISATION' | 'SELF_CARE';

export interface RoundView {
  /** 第幾次巡房（由 1 起） */
  number: number;
  /** 今個模式一共有幾次巡房 */
  totalRounds: number;
  position: number;
  patientCount: number;
  patient: { bed: number; name: string; age: number; sex: 'M' | 'F'; complaint: string };
  category: RoundCategoryCode;
  phase: RoundPhaseCode;
  question: string | null;
  hints: string[];
  answer: string | null;
  viaHint: boolean;
  verdict: RoundVerdictCode | null;
  seniorLine: string | null;
  /** 揭曉階段先有：key facts 原文（T25）同玩家有冇答中 */
  keyFacts: { id: string; text: string; matched: boolean }[] | null;
  secondsLeft: number | null;
  canAnswer: boolean;
  maxChars: number;
  canNext: boolean;
  isLast: boolean;
}

export interface SelfCareActionView {
  id: SelfCareCode;
  durationSec: number;
  gainPercent: number;
  available: boolean;
  /** 冷卻中剩餘秒數；唔需冷卻＝0 */
  cooldownSec: number;
  needsMealWindow: boolean;
}

export interface HandoverCandidateView {
  patientId: string;
  bed: number;
  name: string;
  level: AlarmLevel;
  selected: boolean;
}

export type GradeCode = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'NEEDS_IMPROVEMENT';

export interface SubscoreResultView {
  id: SubscoreCode;
  /** 評級由 T22b 門檻決定；冇總分、冇加權（spec §17） */
  grade: GradeCode;
  /** 該分項有幾多條記錄（0＝本局沒有相關事件） */
  entries: number;
  /** 死亡令「臨床結果」降級 */
  cappedByDeath: boolean;
  items: { rule: string; count: number; delta: number }[];
}

export interface ResultPatientView {
  bed: number;
  name: string;
  outcome: 'DECEASED' | 'ALARM' | 'CAUTION' | 'STABLE';
  mentioned: boolean;
  /** 不可挽回嘅病人死亡：結局照降級，但提示「已盡力」（Q94 D） */
  doneBest: boolean;
}

export type TimelineKindCode = 'ORDER' | 'EVENT' | 'CALL' | 'SCORE';

export interface ReviewPatientLabel {
  bed: number | null;
  name: string | null;
}

export interface ReviewEntryView extends ReviewPatientLabel {
  id: string;
  timeLabel: string;
  rule: string;
  delta: number;
  evidence: string | null;
}

export interface ReviewTimelineView extends ReviewPatientLabel {
  key: string;
  timeLabel: string;
  kind: TimelineKindCode;
  code: string;
  label: string | null;
  detail: string | null;
  delta: number | null;
  subscore: SubscoreCode | null;
}

export interface ReviewWhatIfView extends ReviewPatientLabel {
  id: string;
  label: string | null;
  timeLabel: string;
  rule: string;
  facts: Record<string, number | string>;
}

export interface ReviewGuidelineView extends ReviewPatientLabel {
  id: string;
  label: string;
  status: 'ON_TIME' | 'LATE' | 'MISSED';
  windowMin: number;
  delayMin: number;
  title: string;
  text: string;
  source: string;
  pendingReview: boolean;
}

export interface ReviewSafetyView extends ReviewPatientLabel {
  orderId: string;
  timeLabel: string;
  orderLabel: string;
  outcome: 'RELEASED' | 'CANCELLED' | 'OPEN';
  concerns: { by: 'PHARMACY' | 'NURSE'; category: string; verdict: string }[];
  insistCount: number;
  aiScore: number | null;
  aiReason: string | null;
  danger: {
    level: 'LOW' | 'MID' | 'HIGH';
    category: string;
    reason: string | null;
    hit: boolean | null;
  } | null;
  rules: string[];
}

export interface ReviewView {
  table: { id: SubscoreCode; grade: GradeCode; rows: ReviewEntryView[] }[];
  timeline: ReviewTimelineView[];
  whatIf: ReviewWhatIfView[];
  guidelines: ReviewGuidelineView[];
  safety: ReviewSafetyView[];
  deaths: (ReviewPatientLabel & {
    timeLabel: string;
    doneBest: boolean;
    processComplete: boolean;
  })[];
}

export interface ResultView {
  reason: 'NORMAL' | 'OVERTIME' | 'FAINT';
  tags: ('OVERTIME' | 'FAINT')[];
  forced: boolean;
  atLabel: string;
  overtimeSec: number;
  subscores: SubscoreResultView[];
  patients: ResultPatientView[];
  rounds: { total: number; answered: number; correct: number };
  /** 有不可挽回嘅死亡：回顧提示「已盡力」 */
  doneBest: boolean;
  review: ReviewView;
}

export interface ShiftView {
  shiftMode: ModeCode;
  playerRank: 'HO' | 'MO' | 'RES';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  phase: PhaseCode;
  segment: 'DAY' | 'NIGHT' | null;
  /** 等 AI 回應期間遊戲時間自動暫停（C1） */
  waitingForAi: boolean;
  energy: { percent: number; level: EnergyLevelCode };
  /** 愈高愈差。進入對應房間會降低。 */
  needs: {
    fatigue: { percent: number; level: EnergyLevelCode };
    hunger: { percent: number; level: EnergyLevelCode };
    bladder: { percent: number; level: EnergyLevelCode };
  };
  place: 'STATION' | 'PANTRY' | 'REST' | 'WC' | null;
  rounds: {
    total: number;
    completed: number;
    nextAtLabel: string | null;
    /** 到咗巡房時間，等玩家自己打開 */
    offered: boolean;
    active: RoundView | null;
  };
  selfCare: {
    active: { id: SelfCareCode; endsLabel: string; remainingSec: number } | null;
    actions: SelfCareActionView[];
    mealWindowOpen: boolean;
  };
  overtime: { remainingSec: number; deadlineLabel: string; canHandover: boolean } | null;
  handover: { candidates: HandoverCandidateView[] } | null;
  result: ResultView | null;
}

export interface GameView {
  clock: {
    label: string;
    seconds: number;
    speed: number;
    speeds: number[];
    paused: boolean;
    pausedBy: 'player' | 'ai-failure' | 'forced' | null;
    /** CPR 期間：有效速率固定為 1 倍嘅 cprSlowFactor，玩家倍速被忽略 */
    cprSlow: boolean;
    effectiveSpeed: number;
  };
  patient: PatientView | null;
  monitor: MonitorView | null;
  chat: ChatView | null;
  orders: OrderRowView[];
  gates: GateCardView[];
  reports: ReportView[];
  actionLog: { all: ActionRowView[]; patient: ActionRowView[] };
  quickChips: QuickChipView[];
  /** 醫囑表藥物搜尋。只含 formulary 藥物名，冇劑量。 */
  medications: MedicationOption[];
  resus: ResusView | null;
  death: DeathView | null;
  pendingAiCount: number;
  aiFailure: { reqId: string; reason: string | null; detail: string | null } | null;
  /** 最近一次被 engine 拒絕嘅玩家動作（暫停中落 order 等）；下一個動作時清除 */
  notice: { kind: string; tone: 'info' | 'warn' | 'error' } | null;
  /** 多病人病房（M4）；舊式單一病人時為 null */
  ward: WardView | null;
  shift: ShiftView;
}

/** UI 通過呢個介面嘅動作同 engine 溝通（UI 唔直接 import engine） */
export interface GameActions {
  submitChat: (patientId: string, text: string) => void;
  /** 觀察、治療、檢查、搶救同藥物表：按 catalog id 落單，唔經 order.parse。 */
  placeOrder: (
    patientId: string,
    catalogId: string,
    text: string,
    params: PlacedOrderParams,
  ) => void;
  togglePause: () => void;
  setSpeed: (speed: number) => void;
  cancelOrder: (orderId: string) => void;
  insistOrder: (orderId: string) => void;
  retryAi: () => void;
  goToBed: (bed: number | null) => void;
  enterPlace: (place: 'STATION' | 'PANTRY' | 'REST' | 'WC') => void;
  respondCall: (callId: string, response: CallResponseCode) => void;
  prepareCall: (
    patientId: string,
    target: { kind: 'RANK'; rank: RankCode } | { kind: 'DEPT'; deptId: string },
  ) => void;
  sendCall: (sbar: { S: string; B: string; A: string; R: string }) => void;
  discardCall: () => void;
  sendFollowup: (callId: string, text: string) => void;
  endCall: (callId: string) => void;
  familyOption: (callId: string, optionId: string) => void;
  familySay: (callId: string, text: string) => void;
  startDeathCall: (step: DeathStepCode) => void;
  delegate: (request: {
    task: DelegationTaskCode;
    itemId: string;
    patientId: string | null;
    callId: string | null;
  }) => void;
  completeDeathStep: (step: DeathStepCode) => void;
  answerRound: (text: string, viaHint: boolean) => void;
  beginRound: () => void;
  passRound: () => void;
  nextRound: () => void;
  startSelfCare: (actionId: SelfCareCode) => void;
  stopSelfCare: () => void;
  beginHandover: () => void;
  toggleHandover: (patientId: string) => void;
  confirmHandover: () => void;
  /** 寫入手動槽位（1 起）。無效槽位由 engine 拒絕。 */
  saveManual: (slot: number) => void;
  /** 用而家嘅血壓更新上次 NIBP 袖帶。 */
  measureNibp: (patientId: string) => void;
}
