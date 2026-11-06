import type { ImpressionBand } from '../case/tables';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import type { Rank } from './wardTypes';

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
}

/** 套用 T22 一條規則：入計分流水，並按 impression 目標調整對應職級印象 */
export function applyRule(
  state: GameState,
  ruleId: string,
  ctx: EngineContext,
  targets: RuleTargets = {},
): GameState {
  const rule = ctx.tables['scoring-rules'].find((r) => r.id === ruleId);
  if (!rule) return state;
  let next: GameState = {
    ...state,
    ward: {
      ...state.ward,
      ledger: [
        ...state.ward.ledger,
        {
          t: state.clock.t,
          rule: rule.id,
          subscore: rule.subscore,
          delta: rule.delta,
          callId: targets.callId ?? null,
          patientId: targets.patientId ?? null,
        },
      ],
    },
  };
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
