import type { Effect, Reduction } from '../core/events';
import type { GameState } from '../core/state';
import type { ShiftState } from './shiftState';

export const SHIFT_MODULE = 'shift';

export function withShift(state: GameState, patch: Partial<ShiftState>): GameState {
  return { ...state, shift: { ...state.shift, ...patch } };
}

export const noticeEffect = (
  kind: Extract<Effect, { type: 'NOTICE' }>['kind'],
  tone: 'info' | 'warn' | 'error' = 'warn',
): Effect => ({ type: 'NOTICE', kind, tone });

export const reject = (
  state: GameState,
  kind: Extract<Effect, { type: 'NOTICE' }>['kind'],
): Reduction => ({ state, effects: [noticeEffect(kind)] });

export const none = (state: GameState): Reduction => ({ state, effects: [] });

/** 保留兩位小數，避免浮點誤差累積入存檔 */
export const round2 = (value: number): number => Math.round(value * 100) / 100;
