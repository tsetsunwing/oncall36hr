/** 精力（T20）：全部固定值、冇隨機（S8 B）。扣減／回復只經呢度，確保存檔值一致。 */
import type { EnergyModelRow } from '../case/tables';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import type { PlayerIntent } from '../core/events';
import { round2, withShift } from './common';

export type EnergyLevel = 'NORMAL' | 'LOW' | 'VERY_LOW';

export function energyModel(ctx: {
  tables: Pick<EngineContext['tables'], 'energy-config'>;
}): EnergyModelRow | undefined {
  return ctx.tables['energy-config'][0];
}

export function setEnergy(state: GameState, percent: number): GameState {
  const next = round2(Math.min(100, Math.max(0, percent)));
  if (next === state.shift.energy.percent) return state;
  return withShift(state, { energy: { ...state.shift.energy, percent: next } });
}

export function changeEnergy(state: GameState, delta: number): GameState {
  return setEnergy(state, state.shift.energy.percent + delta);
}

export function energyLevel(percent: number, model: EnergyModelRow | undefined): EnergyLevel {
  if (!model) return 'NORMAL';
  if (percent <= model.veryLowPercent) return 'VERY_LOW';
  if (percent <= model.lowPercent) return 'LOW';
  return 'NORMAL';
}

export function applyDecay(state: GameState, ctx: EngineContext): GameState {
  const model = energyModel(ctx);
  if (!model) return state;
  return changeEnergy(state, (-model.decayPerGameHour * model.tickSeconds) / 3600);
}

/** 按「已被接受」嘅動作扣精力：行路、致電、委派（比較 intent 前後 state 判斷） */
export function actionCostOf(
  before: GameState,
  after: GameState,
  intent: PlayerIntent,
  ctx: EngineContext,
): number {
  const model = energyModel(ctx);
  if (!model || intent.type !== 'EXTENSION' || intent.module !== 'ward') return 0;
  switch (intent.name) {
    case 'GO_TO_BED': {
      const moved =
        before.ward.location.bed !== after.ward.location.bed ||
        (before.ward.location.movingTo === null && after.ward.location.movingTo !== null);
      return moved ? model.actionCosts.MOVE : 0;
    }
    case 'SEND_CALL':
      return after.ward.calls.length > before.ward.calls.length ? model.actionCosts.CALL : 0;
    case 'DELEGATE':
      return after.ward.tasks.length > before.ward.tasks.length ? model.actionCosts.DELEGATE : 0;
    default:
      return 0;
  }
}

export function shouldNudge(state: GameState, ctx: EngineContext): boolean {
  const model = energyModel(ctx);
  if (!model || state.shift.energy.percent >= model.nudgeBelowPercent) return false;
  const last = state.shift.energy.lastNudgeAt;
  return last === null || state.clock.t - last >= model.nudgeCooldownSeconds;
}
