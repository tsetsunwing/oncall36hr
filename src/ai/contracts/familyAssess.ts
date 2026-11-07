import { z } from 'zod';
import { FAMILY_ASSESS_SYSTEM } from '../prompts/system';
import type { Contract } from './types';

export const FAMILY_ASSESS_KIND = 'family.assess';

export const FAMILY_SIGNALS = [
  'STATES_DEATH',
  'HINTS_SERIOUS',
  'CONDOLENCE',
  'OFFERS_SUPPORT',
  'EXPLAINS_EVENTS',
  'BLUNT_OR_COLD',
  'JARGON',
] as const;

const WARM = ['CONDOLENCE', 'OFFERS_SUPPORT', 'EXPLAINS_EVENTS'];
export const MAX_FAMILY_SIGNALS = 5;

export const familyAssessPromptSchema = z.object({
  stage: z.enum(['OPENING', 'FOLLOWUP']),
  text: z.string(),
});

export const familyAssessLocalSchema = z.object({ text: z.string() });

export const familyAssessDataSchema = z.object({ signals: z.array(z.enum(FAMILY_SIGNALS)) });

export type FamilyAssessPrompt = z.infer<typeof familyAssessPromptSchema>;
export type FamilyAssessLocal = z.infer<typeof familyAssessLocalSchema>;
export type FamilyAssessData = z.infer<typeof familyAssessDataSchema>;

export const familyAssessContract: Contract<
  FamilyAssessPrompt,
  FamilyAssessLocal,
  FamilyAssessData
> = {
  kind: FAMILY_ASSESS_KIND,
  promptSchema: familyAssessPromptSchema,
  localSchema: familyAssessLocalSchema,
  dataSchema: familyAssessDataSchema,
  temperatureKey: 'parseTemperature',
  system: FAMILY_ASSESS_SYSTEM,
  guard(data) {
    const issues: string[] = [];
    const { signals } = data;
    if (new Set(signals).size !== signals.length) issues.push('Do not repeat a signal.');
    if (signals.length > MAX_FAMILY_SIGNALS) {
      issues.push(`At most ${String(MAX_FAMILY_SIGNALS)} signals are allowed.`);
    }
    if (signals.includes('BLUNT_OR_COLD') && signals.some((s) => WARM.includes(s))) {
      issues.push(
        'BLUNT_OR_COLD cannot be combined with CONDOLENCE, OFFERS_SUPPORT or EXPLAINS_EVENTS.',
      );
    }
    if (signals.includes('STATES_DEATH') && signals.includes('HINTS_SERIOUS')) {
      issues.push('Use STATES_DEATH or HINTS_SERIOUS, not both.');
    }
    return { issues };
  },
};
