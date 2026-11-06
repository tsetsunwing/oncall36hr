/**
 * 遊戲時鐘（implementation-plan §8.1）。
 * 時間單位：遊戲秒（整數 `t`）＋ 小數進度 `frac`（[0,1)）。
 * TICK 帶嘅係真實毫秒；換算由 engine 負責，所以暫停、倍速、CPR 慢速都係 engine 嘅確定性行為。
 */
import type { EngineConfig } from './config';
import type { GameState } from './state';

/** 每真實毫秒推進幾多遊戲秒；暫停時為 0 */
export function gameSecondsPerRealMs(
  config: EngineConfig,
  state: Pick<GameState, 'clock' | 'paused'>,
): number {
  if (state.paused) return 0;
  const baseAt1x = 60 / (config.clock.realSecondsPerGameMinuteAt1x * 1000);
  // CPR 期間有效速率固定為 1 倍嘅 cprSlowFactor，無視玩家倍速（S-3 A）
  const multiplier = state.clock.cprSlow ? config.clock.cprSlowFactor : state.clock.speed;
  return baseAt1x * multiplier;
}
