/** 精力（T20）：全部固定值、冇隨機（S8 B）。扣減／回復只經呢度，確保存檔值一致。 */
import type { EnergyModelRow } from '../case/tables';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import type { PlayerIntent } from '../core/events';
import { round2, withShift } from './common';

export type EnergyLevel = 'NORMAL' | 'LOW' | 'VERY_LOW';
export type NeedKey = 'fatigue' | 'hunger' | 'bladder';

/** 飢餓加快疲倦：小時速率同落單／撳床／電話嘅 +2% 都乘呢個倍率。 */
export const HUNGER_FATIGUE_BOOST_AT = 70;
export const HUNGER_FATIGUE_BOOST_FACTOR = 1.5;
export const HUNGER_FATIGUE_MAX_AT = 100;
export const HUNGER_FATIGUE_MAX_FACTOR = 2;

/** 內急 100%：失禁後跳過 1 個遊戲小時換衫，內急歸零；唔結束當值。 */
export const BLADDER_ACCIDENT_SKIP_SECONDS = 3600;
export const BLADDER_RESET_PERCENT = 0;

export function energyModel(ctx: {
  tables: Pick<EngineContext['tables'], 'energy-config'>;
}): EnergyModelRow | undefined {
  return ctx.tables['energy-config'][0];
}

function clampNeed(value: number): number {
  return round2(Math.min(100, Math.max(0, value)));
}

/** 餘量係疲倦同飢餓最高值的相反數。內急到 100% 唔計入暈倒。 */
export function reserveOf(needs: { fatigue: number; hunger: number; bladder: number }): number {
  return clampNeed(100 - Math.max(needs.fatigue, needs.hunger));
}

export function fatigueHourlyMultiplier(hunger: number): number {
  if (hunger >= HUNGER_FATIGUE_MAX_AT) return HUNGER_FATIGUE_MAX_FACTOR;
  if (hunger >= HUNGER_FATIGUE_BOOST_AT) return HUNGER_FATIGUE_BOOST_FACTOR;
  return 1;
}

function withNeeds(
  state: GameState,
  needs: { fatigue: number; hunger: number; bladder: number },
): GameState {
  const energy = state.shift.energy;
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

export function changeEnergy(state: GameState, delta: number): GameState {
  const energy = state.shift.energy;
  return withNeeds(state, {
    fatigue: clampNeed(energy.fatigue - delta),
    hunger: clampNeed(energy.hunger - delta),
    bladder: clampNeed(energy.bladder - delta),
  });
}

/** 只降低一項需要（進入對應房間）。正數係降低量。 */
export function relieveNeed(state: GameState, key: NeedKey, amount: number): GameState {
  const energy = state.shift.energy;
  return withNeeds(state, {
    fatigue: energy.fatigue,
    hunger: energy.hunger,
    bladder: energy.bladder,
    [key]: clampNeed(energy[key] - amount),
  });
}

export function raiseNeed(state: GameState, key: NeedKey, amount: number): GameState {
  if (amount === 0) return state;
  const energy = state.shift.energy;
  return withNeeds(state, {
    fatigue: energy.fatigue,
    hunger: energy.hunger,
    bladder: energy.bladder,
    [key]: clampNeed(energy[key] + amount),
  });
}

export function setNeed(state: GameState, key: NeedKey, value: number): GameState {
  const energy = state.shift.energy;
  return withNeeds(state, {
    fatigue: energy.fatigue,
    hunger: energy.hunger,
    bladder: energy.bladder,
    [key]: clampNeed(value),
  });
}

export function energyLevel(percent: number, model: EnergyModelRow | undefined): EnergyLevel {
  if (!model) return 'NORMAL';
  if (percent <= model.veryLowPercent) return 'VERY_LOW';
  if (percent <= model.lowPercent) return 'LOW';
  return 'NORMAL';
}

/** 茶水間上次飲水／用膳起計，咖啡仍然生效。 */
export function coffeeActive(state: GameState, model: EnergyModelRow): boolean {
  if (model.coffeeDurationSeconds <= 0) return false;
  const at = state.shift.energy.placeAt.PANTRY;
  return at !== null && state.clock.t - at < model.coffeeDurationSeconds;
}

export function applyDecay(state: GameState, ctx: EngineContext): GameState {
  const model = energyModel(ctx);
  if (!model) return state;
  const hours = model.tickSeconds / 3600;
  const coffee = coffeeActive(state, model);
  const fatigueGain =
    model.fatiguePerGameHour *
    hours *
    fatigueHourlyMultiplier(state.shift.energy.hunger) *
    (coffee ? model.coffeeFatigueFactor : 1);
  const bladderGain = model.bladderPerGameHour * hours * (coffee ? model.coffeeBladderFactor : 1);
  let next = raiseNeed(state, 'hunger', model.hungerPerGameHour * hours);
  next = raiseNeed(next, 'bladder', bladderGain);
  return raiseNeed(next, 'fatigue', fatigueGain);
}

function actionTick(hunger: number, base: number): number {
  return round2(base * fatigueHourlyMultiplier(hunger));
}

function ordersAdded(before: GameState, after: GameState): number {
  return Math.max(0, Object.keys(after.orders).length - Object.keys(before.orders).length);
}

function movedToBed(before: GameState, after: GameState): boolean {
  const from = before.ward.location.bed;
  const to = after.ward.location.bed ?? after.ward.location.movingTo;
  return to !== null && to !== from;
}

/** 按「已被接受」嘅動作加疲倦：落單、撳病床、去電（來電喺 CALL_ARRIVAL 另外加）。飢餓倍率一併乘。 */
export function actionFatigueOf(
  before: GameState,
  after: GameState,
  intent: PlayerIntent,
  ctx: EngineContext,
): number {
  const model = energyModel(ctx);
  if (!model) return 0;
  const hunger = after.shift.energy.hunger;
  switch (intent.type) {
    case 'PLACE_ORDER':
    case 'PLACE_CATALOG':
      return ordersAdded(before, after) > 0 ? actionTick(hunger, model.actionCosts.ORDER) : 0;
    case 'PLACE_CATALOG_BATCH':
      return actionTick(hunger, model.actionCosts.ORDER * ordersAdded(before, after));
    case 'ENTER_BED':
      return movedToBed(before, after) ? actionTick(hunger, model.actionCosts.BED) : 0;
    case 'EXTENSION':
      if (intent.module === 'ward' && intent.name === 'GO_TO_BED') {
        return movedToBed(before, after) ? actionTick(hunger, model.actionCosts.BED) : 0;
      }
      if (intent.module === 'ward' && intent.name === 'SEND_CALL') {
        return after.ward.calls.length > before.ward.calls.length
          ? actionTick(hunger, model.actionCosts.CALL)
          : 0;
      }
      return 0;
    default:
      return 0;
  }
}

export function chargeCallFatigue(state: GameState, ctx: EngineContext): GameState {
  const model = energyModel(ctx);
  if (!model || model.actionCosts.CALL <= 0) return state;
  return raiseNeed(state, 'fatigue', actionTick(state.shift.energy.hunger, model.actionCosts.CALL));
}

export function shouldNudge(state: GameState, ctx: EngineContext): boolean {
  const model = energyModel(ctx);
  if (!model || state.shift.energy.percent >= model.nudgeBelowPercent) return false;
  const last = state.shift.energy.lastNudgeAt;
  return last === null || state.clock.t - last >= model.nudgeCooldownSeconds;
}
