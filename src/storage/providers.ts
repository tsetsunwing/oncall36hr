/**
 * 2026-11-07 仍然在售的文字模型。清單只收各供應商自己的模型頁，
 * 唔收已標 Deprecated、將於短期停用、或圖像／語音／影片專用的 id。
 *
 * 來源：
 * - Grok：https://docs.x.ai/developers/models
 *   https://docs.x.ai/developers/model-capabilities/text/reasoning
 * - Gemini：https://ai.google.dev/gemini-api/docs/models
 *   https://ai.google.dev/gemini-api/docs/openai
 * - OpenAI：https://developers.openai.com/api/docs/models
 *   https://developers.openai.com/api/docs/guides/reasoning
 * - Claude：https://platform.claude.com/docs/en/about-claude/models/overview
 *   https://platform.claude.com/docs/en/build-with-claude/effort
 *   https://platform.claude.com/docs/en/api/messages
 */

export const PROVIDERS = ['grok', 'gemini', 'openai', 'claude'] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export interface ModelOption {
  id: string;
  /** 該模型文件寫明的思考等級。空陣列表示不提供控制。 */
  thinking: readonly string[];
  /** 文件寫明的預設。空字串表示文件沒有寫明，介面留空、請求不送這個欄位。 */
  defaultThinking: string;
}

export interface ProviderSpec {
  id: ProviderId;
  label: string;
  baseUrl: string;
  defaultModel: string;
  models: readonly ModelOption[];
}

const grokThinking = ['low', 'medium', 'high', 'xhigh'] as const;
const grok45Thinking = ['low', 'medium', 'high'] as const;
const geminiArgonThinking = ['low', 'medium', 'high'] as const;
/** 相容層實測拒收 minimal（400）。Gemini 3 也不能用 none 關掉思考。 */
const geminiFlashThinking = ['low', 'medium', 'high'] as const;
const openaiFull = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
const openaiNoNone = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
const claudeEffort = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export const PROVIDER_SPECS: readonly ProviderSpec[] = [
  {
    id: 'grok',
    label: 'Grok',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4.7',
    models: [
      { id: 'grok-4.7', thinking: grokThinking, defaultThinking: 'high' },
      { id: 'grok-4.6', thinking: grokThinking, defaultThinking: 'high' },
      { id: 'grok-4.5', thinking: grok45Thinking, defaultThinking: 'high' },
      { id: 'grok-4.3', thinking: [], defaultThinking: '' },
      { id: 'grok-4.20-0309-reasoning', thinking: [], defaultThinking: '' },
      { id: 'grok-4.20-0309-non-reasoning', thinking: [], defaultThinking: '' },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.8-flash',
    models: [
      { id: 'gemini-4-argon', thinking: geminiArgonThinking, defaultThinking: 'high' },
      { id: 'gemini-3.8-flash', thinking: geminiFlashThinking, defaultThinking: '' },
      { id: 'gemini-3.6-flash', thinking: geminiFlashThinking, defaultThinking: '' },
      { id: 'gemini-3.5-flash-lite', thinking: geminiFlashThinking, defaultThinking: '' },
      { id: 'gemini-3.1-flash-lite', thinking: geminiFlashThinking, defaultThinking: '' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.6-luna',
    models: [
      { id: 'gpt-6-astra', thinking: openaiNoNone, defaultThinking: '' },
      { id: 'gpt-6.1-sol', thinking: openaiNoNone, defaultThinking: 'medium' },
      { id: 'gpt-6.1-terra', thinking: openaiFull, defaultThinking: 'medium' },
      { id: 'gpt-6-sol', thinking: openaiFull, defaultThinking: 'medium' },
      { id: 'gpt-6-luna', thinking: openaiFull, defaultThinking: 'medium' },
      { id: 'gpt-5.6-sol', thinking: openaiFull, defaultThinking: 'medium' },
      { id: 'gpt-5.6-terra', thinking: openaiFull, defaultThinking: 'medium' },
      { id: 'gpt-5.6-luna', thinking: openaiFull, defaultThinking: 'medium' },
    ],
  },
  {
    id: 'claude',
    label: 'Claude',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-haiku-5-5',
    models: [
      { id: 'claude-fable-5-1', thinking: claudeEffort, defaultThinking: 'high' },
      { id: 'claude-opus-5-5', thinking: claudeEffort, defaultThinking: 'medium' },
      { id: 'claude-sonnet-5-5', thinking: claudeEffort, defaultThinking: 'high' },
      { id: 'claude-haiku-5-5', thinking: claudeEffort, defaultThinking: 'medium' },
    ],
  },
];

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDERS as readonly string[]).includes(value);
}

export function providerSpec(id: ProviderId): ProviderSpec {
  const spec = PROVIDER_SPECS.find((item) => item.id === id);
  if (!spec) throw new Error(`unknown provider ${id}`);
  return spec;
}

export function modelOption(provider: ProviderId, modelId: string): ModelOption | undefined {
  return providerSpec(provider).models.find((item) => item.id === modelId);
}

export function inferProvider(baseUrl: string): ProviderId | undefined {
  try {
    const host = new URL(baseUrl).host;
    if (host === 'api.x.ai' || host === 'us.api.x.ai') return 'grok';
    if (host === 'generativelanguage.googleapis.com') return 'gemini';
    if (host === 'api.openai.com') return 'openai';
    if (host === 'api.anthropic.com') return 'claude';
  } catch {
    return undefined;
  }
  return undefined;
}

/** 只保留這個模型文件列出的等級；自訂模型 id 不送思考參數。 */
export function sanitizeThinking(provider: ProviderId, modelId: string, level: string): string {
  const option = modelOption(provider, modelId.trim());
  const trimmed = level.trim();
  if (!option || trimmed.length === 0) return '';
  return option.thinking.includes(trimmed) ? trimmed : option.defaultThinking;
}

export function defaultThinking(provider: ProviderId, modelId: string): string {
  return modelOption(provider, modelId)?.defaultThinking ?? '';
}

export function withProvider(
  provider: ProviderId,
  currentModel: string,
): { baseUrl: string; model: string; thinkingLevel: string } {
  const spec = providerSpec(provider);
  const model = spec.models.some((item) => item.id === currentModel)
    ? currentModel
    : spec.defaultModel;
  return { baseUrl: spec.baseUrl, model, thinkingLevel: defaultThinking(provider, model) };
}
