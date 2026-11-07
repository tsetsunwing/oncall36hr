import { z } from 'zod';
import { CONSULT_ASSESS_SYSTEM } from '../prompts/system';
import type { Contract } from './types';

export const CONSULT_ASSESS_KIND = 'consult.assess';

const PARTS = ['S', 'B', 'A', 'R'] as const;
const VITAL_KEYS = ['hr', 'sbp', 'dbp', 'spo2', 'rr', 'temp'] as const;

export const consultAssessPromptSchema = z.object({
  mode: z.enum(['INITIAL', 'FOLLOWUP']),
  target: z.object({ kind: z.enum(['RANK', 'DEPT']), label: z.string() }),
  sbar: z.object({ S: z.string(), B: z.string(), A: z.string(), R: z.string() }),
  followup: z.string().nullable(),
  askedItems: z.array(z.string()),
  items: z.array(z.object({ id: z.string(), part: z.enum(PARTS), description: z.string() })),
  vitalKeys: z.array(z.enum(VITAL_KEYS)),
  maxQuotes: z.number().int().positive(),
});

export const consultAssessLocalSchema = z.object({
  mode: z.enum(['INITIAL', 'FOLLOWUP']),
  parts: z.object({ S: z.string(), B: z.string(), A: z.string(), R: z.string() }),
  followup: z.string().nullable(),
  playerText: z.string(),
});

export const consultAssessDataSchema = z.object({
  parts: z.object({
    S: z.array(z.string()),
    B: z.array(z.string()),
    A: z.array(z.string()),
    R: z.array(z.string()),
  }),
  quoted: z.array(z.object({ key: z.enum(VITAL_KEYS), value: z.number() })).default([]),
  tone: z.enum(['POLITE', 'NEUTRAL', 'RUDE']).default('NEUTRAL'),
});

export type ConsultAssessPrompt = z.infer<typeof consultAssessPromptSchema>;
export type ConsultAssessLocal = z.infer<typeof consultAssessLocalSchema>;
export type ConsultAssessData = z.infer<typeof consultAssessDataSchema>;

function numbersIn(text: string): number[] {
  return [...text.normalize('NFKC').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

export const consultAssessContract: Contract<
  ConsultAssessPrompt,
  ConsultAssessLocal,
  ConsultAssessData
> = {
  kind: CONSULT_ASSESS_KIND,
  promptSchema: consultAssessPromptSchema,
  localSchema: consultAssessLocalSchema,
  dataSchema: consultAssessDataSchema,
  temperatureKey: 'parseTemperature',
  system: CONSULT_ASSESS_SYSTEM,
  guard(data, prompt, local) {
    const issues: string[] = [];
    const partOf = new Map(prompt.items.map((item) => [item.id, item.part] as const));
    for (const part of PARTS) {
      const text = local.mode === 'FOLLOWUP' ? (local.followup ?? '') : local.parts[part];
      for (const id of data.parts[part]) {
        if (partOf.get(id) !== part) {
          issues.push(
            `Item "${id}" does not belong to part ${part}; use only ids listed under that part.`,
          );
        } else if (text.trim().length === 0) {
          issues.push(`Part ${part} is empty in the player's text, so it cannot cover "${id}".`);
        }
      }
    }
    if (data.quoted.length > prompt.maxQuotes) {
      issues.push(`At most ${String(prompt.maxQuotes)} quoted values are allowed.`);
    }
    const spoken = numbersIn(local.playerText);
    for (const quote of data.quoted) {
      if (!spoken.includes(quote.value)) {
        issues.push(
          `Quoted value ${String(quote.value)} for "${quote.key}" does not appear verbatim in the player's text. Never invent, convert or correct numbers.`,
        );
      }
    }
    return { issues };
  },
};
