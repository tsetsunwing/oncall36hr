// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMockServer, type MockServer } from '../../../test-support/mock-ai-server/server';
import { testConnection } from './connectionTest';

let mock: MockServer;

beforeAll(async () => {
  mock = await startMockServer({ apiKey: 'good-key' });
});
afterAll(async () => {
  await mock.close();
});

const endpoint = (over: Partial<{ apiKey: string; model: string; baseUrl: string }> = {}) => ({
  baseUrl: mock.baseUrl,
  apiKey: 'good-key',
  model: 'mock-ok',
  ...over,
});

describe('testConnection against the mock OpenAI-compatible server', () => {
  it('succeeds with JSON mode and sends one short request', async () => {
    const before = mock.requests.length;
    expect(await testConnection(endpoint())).toEqual({ kind: 'ok', jsonMode: true });
    expect(mock.requests.length).toBe(before + 1);
    const sent = mock.requests.at(-1);
    expect(sent?.path).toBe('/v1/chat/completions');
    expect(sent?.authorized).toBe(true);
    expect(sent?.body).toMatchObject({ response_format: { type: 'json_object' }, max_tokens: 16 });
  });

  it('flags non-JSON replies as ok without JSON mode', async () => {
    expect(await testConnection(endpoint({ model: 'mock-text' }))).toEqual({
      kind: 'ok',
      jsonMode: false,
    });
  });

  it('maps a wrong key to auth', async () => {
    expect(await testConnection(endpoint({ apiKey: 'bad' }))).toEqual({
      kind: 'auth',
      status: 401,
    });
  });

  it('maps server errors to http', async () => {
    expect(await testConnection(endpoint({ model: 'mock-5xx' }))).toEqual({
      kind: 'http',
      status: 500,
    });
    expect(await testConnection(endpoint({ model: 'mock-429' }))).toEqual({
      kind: 'http',
      status: 429,
    });
  });

  it('maps unexpected payloads to format', async () => {
    expect(await testConnection(endpoint({ model: 'mock-bad-shape' }))).toEqual({ kind: 'format' });
    expect(await testConnection(endpoint({ model: 'mock-bad-json' }))).toEqual({ kind: 'format' });
  });

  it('maps a hanging server to timeout', async () => {
    expect(await testConnection(endpoint({ model: 'mock-hang' }), { timeoutMs: 150 })).toEqual({
      kind: 'timeout',
    });
  });

  it('maps an unreachable server to network', async () => {
    const dead = await startMockServer();
    const baseUrl = dead.baseUrl;
    await dead.close();
    expect(await testConnection(endpoint({ baseUrl }), { timeoutMs: 1000 })).toEqual({
      kind: 'network',
    });
  });

  it('routes through the dev proxy prefix when configured', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fakeFetch: typeof fetch = (input, init) => {
      calls.push({
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        headers: init?.headers as Record<string, string>,
      });
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
          status: 200,
        }),
      );
    };
    const result = await testConnection(endpoint(), {
      fetchImpl: fakeFetch,
      proxy: { prefix: '/ai-proxy' },
    });
    expect(result.kind).toBe('ok');
    expect(calls[0]?.url).toBe('/ai-proxy/chat/completions');
    expect(calls[0]?.headers['x-ai-target-base-url']).toBe(mock.baseUrl);
  });
});
