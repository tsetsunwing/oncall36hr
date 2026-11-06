import { z } from 'zod';
import { getConfig } from '@/content';

export interface Settings {
  baseUrl: string;
  apiKey: string;
  model: string;
  nurseConfirmHighRisk: boolean;
}

export type SettingsField = 'baseUrl' | 'apiKey' | 'model';

export const SETTINGS_STORAGE_KEY = 'dandu.settings.v1';

const storedSchema = z
  .object({
    baseUrl: z.string(),
    apiKey: z.string(),
    model: z.string(),
    nurseConfirmHighRisk: z.boolean(),
  })
  .partial();

export function defaultSettings(): Settings {
  const { ai } = getConfig();
  return {
    baseUrl: ai.defaultBaseUrl,
    apiKey: '',
    model: ai.defaultModel,
    nurseConfirmHighRisk: true,
  };
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function normalizeSettings(settings: Settings): Settings {
  return {
    baseUrl: normalizeBaseUrl(settings.baseUrl),
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim(),
    nurseConfirmHighRisk: settings.nurseConfirmHighRisk,
  };
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
    return { ...defaults, ...stripUndefined(parsed.data) };
  } catch {
    return defaults;
  }
}

function stripUndefined(value: {
  [K in keyof Settings]?: Settings[K] | undefined;
}): Partial<Settings> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
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
