/** 巡房期間抑制突發事件（spec §8、Q102 A）：其他模組只靠呢兩個函數判斷，唔直接讀 shift 內部。 */
import type { EngineConfig } from '../core/config';
import type { GameState } from '../core/state';

export function roundInProgress(state: Pick<GameState, 'shift'>): boolean {
  return state.shift.rounds.active !== null;
}

export function interruptsSuppressed(
  state: Pick<GameState, 'shift'>,
  config: Pick<EngineConfig, 'rounds'>,
): boolean {
  return config.rounds.suppressInterruptsDuringRound && roundInProgress(state);
}

export function overtimeFrozen(state: Pick<GameState, 'clock'>): boolean {
  return state.clock.phase !== 'REGULAR';
}
