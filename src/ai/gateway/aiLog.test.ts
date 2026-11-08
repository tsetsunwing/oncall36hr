import { beforeEach, describe, expect, it } from 'vitest';
import {
  aiLogEntries,
  clearAiLog,
  estimateTokens,
  recordAiExchange,
  reportedUsage,
  summarizeAiLog,
} from './aiLog';

beforeEach(() => {
  clearAiLog();
});

describe('AI log', () => {
  it('估算 token：中文字比英文字元重', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('醫生你好')).toBe(6);
  });

  it('讀供應商回傳嘅 usage（OpenAI 同 Claude 格式）', () => {
    expect(reportedUsage({ usage: { prompt_tokens: 10, completion_tokens: 4 } })).toEqual({
      prompt: 10,
      completion: 4,
      total: 14,
    });
    expect(reportedUsage({ usage: { input_tokens: 7, output_tokens: 3 } })).toEqual({
      prompt: 7,
      completion: 3,
      total: 10,
    });
    expect(reportedUsage({})).toBeNull();
  });

  it('記低請求同回覆，但 API key 唔會出現', () => {
    recordAiExchange({
      reqId: 'r1',
      kind: 'order.parse',
      attempt: 1,
      provider: 'grok',
      model: 'grok-4.3',
      url: 'https://api.x.ai/v1/chat/completions',
      status: 200,
      ms: 12.4,
      outcome: 'ok',
      failure: null,
      request: [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'please use xai-abcdef123456 to call' },
      ],
      reply: '{"echo":"xai-abcdef123456"}',
      reportedUsage: { prompt: 100, completion: 20, total: 120 },
      apiKey: 'xai-abcdef123456',
    });
    const [entry] = aiLogEntries();
    expect(entry?.kind).toBe('order.parse');
    expect(entry?.ms).toBe(12);
    expect(entry?.tokens.reported?.total).toBe(120);
    expect(JSON.stringify(entry)).not.toContain('xai-abcdef123456');
    expect(summarizeAiLog().requests).toBe(1);
  });
});
