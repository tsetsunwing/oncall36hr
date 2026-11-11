import { z } from 'zod';

/**
 * 三張用試算表改的 CSV 表。同 JSON 表一齊經 validateContent 驗證，
 * 所以欄名打錯、數字不是數字、途徑空白，都會在 content:validate 就失敗。
 */
export const CSV_TABLE_NAMES = [
  'drug-class-effects',
  'drug-effect-overrides',
  'effect-categories',
] as const;

export type CsvTableName = (typeof CSV_TABLE_NAMES)[number];

const doseBandShape = {
  usualDoseMin: z.number(),
  usualDoseMax: z.number(),
  doseUnit: z.string().min(1),
  ordinaryRoutes: z.array(z.string().min(1)).min(1),
  deltaSbp: z.number(),
  deltaHr: z.number(),
  deltaRr: z.number(),
  deltaTempC: z.number(),
  note: z.string(),
};

export const classEffectRowSchema = z.object({
  id: z.string().min(1),
  classKey: z.string().min(1),
  ...doseBandShape,
});

/** 只有 ACTIVE 會生效；PROVISIONAL 係數值未核、暫不啟用。 */
export const overrideStatusSchema = z.enum(['ACTIVE', 'PROVISIONAL', 'EXAMPLE']);

export const drugOverrideRowSchema = z.object({
  id: z.string().min(1),
  drug: z.string().min(1),
  status: overrideStatusSchema,
  setsFlags: z.array(z.string().min(1)),
  ...doseBandShape,
});

export const effectCategoryRowSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  deltaSbp: z.number(),
  deltaHr: z.number(),
  deltaRr: z.number(),
  deltaTempC: z.number(),
  note: z.string(),
});

export const csvTableSchemas = {
  'drug-class-effects': z.array(classEffectRowSchema),
  'drug-effect-overrides': z.array(drugOverrideRowSchema),
  'effect-categories': z.array(effectCategoryRowSchema),
} satisfies Record<CsvTableName, z.ZodType<readonly { id: string }[]>>;
