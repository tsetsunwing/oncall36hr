/**
 * T27 family-scenarios（M4b）：致電家屬嘅四選一選項同 engine 結果標籤。
 * 每個選項／自由輸入都只係一組「訊號」；清晰度、同理心由 engine 按訊號計，AI 只負責抽訊號同措辭。
 */
import { z } from 'zod';

const id = z.string().min(1);
const reviewStatus = z.enum(['PENDING_CLINICAL_REVIEW', 'REVIEWED']);

export const FAMILY_SIGNALS = [
  'STATES_DEATH',
  'HINTS_SERIOUS',
  'CONDOLENCE',
  'OFFERS_SUPPORT',
  'EXPLAINS_EVENTS',
  'BLUNT_OR_COLD',
  'JARGON',
] as const;
export const FAMILY_REACTIONS = ['CONFUSED', 'SHOCK', 'GRIEF', 'ANGER'] as const;
export const FAMILY_ASKS = ['NONE', 'WHAT_IS_WRONG', 'WHAT_HAPPENED', 'WHEN_CAN_VISIT'] as const;

const optionSchema = z
  .object({
    id,
    /** 按鈕文字（書面語） */
    label: z.string().min(1),
    /** 醫生實際講嘅說話（粵語，含 {{token}}） */
    line: z.string().min(1),
    signals: z.array(z.enum(FAMILY_SIGNALS)),
  })
  .strict();

const ruleOrNull = z.string().min(1).nullable();

export const familyScenarioSchema = z
  .object({
    id,
    kind: z.literal('SCENARIO'),
    topic: z.enum(['DEATH_NOTIFICATION']),
    calleeName: z.string().min(1),
    pickup: z.string().min(1),
    closing: z.string().min(1),
    stages: z
      .object({
        OPENING: z.array(optionSchema).min(1),
        FOLLOWUP: z.array(optionSchema).min(1),
      })
      .strict(),
    reactions: z
      .array(
        z
          .object({
            informed: z.boolean(),
            empathy: z.number().int().min(0).max(2),
            reaction: z.enum(FAMILY_REACTIONS),
            asks: z.enum(FAMILY_ASKS),
          })
          .strict(),
      )
      .min(1),
    scoring: z
      .object({
        empathy: z.tuple([ruleOrNull, ruleOrNull, ruleOrNull]),
        clarity: z.tuple([ruleOrNull, ruleOrNull, ruleOrNull]),
      })
      .strict(),
    reviewStatus,
    note: z.string(),
  })
  .strict();
