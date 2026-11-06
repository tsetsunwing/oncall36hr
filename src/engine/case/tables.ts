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
  states: Readonly<Record<string, { trajectory: string }>>;
  transitions: readonly { from: string; to: string; when: FsmTransitionWhen; p: number }[];
  salvageable: boolean;
}

export interface CaseTemplateRow {
  id: string;
  fsmId: string;
  bed: number;
  demographics: { name: string; age: number; sex: 'M' | 'F'; code: 'FULL' | 'DNR' };
  presentingComplaint: string;
  allergies: readonly string[];
  diagnosisIds: readonly string[];
  diagnosisTerms: readonly string[];
  symptomsByState: Readonly<Record<string, readonly string[]>>;
}

export type OrderType = 'OBSERVATION' | 'OXYGEN' | 'FLUID' | 'DRUG';

export interface OrderCatalogRow {
  id: string;
  type: OrderType;
  label: string;
  aliases: readonly string[];
  executors: readonly 'NURSE'[];
  fixedDurationSec: number;
  setsFlags: readonly string[];
  formularyId?: string | undefined;
  resultTemplate?: string | undefined;
  cancelWhile: readonly ('QUEUED' | 'RUNNING')[];
}

export interface FormularyRow {
  id: string;
  label: string;
  aliases: readonly string[];
  catalogId: string;
  units: readonly string[];
  routes: readonly string[];
}

export interface OrderEffectRow {
  id: string;
  catalogId: string;
  states: readonly string[];
  delta: VitalDelta;
  delaySec: number;
  rampSec: number;
  durationSec: number | null;
}

export interface RhythmRow {
  id: string;
  label: string;
  family: string;
  hrRange: readonly [number, number];
  shockable: boolean;
  pulse: boolean;
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
  params?:
    | {
        drugFormularyId?: string | undefined;
        dose?: { value: number; unit: string } | undefined;
        route?: string | undefined;
      }
    | undefined;
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
};
