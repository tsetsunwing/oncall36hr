import { dialogueContract, DIALOGUE_KIND } from './dialogueTurn';
import { orderParseContract, ORDER_PARSE_KIND } from './orderParse';
import type { Contract } from './types';

export * from './dialogueTurn';
export * from './orderParse';
export { CONTRACT_VERSION, type Contract, type GuardResult } from './types';

export const CONTRACTS = {
  [ORDER_PARSE_KIND]: orderParseContract,
  [DIALOGUE_KIND]: dialogueContract,
} as const;

export function contractFor(kind: string): Contract<unknown, unknown, unknown> | undefined {
  return (CONTRACTS as Record<string, Contract<unknown, unknown, unknown> | undefined>)[kind];
}
