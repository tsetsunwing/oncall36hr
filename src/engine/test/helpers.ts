import { createEngine, type EngineOptions } from '../core/reducer';
import type { EngineConfig } from '../core/config';
import type { EngineEvent, PlayerIntent } from '../core/events';
import type { NewGameParams } from '../core/state';

/** 同 content/config/config.json 嘅 C3 B 預設一致：1 遊戲分鐘 ＝ 2 真實秒（@1x） */
export const testConfig: EngineConfig = {
  clock: {
    realSecondsPerGameMinuteAt1x: 2,
    speeds: [0, 1, 2, 4],
    defaultSpeed: 1,
    cprSlowFactor: 0.5,
  },
  saves: { manualSlots: 5, autoSaveEveryGameMinutes: 30 },
  vitals: {
    sampleIntervalSeconds: 60,
    criticalSampleIntervalSeconds: 10,
    historyLimit: 240,
    limits: {
      hr: [20, 240],
      sbp: [40, 260],
      dbp: [20, 160],
      spo2: [50, 100],
      rr: [4, 50],
      temp: [34, 42],
    },
  },
  chat: {
    maxLinesPerTurn: 4,
    maxLineChars: 140,
    recentLinesForContext: 8,
    playerTextMaxChars: 200,
    alertCooldownSeconds: 600,
  },
  orders: { maxActionsPerParse: 3 },
};

export const newGame: NewGameParams = {
  seed: 'seed-A',
  mode: 'NIGHT',
  difficulty: 'MEDIUM',
  playerRank: 'MO',
};

export function makeEngine(options?: EngineOptions) {
  return createEngine(testConfig, options);
}

export const tick = (dtRealMs: number): EngineEvent => ({ type: 'TICK', dtRealMs });
export const intent = (i: PlayerIntent): EngineEvent => ({ type: 'PLAYER_INTENT', intent: i });
export const placeOrder = (durationSec: number, catalogId = 'lab.cbc'): EngineEvent =>
  intent({ type: 'PLACE_ORDER', patientId: 'p1', catalogId, durationSec });
