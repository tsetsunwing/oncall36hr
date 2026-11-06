import { z } from 'zod';
import { CONTRACT_VERSION, type Contract } from '../contracts/types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 回應 data 嘅 JSON schema 放喺 system prompt（plan §7.1：唔假設供應商支援 strict json_schema） */
export function buildMessages(
  contract: Contract<unknown, unknown, unknown>,
  prompt: unknown,
): ChatMessage[] {
  const schema = JSON.stringify(z.toJSONSchema(contract.dataSchema, { io: 'input' }));
  return [
    {
      role: 'system',
      content: `${contract.system}\n\ncontract version: ${CONTRACT_VERSION}\n"data" JSON schema:\n${schema}`,
    },
    { role: 'user', content: JSON.stringify({ kind: contract.kind, ...(prompt as object) }) },
  ];
}

export function repairMessages(
  previous: ChatMessage[],
  badReply: string,
  issues: readonly string[],
): ChatMessage[] {
  return [
    ...previous,
    { role: 'assistant', content: badReply },
    {
      role: 'user',
      content: `Your reply was rejected:\n${issues.map((i) => `- ${i}`).join('\n')}\nReturn the corrected single JSON object only.`,
    },
  ];
}
