/**
 * Engine 只讀嘅設定子集。內容層 `GameConfig`（src/content）結構上可直接賦值畀呢個型別，
 * 所以 engine 唔使 import content，亦唔內置任何數字（implementation-plan §5 T30）。
 */
export interface EngineConfig {
  clock: {
    realSecondsPerGameMinuteAt1x: number;
    pauseWhileAiPending: boolean;
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
  drugEffect: {
    /** 實際藥效 ＝ 計算值 ×（1 ± jitter）；每張醫囑用 id 抽一次，同一存檔內唔變 */
    jitterFraction: number;
    /** 剩餘效應下限：貼近正常時藥效都起碼有呢個比例，唔會完全歸零 */
    residualFraction: number;
    /** 途徑 → 起效延遲（遊戲秒）。key 用藥單途徑 id（po／iv／im…）；冇途徑的醫囑用 0 */
    routeOnsetSec: Readonly<Record<string, number>>;
    /** 途徑 → 漸進時間（遊戲秒）；與 order-effects 本身的 ramp 取大者 */
    routeRampSec: Readonly<Record<string, number>>;
    /** 遞減效應：正常目標值；藥效按「現值距離這個值多遠」縮放 */
    normalTarget: Readonly<Record<'hr' | 'sbp' | 'dbp' | 'spo2' | 'rr' | 'temp', number>>;
    /** 遞減效應：極端值；到達 low／high 就 100% 藥效 */
    extremeAt: Readonly<
      Record<'hr' | 'sbp' | 'dbp' | 'spo2' | 'rr' | 'temp', Readonly<{ low: number; high: number }>>
    >;
  };
  chat: {
    maxLinesPerTurn: number;
    maxLineChars: number;
    recentLinesForContext: number;
    playerTextMaxChars: number;
    alertCooldownSeconds: number;
  };
  orders: {
    maxActionsPerParse: number;
    medicationAnchorHour: number;
    fixedMedicationHours: {
      Daily: readonly number[];
      BD: readonly number[];
      TDS: readonly number[];
      QID: readonly number[];
    };
  };
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
    day: { startHour: number; regularSeconds: number };
    night: { startHour: number; regularSeconds: number };
    onCall: { startHour: number; regularSeconds: number; segmentHours: readonly number[] };
    overtimeSeconds: number;
    overtimePenaltyStepSeconds: number;
  };
  rounds: {
    hours: readonly number[];
    suppressInterruptsDuringRound: boolean;
    onCallRoundsTotal: number;
    questionSeconds: number;
    revealSeconds: number;
    deferStepSeconds: number;
    arrestDeferMaxSeconds: number;
    hostRank: 'AC' | 'COS';
    questionMaxChars: number;
    hintMaxChars: number;
  };
  meals: { lunchHour: number; dinnerHour: number; windowSeconds: number };
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
