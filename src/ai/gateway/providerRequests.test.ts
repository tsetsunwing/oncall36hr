import { describe, expect, it } from 'vitest';
import { postCompletion } from './transport';
import type { AiEndpoint } from './types';

const messages = [
  { role: 'system' as const, content: 'Reply with JSON.' },
  { role: 'user' as const, content: 'ping' },
];

const call = { messages, temperature: 0, jsonMode: true, maxTokens: 16 };

interface Captured {
  url: string;
  headerNames: string[];
  authHeader: string | undefined;
  bodyKeys: string[];
  body: string;
}

async function capture(endpoint: AiEndpoint): Promise<Captured> {
  let seen: Captured | undefined;
  const fetchImpl = ((url: string, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>;
    const body = typeof init?.body === 'string' ? init.body : '';
    seen = {
      url,
      headerNames: Object.keys(headers).filter((name) => name !== 'Content-Type'),
      authHeader: headers.Authorization
        ? 'Authorization'
        : headers['x-api-key']
          ? 'x-api-key'
          : undefined,
      bodyKeys: Object.keys(JSON.parse(body) as Record<string, unknown>).sort(),
      body,
    };
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as typeof fetch;
  await postCompletion(endpoint, call, { timeoutMs: 500, fetchImpl });
  if (!seen) throw new Error('request was not sent');
  return seen;
}

const secret = 'secret-key-value';

describe('provider request shape', () => {
  it.each([
    {
      name: 'grok-4.7 from a bare host',
      endpoint: {
        provider: 'grok' as const,
        baseUrl: 'https://api.x.ai',
        apiKey: secret,
        model: 'grok-4.7',
        thinkingLevel: 'high',
      },
      url: 'https://api.x.ai/v1/chat/completions',
      authHeader: 'Authorization',
      bodyKeys: ['max_tokens', 'messages', 'model', 'reasoning_effort', 'response_format'],
    },
    {
      name: 'grok-4.3 from a console endpoint',
      endpoint: {
        provider: 'grok' as const,
        baseUrl: 'https://api.x.ai/v1/chat/completions',
        apiKey: secret,
        model: 'grok-4.3',
        thinkingLevel: '',
      },
      url: 'https://api.x.ai/v1/chat/completions',
      authHeader: 'Authorization',
      bodyKeys: ['max_tokens', 'messages', 'model', 'response_format', 'temperature'],
    },
    {
      name: 'gemini-4-argon',
      endpoint: {
        provider: 'gemini' as const,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: secret,
        model: 'gemini-4-argon',
        thinkingLevel: 'high',
      },
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      authHeader: 'Authorization',
      bodyKeys: ['max_tokens', 'messages', 'model', 'reasoning_effort', 'response_format'],
    },
    {
      name: 'gemini-3.8-flash from a pasted completions URL',
      endpoint: {
        provider: 'gemini' as const,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        apiKey: secret,
        model: 'gemini-3.8-flash',
        thinkingLevel: '',
      },
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      authHeader: 'Authorization',
      bodyKeys: ['max_tokens', 'messages', 'model', 'response_format', 'temperature'],
    },
    {
      name: 'gpt-5.6-luna',
      endpoint: {
        provider: 'openai' as const,
        baseUrl: 'https://api.openai.com/v1',
        apiKey: secret,
        model: 'gpt-5.6-luna',
        thinkingLevel: 'medium',
      },
      url: 'https://api.openai.com/v1/chat/completions',
      authHeader: 'Authorization',
      bodyKeys: ['max_tokens', 'messages', 'model', 'reasoning_effort', 'response_format'],
    },
    {
      name: 'gpt-6-astra from a pasted completions URL',
      endpoint: {
        provider: 'openai' as const,
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        apiKey: secret,
        model: 'gpt-6-astra',
        thinkingLevel: '',
      },
      url: 'https://api.openai.com/v1/chat/completions',
      authHeader: 'Authorization',
      bodyKeys: ['max_tokens', 'messages', 'model', 'response_format', 'temperature'],
    },
    {
      name: 'claude-haiku-5-5',
      endpoint: {
        provider: 'claude' as const,
        baseUrl: 'https://api.anthropic.com',
        apiKey: secret,
        model: 'claude-haiku-5-5',
        thinkingLevel: 'medium',
      },
      url: 'https://api.anthropic.com/v1/messages',
      authHeader: 'x-api-key',
      bodyKeys: ['max_tokens', 'messages', 'model', 'output_config', 'system'],
    },
    {
      name: 'claude-opus-5-5 from a pasted messages URL',
      endpoint: {
        provider: 'claude' as const,
        baseUrl: 'https://api.anthropic.com/v1/messages',
        apiKey: secret,
        model: 'claude-opus-5-5',
        thinkingLevel: '',
      },
      url: 'https://api.anthropic.com/v1/messages',
      authHeader: 'x-api-key',
      bodyKeys: ['max_tokens', 'messages', 'model', 'system', 'temperature'],
    },
  ])('$name', async ({ endpoint, url, authHeader, bodyKeys }) => {
    const sent = await capture(endpoint);
    expect(sent.url).toBe(url);
    expect(sent.url.split('/chat/completions').length - 1).toBe(
      endpoint.provider === 'claude' ? 0 : 1,
    );
    expect(sent.authHeader).toBe(authHeader);
    expect(sent.headerNames).toContain(authHeader);
    expect(sent.bodyKeys).toEqual(bodyKeys);
    expect(sent.body).not.toContain(secret);
    expect(sent.body).not.toContain('thinking_config');
    expect(sent.body).not.toContain('generateContent');
  });
});
