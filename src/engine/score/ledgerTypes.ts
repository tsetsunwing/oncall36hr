/**
 * 唯一計分 ledger（M7）：六個分項共用一條只增不減嘅事件列表；冇總分、冇倍數（spec §17）。
 * `rule` 指向 scoring-rules（T22），幅度只喺 content；`evidenceRef` 指向引發事件嘅來源，供回顧重建。
 */
import { z } from 'zod';

export const SUBSCORE_IDS = [
  'CLINICAL_OUTCOME',
  'TIMELINESS',
  'SAFETY',
  'COMMUNICATION',
  'PRIORITISATION',
  'SELF_CARE',
] as const;
export type SubscoreCode = (typeof SUBSCORE_IDS)[number];

export const ledgerEntrySchema = z
  .object({
    id: z.string().min(1),
    t: z.number().int().min(0),
    subscore: z.enum(SUBSCORE_IDS),
    rule: z.string().min(1),
    delta: z.number(),
    patientId: z.string().nullable(),
    callId: z.string().nullable(),
    /** 例：order:o3、call:c2、round:1、gate:o4；回顧用嚟連結事件，唔係顯示文字 */
    evidenceRef: z.string().nullable(),
    /** engine 事實（延遲秒數、時間窗、order id 等）：回顧重建「如果早做」用，唔含 AI 文字 */
    facts: z.record(z.string(), z.union([z.number(), z.string()])),
  })
  .strict();

export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
