import type { ChatMessage } from '../prompts/messages';
import type { AiEndpoint, TransportOptions } from './types';

export type TransportResult =
  { kind: 'response'; status: number; body: unknown } | { kind: 'timeout' } | { kind: 'network' };

export const TARGET_BASE_URL_HEADER = 'x-ai-target-base-url';

/** 2026-10-21 係 Messages API 參考例子使用的版本。 */
export const ANTHROPIC_VERSION = '2026-10-21';

export const BROWSER_ACCESS_HEADER = 'anthropic-dangerous-direct-browser-access';

export interface CompletionCall {
  messages: readonly ChatMessage[];
  temperature: number;
  jsonMode: boolean;
  maxTokens?: number;
}

interface ResolvedClaudeUrl {
  target: string;
  path: string;
}

export function claudeMessagesTarget(baseUrl: string): ResolvedClaudeUrl {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (trimmed.endsWith('/v1')) return { target: trimmed, path: 'messages' };
  return { target: trimmed, path: 'v1/messages' };
}

function thinkingLevel(endpoint: AiEndpoint): string {
  return endpoint.thinkingLevel?.trim() ?? '';
}

/** OpenAI 相容 chat/completions。有思考等級時不送 temperature，避免 reasoning 模型拒收。 */
export function openAiPayload(endpoint: AiEndpoint, call: CompletionCall): Record<string, unknown> {
  const level = thinkingLevel(endpoint);
  const body: Record<string, unknown> = {
    model: endpoint.model,
    messages: call.messages,
  };
  if (call.jsonMode) body.response_format = { type: 'json_object' };
  if (call.maxTokens !== undefined) body.max_tokens = call.maxTokens;
  if (level) body.reasoning_effort = level;
  else body.temperature = call.temperature;
  return body;
}

/** Claude 官方 Messages API。system 提升到頂層；effort 用 output_config。 */
export function claudePayload(endpoint: AiEndpoint, call: CompletionCall): Record<string, unknown> {
  const system = call.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const messages = call.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role, content: message.content }));
  const level = thinkingLevel(endpoint);
  const body: Record<string, unknown> = {
    model: endpoint.model,
    max_tokens: call.maxTokens ?? 8192,
    messages,
  };
  if (system) body.system = system;
  if (!level) body.temperature = call.temperature;
  if (level) body.output_config = { effort: level };
  return body;
}

function claudeText(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const content = (body as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      if (!block || typeof block !== 'object') return '';
      const part = block as { type?: unknown; text?: unknown };
      return part.type === 'text' && typeof part.text === 'string' ? part.text : '';
    })
    .filter((text) => text.length > 0)
    .join('');
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  payload: unknown,
  options: TransportOptions,
): Promise<TransportResult> {
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const controller = new AbortController();
  const state = { timedOut: false };
  const timer = setTimeout(() => {
    state.timedOut = true;
    controller.abort();
  }, options.timeoutMs);
  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { kind: 'response', status: response.status, body };
  } catch {
    return state.timedOut ? { kind: 'timeout' } : { kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

function requestUrl(
  options: TransportOptions,
  target: string,
  path: string,
): {
  url: string;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.proxy) {
    headers[TARGET_BASE_URL_HEADER] = target;
    return { url: `${options.proxy.prefix}/${path}`, headers };
  }
  return { url: `${target}/${path}`, headers };
}

/**
 * OpenAI、Grok、Gemini 走 chat/completions。
 * Claude 走官方 POST /v1/messages，成功回應折成 choices[0].message.content，之後的契約檢查不變。
 */
export async function postCompletion(
  endpoint: AiEndpoint,
  call: CompletionCall,
  options: TransportOptions,
): Promise<TransportResult> {
  if (endpoint.provider === 'claude') {
    const { target, path } = claudeMessagesTarget(endpoint.baseUrl);
    const { url, headers } = requestUrl(options, target, path);
    headers['x-api-key'] = endpoint.apiKey;
    headers['anthropic-version'] = ANTHROPIC_VERSION;
    headers[BROWSER_ACCESS_HEADER] = 'true';
    const result = await postJson(url, headers, claudePayload(endpoint, call), options);
    if (result.kind !== 'response' || result.status < 200 || result.status >= 300) return result;
    return {
      kind: 'response',
      status: result.status,
      body: { choices: [{ message: { content: claudeText(result.body) } }] },
    };
  }

  const target = endpoint.baseUrl.replace(/\/+$/, '');
  const { url, headers } = requestUrl(options, target, 'chat/completions');
  headers.Authorization = `Bearer ${endpoint.apiKey}`;
  return postJson(url, headers, openAiPayload(endpoint, call), options);
}
