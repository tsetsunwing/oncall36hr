/**
 * ROSC 機率模型（implementation-plan §10、spec §12）：純函數，輸入係 engine 自己記錄嘅 order 時機同正確程度，
 * 係數全部讀 T9 `acls-transitions` MODEL 列；呢度冇任何臨床數字，亦完全唔讀 AI 輸出。
 */
import type {
  AclsCauseRow,
  AclsDrugRule,
  AclsModelRow,
  AclsRhythmRow,
  AclsRow,
  EngineTables,
  RhythmRow,
  WeightedRhythm,
} from '../case/tables';
import { rngFloat, type RngState } from '../core/rng';
import type { Resus } from './resusState';

export function aclsModelOf(tables: EngineTables): AclsModelRow | undefined {
  return tables['acls-transitions'].find((r): r is AclsModelRow => r.kind === 'MODEL');
}

export function aclsRhythmRowOf(tables: EngineTables, rhythmId: string): AclsRhythmRow | undefined {
  return tables['acls-transitions'].find(
    (r): r is AclsRhythmRow => r.kind === 'RHYTHM' && r.rhythm === rhythmId,
  );
}

export function causeRowsOf(tables: EngineTables): AclsCauseRow[] {
  return tables['acls-transitions'].filter((r: AclsRow): r is AclsCauseRow => r.kind === 'CAUSE');
}

export function rhythmOf(tables: EngineTables, rhythmId: string): RhythmRow | undefined {
  return tables.rhythms.find((r) => r.id === rhythmId);
}

const MG_PER_G = 1000;

/** 劑量比對（g／mg 互換）；冇提供劑量視為預設劑量（護士按標準處理） */
export function doseMatches(
  given: { value: number; unit: string } | null,
  rule: AclsDrugRule['dose'],
): boolean {
  if (!given) return true;
  const toMg = (d: { value: number; unit: string }) =>
    d.unit.toLowerCase() === 'g' ? d.value * MG_PER_G : d.value;
  const sameFamily =
    given.unit.toLowerCase() === rule.unit.toLowerCase() ||
    (['g', 'mg'].includes(given.unit.toLowerCase()) &&
      ['g', 'mg'].includes(rule.unit.toLowerCase()));
  if (!sameFamily) return false;
  return Math.abs(toMg(given) - toMg(rule)) < 1e-9;
}

export function energyInRange(energyJ: number, model: AclsModelRow): boolean {
  return energyJ >= model.shock.minEnergyJ && energyJ <= model.shock.maxEnergyJ;
}

export interface RoscInputs {
  resus: Resus;
  rhythmRow: AclsRhythmRow;
  rhythm: RhythmRow;
  model: AclsModelRow;
  now: number;
  salvageable: boolean;
  airwaySecured: boolean;
}

export interface RoscBreakdown {
  p: number;
  terms: Record<string, number>;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * 逐項計算 ROSC 機率；`terms` 每項帶符號，方便回顧同單元測試核對。
 * 單調性（由測試以 property 驗證）：延遲 CPR、hands-off 變長、拖長 arrest、漏電擊、錯劑量，機率只會下降或不變。
 */
export function computeRoscProbability(input: RoscInputs): RoscBreakdown {
  const { resus, rhythmRow, rhythm, model, now } = input;
  const terms: Record<string, number> = { base: rhythmRow.rocBaseP };

  const noFlowOverSec = Math.max(0, resus.noFlowSec - model.noFlow.graceSec);
  terms.noFlow = -Math.min(model.noFlow.cap, (noFlowOverSec / 60) * model.noFlow.penaltyPerMin);

  const handsOffOverSec = Math.max(0, resus.handsOffSec - model.handsOff.graceSec);
  terms.handsOff = -Math.min(
    model.handsOff.cap,
    (handsOffOverSec / 10) * model.handsOff.penaltyPer10Sec,
  );

  terms.duration = -Math.min(model.duration.cap, resus.cycles * model.duration.penaltyPerCycle);

  const shock = model.shock;
  if (rhythm.shockable) {
    if (resus.cycle.shocksOnShockable > 0) {
      terms.shock = resus.cycle.wrongEnergy ? -shock.wrongEnergyPenalty : shock.appropriateBonus;
    } else {
      terms.shock = -shock.missedPenalty;
    }
    if (resus.firstShockableAt !== null) {
      const delaySec = (resus.firstShockAt ?? now) - resus.firstShockableAt;
      terms.shockDelay = -Math.min(
        shock.delayCap,
        (Math.max(0, delaySec - shock.delayGraceSec) / 60) * shock.delayPenaltyPerMin,
      );
    }
  }
  if (resus.cycle.shocksOnNonShockable > 0) {
    terms.inappropriateShock = -resus.cycle.shocksOnNonShockable * shock.inappropriatePenalty;
  }

  let drugs = 0;
  for (const rule of model.drugs) {
    const given = resus.cycle.drugs.filter((d) => d.formularyId === rule.formularyId);
    if (given.length === 0) continue;
    if (given.some((d) => !d.doseOk)) {
      drugs -= rule.wrongDosePenalty;
      continue;
    }
    if (rule.needsShockable && !rhythm.shockable) continue;
    if (rhythm.shockable && resus.shocks < rule.minShocksBefore) continue;
    drugs += rule.bonus;
  }
  terms.drugs = drugs;

  const treatedPresent = resus.treatedCauses.filter((c) => resus.causeIds.includes(c)).length;
  terms.causes = Math.min(model.causes.cap, treatedPresent * model.causes.treatedBonus);

  terms.airway = input.airwaySecured ? model.airway.bonus : 0;

  let p = clamp(
    Object.values(terms).reduce((sum, v) => sum + v, 0),
    model.rosc.min,
    model.rosc.max,
  );
  if (!input.salvageable) p = Math.min(p, model.unsalvageableCap);
  return { p: clamp(p, 0, 1), terms };
}

/** 按權重揀下一個節律（rng.cpr）；權重唔需要加起來係 1 */
export function pickWeighted(
  weights: readonly WeightedRhythm[],
  rng: RngState,
): { value: string; rng: RngState } {
  const first = weights[0];
  if (!first) throw new Error('acls：空嘅節律權重表');
  const total = weights.reduce((sum, w) => sum + w.w, 0);
  const draw = rngFloat(rng, 'cpr');
  let cursor = draw.value * total;
  for (const w of weights) {
    cursor -= w.w;
    if (cursor < 0) return { value: w.rhythm, rng: draw.rng };
  }
  return { value: first.rhythm, rng: draw.rng };
}
