import { dialogueContract, DIALOGUE_KIND } from './dialogueTurn';
import {
  GATE_DANGER_KIND,
  GATE_NURSE_KIND,
  GATE_PHARMACY_KIND,
  gateDangerContract,
  gateNurseContract,
  gatePharmacyContract,
} from './gate';
import { orderParseContract, ORDER_PARSE_KIND } from './orderParse';
import type { Contract } from './types';

export * from './dialogueTurn';
export * from './gate';
export * from './orderParse';
export { CONTRACT_VERSION, type Contract, type GuardResult } from './types';

export const CONTRACTS = {
  [ORDER_PARSE_KIND]: orderParseContract,
  [DIALOGUE_KIND]: dialogueContract,
  [GATE_PHARMACY_KIND]: gatePharmacyContract,
  [GATE_NURSE_KIND]: gateNurseContract,
  [GATE_DANGER_KIND]: gateDangerContract,
} as const;

export function contractFor(kind: string): Contract<unknown, unknown, unknown> | undefined {
  return (CONTRACTS as Record<string, Contract<unknown, unknown, unknown> | undefined>)[kind];
}
