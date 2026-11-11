import { z } from 'zod';
import { ORDER_EFFECT_SYSTEM } from '../prompts/system';
import type { Contract } from './types';

export const ORDER_EFFECT_KIND = 'order.effect';

const categorySchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();

export const orderEffectPromptSchema = z
  .object({
    text: z.string(),
    drugName: z.string(),
    dose: z.object({ value: z.number(), unit: z.string() }).strict().nullable(),
    route: z.string().nullable(),
    classes: z.array(z.string()),
    categories: z.array(categorySchema).min(1),
  })
  .strict();

export const orderEffectLocalSchema = z
  .object({
    orderId: z.string().min(1),
    patientId: z.string().min(1),
  })
  .strict();

export const orderEffectDataSchema = z
  .object({
    effectCategory: z.string().min(1),
  })
  .strict();

export type OrderEffectPrompt = z.infer<typeof orderEffectPromptSchema>;
export type OrderEffectLocal = z.infer<typeof orderEffectLocalSchema>;
export type OrderEffectData = z.infer<typeof orderEffectDataSchema>;

export const orderEffectContract: Contract<OrderEffectPrompt, OrderEffectLocal, OrderEffectData> = {
  kind: ORDER_EFFECT_KIND,
  promptSchema: orderEffectPromptSchema,
  localSchema: orderEffectLocalSchema,
  dataSchema: orderEffectDataSchema,
  temperatureKey: 'parseTemperature',
  system: ORDER_EFFECT_SYSTEM,
  guard(data, prompt) {
    const ids = new Set(prompt.categories.map((item) => item.id));
    if (!ids.has(data.effectCategory)) {
      return {
        issues: [
          `effectCategory "${data.effectCategory}" is not in categories. Return only one listed id.`,
        ],
      };
    }
    return { issues: [] };
  },
};
