/**
 * Engine 只讀嘅設定子集。內容層 `GameConfig`（src/content）結構上可直接賦值畀呢個型別，
 * 所以 engine 唔使 import content，亦唔內置任何數字（implementation-plan §5 T30）。
 */
export interface EngineConfig {
  clock: {
    realSecondsPerGameMinuteAt1x: number;
    speeds: readonly number[];
    defaultSpeed: number;
    cprSlowFactor: number;
  };
  saves: {
    manualSlots: number;
    autoSaveEveryGameMinutes: number;
  };
  vitals: {
    sampleIntervalSeconds: number;
    criticalSampleIntervalSeconds: number;
    historyLimit: number;
    limits: Readonly<
      Record<'hr' | 'sbp' | 'dbp' | 'spo2' | 'rr' | 'temp', readonly [number, number]>
    >;
  };
  chat: {
    maxLinesPerTurn: number;
    maxLineChars: number;
    recentLinesForContext: number;
    playerTextMaxChars: number;
    alertCooldownSeconds: number;
  };
  orders: { maxActionsPerParse: number };
  gate: {
    pharmacyName: string;
    maxConcerns: number;
    insistRequired: { CONFIRM: number; OBJECT: number };
  };
  staff: {
    nurseSeniorityByDifficulty: Readonly<
      Record<'EASY' | 'MEDIUM' | 'HARD', 'SENIOR' | 'NORMAL' | 'NEW'>
    >;
    speedMultiplier: Readonly<Record<'NOVICE' | 'NORMAL' | 'SENIOR', number>>;
  };
}
