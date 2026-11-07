import { z } from 'zod';
import { getConfig } from '@/content';
import {
  authorizedGet,
  claudeMessagesTarget,
  completionTarget,
  isApiKeyRejection,
  postCompletion,
  providerErrorDetail,
} from './transport';
import type { AiEndpoint, TransportOptions } from './types';

export type ConnectionTestResult =
  | { kind: 'ok'; jsonMode: boolean }
  | { kind: 'auth'; status: number; detail?: string }
  | { kind: 'http'; status: number; detail?: string; url?: string }
  | { kind: 'unavailable-model'; model: string; available: string[] }
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

function modelIds(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const id = (item as { id?: unknown }).id;
    return typeof id === 'string' && id.length > 0 ? [id] : [];
  });
}

function withDetail(status: number, body: unknown, url: string): ConnectionTestResult {
  const detail = providerErrorDetail(body);
  if (isApiKeyRejection(status, body)) {
    return detail ? { kind: 'auth', status, detail } : { kind: 'auth', status };
  }
  return detail ? { kind: 'http', status, detail, url } : { kind: 'http', status, url };
}

/**
 * Grok 的 404 有兩種：路徑不存在，或者這條 key 的團隊沒有該模型。
 * 先讀 /models，清單有內容但沒有所選模型時，不要再打 chat。
 */
async function grokModelAccess(
  endpoint: AiEndpoint,
  options: TransportOptions,
): Promise<ConnectionTestResult | undefined> {
  if (endpoint.provider !== 'grok') return undefined;
  const url = `${completionTarget(endpoint.baseUrl)}/models`;
  const listed = await authorizedGet(url, endpoint.apiKey, options);
  if (listed.kind !== 'response') return { kind: listed.kind };
  if (listed.status === 404 || isApiKeyRejection(listed.status, listed.body)) {
    return withDetail(listed.status, listed.body, url);
  }
  if (listed.status < 200 || listed.status >= 300) return undefined;
  const available = modelIds(listed.body);
  const model = endpoint.model.trim();
  if (available.length === 0 || available.includes(model)) return undefined;
  return { kind: 'unavailable-model', model, available };
}

/** C8 A：只送一個極短請求，確認 URL、key、model 同 JSON 模式可用。 */
export async function testConnection(
  endpoint: AiEndpoint,
  options: Partial<TransportOptions> = {},
): Promise<ConnectionTestResult> {
  const { ai } = getConfig();
  const transport = { timeoutMs: ai.connectionTestTimeoutMs, ...options };
  const access = await grokModelAccess(endpoint, transport);
  if (access) return access;
  const base = completionTarget(endpoint.baseUrl);
  const claude = endpoint.provider === 'claude' ? claudeMessagesTarget(base) : undefined;
  const chatUrl = claude ? `${claude.target}/${claude.path}` : `${base}/chat/completions`;
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
    transport,
  );

  if (result.kind !== 'response') return { kind: result.kind };
  if (
    result.status < 200 ||
    result.status >= 300 ||
    isApiKeyRejection(result.status, result.body)
  ) {
    return withDetail(result.status, result.body, chatUrl);
  }

  const parsed = completionSchema.safeParse(result.body);
  if (!parsed.success) return { kind: 'format' };
  const content = parsed.data.choices[0]?.message.content ?? '';
  return { kind: 'ok', jsonMode: looksLikeJsonObject(content) };
}
