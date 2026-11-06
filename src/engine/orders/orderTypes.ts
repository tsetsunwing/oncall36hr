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
      })
      .strict(),
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
