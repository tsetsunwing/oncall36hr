import { z } from 'zod';
import { gateRecordSchema } from '../gate/gateTypes';

export const ORDER_STATUSES = [
  'PENDING_PARSE',
  'GATED',
  'QUEUED',
  'RUNNING',
  'DONE',
  'CANCELLED',
  'FAILED',
] as const;

export const orderSchema = z
  .object({
    id: z.string().min(1),
    patientId: z.string().min(1),
    catalogId: z.string().min(1),
    createdAt: z.number().int().min(0),
    startsAt: z.number().int().min(0),
    completesAt: z.number().int().min(0),
    status: z.enum(ORDER_STATUSES),
    source: z.enum(['MANUAL', 'QUICKWORD', 'AI_PARSED']),
    params: z
      .object({
        drugFormularyId: z.string().nullable(),
        dose: z.object({ value: z.number(), unit: z.string() }).strict().nullable(),
        route: z.string().nullable(),
        /** 彈窗填嘅頻次，例如 stat、TDS、Q4H。舊存檔冇呢欄。 */
        frequency: z.string().min(1).optional(),
        /** x1–x3。舊存檔冇呢欄。 */
        times: z.number().int().min(1).max(3).optional(),
        /** 輸液速率。舊存檔冇呢欄。 */
        rate: z.object({ value: z.number(), unit: z.string() }).strict().optional(),
        /** 未收錄藥物的顯示藥名。舊存檔冇呢欄。目錄醫囑不用。 */
        drugName: z.string().min(1).optional(),
        /** 選單寫下的短標籤。有這欄時行動記錄與護士確認用它，不用目錄長名。舊存檔沒有。 */
        summary: z.string().min(1).optional(),
      })
      .strict(),
    /**
     * 類別表或效果類別加在狀態機基線上的變化。
     * 只含收縮壓、心率、呼吸、體溫。舊存檔冇呢欄。
     */
    effectPreset: z
      .object({
        sbp: z.number(),
        hr: z.number(),
        rr: z.number(),
        temp: z.number(),
      })
      .strict()
      .optional(),
    executor: z.string().nullable(),
    executorKind: z.enum(['NURSE', 'SUBORDINATE', 'PLAYER']).nullable(),
    /** 取消時間；KEEP_PARTIAL 按（取消－開始）／總時長保留效果 */
    cancelledAt: z.number().int().min(0).nullable(),
    /** 化驗／檢查：PENDING＝已完成採樣／拍攝，等報告；REPORTED＝報告已出 */
    resultStatus: z.enum(['PENDING', 'REPORTED']).nullable(),
    /** 採樣當刻嘅 case FSM 狀態：報告內容按呢個狀態查 T7（報告出嚟時病情可能已變） */
    sampledState: z.string().nullable(),
    gate: gateRecordSchema.nullable(),
  })
  .strict();

export type Order = z.infer<typeof orderSchema>;
export type OrderStatus = Order['status'];

/** 仍然可以取消嘅狀態（S-6：暫停時亦可取消） */
export const CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  'PENDING_PARSE',
  'GATED',
  'QUEUED',
  'RUNNING',
];
