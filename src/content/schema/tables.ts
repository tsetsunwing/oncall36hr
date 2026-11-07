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
import { consequenceSchema, resultSchema } from './m3Tables';
import {
  callOrSbarSchema,
  consultDepartmentSchema,
  delegationResultSchema,
  difficultyProfileSchema,
  rankBehaviourSchema,
  rankComplexitySchema,
  scoringRuleSchema,
  subordinateSchema,
  wardLayoutSchema,
} from './m4Tables';
import { familyScenarioSchema } from './familyTables';
import { aclsTransitionSchema, deathProcessSchema } from './m5Tables';
import { endingTagSchema, energyModelSchema, roundTopicSchema, selfCareSchema } from './m6Tables';

/**
 * implementation-plan §5：T1–T29 為陣列型內容表（T30 config 另有 schema）。
 * M2 收緊咗 T1、T2、T3、T4、T5、T6、T8、T10、T14、T26；M3 收緊 T4／T5／T6 並加 T7、T11；M5 收緊 T9、T23；M6 收緊 T20、T21、T25、T29；M4b 收緊 T27；M4 收緊 T12、T13、T15、T16、T17、T18、T22（子集）、T24、T28；其餘表只驗證「存在、為陣列、每筆有唯一字串 id」，
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
  results: z.array(resultSchema),
  rhythms: z.array(rhythmSchema),
  'acls-transitions': z.array(aclsTransitionSchema),
  mews: z.array(mewsSchema),
  consequences: z.array(consequenceSchema),
  'difficulty-profiles': z.array(difficultyProfileSchema),
  'rank-complexity': z.array(rankComplexitySchema),
  'nurse-roster': z.array(nurseRosterEntrySchema),
  subordinates: z.array(subordinateSchema),
  'delegation-results': z.array(delegationResultSchema),
  'call-templates': z.array(callOrSbarSchema),
  'rank-behaviour': z.array(rankBehaviourSchema),
  'event-schedule-templates': looseRecords,
  'energy-config': z.array(energyModelSchema),
  'self-care-actions': z.array(selfCareSchema),
  'scoring-rules': z.array(scoringRuleSchema),
  'death-process': z.array(deathProcessSchema),
  'consult-departments': z.array(consultDepartmentSchema),
  'rounds-topics': z.array(roundTopicSchema),
  'quick-words': z.array(quickWordSchema),
  'family-scenarios': z.array(familyScenarioSchema),
  'ward-layout': z.array(wardLayoutSchema),
  endings: z.array(endingTagSchema),
} satisfies Record<TableName, z.ZodType<readonly ContentRecord[]>>;

export type Tables = { [K in TableName]: z.infer<(typeof tableSchemas)[K]> };
