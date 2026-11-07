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
    speedAfterCpr: 1,
    speedAfterInterrupt: 1,
  },
  acls: { cycleSeconds: 120, minCyclesBeforeStop: 3 },
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
  gate: { pharmacyName: '藥房', maxConcerns: 3, insistRequired: { CONFIRM: 1, OBJECT: 2 } },
  staff: {
    nurseSeniorityByDifficulty: { EASY: 'SENIOR', MEDIUM: 'NORMAL', HARD: 'NEW' },
    speedMultiplier: { NOVICE: 1.5, NORMAL: 1, SENIOR: 0.8 },
    reliability: { NOVICE: 0.7, NORMAL: 0.85, SENIOR: 0.95 },
    rankImpression: { start: 50, min: 0, max: 100, warmMin: 65, coldMax: 35 },
  },
  shifts: {
    day: { regularSeconds: 36000 },
    night: { regularSeconds: 50400 },
    onCall: { regularSeconds: 122400, segmentHours: [10, 14, 10] },
  },
  ward: { bedCount: 20 },
  phone: {
    baseCallsPerHour: 2,
    firstCallAfterSec: 600,
    laterDelaySec: 600,
    maxDefers: 2,
    expireSec: { ROUTINE: 3600, URGENT: 1500, EMERGENCY: 600 },
    interruptPriorities: ['URGENT', 'EMERGENCY'],
    sbarMaxChars: 200,
    transcriptLimit: 40,
  },
  consult: {
    maxFollowups: 2,
    followupMaxChars: 200,
    maxQuotes: 8,
    deptQuestionDepth: 1,
    vitalTolerance: { hr: 10, sbp: 15, dbp: 10, spo2: 3, rr: 3, temp: 0.6 },
    items: [
      { id: 'S.PATIENT', part: 'S', description: 'Identifies which patient.' },
      { id: 'S.PROBLEM', part: 'S', description: 'States the current problem.' },
      { id: 'B.HISTORY', part: 'B', description: 'Gives the presenting complaint.' },
      { id: 'B.ALLERGY', part: 'B', description: 'States the allergy status.' },
      { id: 'B.TREATMENT', part: 'B', description: 'Says what has been done.' },
      { id: 'A.VITALS', part: 'A', description: 'Quotes current vital signs.' },
      { id: 'A.IMPRESSION', part: 'A', description: 'Gives own assessment.' },
      { id: 'R.REQUEST', part: 'R', description: 'Makes a clear request.' },
    ],
    partAnyOf: {
      S: ['S.PROBLEM'],
      B: ['B.HISTORY', 'B.ALLERGY', 'B.TREATMENT'],
      A: ['A.VITALS', 'A.IMPRESSION'],
      R: ['R.REQUEST'],
    },
    askOrder: [
      'R.REQUEST',
      'S.PROBLEM',
      'A.VITALS',
      'B.ALLERGY',
      'B.TREATMENT',
      'A.IMPRESSION',
      'B.HISTORY',
      'S.PATIENT',
    ],
  },
  family: { maxTurns: 3 },
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
