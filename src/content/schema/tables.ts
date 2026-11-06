import { z } from 'zod';
import {
  caseFsmSchema,
  caseTemplateSchema,
  formularyEntrySchema,
  mewsSchema,
  nurseRosterEntrySchema,
  orderCatalogEntrySchema,
  orderEffectSchema,
  quickWordSchema,
  rhythmSchema,
  trajectorySchema,
} from './m2Tables';

/**
 * implementation-plan §5：T1–T29 為陣列型內容表（T30 config 另有 schema）。
 * M2 收緊咗 T1、T2、T3、T4、T5、T6、T8、T10、T14、T26；其餘表只驗證「存在、為陣列、每筆有唯一字串 id」，
 * 於對應 milestone 逐張收緊。
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

const looseRecords = z.array(baseRecordSchema);

export const tableSchemas = {
  'case-templates': z.array(caseTemplateSchema),
  'case-fsm': z.array(caseFsmSchema),
  trajectories: z.array(trajectorySchema),
  'order-catalog': z.array(orderCatalogEntrySchema),
  formulary: z.array(formularyEntrySchema),
  'order-effects': z.array(orderEffectSchema),
  results: looseRecords,
  rhythms: z.array(rhythmSchema),
  'acls-transitions': looseRecords,
  mews: z.array(mewsSchema),
  consequences: looseRecords,
  'difficulty-profiles': looseRecords,
  'rank-complexity': looseRecords,
  'nurse-roster': z.array(nurseRosterEntrySchema),
  subordinates: looseRecords,
  'delegation-results': looseRecords,
  'call-templates': looseRecords,
  'rank-behaviour': looseRecords,
  'event-schedule-templates': looseRecords,
  'energy-config': looseRecords,
  'self-care-actions': looseRecords,
  'scoring-rules': looseRecords,
  'death-process': looseRecords,
  'consult-departments': looseRecords,
  'rounds-topics': looseRecords,
  'quick-words': z.array(quickWordSchema),
  'family-scenarios': looseRecords,
  'ward-layout': looseRecords,
  endings: looseRecords,
} satisfies Record<TableName, z.ZodType<readonly ContentRecord[]>>;

export type Tables = { [K in TableName]: z.infer<(typeof tableSchemas)[K]> };
