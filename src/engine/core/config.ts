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
    /** 搶救（CPR）結束後嘅倍速 */
    speedAfterCpr: number;
    /** 突發事件（電話、心臟停頓呼叫）令倍速回到呢個值；唔會取消 CPR 慢速 */
    speedAfterInterrupt: number;
  };
  acls: { cycleSeconds: number; minCyclesBeforeStop: number };
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
    reliability: Readonly<Record<'NOVICE' | 'NORMAL' | 'SENIOR', number>>;
    rankImpression: {
      start: number;
      min: number;
      max: number;
      warmMin: number;
      coldMax: number;
    };
  };
  shifts: {
    day: { regularSeconds: number };
    night: { regularSeconds: number };
    onCall: { regularSeconds: number; segmentHours: readonly number[] };
  };
  ward: { bedCount: number };
  phone: {
    baseCallsPerHour: number;
    firstCallAfterSec: number;
    laterDelaySec: number;
    maxDefers: number;
    expireSec: Readonly<Record<'ROUTINE' | 'URGENT' | 'EMERGENCY', number>>;
    interruptPriorities: readonly ('ROUTINE' | 'URGENT' | 'EMERGENCY')[];
    sbarMaxChars: number;
    transcriptLimit: number;
  };
  consult: {
    maxFollowups: number;
    followupMaxChars: number;
    maxQuotes: number;
    deptQuestionDepth: number;
    vitalTolerance: Readonly<Record<'hr' | 'sbp' | 'dbp' | 'spo2' | 'rr' | 'temp', number>>;
    items: readonly { id: string; part: 'S' | 'B' | 'A' | 'R'; description: string }[];
    partAnyOf: Readonly<Record<'S' | 'B' | 'A' | 'R', readonly string[]>>;
    askOrder: readonly string[];
  };
  family: { maxTurns: number };
}
