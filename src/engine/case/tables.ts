/**
 * Engine 讀嘅內容表形狀。內容層（src/content）嘅 zod 推導型別結構上可直接賦值畀呢個型別，
 * 所以 engine 唔使 import content（同 EngineConfig 一樣；app 層以 TypeScript 檢查兩邊一致）。
 */
export const VITAL_KEYS = ['hr', 'sbp', 'dbp', 'spo2', 'rr', 'temp'] as const;
export type VitalKey = (typeof VITAL_KEYS)[number];

export type VitalNumbers = Record<VitalKey, number>;
export type VitalDelta = Partial<Record<VitalKey, number | undefined>>;
export type Consciousness = 'A' | 'V' | 'P' | 'U';

export interface TrajectoryRow {
  id: string;
  target: VitalNumbers;
  slopePerMin: VitalNumbers;
  noise: VitalNumbers;
  rhythm: string;
  consciousness: Consciousness;
}

export interface FsmTransitionWhen {
  timeInStateSec?: number | undefined;
  timeAtLeastSec?: number | undefined;
  flagsAll?: readonly string[] | undefined;
  flagsNone?: readonly string[] | undefined;
  missingAny?: readonly string[] | undefined;
}

export interface CaseFsmRow {
  id: string;
  initial: string;
  states: Readonly<Record<string, { trajectory: string; arrest?: { rhythm: string } | undefined }>>;
  /** M5：ROSC 後 FSM 跳去嘅狀態（有 arrest 狀態嘅 FSM 必須提供） */
  postRoscState?: string | undefined;
  transitions: readonly { from: string; to: string; when: FsmTransitionWhen; p: number }[];
  salvageable: boolean;
}

export interface CaseTemplateRow {
  id: string;
  fsmId: string;
  bed: number;
  complexity: 'SIMPLE' | 'COMPLEX' | 'SCENARIO';
  demographics: { name: string; age: number; sex: 'M' | 'F'; code: 'FULL' | 'DNR' };
  presentingComplaint: string;
  allergies: readonly string[];
  diagnosisIds: readonly string[];
  diagnosisTerms: readonly string[];
  symptomsByState: Readonly<Record<string, readonly string[]>>;
  reversibleCauseIds: readonly string[];
  deathCause: string;
}

export type OrderType =
  | 'OBSERVATION'
  | 'MONITORING'
  | 'OXYGEN'
  | 'FLUID'
  | 'DRUG'
  | 'LAB_BLOOD'
  | 'ECG'
  | 'XRAY'
  | 'CT'
  | 'ULTRASOUND'
  | 'ABG'
  | 'BLOOD_CULTURE'
  | 'CROSSMATCH'
  | 'PROCEDURE'
  | 'RESUSCITATION';

export type ExecutorKind = 'NURSE' | 'SUBORDINATE' | 'PLAYER';
export type ReviewStatus = 'PENDING_CLINICAL_REVIEW' | 'REVIEWED';

export interface OrderCatalogRow {
  id: string;
  type: OrderType;
  label: string;
  aliases: readonly string[];
  executors: readonly ExecutorKind[];
  fixedDurationSec: number;
  setsFlags: readonly string[];
  formularyId?: string | undefined;
  resultId?: string | undefined;
  resultTemplate?: string | undefined;
  cancelWhile: readonly ('QUEUED' | 'RUNNING')[];
  sunkEffectRule: 'DISCARD' | 'KEEP_PARTIAL';
  pharmacyGate: boolean;
  nurseGate: 'ALWAYS' | 'HIGH_RISK' | 'NEVER';
  acls?: { action: AclsAction } | undefined;
  reviewStatus: ReviewStatus;
}

export type AclsAction = 'CPR_START' | 'RHYTHM_CHECK' | 'DEFIB' | 'DRUG' | 'TERMINATE';

