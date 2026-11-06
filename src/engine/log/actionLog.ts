import { z } from 'zod';

export const ACTION_LOG_KINDS = ['ORDER', 'EVENT'] as const;

/**
 * Action Log 條目（implementation-plan §4.9）。
 * Order 嘅狀態由 `state.orders[orderId].status` 即時映射；呢度只存 engine 凍結嘅結果文字同原因碼。
 * `resultText` 全部由 content 模板＋凍結 token 生成，唔係 AI 文字。
 */
export const actionLogEntrySchema = z
  .object({
    id: z.string().min(1),
    t: z.number().int().min(0),
    patientId: z.string().nullable(),
    kind: z.enum(ACTION_LOG_KINDS),
    orderId: z.string().nullable(),
    executor: z.string().nullable(),
    reasonCode: z.string().nullable(),
    resultText: z.string().nullable(),
    nurseNote: z.string().nullable(),
  })
  .strict();

export type ActionLogEntry = z.infer<typeof actionLogEntrySchema>;
