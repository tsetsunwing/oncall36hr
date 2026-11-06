import { z } from 'zod';
import { getConfig } from '@/content';
import { checkDialogueText } from '../guard/numeric';
import { GATE_DANGER_SYSTEM, GATE_NURSE_SYSTEM, GATE_PHARMACY_SYSTEM } from '../prompts/system';
import type { Contract } from './types';

export const GATE_PHARMACY_KIND = 'gate.pharmacy';
export const GATE_NURSE_KIND = 'gate.nurse';
export const GATE_DANGER_KIND = 'gate.danger';

const CATEGORIES = [
  'ALLERGY',
  'INTERACTION',
  'DOSE_HIGH',
  'DOSE_LOW',
  'WRONG_ROUTE',
  'CONTRAINDICATION',
  'OTHER',
] as const;

const orderFactsSchema = z.object({
  label: z.string(),
  type: z.string(),
  drug: z
    .object({
      name: z.string(),
      drugClass: z.string(),
      allergyClasses: z.array(z.string()),
      dose: z.object({ value: z.number(), unit: z.string() }).nullable(),
      route: z.string().nullable(),
      typicalDose: z.unknown().nullable(),
      units: z.array(z.string()),
      routes: z.array(z.string()),
    })
    .nullable(),
});

const patientFactsSchema = z.object({
  age: z.number(),
  sex: z.string(),
  allergies: z.array(z.string()),
  currentDrugs: z.array(z.string()),
  reports: z.array(z.string()),
  vitals: z.object({
    hr: z.number(),
    sbp: z.number(),
    dbp: z.number(),
    spo2: z.number(),
    rr: z.number(),
    temp: z.number(),
  }),
  mews: z.number(),
});

export const gateReviewPromptSchema = z.object({
  role: z.enum(['PHARMACY', 'NURSE']),
  order: orderFactsSchema,
  patient: patientFactsSchema,
  concernCategories: z.array(z.enum(CATEGORIES)),
  maxConcerns: z.number().int().positive(),
  allowedTokens: z.array(z.string()),
  maxLineChars: z.number().int().positive(),
});

export const gateReviewLocalSchema = z.object({
  orderId: z.string(),
  patientId: z.string(),
  role: z.enum(['PHARMACY', 'NURSE']),
  nurseId: z.string().nullable(),
  allowedTokens: z.array(z.string()),
  frozenTokens: z.record(z.string(), z.string()),
  denyTerms: z.array(z.string()),
});

export const gateReviewDataSchema = z.object({
  verdict: z.enum(['OK', 'CONFIRM', 'OBJECT']),
  concerns: z.array(z.object({ category: z.enum(CATEGORIES), line: z.string() })).default([]),
  safety: z.object({ score: z.number().int().min(0).max(10), rationale: z.string() }).nullish(),
});

export type GateReviewPrompt = z.infer<typeof gateReviewPromptSchema>;
export type GateReviewLocal = z.infer<typeof gateReviewLocalSchema>;
export type GateReviewData = z.infer<typeof gateReviewDataSchema>;

function reviewGuard(data: GateReviewData, prompt: GateReviewPrompt, local: GateReviewLocal) {
  const issues: string[] = [];
  if (data.verdict === 'OK' && data.concerns.length > 0) {
    issues.push('verdict OK must have an empty concerns list.');
  }
  if (data.verdict !== 'OK' && data.concerns.length === 0) {
    issues.push(`verdict ${data.verdict} needs at least one concern.`);
  }
  const maxConcerns = Math.min(prompt.maxConcerns, getConfig().gate.maxConcerns);
  if (data.concerns.length > maxConcerns) {
    issues.push(`At most ${String(maxConcerns)} concerns are allowed.`);
  }
  const rules = {
    allowedTokens: new Set(local.allowedTokens),
    denyTerms: local.denyTerms,
    maxChars: Math.min(prompt.maxLineChars, getConfig().chat.maxLineChars),
  };
  data.concerns.forEach((concern, index) => {
    const n = String(index + 1);
    for (const issue of checkDialogueText(concern.line, rules)) {
      switch (issue) {
        case 'BARE_NUMBER':
          issues.push(
            `Concern ${n}: contains a number. Never write digits or spelled-out numbers; use a {{token}} from allowedTokens.`,
          );
          break;
        case 'UNKNOWN_TOKEN':
          issues.push(`Concern ${n}: uses a token that is not in allowedTokens.`);
          break;
        case 'DIAGNOSIS_LEAK':
          issues.push(`Concern ${n}: names a diagnosis.`);
          break;
        case 'TOO_LONG':
          issues.push(`Concern ${n}: longer than ${String(rules.maxChars)} characters.`);
          break;
        case 'MALFORMED_TOKEN':
          issues.push(`Concern ${n}: malformed {{token}}.`);
          break;
        case 'EMPTY':
          issues.push(`Concern ${n}: empty.`);
          break;
      }
    }
  });
  return { issues };
}

export const gatePharmacyContract: Contract<GateReviewPrompt, GateReviewLocal, GateReviewData> = {
  kind: GATE_PHARMACY_KIND,
  promptSchema: gateReviewPromptSchema,
  localSchema: gateReviewLocalSchema,
  dataSchema: gateReviewDataSchema,
  temperatureKey: 'dialogueTemperature',
  system: GATE_PHARMACY_SYSTEM,
  guard: reviewGuard,
};

export const gateNurseContract: Contract<GateReviewPrompt, GateReviewLocal, GateReviewData> = {
  kind: GATE_NURSE_KIND,
  promptSchema: gateReviewPromptSchema,
  localSchema: gateReviewLocalSchema,
  dataSchema: gateReviewDataSchema,
  temperatureKey: 'dialogueTemperature',
  system: GATE_NURSE_SYSTEM,
  guard: reviewGuard,
};

export const gateDangerPromptSchema = z.object({
  order: orderFactsSchema,
  patient: patientFactsSchema,
  concerns: z.array(z.object({ by: z.enum(['PHARMACY', 'NURSE']), category: z.enum(CATEGORIES) })),
  concernCategories: z.array(z.enum(CATEGORIES)),
});

export const gateDangerLocalSchema = z.object({ orderId: z.string(), patientId: z.string() });

/** AI 只評 LOW／MID／HIGH 同風險類別；後果有冇發生由 engine 擲骰決定 */
export const gateDangerDataSchema = z.object({
  danger: z.enum(['LOW', 'MID', 'HIGH']),
  category: z.enum(CATEGORIES),
  rationale: z.string().default(''),
});

export type GateDangerPrompt = z.infer<typeof gateDangerPromptSchema>;
export type GateDangerLocal = z.infer<typeof gateDangerLocalSchema>;
export type GateDangerData = z.infer<typeof gateDangerDataSchema>;

export const gateDangerContract: Contract<GateDangerPrompt, GateDangerLocal, GateDangerData> = {
  kind: GATE_DANGER_KIND,
  promptSchema: gateDangerPromptSchema,
  localSchema: gateDangerLocalSchema,
  dataSchema: gateDangerDataSchema,
  temperatureKey: 'parseTemperature',
  system: GATE_DANGER_SYSTEM,
  guard(data, prompt) {
    const issues: string[] = [];
    if (!prompt.concernCategories.includes(data.category)) {
      issues.push('category must be one of concernCategories.');
    }
    return { issues };
  },
};
