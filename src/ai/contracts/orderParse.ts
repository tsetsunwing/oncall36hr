import { z } from 'zod';
import { getConfig } from '@/content';
import type { Contract } from './types';
import { ORDER_PARSE_SYSTEM } from '../prompts/system';

export const ORDER_PARSE_KIND = 'order.parse';

const speakerSchema = z.object({
  id: z.string(),
  kind: z.string(),
  name: z.string(),
});

export const orderParsePromptSchema = z.object({
  text: z.string(),
  patientId: z.string(),
  speakers: z.array(speakerSchema),
  catalog: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      label: z.string(),
      aliases: z.array(z.string()),
      formularyId: z.string().nullable(),
      executors: z.array(z.string()),
    }),
  ),
  formulary: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      aliases: z.array(z.string()),
      units: z.array(z.string()),
      routes: z.array(z.string()),
    }),
  ),
  openOrders: z.array(z.object({ id: z.string(), catalogId: z.string() })),
});

export const orderParseLocalSchema = z.object({
  patientId: z.string(),
  playerText: z.string(),
  submittedAt: z.number().int(),
});

export const orderParseDataSchema = z.object({
  intent: z.enum(['ORDER', 'QUESTION', 'CHAT', 'CANCEL', 'DELEGATE', 'UNCLEAR']),
  addressee: z
    .object({ kind: z.string().optional(), id: z.string().nullable().optional() })
    .optional(),
  actions: z
    .array(
      z.object({
        catalogId: z.string(),
        executor: z.enum(['NURSE', 'SUBORDINATE', 'PLAYER']).nullish(),
        drug: z
          .object({
            formularyId: z.string().nullish(),
            dose: z.object({ value: z.number(), unit: z.string() }).nullish(),
            route: z.string().nullish(),
          })
          .nullish(),
      }),
    )
    .default([]),
  cancelTargets: z.array(z.string()).default([]),
});

export type OrderParsePrompt = z.infer<typeof orderParsePromptSchema>;
export type OrderParseLocal = z.infer<typeof orderParseLocalSchema>;
export type OrderParseData = z.infer<typeof orderParseDataSchema>;

export function numbersIn(text: string): number[] {
  return [...text.normalize('NFKC').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

export const orderParseContract: Contract<OrderParsePrompt, OrderParseLocal, OrderParseData> = {
  kind: ORDER_PARSE_KIND,
  promptSchema: orderParsePromptSchema,
  localSchema: orderParseLocalSchema,
  dataSchema: orderParseDataSchema,
  temperatureKey: 'parseTemperature',
  system: ORDER_PARSE_SYSTEM,
  guard(data, prompt, local) {
    const issues: string[] = [];
    const catalogIds = new Set(prompt.catalog.map((c) => c.id));
    const formulary = new Map(prompt.formulary.map((f) => [f.id, f]));
    const open = new Set(prompt.openOrders.map((o) => o.id));
    const spoken = numbersIn(local.playerText);
    const { maxActionsPerParse } = getConfig().orders;

    if (data.actions.length > maxActionsPerParse) {
      issues.push(`At most ${String(maxActionsPerParse)} actions are allowed.`);
    }
    for (const action of data.actions) {
      if (!catalogIds.has(action.catalogId)) {
        issues.push(`Unknown catalogId "${action.catalogId}". Use only ids from "catalog".`);
        continue;
      }
      const drug = action.drug;
      if (!drug) continue;
      if (drug.formularyId && !formulary.has(drug.formularyId)) {
        issues.push(`Unknown formularyId "${drug.formularyId}".`);
      }
      const entry = drug.formularyId ? formulary.get(drug.formularyId) : undefined;
      if (drug.dose) {
        if (!spoken.includes(drug.dose.value)) {
          issues.push(
            `Dose value ${String(drug.dose.value)} does not appear in the player's text. Copy numbers verbatim or set dose to null.`,
          );
        }
        if (entry && !entry.units.some((u) => u.toLowerCase() === drug.dose?.unit.toLowerCase())) {
          issues.push(`Unit "${drug.dose.unit}" is not valid for ${entry.id}.`);
        }
      }
    }
    for (const id of data.cancelTargets) {
      if (!open.has(id))
        issues.push(`cancelTargets contains "${id}" which is not in "openOrders".`);
    }
    return { issues };
  },
};
