import { z } from 'zod';
import { getConfig } from '@/content';
import {
  defaultThinking,
  inferProvider,
  isProviderId,
  providerSpec,
  sanitizeThinking,
  withProvider,
  type ProviderId,
} from './providers';

export type { ProviderId } from './providers';

export interface Settings {
  provider: ProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 空字串表示不送思考參數，由模型使用自己的預設。 */
  thinkingLevel: string;
  nurseConfirmHighRisk: boolean;
}

export type SettingsField = 'baseUrl' | 'apiKey' | 'model';

export const SETTINGS_STORAGE_KEY = 'dandu.settings.v1';

const storedSchema = z
  .object({
    provider: z.string(),
    baseUrl: z.string(),
    apiKey: z.string(),
    model: z.string(),
    thinkingLevel: z.string(),
    nurseConfirmHighRisk: z.boolean(),
  })
  .partial();

export function defaultSettings(): Settings {
  const { ai } = getConfig();
  const provider: ProviderId = 'openai';
  const spec = providerSpec(provider);
  return {
    provider,
    baseUrl: ai.defaultBaseUrl,
    apiKey: '',
    model: spec.defaultModel,
    thinkingLevel: defaultThinking(provider, spec.defaultModel),
    nurseConfirmHighRisk: true,
  };
}

const PASTED_ENDPOINT_SUFFIXES = ['/chat/completions', '/messages', '/responses'] as const;

/**
 * 主控台複製的常常是完整端點。去掉路徑尾同 query，xAI 只有 host 時補上 /v1。
 * 請求時 transport.completionTarget 再做一次，避免舊存檔仍打出 404。
 */
function normalizeApiKey(value: string): string {
  let key = value.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  return key.replace(/^bearer\s+/i, '').trim();
}

export function normalizeBaseUrl(value: string): string {
  let text = value.trim();
  try {
    const url = new URL(text);
    url.hash = '';
    url.search = '';
    text = url.toString();
  } catch {
    return value.trim().replace(/\/+$/, '');
  }
  text = text.replace(/\/+$/, '');
  const lower = text.toLowerCase();
  for (const suffix of PASTED_ENDPOINT_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      text = text.slice(0, -suffix.length).replace(/\/+$/, '');
      break;
    }
  }
  try {
    const url = new URL(text);
    const bare = url.pathname === '' || url.pathname === '/';
    if (bare && (url.host === 'api.x.ai' || url.host === 'us.api.x.ai')) return `${url.origin}/v1`;
  } catch {
    return text;
  }
  return text;
}

export function normalizeSettings(settings: Settings): Settings {
  const provider = isProviderId(settings.provider) ? settings.provider : 'openai';
  const model = settings.model.trim();
  return {
    provider,
    baseUrl: normalizeBaseUrl(settings.baseUrl),
    apiKey: normalizeApiKey(settings.apiKey),
    model,
    thinkingLevel: sanitizeThinking(provider, model, settings.thinkingLevel),
    nurseConfirmHighRisk: settings.nurseConfirmHighRisk,
  };
}

export function settingsForProvider(settings: Settings, provider: ProviderId): Settings {
  return normalizeSettings({ ...settings, provider, ...withProvider(provider, settings.model) });
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateSettings(settings: Settings): SettingsField[] {
  const s = normalizeSettings(settings);
  const invalid: SettingsField[] = [];
  if (!isHttpUrl(s.baseUrl)) invalid.push('baseUrl');
  if (s.apiKey.length === 0) invalid.push('apiKey');
  if (s.model.length === 0) invalid.push('model');
  return invalid;
}

export function isSettingsComplete(settings: Settings): boolean {
  return validateSettings(settings).length === 0;
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadSettings(storage: Storage | undefined = safeStorage()): Settings {
  const defaults = defaultSettings();
  if (!storage) return defaults;
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    if (raw === null) return defaults;
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return defaults;
    const stored = definedFields(parsed.data);
    const provider =
      stored.provider && isProviderId(stored.provider)
        ? stored.provider
        : (inferProvider(stored.baseUrl ?? defaults.baseUrl) ?? defaults.provider);
    const model = stored.model ?? defaults.model;
    const thinkingLevel =
      stored.thinkingLevel !== undefined
        ? sanitizeThinking(provider, model, stored.thinkingLevel)
        : defaultThinking(provider, model);
    return normalizeSettings({
      provider,
      baseUrl: stored.baseUrl ?? defaults.baseUrl,
      apiKey: stored.apiKey ?? defaults.apiKey,
      model,
      thinkingLevel,
      nurseConfirmHighRisk: stored.nurseConfirmHighRisk ?? defaults.nurseConfirmHighRisk,
    });
  } catch {
    return defaults;
  }
}

function definedFields<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function saveSettings(
  settings: Settings,
  storage: Storage | undefined = safeStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

export function clearSettings(storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.removeItem(SETTINGS_STORAGE_KEY);
  } catch {
    /* 無法存取 storage 時，視為已清除 */
  }
}
