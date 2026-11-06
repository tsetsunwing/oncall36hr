import { z } from 'zod';

export const SPEAKER_KINDS = ['PLAYER', 'NURSE', 'PATIENT', 'SYSTEM', 'PHARMACY'] as const;
export type SpeakerKind = (typeof SPEAKER_KINDS)[number];

export const speakerSchema = z
  .object({ kind: z.enum(SPEAKER_KINDS), id: z.string().min(1) })
  .strict();

/**
 * ChatLine（implementation-plan §4.10）。
 * 非玩家對白嘅 `template` 內嘅 {{token}} 於發言當刻由 engine 凍結值寫入 `tokenValues`（B3）。
 * PLAYER 行係玩家原文，永遠當純文字；SYSTEM 行嘅 `template` 係系統碼（由 UI 映射文字）。
 */
export const chatLineSchema = z
  .object({
    id: z.string().min(1),
    t: z.number().int().min(0),
    patientId: z.string().min(1),
    speaker: speakerSchema,
    template: z.string(),
    tokenValues: z.record(z.string(), z.string()),
    /** BEDSIDE＝床邊；PHONE＝電話（藥房把關），記入病人紀錄並標明來源（spec §9.3 Q60 A） */
    source: z.enum(['BEDSIDE', 'PHONE']),
    orderId: z.string().nullable(),
  })
  .strict();

export type ChatLine = z.infer<typeof chatLineSchema>;

export const presentSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['NURSE', 'PATIENT']),
    name: z.string().min(1),
    tone: z.string().nullable(),
    mentionKeys: z.array(z.string().min(1)),
  })
  .strict();

export type Present = z.infer<typeof presentSchema>;

export const chatThreadSchema = z
  .object({
    patientId: z.string().min(1),
    present: z.array(presentSchema),
    lines: z.array(chatLineSchema),
    visits: z.array(
      z
        .object({
          enteredAt: z.number().int().min(0),
          leftAt: z.number().int().min(0).nullable(),
          lineCountAtEnter: z.number().int().min(0),
          lineCountAtLeave: z.number().int().min(0).nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export type ChatThread = z.infer<typeof chatThreadSchema>;

/** SYSTEM 行嘅系統碼 */
export const SYSTEM_CODES = ['ARRIVE', 'LEAVE', 'VISIT_START'] as const;
