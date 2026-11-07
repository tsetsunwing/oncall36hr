/**
 * 六分項評級（冇總分、冇倍數）：每個分項各自按 T22b 門檻評級；
 * 死亡令「臨床結果」降級（不論可否挽回），不可挽回嘅死亡另加「已盡力」旗標。
 */
import type { EngineTables, Grade, GradingThresholds } from '../case/tables';
import type { GameState } from '../core/state';
import { SUBSCORE_IDS, type SubscoreCode } from './ledgerTypes';

const GRADE_RANK: Readonly<Record<Grade, number>> = {
  NEEDS_IMPROVEMENT: 0,
  FAIR: 1,
  GOOD: 2,
  EXCELLENT: 3,
};

export function worseGrade(a: Grade, b: Grade): Grade {
  return GRADE_RANK[a] <= GRADE_RANK[b] ? a : b;
}

export function gradeOf(sum: number, thresholds: GradingThresholds): Grade {
  if (sum >= thresholds.excellentMin) return 'EXCELLENT';
  if (sum >= thresholds.goodMin) return 'GOOD';
  if (sum >= thresholds.fairMin) return 'FAIR';
  return 'NEEDS_IMPROVEMENT';
}

export interface SubscoreSummary {
  id: SubscoreCode;
  /** 單一分項嘅原始加減總和 */
  sum: number;
  entries: number;
  grade: Grade;
  cappedByDeath: boolean;
  items: { rule: string; count: number; delta: number }[];
}

export interface DeathSummary {
  patientId: string;
  t: number;
  /** 病例設定上有冇可能挽回（隱藏資料；只喺結局後用嚟提示「已盡力」） */
  salvageable: boolean;
  processComplete: boolean;
}

export interface RunSummary {
  subscores: SubscoreSummary[];
  deaths: DeathSummary[];
  /** 有不可挽回嘅死亡 → 回顧提示「已盡力」 */
  doneBest: boolean;
  tags: ('OVERTIME' | 'FAINT')[];
}

type GradingTables = Pick<EngineTables, 'scoring-model' | 'case-templates' | 'case-fsm'>;

function salvageableOf(state: GameState, patientId: string, tables: GradingTables): boolean {
  const patient = state.patients[patientId];
  const template = tables['case-templates'].find((t) => t.id === patient?.hidden.caseTemplateId);
  const fsm = tables['case-fsm'].find((f) => f.id === template?.fsmId);
  return fsm?.salvageable ?? true;
}

export function summariseRun(state: GameState, tables: GradingTables): RunSummary {
  const model = tables['scoring-model'][0];
  const deathEntries = state.scoreLedger.filter((e) => e.rule === 'PATIENT_DEATH' && e.patientId);
  const seen = new Set<string>();
  const deaths: DeathSummary[] = [];
  for (const entry of deathEntries) {
    const patientId = entry.patientId ?? '';
    if (seen.has(patientId)) continue;
    seen.add(patientId);
    deaths.push({
      patientId,
      t: entry.t,
      salvageable: salvageableOf(state, patientId, tables),
      processComplete:
        state.death?.patientId === patientId ? state.death.status === 'COMPLETE' : true,
    });
  }
  const census = Math.max(1, Object.keys(state.patients).length);
  const deathCap: Grade | null =
    !model || deaths.length === 0
      ? null
      : deaths.length / census >= model.deathCap.needsImprovementFraction
        ? 'NEEDS_IMPROVEMENT'
        : model.deathCap.oneDeathCap;

  const subscores = SUBSCORE_IDS.map((id): SubscoreSummary => {
    const rows = state.scoreLedger.filter((e) => e.subscore === id);
    const byRule = new Map<string, { count: number; delta: number }>();
    for (const e of rows) {
      const row = byRule.get(e.rule) ?? { count: 0, delta: 0 };
      byRule.set(e.rule, { count: row.count + 1, delta: row.delta + e.delta });
    }
    const sum = rows.reduce((n, e) => n + e.delta, 0);
    const thresholds = model?.grading[id];
    const base: Grade = thresholds ? gradeOf(sum, thresholds) : 'GOOD';
    const capped = id === 'CLINICAL_OUTCOME' && deathCap !== null;
    const grade = capped ? worseGrade(base, deathCap) : base;
    return {
      id,
      sum,
      entries: rows.length,
      grade,
      cappedByDeath: capped && grade !== base,
      items: [...byRule].map(([rule, v]) => ({ rule, ...v })),
    };
  });

  return {
    subscores,
    deaths,
    doneBest: deaths.some((d) => !d.salvageable),
    tags: [...(state.shift.ending?.tags ?? [])],
  };
}
