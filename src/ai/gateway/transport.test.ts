import { describe, expect, it } from 'vitest';
import { createAiGateway, type AiRequest } from './gateway';
import {
  claudePayload,
  completionTarget,
  openAiPayload,
  postCompletion,
  providerErrorDetail,
} from './transport';

const messages = [
  { role: 'system' as const, content: 'sys' },
  { role: 'user' as const, content: 'ping' },
];

describe('completion payloads', () => {
  it('sends reasoning_effort and omits temperature when a thinking level is set', () => {
    const body = openAiPayload(
      {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'secret',
        model: 'gpt-6-astra',
        thinkingLevel: 'low',
      },
      { messages, temperature: 0.7, jsonMode: true },
    );
    expect(body.reasoning_effort).toBe('low');
    expect(body).not.toHaveProperty('temperature');
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('builds a Claude Messages payload without the key', () => {
    const body = claudePayload(
      {
        provider: 'claude',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'secret-key',
        model: 'claude-haiku-5-5',
        thinkingLevel: 'medium',
      },
      { messages, temperature: 0.4, jsonMode: true },
    );
    expect(body).toMatchObject({
      model: 'claude-haiku-5-5',
      system: 'sys',
      messages: [{ role: 'user', content: 'ping' }],
      output_config: { effort: 'medium' },
    });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('response_format');
    expect(JSON.stringify(body)).not.toContain('secret-key');
  });
});

describe('Claude transport', () => {
  const prompt = {
    patientId: 'p1',
    speakers: [{ id: 'nurse:N1', kind: 'NURSE', name: '何姑娘', tone: null }],
    addressed: [],
    beats: [{ type: 'ACK_CHAT', speaker: 'NURSE' }],
    allowedTokens: ['vital.spo2'],
    recent: [],
    maxLines: 4,
    maxLineChars: 140,
  };
  const local = {
    patientId: 'p1',
    speakerIds: ['nurse:N1'],
    allowedTokens: ['vital.spo2'],
    denyTerms: ['肺炎'],
    frozenTokens: { 'vital.spo2': '93' },
  };
  const request: AiRequest = { reqId: 'r1', kind: 'dialogue.turn', context: { prompt, local } };

  it('calls /v1/messages and reads text blocks back into the contract', async () => {
    const sent: { url: string; headers: Record<string, string>; body: string }[] = [];
    const fetchImpl = ((url: string, init?: RequestInit) => {
      sent.push({
        url,
        headers: init?.headers as Record<string, string>,
        body: typeof init?.body === 'string' ? init.body : '',
      });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            content: [
              { type: 'thinking', thinking: 'hidden' },
              {
                type: 'text',
                text: JSON.stringify({
                  contract: 'v1',
                  kind: 'dialogue.turn',
                  data: { lines: [{ speaker: 'nurse:N1', text: '血氧 {{vital.spo2}}' }] },
                }),
              },
            ],
          }),
          { status: 200 },
        ),
      );
    }) as typeof fetch;

    const outcome = await createAiGateway(
      {
        provider: 'claude',
        baseUrl: 'https://api.anthropic.com/',
        apiKey: 'secret-key',
        model: 'claude-sonnet-5-5',
        thinkingLevel: 'high',
      },
      { fetchImpl, timeoutMs: 500 },
    ).run(request);

    expect(outcome.ok).toBe(true);
    expect(sent[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(sent[0]?.headers['x-api-key']).toBe('secret-key');
    expect(sent[0]?.headers['anthropic-version']).toBe('2026-10-21');
    expect(sent[0]?.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(sent[0]?.body).not.toContain('secret-key');
    expect(sent[0]?.body).not.toContain('肺炎');
    expect(sent[0]?.body).toContain('"effort":"high"');
  });

  it('keeps an error body unwrapped', async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { type: 'authentication_error' } }), { status: 401 }),
      )) as typeof fetch;
    const result = await postCompletion(
      {
        provider: 'claude',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'k',
        model: 'claude-haiku-5-5',
      },
      { messages, temperature: 0, jsonMode: true, maxTokens: 32 },
      { timeoutMs: 500, fetchImpl },
    );
    expect(result).toMatchObject({ kind: 'response', status: 401 });
  });
});

describe('pasted console endpoints', () => {
  it('does not append chat/completions twice', () => {
    expect(completionTarget('https://api.x.ai/v1/chat/completions')).toBe('https://api.x.ai/v1');
    expect(completionTarget('https://api.x.ai')).toBe('https://api.x.ai/v1');
    expect(completionTarget('https://api.x.ai/v1')).toBe('https://api.x.ai/v1');
  });

  it('posts a pasted Grok endpoint to /v1/chat/completions once', async () => {
    const sent: string[] = [];
    const fetchImpl = ((url: string) => {
      sent.push(url);
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as typeof fetch;
    await postCompletion(
      {
        provider: 'grok',
        baseUrl: 'https://api.x.ai/v1/chat/completions',
        apiKey: 'xai-test',
        model: 'grok-4.7',
      },
      { messages, temperature: 0, jsonMode: true, maxTokens: 16 },
      { timeoutMs: 500, fetchImpl },
    );
    expect(sent).toEqual(['https://api.x.ai/v1/chat/completions']);
  });

  it('reads a Gemini array error about the API key', () => {
    expect(
      providerErrorDetail([
        {
          error: { code: 400, message: 'Please pass a valid API key', status: 'INVALID_ARGUMENT' },
        },
      ]),
    ).toBe('Please pass a valid API key');
  });

  it('reads an xAI error without keeping a key', () => {
    const detail = providerErrorDetail({
      code: 'not-found',
      error: 'The model grok-4.7 does not exist. Key xai-secretvalue was not logged.',
    });
    expect(detail).toContain('does not exist');
    expect(detail).not.toContain('xai-secretvalue');
  });
});