export interface FormularyRow {
  id: string;
  label: string;
  aliases: readonly string[];
  catalogId: string;
  units: readonly string[];
  routes: readonly string[];
  drugClass: string;
  allergyClasses: readonly string[];
  typicalDose: { min: number; max: number; unit: string } | null;
  reviewStatus: ReviewStatus;
}

export interface OrderEffectRow {
  id: string;
  catalogId: string;
  states: readonly string[];
  delta: VitalDelta;
  delaySec: number;
  rampSec: number;
  durationSec: number | null;
  reviewStatus: ReviewStatus;
}

export interface RhythmRow {
  id: string;
  label: string;
  family: string;
  hrRange: readonly [number, number];
  shockable: boolean;
  pulse: boolean;
  alarm: MewsAlert;
  electricalRate: number;
  wave: unknown;
}

export interface MewsRange {
  min: number | null;
  max: number | null;
  score: number;
  direction: 'LOW' | 'HIGH' | null;
}

export type MewsComponentKey = 'rr' | 'hr' | 'sbp' | 'temp' | 'spo2';
export const MEWS_COMPONENT_KEYS: readonly MewsComponentKey[] = ['rr', 'hr', 'sbp', 'temp', 'spo2'];
export type MewsAlert = 'NONE' | 'CAUTION' | 'ALARM';

export interface MewsRow {
  id: string;
  reviewStatus: 'PENDING_CLINICAL_REVIEW' | 'REVIEWED';
  components: Readonly<Record<MewsComponentKey, readonly MewsRange[]>>;
  avpu: Readonly<Record<Consciousness, number>>;
  componentAlert: { cautionMin: number; alarmMin: number };
  bands: readonly { id: string; min: number; max: number | null; alert: MewsAlert }[];
}

export interface NurseRosterRow {
  id: string;
  name: string;
  shift: 'DAY' | 'NIGHT';
  zone: string;
  tone: string;
}

export interface QuickWordRow {
  id: string;
  aliases: readonly string[];
  catalogId: string;
  chipLabel?: string | undefined;
  chipGroup?: 'observe' | 'treat' | 'tests' | 'resus' | undefined;
  prompt?:
    | readonly (
        | 'dose'
        | 'route'
        | 'frequency'
        | 'times'
        | 'volume'
        | 'rate'
        | 'energy'
        | 'flow'
        | 'transfusion'
      )[]
    | undefined;
  promptStem?: string | undefined;
  promptDefaults?:
    | {
        flow?: number | undefined;
        volume?: number | undefined;
        rate?: number | undefined;
        energy?: number | undefined;
        transfusion?: number | undefined;
        frequency?: 'stat' | 'TDS' | 'prn' | 'Q_H' | 'Q_min' | undefined;
        every?: number | undefined;
        times?: number | undefined;
      }
    | undefined;
  params?:
    | {
        drugFormularyId?: string | undefined;
        dose?: { value: number; unit: string } | undefined;
        route?: string | undefined;
        executor?: ExecutorKind | undefined;
      }
    | undefined;
}

export interface ResultItemRow {
  id: string;
  label: string;
  unit: string;
  decimals: number;
  ref: { low: number; high: number };
  byState: Readonly<Record<string, number>>;
}

export interface ResultRow {
  id: string;
  kind: 'PANEL' | 'REPORT';
  label: string;
  reportDelaySec: number;
  reviewStatus: ReviewStatus;
  items: readonly ResultItemRow[];
  textByState: Readonly<Record<string, { text: string; abnormal: boolean }>>;
}

export const CONCERN_CATEGORIES = [
  'ALLERGY',
  'INTERACTION',
  'DOSE_HIGH',
  'DOSE_LOW',
  'WRONG_ROUTE',
  'CONTRAINDICATION',
  'OTHER',
] as const;
export type ConcernCategory = (typeof CONCERN_CATEGORIES)[number];
export type DangerLevel = 'LOW' | 'MID' | 'HIGH';
export type ConsequenceMode = 'IMMEDIATE' | 'DELAYED' | 'REVIEW_ONLY';

