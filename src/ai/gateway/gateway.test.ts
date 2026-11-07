import { describe, expect, it } from 'vitest';
import { createAiGateway, type AiRequest } from './gateway';

interface Sent {
  url: string;
  body: { model: string; messages: { role: string; content: string }[]; temperature: number };
}

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
  denyTerms: ['肺炎', 'sepsis'],
  frozenTokens: { 'vital.spo2': '93' },
};
const request: AiRequest = { reqId: 'r1', kind: 'dialogue.turn', context: { prompt, local } };
const endpoint = { baseUrl: 'http://x/v1', apiKey: 'secret-key', model: 'm' };

const envelope = (data: unknown, kind = 'dialogue.turn') =>
  JSON.stringify({ contract: 'v1', kind, data });
const completion = (content: string) => ({
  choices: [{ message: { role: 'assistant', content } }],
});

type Step = { status: number; body: unknown } | 'hang' | 'network';

function scripted(steps: Step[]) {
  const sent: Sent[] = [];
  let i = 0;
  const fetchImpl = ((url: string, init: RequestInit & { signal?: AbortSignal }) => {
    sent.push({ url, body: JSON.parse(init.body as string) as Sent['body'] });
    const step = steps[Math.min(i, steps.length - 1)];
    i += 1;
    if (step === 'network') return Promise.reject(new TypeError('failed'));
    if (step === 'hang') {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    }
    return Promise.resolve(
      new Response(JSON.stringify(step?.body), {
        status: step?.status ?? 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }) as unknown as typeof fetch;
  return { sent, fetchImpl };
}

const good = {
  status: 200,
  body: completion(envelope({ lines: [{ speaker: 'nurse:N1', text: '血氧 {{vital.spo2}}' }] })),
};

describe('AI gateway', () => {
  it('成功：回傳已驗證嘅 data（多餘欄位剝除），只送 prompt', async () => {
    const withExtra = completion(
      envelope({
        lines: [{ speaker: 'nurse:N1', text: '好，{{vital.spo2}}' }],
        vitals: { spo2: 99 },
      }),
    );
    const { sent, fetchImpl } = scripted([{ status: 200, body: withExtra }]);
    const outcome = await createAiGateway(endpoint, { fetchImpl, timeoutMs: 500 }).run(request);
    expect(outcome).toEqual({
      ok: true,
      payload: { lines: [{ speaker: 'nurse:N1', text: '好，{{vital.spo2}}' }] },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('http://x/v1/chat/completions');
    expect(sent[0]?.body.model).toBe('m');
  });

  it('local（deny-list、凍結 token 值）同 API key 都唔會出現喺請求內容', async () => {
    const { sent, fetchImpl } = scripted([good]);
    await createAiGateway(endpoint, { fetchImpl, timeoutMs: 500 }).run(request);
    const body = JSON.stringify(sent[0]?.body);
    for (const secret of ['肺炎', 'sepsis', 'frozenTokens', 'denyTerms', 'secret-key', '"93"']) {
      expect(body).not.toContain(secret);
    }
    expect(body).toContain('allowedTokens');
  });

  it('逾時：自動重試 1 次，仍逾時 → TIMEOUT', async () => {
    const { sent, fetchImpl } = scripted(['hang']);
    const outcome = await createAiGateway(endpoint, { fetchImpl, timeoutMs: 20 }).run(request);
    expect(outcome).toEqual({ ok: false, reason: 'TIMEOUT' });
    expect(sent).toHaveLength(2);
  });

  it('逾時後第二次成功 → 成功（C7 A）', async () => {
    const { sent, fetchImpl } = scripted(['hang', good]);
    const outcome = await createAiGateway(endpoint, { fetchImpl, timeoutMs: 20 }).run(request);
    expect(outcome.ok).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it('認證錯誤：唔重試 → AUTH', async () => {
    const { sent, fetchImpl } = scripted([{ status: 401, body: { error: 'no' } }]);
    expect(await createAiGateway(endpoint, { fetchImpl, timeoutMs: 500 }).run(request)).toEqual({
      ok: false,
      reason: 'AUTH',
    });
    expect(sent).toHaveLength(1);
  });

  it('xAI 的 400 incorrect API key 唔重試 → AUTH', async () => {
    const { sent, fetchImpl } = scripted([
      { status: 400, body: { error: 'Incorrect API key provided. Obtain one from the console.' } },
    ]);
    expect(await createAiGateway(endpoint, { fetchImpl, timeoutMs: 500 }).run(request)).toEqual({
      ok: false,
      reason: 'AUTH',
    });
    expect(sent).toHaveLength(1);
  });

  it('404 唔重試', async () => {
    const { sent, fetchImpl } = scripted([
      {
        status: 404,
        body: { error: 'The model grok-4.7 does not exist or your team lacks access.' },
      },
    ]);
    expect(await createAiGateway(endpoint, { fetchImpl, timeoutMs: 500 }).run(request)).toEqual({
      ok: false,
      reason: 'NETWORK',
    });
    expect(sent).toHaveLength(1);
  });

  it('HTTP 5xx／429／網絡錯誤：重試 1 次後 → NETWORK', async () => {
    for (const step of [{ status: 503, body: {} }, { status: 429, body: {} }, 'network' as const]) {
      const { sent, fetchImpl } = scripted([step]);
      const outcome = await createAiGateway(endpoint, { fetchImpl, timeoutMs: 500 }).run(request);
      expect(outcome).toEqual({ ok: false, reason: 'NETWORK' });
      expect(sent).toHaveLength(2);
    }
  });

  it('格式錯誤：修復重試帶住驗證問題，修復後成功', async () => {
    const { sent, fetchImpl } = scripted([
      { status: 200, body: completion('sorry, no json here') },
      good,
    ]);
    const outcome = await createAiGateway(endpoint, { fetchImpl, timeoutMs: 500 }).run(request);
    expect(outcome.ok).toBe(true);
    expect(sent).toHaveLength(2);
    const second = sent[1]?.body.messages ?? [];
    expect(second.at(-2)?.role).toBe('assistant');
    expect(second.at(-1)?.content).toMatch(/rejected/);
  });

  it('envelope 唔啱（kind 不符）→ FORMAT', async () => {
    const wrong = completion(
      envelope({ lines: [{ speaker: 'nurse:N1', text: '好' }] }, 'order.parse'),
    );
    const { fetchImpl } = scripted([{ status: 200, body: wrong }]);
    expect(await createAiGateway(endpoint, { fetchImpl, timeoutMs: 500 }).run(request)).toEqual({
      ok: false,
      reason: 'FORMAT',
    });
  });

  it('guard 違規：重試一次並附上違規原因；仍違規 → GUARD（唔會回傳 payload）', async () => {
    const bad = completion(
      envelope({ lines: [{ speaker: 'nurse:N1', text: '血氧 99%，係肺炎' }] }),
    );
    const { sent, fetchImpl } = scripted([{ status: 200, body: bad }]);
    const outcome = await createAiGateway(endpoint, { fetchImpl, timeoutMs: 500 }).run(request);
    expect(outcome).toEqual({ ok: false, reason: 'GUARD' });
    expect(sent).toHaveLength(2);
    const feedback = sent[1]?.body.messages.at(-1)?.content ?? '';
    expect(feedback).toMatch(/number/);
    expect(feedback).toMatch(/diagnosis/);
  });

  it('guard 違規後修復成功', async () => {
    const bad = completion(envelope({ lines: [{ speaker: 'nurse:N1', text: '血氧 99' }] }));
    const { fetchImpl } = scripted([{ status: 200, body: bad }, good]);
    expect((await createAiGateway(endpoint, { fetchImpl, timeoutMs: 500 }).run(request)).ok).toBe(
      true,
    );
  });

  it('context 唔符契約（engine／ai 脫節）→ FORMAT，並且唔會發出請求', async () => {
    const { sent, fetchImpl } = scripted([good]);
    const gateway = createAiGateway(endpoint, { fetchImpl, timeoutMs: 500 });
    expect(await gateway.run({ ...request, context: { prompt: {}, local } })).toEqual({
      ok: false,
      reason: 'FORMAT',
    });
    expect(await gateway.run({ ...request, kind: 'unknown.kind' })).toEqual({
      ok: false,
      reason: 'FORMAT',
    });
    expect(sent).toHaveLength(0);
  });

  it('對白用 dialogueTemperature、解析用 parseTemperature', async () => {
    const a = scripted([good]);
    await createAiGateway(endpoint, { fetchImpl: a.fetchImpl, timeoutMs: 500 }).run(request);
    expect(a.sent[0]?.body.temperature).toBeGreaterThanOrEqual(0.5);
    const parse = completion(envelope({ intent: 'CHAT' }, 'order.parse'));
    const b = scripted([{ status: 200, body: parse }]);
    await createAiGateway(endpoint, { fetchImpl: b.fetchImpl, timeoutMs: 500 }).run({
      reqId: 'r2',
      kind: 'order.parse',
      context: {
        prompt: {
          text: 'hi',
          patientId: 'p1',
          speakers: [],
          catalog: [],
          formulary: [],
          openOrders: [],
        },
        local: { patientId: 'p1', playerText: 'hi', submittedAt: 0 },
      },
    });
    expect(b.sent[0]?.body.temperature).toBeLessThanOrEqual(0.2);
  });
});
