/**
 * 遊戲時鐘（implementation-plan §8.1）。
 * 時間單位：遊戲秒（整數 `t`）＋ 小數進度 `frac`（[0,1)）。
 * TICK 帶嘅係真實毫秒；換算由 engine 負責，所以暫停、倍速、CPR 慢速都係 engine 嘅確定性行為。
 */
import type { EngineConfig } from './config';
import type { Effect } from './events';
import type { GameState } from './state';

/** 把關審視唔凍結時鐘。本地落單本身亦唔暫停；只係其餘未完成嘅模型呼叫（包括護士提醒）先暫停。 */
const CLOCK_KEEPS_RUNNING = new Set(['gate.pharmacy', 'gate.nurse', 'gate.danger']);

export function pendingPausesClock(pending: readonly { kind: string }[]): boolean {
  return pending.some((request) => !CLOCK_KEEPS_RUNNING.has(request.kind));
}

/** 每真實毫秒推進幾多遊戲秒；暫停、等 AI 回覆、交班／結束階段時為 0 */
export function gameSecondsPerRealMs(
  config: EngineConfig,
  state: Pick<GameState, 'clock' | 'paused' | 'pendingAi' | 'shift'>,
): number {
  if (state.paused) return 0;
  if (state.clock.phase === 'HANDOVER' || state.clock.phase === 'ENDED') return 0;
  // 玩家打開巡房之後先暫停；未打開唔會進入巡房
  if (state.shift.rounds.active) return 0;
  // C1：等模型回覆期間遊戲時鐘自動暫停。本地落單同把關審視唔計。
  if (config.clock.pauseWhileAiPending && pendingPausesClock(state.pendingAi)) return 0;
  const baseAt1x = 60 / (config.clock.realSecondsPerGameMinuteAt1x * 1000);
  // CPR 期間有效速率固定為 1 倍嘅 cprSlowFactor，無視玩家倍速（S-3 A）
  const multiplier = state.clock.cprSlow ? config.clock.cprSlowFactor : state.clock.speed;
  return baseAt1x * multiplier;
}

/** 突發事件（心臟停頓呼叫、電話…）：倍速回到 config 設定值，但絕不取消 CPR 慢速（S26b B）。 */
export function interruptSpeed(
  state: GameState,
  config: EngineConfig,
): { state: GameState; effects: Effect[] } {
  return setSpeed(state, config.clock.speedAfterInterrupt);
}

/** CPR 期間開始：有效速率固定為 1 倍嘅 cprSlowFactor，玩家倍速只係被忽略（唔改寫） */
export function beginCprSlow(state: GameState): GameState {
  return state.clock.cprSlow ? state : { ...state, clock: { ...state.clock, cprSlow: true } };
}

/** CPR 期間結束（ROSC、停止搶救）：回復慢速前嘅倍速 */
export function endCprSlow(
  state: GameState,
  config: EngineConfig,
): { state: GameState; effects: Effect[] } {
  const released: GameState = {
    ...state,
    clock: { ...state.clock, cprSlow: false },
  };
  return setSpeed(released, config.clock.speedAfterCpr);
}

function setSpeed(state: GameState, speed: number): { state: GameState; effects: Effect[] } {
  if (state.clock.speed === speed) return { state, effects: [] };
  return {
    state: { ...state, clock: { ...state.clock, speed } },
    effects: [{ type: 'SET_SPEED', speed }],
  };
}
