import { z } from 'zod';
import { checkDialogueText } from '../guard/numeric';
import { ROUNDS_GRADE_SYSTEM, ROUNDS_QUESTION_SYSTEM } from '../prompts/system';
import type { Contract } from './types';

export const ROUNDS_QUESTION_KIND = 'rounds.question';
export const ROUNDS_GRADE_KIND = 'rounds.grade';

const keyFactsSchema = z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).min(1);
const CATEGORIES = ['HISTORY', 'PATHOLOGY', 'PHARMACOLOGY'] as const;

export const roundsQuestionPromptSchema = z.object({
  hostRank: z.enum(['AC', 'COS']),
  playerRank: z.enum(['HO', 'MO', 'RES']),
  category: z.enum(CATEGORIES),
  focus: z.string().min(1),
  keyFacts: keyFactsSchema,
  patient: z.object({
    age: z.number(),
    sex: z.string(),
    presentingComplaint: z.string(),
  }),
  hintCount: z.number().int().positive(),
  maxQuestionChars: z.number().int().positive(),
  maxHintChars: z.number().int().positive(),
});

export const roundsLocalSchema = z.object({
  number: z.number().int(),
  patientId: z.string(),
  topicId: z.string(),
});

export const roundsQuestionDataSchema = z.object({
  question: z.string(),
  hints: z.array(z.string()),
});

export type RoundsQuestionPrompt = z.infer<typeof roundsQuestionPromptSchema>;
export type RoundsLocal = z.infer<typeof roundsLocalSchema>;
export type RoundsQuestionData = z.infer<typeof roundsQuestionDataSchema>;

/** 巡房文字冇 token：數字、{{ }} 一律唔准；教學內容全部由 T25 key facts 提供 */
function textIssues(label: string, text: string, maxChars: number): string[] {
  const issues: string[] = [];
  for (const issue of checkDialogueText(text, {
    allowedTokens: new Set(),
    denyTerms: [],
    maxChars,
  })) {
    switch (issue) {
      case 'BARE_NUMBER':
        issues.push(
          `${label}: contains a digit or a spelled-out number. Write without any number.`,
        );
        break;
      case 'UNKNOWN_TOKEN':
      case 'MALFORMED_TOKEN':
        issues.push(`${label}: must not contain {{tokens}}.`);
        break;
      case 'TOO_LONG':
        issues.push(`${label}: longer than ${String(maxChars)} characters.`);
        break;
      case 'EMPTY':
        issues.push(`${label}: empty.`);
        break;
      case 'DIAGNOSIS_LEAK':
        break;
    }
  }
  return issues;
}

export const roundsQuestionContract: Contract<
  RoundsQuestionPrompt,
  RoundsLocal,
  RoundsQuestionData
> = {
  kind: ROUNDS_QUESTION_KIND,
  promptSchema: roundsQuestionPromptSchema,
  localSchema: roundsLocalSchema,
  dataSchema: roundsQuestionDataSchema,
  temperatureKey: 'dialogueTemperature',
  system: ROUNDS_QUESTION_SYSTEM,
  guard(data, prompt) {
    const issues = textIssues('question', data.question, prompt.maxQuestionChars);
    if (data.hints.length !== prompt.hintCount) {
      issues.push(`hints must contain exactly ${String(prompt.hintCount)} entries.`);
    }
    data.hints.forEach((hint, index) => {
      issues.push(...textIssues(`hint ${String(index + 1)}`, hint, prompt.maxHintChars));
    });
    if (new Set(data.hints.map((h) => h.trim())).size !== data.hints.length) {
      issues.push('hints must all be different.');
    }
    return { issues };
  },
};

export const roundsGradePromptSchema = z.object({
  hostRank: z.enum(['AC', 'COS']),
  playerRank: z.enum(['HO', 'MO', 'RES']),
  category: z.enum(CATEGORIES),
  focus: z.string().min(1),
  question: z.string(),
  answer: z.string(),
  viaHint: z.boolean(),
  keyFacts: keyFactsSchema,
  maxLineChars: z.number().int().positive(),
});

export const roundsGradeDataSchema = z.object({
  verdict: z.enum(['CORRECT', 'PARTIAL', 'WRONG']),
  matchedKeyFacts: z.array(z.string()).default([]),
  seniorLine: z.string().nullish(),
});

export type RoundsGradePrompt = z.infer<typeof roundsGradePromptSchema>;
export type RoundsGradeData = z.infer<typeof roundsGradeDataSchema>;

export const roundsGradeContract: Contract<RoundsGradePrompt, RoundsLocal, RoundsGradeData> = {
  kind: ROUNDS_GRADE_KIND,
  promptSchema: roundsGradePromptSchema,
  localSchema: roundsLocalSchema,
  dataSchema: roundsGradeDataSchema,
  temperatureKey: 'parseTemperature',
  system: ROUNDS_GRADE_SYSTEM,
  guard(data, prompt) {
    const issues: string[] = [];
    const ids = new Set(prompt.keyFacts.map((f) => f.id));
    if (data.matchedKeyFacts.some((id) => !ids.has(id))) {
      issues.push('matchedKeyFacts must only contain ids copied from keyFacts.');
    }
    if (data.verdict !== 'WRONG' && data.matchedKeyFacts.length === 0) {
      issues.push(`verdict ${data.verdict} needs at least one matched key fact id.`);
    }
    const line = data.seniorLine?.trim() ?? '';
    if (line.length > 0) issues.push(...textIssues('seniorLine', line, prompt.maxLineChars));
    return { issues };
  },
};
