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

function clampNeed(value: number): number {
  return round2(Math.min(100, Math.max(0, value)));
}

/** 餘量係三項需要最高值的相反數。需要愈高，餘量愈低。 */
export function reserveOf(needs: { fatigue: number; hunger: number; bladder: number }): number {
  return clampNeed(100 - Math.max(needs.fatigue, needs.hunger, needs.bladder));
}

export function changeEnergy(state: GameState, delta: number): GameState {
  const energy = state.shift.energy;
  const needs = {
    fatigue: clampNeed(energy.fatigue - delta),
    hunger: clampNeed(energy.hunger - delta),
    bladder: clampNeed(energy.bladder - delta),
  };
  const percent = reserveOf(needs);
  if (
    percent === energy.percent &&
    needs.fatigue === energy.fatigue &&
    needs.hunger === energy.hunger &&
    needs.bladder === energy.bladder
  ) {
    return state;
  }
  return withShift(state, { energy: { ...energy, ...needs, percent } });
}

/** 只降低一項需要（進入對應房間）。正數係降低量。 */
export function relieveNeed(
  state: GameState,
  key: 'fatigue' | 'hunger' | 'bladder',
  amount: number,
): GameState {
  const energy = state.shift.energy;
  const needs = {
    fatigue: energy.fatigue,
    hunger: energy.hunger,
    bladder: energy.bladder,
    [key]: clampNeed(energy[key] - amount),
  };
  return withShift(state, { energy: { ...energy, ...needs, percent: reserveOf(needs) } });
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
