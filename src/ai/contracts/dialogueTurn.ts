import { z } from 'zod';
import { getConfig } from '@/content';
import { DIALOGUE_SYSTEM } from '../prompts/system';
import { checkDialogueText } from '../guard/numeric';
import type { Contract } from './types';

export const DIALOGUE_KIND = 'dialogue.turn';

const abnormalSchema = z.object({
  key: z.string(),
  direction: z.enum(['LOW', 'HIGH']),
});

const beatSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ACK_ORDER'),
    speaker: z.literal('NURSE'),
    labelToken: z.string(),
    executor: z.enum(['NURSE', 'SUBORDINATE', 'PLAYER']).nullable(),
  }),
  z.object({
    type: z.literal('GATE_RECONFIRM'),
    speaker: z.enum(['NURSE', 'PHARMACY']),
    labelToken: z.string(),
  }),
  z.object({
    type: z.literal('REPORT_LAB_READY'),
    speaker: z.literal('NURSE'),
    labelToken: z.string(),
    abnormal: z.boolean(),
  }),
  z.object({
    type: z.literal('ORDER_CANCELLED'),
    speaker: z.literal('NURSE'),
    labelToken: z.string(),
  }),
  z.object({
    type: z.literal('REPORT_RESULT'),
    speaker: z.literal('NURSE'),
    labelToken: z.string(),
    tokens: z.array(z.string()),
    abnormal: z.array(abnormalSchema),
  }),
  z.object({
    type: z.literal('REPORT_STATUS'),
    speaker: z.literal('NURSE'),
    tokens: z.array(z.string()),
    abnormal: z.array(abnormalSchema),
  }),
  z.object({
    type: z.literal('ALERT_DETERIORATION'),
    speaker: z.literal('NURSE'),
    tokens: z.array(z.string()),
    abnormal: z.array(abnormalSchema),
  }),
  z.object({
    type: z.literal('PATIENT_SPEAKS'),
    speaker: z.literal('PATIENT'),
    symptoms: z.array(z.string()),
  }),
  z.object({ type: z.literal('ACK_CHAT'), speaker: z.literal('NURSE') }),
  z.object({
    type: z.literal('ASK_REPHRASE'),
    speaker: z.literal('NURSE'),
    reason: z.enum(['UNKNOWN_ORDER', 'UNSUPPORTED']),
  }),
]);

export const dialoguePromptSchema = z.object({
  patientId: z.string(),
  speakers: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      name: z.string(),
      tone: z.string().nullable(),
    }),
  ),
  addressed: z.array(z.string()),
  beats: z.array(beatSchema),
  allowedTokens: z.array(z.string()),
  recent: z.array(z.object({ speaker: z.string(), kind: z.string(), template: z.string() })),
  maxLines: z.number().int().positive(),
  maxLineChars: z.number().int().positive(),
});

export const dialogueLocalSchema = z.object({
  patientId: z.string(),
  speakerIds: z.array(z.string()),
  allowedTokens: z.array(z.string()),
  denyTerms: z.array(z.string()),
  frozenTokens: z.record(z.string(), z.string()),
  liveTokens: z.array(z.string()).optional(),
});

export const dialogueDataSchema = z.object({
  lines: z
    .array(
      z.object({
        speaker: z.string(),
        text: z.string(),
        tokens: z.array(z.string()).optional(),
      }),
    )
    .min(1),
});

export type DialoguePrompt = z.infer<typeof dialoguePromptSchema>;
export type DialogueLocal = z.infer<typeof dialogueLocalSchema>;
export type DialogueData = z.infer<typeof dialogueDataSchema>;

export const dialogueContract: Contract<DialoguePrompt, DialogueLocal, DialogueData> = {
  kind: DIALOGUE_KIND,
  promptSchema: dialoguePromptSchema,
  localSchema: dialogueLocalSchema,
  dataSchema: dialogueDataSchema,
  temperatureKey: 'dialogueTemperature',
  system: DIALOGUE_SYSTEM,
  guard(data, prompt, local) {
    const issues: string[] = [];
    const maxLines = Math.min(prompt.maxLines, getConfig().chat.maxLinesPerTurn);
    if (data.lines.length > maxLines) issues.push(`At most ${String(maxLines)} lines are allowed.`);
    const speakers = new Set(local.speakerIds);
    const rules = {
      allowedTokens: new Set(local.allowedTokens),
      denyTerms: local.denyTerms,
      maxChars: Math.min(prompt.maxLineChars, getConfig().chat.maxLineChars),
    };
    data.lines.forEach((line, index) => {
      const n = String(index + 1);
      if (!speakers.has(line.speaker)) {
        issues.push(`Line ${n}: speaker "${line.speaker}" is not one of the listed speakers.`);
      }
      for (const issue of checkDialogueText(line.text, rules)) {
        switch (issue) {
          case 'BARE_NUMBER':
            issues.push(
              `Line ${n}: contains a number. Never write digits or spelled-out numbers; use a {{token}} from allowedTokens.`,
            );
            break;
          case 'UNKNOWN_TOKEN':
            issues.push(`Line ${n}: uses a token that is not in allowedTokens.`);
            break;
          case 'DIAGNOSIS_LEAK':
            issues.push(`Line ${n}: names a diagnosis. Characters must not state a diagnosis.`);
            break;
          case 'TOO_LONG':
            issues.push(`Line ${n}: longer than ${String(rules.maxChars)} characters.`);
            break;
          case 'MALFORMED_TOKEN':
            issues.push(`Line ${n}: malformed {{token}}.`);
            break;
          case 'EMPTY':
            issues.push(`Line ${n}: empty.`);
            break;
        }
      }
    });
    return { issues };
  },
};
