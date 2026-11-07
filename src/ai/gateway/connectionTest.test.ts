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
    expect(await testConnection(endpoint({ apiKey: 'bad' }))).toMatchObject({
      kind: 'auth',
      status: 401,
      detail: 'Invalid API key',
      url: expect.stringContaining('/chat/completions') as string,
    });
  });

  it('maps server errors to http', async () => {
    expect(await testConnection(endpoint({ model: 'mock-5xx' }))).toMatchObject({
      kind: 'http',
      status: 500,
      detail: 'Internal error',
      url: expect.stringContaining('/chat/completions') as string,
    });
    expect(await testConnection(endpoint({ model: 'mock-429' }))).toMatchObject({
      kind: 'http',
      status: 429,
      detail: 'Rate limited',
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

  it('reports a Grok 404 against the models URL when the path does not exist', async () => {
    const urls: string[] = [];
    const fetchImpl = ((input: string) => {
      urls.push(input);
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'The requested resource was not found.' }), {
          status: 404,
        }),
      );
    }) as typeof fetch;
    const result = await testConnection(
      {
        provider: 'grok',
        baseUrl: 'https://api.x.ai/v1/chat/completions',
        apiKey: 'xai-test',
        model: 'grok-4.7',
      },
      { fetchImpl, timeoutMs: 500 },
    );
    expect(urls).toEqual(['https://api.x.ai/v1/models']);
    expect(result).toMatchObject({
      kind: 'http',
      status: 404,
      url: 'https://api.x.ai/v1/models',
    });
  });

  it('treats Gemini’s 400 valid-key message as auth and keeps the full URL', async () => {
    const url = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify([
            {
              error: {
                code: 400,
                message: 'Please pass a valid API key',
                status: 'INVALID_ARGUMENT',
              },
            },
          ]),
          { status: 400 },
        ),
      )) as typeof fetch;
    const result = await testConnection(
      {
        provider: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: 'invalid-key-not-real',
        model: 'gemini-3.8-flash',
        thinkingLevel: '',
      },
      { fetchImpl, timeoutMs: 500 },
    );
    expect(result).toMatchObject({ kind: 'auth', status: 400, url });
  });

  it('names the models a Grok key can actually call', async () => {
    const urls: string[] = [];
    const fetchImpl = ((input: string) => {
      urls.push(input);
      return Promise.resolve(
        new Response(JSON.stringify({ data: [{ id: 'grok-4.3' }, { id: 'grok-4.5' }] }), {
          status: 200,
        }),
      );
    }) as typeof fetch;
    const result = await testConnection(
      {
        provider: 'grok',
        baseUrl: 'https://api.x.ai/v1',
        apiKey: 'xai-test',
        model: 'grok-4.7',
      },
      { fetchImpl, timeoutMs: 500 },
    );
    expect(urls).toEqual(['https://api.x.ai/v1/models']);
    expect(result).toEqual({
      kind: 'unavailable-model',
      model: 'grok-4.7',
      available: ['grok-4.3', 'grok-4.5'],
    });
  });
});
