import { z } from 'zod';

export const prioritySchema = z
  .object({
    /** 玩家最近一次處理（落 order、傾偈、入床、應電話）每個病人嘅遊戲秒 */
    lastAttended: z.record(z.string(), z.number().int().min(0)),
    /** 每個病人現時 MEWS 緊急度同由幾時開始（每次抽樣更新；0 即無警示會移除） */
    urgency: z.record(
      z.string(),
      z.object({ level: z.number().int().min(1), since: z.number().int().min(0) }).strict(),
    ),
  })
  .strict();

export type PriorityState = z.infer<typeof prioritySchema>;

export const emptyPriority = (): PriorityState => ({ lastAttended: {}, urgency: {} });
