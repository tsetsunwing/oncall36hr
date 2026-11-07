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
    gate: z
      .object({
        pharmacyName: z.string().min(1),
        maxConcerns: z.number().int().positive(),
        /** 把關 verdict 要玩家確認幾多次先放行（CONFIRM＝1；OBJECT＝堅持＋再確認＝2；spec §15.1） */
        insistRequired: z
          .object({
            CONFIRM: z.number().int().min(1).max(2),
            OBJECT: z.number().int().min(1).max(2),
          })
          .strict(),
      })
      .strict(),
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
        /** 護士資歷由難度決定（spec §4）；NEW 完全唔提醒、唔發 gate 請求 */
        nurseSeniorityByDifficulty: z
          .object({
            EASY: z.enum(['SENIOR', 'NORMAL', 'NEW']),
            MEDIUM: z.enum(['SENIOR', 'NORMAL', 'NEW']),
            HARD: z.enum(['SENIOR', 'NORMAL', 'NEW']),
          })
          .strict(),
        reliability: levelRecord(probability),
        speedMultiplier: levelRecord(positive),
        rankImpression: z
          .object({
            start: z.number(),
            min: z.number(),
            max: z.number(),
            /** 評價 ≥ warmMin 為 WARM；≤ coldMax 為 COLD；其餘 NEUTRAL（只喺 engine 內部換成態度標籤） */
            warmMin: z.number(),
            coldMax: z.number(),
          })
          .strict()
          .refine((v) => v.min <= v.start && v.start <= v.max, 'start 必須介乎 min 與 max 之間')
          .refine((v) => v.coldMax < v.warmMin, 'coldMax 必須細過 warmMin'),
      })
      .strict(),
    ward: z.object({ bedCount: z.number().int().positive() }).strict(),
    /** 電話量＝ baseCallsPerHour × 班次時數 × (1 ＋ T12 難度加幅)（spec §4） */
    phone: z
      .object({
        baseCallsPerHour: positive,
        firstCallAfterSec: z.number().int().min(0),
        laterDelaySec: z.number().int().positive(),
        maxDefers: z.number().int().min(0),
        expireSec: z
          .object({
            ROUTINE: z.number().int().positive(),
            URGENT: z.number().int().positive(),
            EMERGENCY: z.number().int().positive(),
          })
          .strict(),
        interruptPriorities: z.array(z.enum(['ROUTINE', 'URGENT', 'EMERGENCY'])),
        sbarMaxChars: z.number().int().positive(),
        transcriptLimit: z.number().int().positive(),
      })
      .strict(),
    /** 會診／上報嘅 SBAR 清單：AI 只抽出玩家講咗邊啲項目，清晰度由 engine 按呢份清單計 */
    consult: z
      .object({
        maxFollowups: z.number().int().min(0),
        followupMaxChars: z.number().int().positive(),
        maxQuotes: z.number().int().positive(),
        deptQuestionDepth: z.number().int().min(0),
        vitalTolerance: z
          .object({
            hr: positive,
            sbp: positive,
            dbp: positive,
            spo2: positive,
            rr: positive,
            temp: positive,
          })
          .strict(),
        items: z
          .array(
            z
              .object({
                id: z.string().min(1),
                part: z.enum(['S', 'B', 'A', 'R']),
                description: z.string().min(1),
              })
              .strict(),
          )
          .min(4),
        partAnyOf: z
          .object({
            S: z.array(z.string().min(1)).min(1),
            B: z.array(z.string().min(1)).min(1),
            A: z.array(z.string().min(1)).min(1),
            R: z.array(z.string().min(1)).min(1),
          })
          .strict(),
        askOrder: z.array(z.string().min(1)),
      })
      .strict()
      .superRefine((consult, ctx) => {
        const ids = new Set(consult.items.map((i) => i.id));
        if (ids.size !== consult.items.length) {
          ctx.addIssue({ code: 'custom', path: ['items'], message: 'SBAR 項目 id 重複' });
        }
        const partOf = new Map(consult.items.map((i) => [i.id, i.part] as const));
        for (const part of ['S', 'B', 'A', 'R'] as const) {
          for (const id of consult.partAnyOf[part]) {
            if (partOf.get(id) !== part) {
              ctx.addIssue({
                code: 'custom',
                path: ['partAnyOf', part],
                message: `${id} 唔屬於 ${part}`,
              });
            }
          }
        }
        for (const id of consult.askOrder) {
          if (!ids.has(id)) {
            ctx.addIssue({ code: 'custom', path: ['askOrder'], message: `未知項目 ${id}` });
          }
        }
      }),
    family: z.object({ maxTurns: z.number().int().positive() }).strict(),
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