export interface ConsequenceEffect {
  delta: VitalDelta;
  delaySec: number;
  rampSec: number;
  durationSec: number | null;
  setsFlags: readonly string[];
}

export interface ConsequenceLevel {
  p: number;
  mode: ConsequenceMode;
  delayMinSec?: number | undefined;
  delayMaxSec?: number | undefined;
  effect: ConsequenceEffect | null;
}

export interface ConsequenceRow {
  id: string;
  category: ConcernCategory;
  reviewStatus: ReviewStatus;
  levels: Readonly<Record<DangerLevel, ConsequenceLevel>>;
}

export type RankId = 'HO' | 'MO' | 'RES' | 'AC' | 'COS';
export type Priority = 'ROUTINE' | 'URGENT' | 'EMERGENCY';
export type SubscoreId =
  'CLINICAL_OUTCOME' | 'TIMELINESS' | 'SAFETY' | 'COMMUNICATION' | 'PRIORITISATION' | 'SELF_CARE';
export type SubordinateLevel = 'NOVICE' | 'NORMAL' | 'SENIOR';
export type DelegationTask =
  'PROCEDURE' | 'ORDER_NOTE' | 'ADMISSION' | 'SIMPLE_CALL' | 'ROUND_PREP';
export type FailureMode = 'DELAYED' | 'INCOMPLETE' | 'WRONG';
export type CallTag = 'NURSE' | 'JUNIOR' | 'LAB' | 'XRAY' | 'PHARMACY' | 'DEPT';
export type CallNeeds = 'NONE' | 'ANY_PATIENT' | 'WORST_PATIENT' | 'ABNORMAL_REPORT' | 'FREE_BED';

export interface DifficultyProfileRow {
  id: 'EASY' | 'MEDIUM' | 'HARD';
  occupancy: { min: number; max: number };
  complexityLevel: number;
  complexRatio: number;
  phoneVolumeUplift: number;
  nightEventMultiplier: number;
  nurseSeniority: 'SENIOR' | 'NORMAL' | 'NEW';
}

export interface RankComplexityRow {
  id: 'HO' | 'MO' | 'RES';
  complexityLevel: number;
}

export interface SubordinateRow {
  id: string;
  rank: 'HO' | 'MO';
  name: string;
  level: SubordinateLevel;
  tone: string;
}

export interface DelegationItemRow {
  id: string;
  label: string;
  catalogId?: string | undefined;
  baseDurationSec?: number | undefined;
  needsPatient: boolean;
  needsTag?: string | undefined;
  setsFlag?: string | undefined;
  clearsTag?: string | undefined;
}

export interface DelegationResultRow {
  id: DelegationTask;
  task: DelegationTask;
  items: readonly DelegationItemRow[];
  byLevel: Readonly<Record<SubordinateLevel, { failureModes: readonly FailureMode[] }>>;
  delayExtraMultiplier: number;
}

export interface CallResponseEffect {
  events: readonly string[];
  setFlags: readonly string[];
  goToBed: boolean;
}

export interface CallTemplateRow {
  id: string;
  kind: 'CALL';
  tag: CallTag;
  weight: number;
  priority: Priority;
  needs: CallNeeds;
  playerRanks: readonly ('HO' | 'MO' | 'RES')[];
  text: string;
  sbar?: { S: string; B: string; A: string; R: string } | undefined;
  delegable: boolean;
  admission?: boolean | undefined;
  deptPool?: readonly string[] | undefined;
  responses: Readonly<Record<'GO_NOW' | 'LATER' | 'CONTINUE' | 'MISSED', CallResponseEffect>>;
  callerImpression: 'NONE' | 'CALLER_RANK';
}

