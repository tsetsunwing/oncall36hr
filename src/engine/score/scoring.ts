import type { ImpressionBand } from '../case/tables';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import type { Rank } from '../ward/wardTypes';
import type { LedgerEntry, SubscoreCode } from './ledgerTypes';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function impressionOf(state: GameState, rank: Rank, ctx: EngineContext): number {
  return state.ward.impressions[rank] ?? ctx.config.staff.rankImpression.start;
}

export function impressionBand(value: number, ctx: EngineContext): ImpressionBand {
  const { warmMin, coldMax } = ctx.config.staff.rankImpression;
  if (value >= warmMin) return 'WARM';
  if (value <= coldMax) return 'COLD';
  return 'NEUTRAL';
}

export function adjustImpression(
  state: GameState,
  rank: Rank,
  delta: number,
  ctx: EngineContext,
): GameState {
  const { min, max } = ctx.config.staff.rankImpression;
  const next = clamp(impressionOf(state, rank, ctx) + delta, min, max);
  return {
    ...state,
    ward: { ...state.ward, impressions: { ...state.ward.impressions, [rank]: next } },
  };
}

export interface RuleTargets {
  skipped?: readonly Rank[];
  callee?: Rank | null;
  caller?: Rank | null;
  callId?: string | null;
  patientId?: string | null;
  /** 引發事件嘅來源參照（order:o3 之類），回顧用 */
  evidence?: string | null;
  facts?: Readonly<Record<string, number | string>>;
  /** 事件實際發生時刻（預設係而家）；例如搶救事件按事發時間入帳 */
  t?: number;
}

/**
 * 套用 T22 一條規則：入唯一 ledger，並按 impression 目標調整對應職級印象。
 * 所有模組（把關、來電、搶救、巡房、自我照顧、超時、暈倒…）都經呢度計分。
 */
export function applyRule(
  state: GameState,
  ruleId: string,
  ctx: EngineContext,
  targets: RuleTargets = {},
): GameState {
  const rule = ctx.tables['scoring-rules'].find((r) => r.id === ruleId);
  if (!rule) return state;
  const entry: LedgerEntry = {
    id: `sc${String(state.scoreLedger.length + 1)}`,
    t: targets.t ?? state.clock.t,
    subscore: rule.subscore,
    rule: rule.id,
    delta: rule.delta,
    patientId: targets.patientId ?? null,
    callId: targets.callId ?? null,
    evidenceRef: targets.evidence ?? null,
    facts: { ...targets.facts },
  };
  let next: GameState = { ...state, scoreLedger: [...state.scoreLedger, entry] };
  if (rule.impression) {
    const { target, delta } = rule.impression;
    const ranks: readonly Rank[] =
      target === 'SKIPPED'
        ? (targets.skipped ?? [])
        : target === 'CALLEE'
          ? targets.callee
            ? [targets.callee]
            : []
          : targets.caller
            ? [targets.caller]
            : [];
    for (const rank of ranks) next = adjustImpression(next, rank, delta, ctx);
  }
  return next;
}

/** 單一分項嘅原始加總（冇總分：呢個函數只接受一個分項） */
export function subscoreSum(state: Pick<GameState, 'scoreLedger'>, id: SubscoreCode): number {
  return state.scoreLedger.filter((e) => e.subscore === id).reduce((n, e) => n + e.delta, 0);
}

export function ledgerRules(state: Pick<GameState, 'scoreLedger'>): string[] {
  return state.scoreLedger.map((e) => e.rule);
}
