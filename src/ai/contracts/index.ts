import {
  CONSULT_REPLY_KIND,
  FAMILY_REPLY_KIND,
  consultReplyContract,
  familyReplyContract,
} from './calleeReply';
import { CONSULT_ASSESS_KIND, consultAssessContract } from './consultAssess';
import { FAMILY_ASSESS_KIND, familyAssessContract } from './familyAssess';
import { dialogueContract, DIALOGUE_KIND } from './dialogueTurn';
import {
  GATE_DANGER_KIND,
  GATE_NURSE_KIND,
  GATE_PHARMACY_KIND,
  gateDangerContract,
  gateNurseContract,
  gatePharmacyContract,
} from './gate';
import {
  ROUNDS_GRADE_KIND,
  ROUNDS_QUESTION_KIND,
  roundsGradeContract,
  roundsQuestionContract,
} from './rounds';
import { orderParseContract, ORDER_PARSE_KIND } from './orderParse';
import { orderEffectContract, ORDER_EFFECT_KIND } from './orderEffect';
import type { Contract } from './types';

export * from './calleeReply';
export * from './consultAssess';
export * from './dialogueTurn';
export * from './familyAssess';
export * from './gate';
export * from './orderParse';
export * from './orderEffect';
export * from './rounds';
export { CONTRACT_VERSION, type Contract, type GuardResult } from './types';

export const CONTRACTS = {
  [ORDER_PARSE_KIND]: orderParseContract,
  [ORDER_EFFECT_KIND]: orderEffectContract,
  [DIALOGUE_KIND]: dialogueContract,
  [GATE_PHARMACY_KIND]: gatePharmacyContract,
  [GATE_NURSE_KIND]: gateNurseContract,
  [GATE_DANGER_KIND]: gateDangerContract,
  [CONSULT_ASSESS_KIND]: consultAssessContract,
  [CONSULT_REPLY_KIND]: consultReplyContract,
  [FAMILY_ASSESS_KIND]: familyAssessContract,
  [FAMILY_REPLY_KIND]: familyReplyContract,
  [ROUNDS_QUESTION_KIND]: roundsQuestionContract,
  [ROUNDS_GRADE_KIND]: roundsGradeContract,
} as const;

export function contractFor(kind: string): Contract<unknown, unknown, unknown> | undefined {
  return (CONTRACTS as Record<string, Contract<unknown, unknown, unknown> | undefined>)[kind];
}