export interface SbarPrefillRow {
  id: string;
  kind: 'SBAR_PREFILL';
  S: string;
  B: string;
  A: string;
  R: string;
  RByTarget: { RANK: string; DEPT: string };
  abnormalLabels: Readonly<Record<string, string>>;
  directionLabels: { LOW: string; HIGH: string };
  sexLabels: { M: string; F: string };
  noAbnormal: string;
  noAllergy: string;
  noOrders: string;
}

export interface ArrestAlertRow {
  id: string;
  kind: 'ARREST_ALERT';
  text: string;
  rearrestText: string;
  responses: Readonly<Record<'GO_NOW' | 'LATER' | 'CONTINUE' | 'MISSED', CallResponseEffect>>;
}

export interface DeathSbarRow {
  id: string;
  kind: 'DEATH_SBAR';
  S: string;
  B: string;
  A: string;
  R: string;
}

export type CallTemplateTableRow = CallTemplateRow | SbarPrefillRow | ArrestAlertRow | DeathSbarRow;

export type ImpressionBand = 'WARM' | 'NEUTRAL' | 'COLD';

export interface RankBehaviourRow {
  id: 'MO' | 'RES' | 'AC' | 'COS';
  bands: Readonly<
    Record<
      ImpressionBand,
      {
        reactionSec: number;
        adviceMinClarity: number;
        bedsideMinClarity: number;
        questionDepth: number;
      }
    >
  >;
}

export interface ConsultDepartmentRow {
  id: string;
  label: string;
  kind: 'SPECIALTY' | 'ICU' | 'SERVICE';
  acceptMinClarity: number;
  bedsideByUrgency: Readonly<Record<Priority, 'PHONE' | 'BEDSIDE'>>;
  reactionSec: { PHONE: number; BEDSIDE: number };
  icu?: { mewsMin: number; assessSec: number } | undefined;
  incoming: boolean;
}

export interface ScoringRuleRow {
  id: string;
  subscore: SubscoreId;
  delta: number;
  impression?: { target: 'SKIPPED' | 'CALLEE' | 'CALLER'; delta: number } | undefined;
}

export type WardLayoutRow =
  | { id: string; kind: 'BED'; bed: number; zone: string; row: number; col: number }
  | { id: string; kind: 'LANDMARK'; landmark: string }
  | { id: string; kind: 'WALK'; sameZoneSec: number; crossZoneSec: number };

export interface WeightedRhythm {
  rhythm: string;
  w: number;
}

export interface AclsRhythmRow {
  id: string;
  kind: 'RHYTHM';
  rhythm: string;
  trajectory: string;
  rocBaseP: number;
  ifNoShock: readonly WeightedRhythm[];
  ifShocked: readonly WeightedRhythm[];
  reviewStatus: ReviewStatus;
  note: string;
}

export interface AclsDrugRule {
  formularyId: string;
  dose: { value: number; unit: string };
  needsShockable: boolean;
  minShocksBefore: number;
  bonus: number;
  wrongDosePenalty: number;
}

export interface AclsModelRow {
  id: string;
  kind: 'MODEL';
  reviewStatus: ReviewStatus;
  note: string;
  rosc: { min: number; max: number };
  noFlow: { graceSec: number; penaltyPerMin: number; cap: number };
  handsOff: { graceSec: number; penaltyPer10Sec: number; cap: number };
  duration: { penaltyPerCycle: number; cap: number };
  shock: {
    defaultEnergyJ: number;
    minEnergyJ: number;
    maxEnergyJ: number;
    appropriateBonus: number;
    missedPenalty: number;
    inappropriatePenalty: number;
    wrongEnergyPenalty: number;
    delayGraceSec: number;
    delayPenaltyPerMin: number;
    delayCap: number;
  };
  drugs: readonly AclsDrugRule[];
  causes: { treatedBonus: number; cap: number };
  airway: { flag: string; bonus: number };
  unsalvageableCap: number;
  afterRosc: readonly WeightedRhythm[];
  postRosc: {
    windowSec: number;
    bundle: readonly { id: string; label: string; catalogIds: readonly string[] }[];
    rearrestBaseP: number;
    rearrestPerMissing: number;
    rearrestRhythms: readonly WeightedRhythm[];
  };
  /** 只剩時間窗；分值同分項全部喺 scoring-rules（唯一 ledger） */
  scoring: {
    timeToCpr: { graceSec: number };
    timeToFirstShock: { graceSec: number };
    cycleGap: { graceSec: number };
  };
}

