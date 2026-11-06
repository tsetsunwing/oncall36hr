import { z } from 'zod';

/**
 * implementation-plan §5：T1–T29 為陣列型內容表（T30 config 另有 schema）。
 * M0 只驗證「每張表存在、為陣列、每筆有唯一字串 id」；各表的欄位 schema 於對應 milestone 逐張收緊。
 */
export const TABLE_NAMES = [
  'case-templates',
  'case-fsm',
  'trajectories',
  'order-catalog',
  'formulary',
  'order-effects',
  'results',
  'rhythms',
  'acls-transitions',
  'mews',
  'consequences',
  'difficulty-profiles',
  'rank-complexity',
  'nurse-roster',
  'subordinates',
  'delegation-results',
  'call-templates',
  'rank-behaviour',
  'event-schedule-templates',
  'energy-config',
  'self-care-actions',
  'scoring-rules',
  'death-process',
  'consult-departments',
  'rounds-topics',
  'quick-words',
  'family-scenarios',
  'ward-layout',
  'endings',
] as const;

export type TableName = (typeof TABLE_NAMES)[number];

export const baseRecordSchema = z.object({ id: z.string().min(1) }).loose();
export type ContentRecord = z.infer<typeof baseRecordSchema>;

const recordsSchema = z.array(baseRecordSchema);

export const tableSchemas: Record<TableName, typeof recordsSchema> = Object.fromEntries(
  TABLE_NAMES.map((name) => [name, recordsSchema]),
) as Record<TableName, typeof recordsSchema>;
