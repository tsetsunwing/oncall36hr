import { z } from 'zod';
import { getConfig } from '@/content';
import { isApiKeyRejection, postCompletion, providerErrorDetail } from './transport';
import type { AiEndpoint, TransportOptions } from './types';

export type ConnectionTestResult =
  | { kind: 'ok'; jsonMode: boolean }
  | { kind: 'auth'; status: number; detail?: string }
  | { kind: 'http'; status: number; detail?: string }
  | { kind: 'format' }
  | { kind: 'timeout' }
  | { kind: 'network' };

const completionSchema = z
  .object({
    choices: z
      .array(z.object({ message: z.object({ content: z.string().nullable() }).loose() }).loose())
      .min(1),
  })
  .loose();

function looksLikeJsonObject(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

/** C8 A：只送一個極短請求，確認 URL、key、model 同 JSON 模式可用。 */
export async function testConnection(
  endpoint: AiEndpoint,
  options: Partial<TransportOptions> = {},
): Promise<ConnectionTestResult> {
  const { ai } = getConfig();
  const result = await postCompletion(
    endpoint,
    {
      temperature: 0,
      maxTokens: endpoint.provider === 'claude' ? 1024 : 16,
      jsonMode: true,
      messages: [
        { role: 'system', content: 'Reply with the JSON object {"ok":true} and nothing else.' },
        { role: 'user', content: 'ping' },
      ],
    },
    { timeoutMs: ai.connectionTestTimeoutMs, ...options },
  );

  if (result.kind !== 'response') return { kind: result.kind };
  const detail = providerErrorDetail(result.body);
  if (isApiKeyRejection(result.status, result.body)) {
    return detail
      ? { kind: 'auth', status: result.status, detail }
      : { kind: 'auth', status: result.status };
  }
  if (result.status < 200 || result.status >= 300) {
    return detail
      ? { kind: 'http', status: result.status, detail }
      : { kind: 'http', status: result.status };
  }

  const parsed = completionSchema.safeParse(result.body);
  if (!parsed.success) return { kind: 'format' };
  const content = parsed.data.choices[0]?.message.content ?? '';
  return { kind: 'ok', jsonMode: looksLikeJsonObject(content) };
}
