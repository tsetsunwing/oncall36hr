import type { ChatMessage } from '../prompts/messages';
import type { AiEndpoint, TransportOptions } from './types';

export type TransportResult =
  | { kind: 'response'; status: number; body: unknown; url: string }
  | { kind: 'timeout'; url: string }
  | { kind: 'network'; url: string; message: string };

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

async function sendJson(
  url: string,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  body: string | undefined,
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
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      signal: controller.signal,
    });
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    return { kind: 'response', status: response.status, body: parsed, url };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return state.timedOut
      ? { kind: 'timeout', url }
      : { kind: 'network', url, message: message.replace(/\s+/g, ' ').slice(0, 180) };
  } finally {
    clearTimeout(timer);
  }
}

function postJson(
  url: string,
  headers: Record<string, string>,
  payload: unknown,
  options: TransportOptions,
): Promise<TransportResult> {
  return sendJson(url, 'POST', headers, JSON.stringify(payload), options);
}

/** 用同一條 key 讀供應商的模型清單。key 只放在 Authorization，不入網址。 */
export function authorizedGet(
  url: string,
  apiKey: string,
  options: TransportOptions,
): Promise<TransportResult> {
  return sendJson(
    url,
    'GET',
    { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    undefined,
    options,
  );
}

const ENDPOINT_SUFFIXES = ['/chat/completions', '/messages', '/responses'] as const;

/**
 * 主控台通常複製完整端點（例如 https://api.x.ai/v1/chat/completions）。
 * 再拼一次 /chat/completions 會打到不存在的路徑，xAI 回 404。
 * 只有 host、沒有 /v1 的 api.x.ai 同樣 404。
 */
export function completionTarget(baseUrl: string): string {
  let value = baseUrl.trim();
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    value = url.toString();
  } catch {
    return baseUrl.trim().replace(/\/+$/, '');
  }
  value = value.replace(/\/+$/, '');
  const lower = value.toLowerCase();
  for (const suffix of ENDPOINT_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      value = value.slice(0, -suffix.length).replace(/\/+$/, '');
      break;
    }
  }
  try {
    const url = new URL(value);
    const bareHost = url.pathname === '' || url.pathname === '/';
    if (url.host === 'console.x.ai') return 'https://api.x.ai/v1';
    if (bareHost && (url.host === 'api.x.ai' || url.host === 'us.api.x.ai')) {
      return `${url.origin}/v1`;
    }
  } catch {
    return value;
  }
  return value;
}

function errorRecord(body: unknown): { error?: unknown; message?: unknown } | undefined {
  if (Array.isArray(body)) return errorRecord(body[0]);
  if (!body || typeof body !== 'object') return undefined;
  return body;
}

/** 供應商錯誤正文。去掉可能混入的 key，並截短。Gemini 有時把錯誤包成陣列。 */
export function providerErrorDetail(body: unknown): string {
  const record = errorRecord(body);
  if (!record) return '';
  const error = record.error;
  let text = '';
  if (typeof error === 'string') text = error;
  else if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') text = message;
  } else if (typeof record.message === 'string') text = record.message;
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/bearer\s+\S+/gi, 'Bearer …');
  text = text.replace(/\b(?:sk-|xai-|sk-ant-)[A-Za-z0-9_-]{8,}\b/g, '…');
  if (text.length > 180) text = `${text.slice(0, 177)}…`;
  return text;
}

export function isApiKeyRejection(status: number, body: unknown): boolean {
  if (status === 401 || status === 403) return true;
  if (status !== 400) return false;
  // Gemini 的 OpenAI 相容層用 400 表示鑰匙問題，不是路徑或欄位錯誤。
  return /incorrect api key|invalid api key|please pass a valid api key|invalid x-api-key|missing or invalid authorization|authentication/i.test(
    providerErrorDetail(body),
  );
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
    const { target, path } = claudeMessagesTarget(completionTarget(endpoint.baseUrl));
    const { url, headers } = requestUrl(options, target, path);
    headers['x-api-key'] = endpoint.apiKey;
    headers['anthropic-version'] = ANTHROPIC_VERSION;
    headers[BROWSER_ACCESS_HEADER] = 'true';
    const result = await postJson(url, headers, claudePayload(endpoint, call), options);
    if (result.kind !== 'response' || result.status < 200 || result.status >= 300) return result;
    return {
      kind: 'response',
      status: result.status,
      url: result.url,
      body: { choices: [{ message: { content: claudeText(result.body) } }] },
    };
  }

  const target = completionTarget(endpoint.baseUrl);
  const { url, headers } = requestUrl(options, target, 'chat/completions');
  headers.Authorization = `Bearer ${endpoint.apiKey}`;
  return postJson(url, headers, openAiPayload(endpoint, call), options);
}
