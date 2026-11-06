import type { AiEndpoint, TransportOptions } from './types';

export type TransportResult =
  { kind: 'response'; status: number; body: unknown } | { kind: 'timeout' } | { kind: 'network' };

export const TARGET_BASE_URL_HEADER = 'x-ai-target-base-url';

/** 只做 I/O：POST {baseUrl}/chat/completions。唔會把 key 寫入任何錯誤訊息或 log。 */
export async function postChatCompletion(
  endpoint: AiEndpoint,
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${endpoint.apiKey}`,
  };
  let url = `${endpoint.baseUrl}/chat/completions`;
  if (options.proxy) {
    url = `${options.proxy.prefix}/chat/completions`;
    headers[TARGET_BASE_URL_HEADER] = endpoint.baseUrl;
  }

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