export interface AclsCauseRow {
  id: string;
  kind: 'CAUSE';
  label: string;
  group: 'H' | 'T';
  checkCatalogIds: readonly string[];
  treatCatalogIds: readonly string[];
  reviewStatus: ReviewStatus;
  note: string;
}

export type AclsRow = AclsRhythmRow | AclsModelRow | AclsCauseRow;

export const DEATH_STEP_IDS = ['CERTIFICATE', 'NOTIFY_SENIOR', 'PHONE_FAMILY', 'RECORD'] as const;
export type DeathStepId = (typeof DEATH_STEP_IDS)[number];

export interface DeathModelRow {
  id: string;
  kind: 'MODEL';
  reviewStatus: ReviewStatus;
  note: string;
  delayIntervalSec: number;
  seniorByRank: Readonly<Record<'HO' | 'MO' | 'RES', string>>;
}

export interface DeathStepRow {
  id: string;
  kind: 'STEP';
  step: DeathStepId;
  fields: readonly string[];
  reviewStatus: ReviewStatus;
  note: string;
}

export type DeathRow = DeathModelRow | DeathStepRow;

export const FAMILY_SIGNAL_IDS = [
  'STATES_DEATH',
  'HINTS_SERIOUS',
  'CONDOLENCE',
  'OFFERS_SUPPORT',
  'EXPLAINS_EVENTS',
  'BLUNT_OR_COLD',
  'JARGON',
] as const;
export type FamilySignal = (typeof FAMILY_SIGNAL_IDS)[number];
export type FamilyReaction = 'CONFUSED' | 'SHOCK' | 'GRIEF' | 'ANGER';
export type FamilyAsk = 'NONE' | 'WHAT_IS_WRONG' | 'WHAT_HAPPENED' | 'WHEN_CAN_VISIT';

export interface FamilyOptionRow {
  id: string;
  label: string;
  line: string;
  signals: readonly FamilySignal[];
}

export interface FamilyScenarioRow {
  id: string;
  kind: 'SCENARIO';
  topic: 'DEATH_NOTIFICATION';
  calleeName: string;
  pickup: string;
  closing: string;
  stages: { OPENING: readonly FamilyOptionRow[]; FOLLOWUP: readonly FamilyOptionRow[] };
  reactions: readonly {
    informed: boolean;
    empathy: number;
    reaction: FamilyReaction;
    asks: FamilyAsk;
  }[];
  scoring: {
    empathy: readonly [string | null, string | null, string | null];
    clarity: readonly [string | null, string | null, string | null];
  };
}

export type RoundCategory = 'HISTORY' | 'PATHOLOGY' | 'PHARMACOLOGY';

export interface RoundTopicRow {
  id: string;
  diagnosisId: string;
  category: RoundCategory;
  focus: string;
  keyFacts: readonly { id: string; text: string }[];
}

export interface EnergyModelRow {
  id: 'MODEL';
  startPercent: number;
  decayPerGameHour: number;
  tickSeconds: number;
  lowPercent: number;
  veryLowPercent: number;
  nudgeBelowPercent: number;
  nudgeCooldownSeconds: number;
  actionCosts: { MOVE: number; CALL: number; DELEGATE: number };
  placeReliefPercent: number;
  placeCooldownSeconds: number;
}

