import { z } from 'zod';

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
