import { z } from 'zod';
import { checkDialogueText } from '../guard/numeric';
import { CONSULT_REPLY_SYSTEM, FAMILY_REPLY_SYSTEM } from '../prompts/system';
import type { Contract } from './types';

export const CONSULT_REPLY_KIND = 'consult.reply';
export const FAMILY_REPLY_KIND = 'family.reply';

const calleeSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['RANK', 'DEPT', 'FAMILY']),
  rank: z.string().nullable(),
  attitude: z.enum(['WARM', 'NEUTRAL', 'COLD']).nullable(),
});

const replyBase = {
  callee: calleeSchema,
  doctorSaid: z.string(),
  allowedTokens: z.array(z.string()),
  maxLines: z.number().int().positive(),
  maxLineChars: z.number().int().positive(),
};

const consultBeatSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('OUTCOME'),
    outcome: z.enum(['REFUSE', 'ADVICE', 'BEDSIDE', 'ICU_ASSESS', 'DEATH_ACK']),
    attitude: z.enum(['WARM', 'NEUTRAL', 'COLD']).nullable(),
    etaToken: z.string().nullable(),
    changed: z.boolean(),
  }),
  z.object({
    type: z.literal('ASK_MISSING'),
    items: z.array(z.object({ id: z.string(), description: z.string() })),
  }),
]);

const familyBeatSchema = z.object({
  type: z.literal('FAMILY_REACT'),
  stage: z.enum(['OPENING', 'FOLLOWUP']),
  informed: z.boolean(),
  reaction: z.enum(['CONFUSED', 'SHOCK', 'GRIEF', 'ANGER']),
  asks: z.enum(['NONE', 'WHAT_IS_WRONG', 'WHAT_HAPPENED', 'WHEN_CAN_VISIT']),
  closing: z.boolean(),
});

export const consultReplyPromptSchema = z.object({
  ...replyBase,
  beats: z.array(consultBeatSchema).min(1),
});
export const familyReplyPromptSchema = z.object({
  ...replyBase,
  beats: z.array(familyBeatSchema).min(1),
});

export const calleeReplyLocalSchema = z.object({
  speakerId: z.string(),
  allowedTokens: z.array(z.string()),
  denyTerms: z.array(z.string()),
});

export const calleeReplyDataSchema = z.object({
  lines: z.array(z.object({ speaker: z.string(), text: z.string() })).min(1),
});

export type ConsultReplyPrompt = z.infer<typeof consultReplyPromptSchema>;
export type FamilyReplyPrompt = z.infer<typeof familyReplyPromptSchema>;
export type CalleeReplyLocal = z.infer<typeof calleeReplyLocalSchema>;
export type CalleeReplyData = z.infer<typeof calleeReplyDataSchema>;

function guardReply(
  data: CalleeReplyData,
  prompt: { maxLines: number; maxLineChars: number },
  local: CalleeReplyLocal,
): { issues: string[] } {
  const issues: string[] = [];
  if (data.lines.length > prompt.maxLines) {
    issues.push(`At most ${String(prompt.maxLines)} lines are allowed.`);
  }
  const rules = {
    allowedTokens: new Set(local.allowedTokens),
    denyTerms: local.denyTerms,
    maxChars: prompt.maxLineChars,
  };
  data.lines.forEach((line, index) => {
    const n = String(index + 1);
    if (line.speaker !== local.speakerId) {
      issues.push(`Line ${n}: speaker must be exactly "${local.speakerId}".`);
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
}

export const consultReplyContract: Contract<ConsultReplyPrompt, CalleeReplyLocal, CalleeReplyData> =
  {
    kind: CONSULT_REPLY_KIND,
    promptSchema: consultReplyPromptSchema,
    localSchema: calleeReplyLocalSchema,
    dataSchema: calleeReplyDataSchema,
    temperatureKey: 'dialogueTemperature',
    system: CONSULT_REPLY_SYSTEM,
    guard: guardReply,
  };

export const familyReplyContract: Contract<FamilyReplyPrompt, CalleeReplyLocal, CalleeReplyData> = {
  kind: FAMILY_REPLY_KIND,
  promptSchema: familyReplyPromptSchema,
  localSchema: calleeReplyLocalSchema,
  dataSchema: calleeReplyDataSchema,
  temperatureKey: 'dialogueTemperature',
  system: FAMILY_REPLY_SYSTEM,
  guard: guardReply,
};