export const SELF_CARE_IDS = ['MEAL', 'NAP', 'TOILET', 'WATER', 'PHONE_CHAT', 'MUSIC'] as const;
export type SelfCareId = (typeof SELF_CARE_IDS)[number];

export interface SelfCareRow {
  id: SelfCareId;
  durationSeconds: number;
  gainPercent: number;
  requires: 'NONE' | 'MEAL_WINDOW';
  cooldownSeconds: number;
  rule: string;
}

export type EndingReason = 'OVERTIME' | 'FAINT';

export interface EndingTagRow {
  id: string;
  tag: EndingReason;
  reason: EndingReason;
}

export type Grade = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'NEEDS_IMPROVEMENT';

export interface GradingThresholds {
  excellentMin: number;
  goodMin: number;
  fairMin: number;
}

export interface ScoringModelRow {
  id: 'MODEL';
  grading: Readonly<Record<SubscoreId, GradingThresholds>>;
  deathCap: { oneDeathCap: Grade; needsImprovementFraction: number };
  safetyScore: { goodMin: number; poorMax: number };
  priority: { graceSec: number };
  reviewStatus: ReviewStatus;
  note: string;
}

export interface RequiredActionRow {
  id: string;
  fsmId: string;
  state: string;
  flag: string;
  label: string;
  catalogIds: readonly string[];
  windowSec: number;
  guideline: { title: string; text: string; source: string };
  reviewStatus: ReviewStatus;
  note: string;
}

export interface EngineTables {
  'case-templates': readonly CaseTemplateRow[];
  'case-fsm': readonly CaseFsmRow[];
  trajectories: readonly TrajectoryRow[];
  'order-catalog': readonly OrderCatalogRow[];
  formulary: readonly FormularyRow[];
  'order-effects': readonly OrderEffectRow[];
  rhythms: readonly RhythmRow[];
  mews: readonly MewsRow[];
  'nurse-roster': readonly NurseRosterRow[];
  'quick-words': readonly QuickWordRow[];
  results: readonly ResultRow[];
  consequences: readonly ConsequenceRow[];
  'difficulty-profiles': readonly DifficultyProfileRow[];
  'rank-complexity': readonly RankComplexityRow[];
  subordinates: readonly SubordinateRow[];
  'delegation-results': readonly DelegationResultRow[];
  'call-templates': readonly CallTemplateTableRow[];
  'rank-behaviour': readonly RankBehaviourRow[];
  'consult-departments': readonly ConsultDepartmentRow[];
  'scoring-rules': readonly ScoringRuleRow[];
  'ward-layout': readonly WardLayoutRow[];
  'acls-transitions': readonly AclsRow[];
  'death-process': readonly DeathRow[];
  'family-scenarios': readonly FamilyScenarioRow[];
  'rounds-topics': readonly RoundTopicRow[];
  'energy-config': readonly EnergyModelRow[];
  'self-care-actions': readonly SelfCareRow[];
  endings: readonly EndingTagRow[];
  'scoring-model': readonly ScoringModelRow[];
  'required-actions': readonly RequiredActionRow[];
}

export const EMPTY_TABLES: EngineTables = {
  'case-templates': [],
  'case-fsm': [],
  trajectories: [],
  'order-catalog': [],
  formulary: [],
  'order-effects': [],
  rhythms: [],
  mews: [],
  'nurse-roster': [],
  'quick-words': [],
  results: [],
  consequences: [],
  'difficulty-profiles': [],
  'rank-complexity': [],
  subordinates: [],
  'delegation-results': [],
  'call-templates': [],
  'rank-behaviour': [],
  'consult-departments': [],
  'scoring-rules': [],
  'ward-layout': [],
  'acls-transitions': [],
  'death-process': [],
  'family-scenarios': [],
  'rounds-topics': [],
  'energy-config': [],
  'self-care-actions': [],
  endings: [],
  'scoring-model': [],
  'required-actions': [],
};
