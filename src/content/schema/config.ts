import { z } from 'zod';

const positive = z.number().positive();
const probability = z.number().min(0).max(1);
const levelRecord = <T extends z.ZodType>(value: T) =>
  z.object({ NOVICE: value, NORMAL: value, SENIOR: value }).strict();

export const configSchema = z
  .object({
    _note: z.string().optional(),
    clock: z
      .object({
        realSecondsPerGameMinuteAt1x: positive,
        speeds: z.array(z.number().nonnegative()).min(1),
        defaultSpeed: z.number().nonnegative(),
        cprSlowFactor: z.number().gt(0).lte(1),
        speedAfterCpr: z.number().positive(),
        speedAfterInterrupt: z.number().positive(),
      })
      .strict(),
    shifts: z
      .object({
        day: z
          .object({ startHour: z.number().int().min(0).max(23), regularSeconds: positive })
          .strict(),
        night: z
          .object({ startHour: z.number().int().min(0).max(23), regularSeconds: positive })
          .strict(),
        onCall: z
          .object({
            startHour: z.number().int().min(0).max(23),
            segmentHours: z.array(positive).length(3),
            regularSeconds: positive,
          })
          .strict(),
        overtimeSeconds: positive,
      })
      .strict(),
    rounds: z
      .object({
        hours: z.array(z.number().int().min(0).max(23)).min(1),
        suppressInterruptsDuringRound: z.boolean(),
        onCallRoundsTotal: z.number().int().positive(),
      })
      .strict(),
    meals: z
      .object({
        lunchHour: z.number().int().min(0).max(23),
        dinnerHour: z.number().int().min(0).max(23),
      })
      .strict(),
    vitals: z
      .object({
        sampleIntervalSeconds: positive,
        criticalSampleIntervalSeconds: positive,
        historyLimit: z.number().int().positive(),
        limits: z
          .object({
            hr: z.tuple([z.number(), z.number()]),
            sbp: z.tuple([z.number(), z.number()]),
            dbp: z.tuple([z.number(), z.number()]),
            spo2: z.tuple([z.number(), z.number()]),
            rr: z.tuple([z.number(), z.number()]),
            temp: z.tuple([z.number(), z.number()]),
          })
          .strict(),
      })
      .strict(),
    chat: z
      .object({
        maxLinesPerTurn: z.number().int().positive(),
        maxLineChars: z.number().int().positive(),
        recentLinesForContext: z.number().int().min(0),
        playerTextMaxChars: z.number().int().positive(),
        alertCooldownSeconds: z.number().int().min(0),
      })
      .strict(),
    orders: z.object({ maxActionsPerParse: z.number().int().positive() }).strict(),
    acls: z
      .object({ cycleSeconds: positive, minCyclesBeforeStop: z.number().int().min(0) })
      .strict(),
    ai: z
      .object({
        defaultBaseUrl: z.url(),
        defaultModel: z.string().min(1),
        requestTimeoutMs: positive,
        connectionTestTimeoutMs: positive,
        autoRepairRetries: z.number().int().min(0),
        parseTemperature: z.number().min(0).max(2),
        dialogueTemperature: z.number().min(0).max(2),
        contractVersion: z.string().min(1),
      })
      .strict(),
    saves: z
      .object({
        manualSlots: z.number().int().min(1),
        autoSlots: z.number().int().min(1),
        aiFailureSlots: z.number().int().min(1),
        autoSaveEveryGameMinutes: positive,
      })
      .strict(),
    difficulty: z
      .object({
        phoneVolumeUplift: z
          .object({ EASY: z.number(), MEDIUM: z.number(), HARD: z.number() })
          .strict(),
      })
      .strict(),
    staff: z
      .object({
        reliability: levelRecord(probability),
        speedMultiplier: levelRecord(positive),
        rankImpression: z
          .object({ start: z.number(), min: z.number(), max: z.number() })
          .strict()
          .refine((v) => v.min <= v.start && v.start <= v.max, 'start 必須介乎 min 與 max 之間'),
      })
      .strict(),
    ward: z.object({ bedCount: z.number().int().positive() }).strict(),
    ui: z
      .object({
        touchTargetMinPx: positive,
        maxFlashesPerSecond: z.number().int().min(0).max(3),
        tickIntervalMs: z.number().int().min(50).max(1000),
        monitor: z
          .object({ sweepSeconds: positive, targetFps: z.number().int().min(1).max(60) })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (!cfg.clock.speeds.includes(cfg.clock.defaultSpeed)) {
      ctx.addIssue({
        code: 'custom',
        path: ['clock', 'defaultSpeed'],
        message: '預設倍速必須在 speeds 內',
      });
    }
  });

export type GameConfig = z.infer<typeof configSchema>;
