import { describe, expect, it } from 'vitest';
import {
  SETTINGS_STORAGE_KEY,
  clearSettings,
  defaultSettings,
  isSettingsComplete,
  loadSettings,
  normalizeBaseUrl,
  saveSettings,
  validateSettings,
} from './settings';

describe('settings storage', () => {
  it('defaults come from config and have no key', () => {
    const d = defaultSettings();
    expect(d.baseUrl).toBe('https://api.openai.com/v1');
    expect(d.apiKey).toBe('');
    expect(d.model.length).toBeGreaterThan(0);
    expect(isSettingsComplete(d)).toBe(false);
    expect(validateSettings(d)).toEqual(['apiKey']);
  });

  it('round-trips through localStorage', () => {
    saveSettings({ ...defaultSettings(), apiKey: ' sk-test ', baseUrl: 'http://x.test/v1/' });
    const raw = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null') as Record<
      string,
      unknown
    >;
    expect(raw.apiKey).toBe('sk-test');
    expect(raw.baseUrl).toBe('http://x.test/v1');
    expect(loadSettings().apiKey).toBe('sk-test');
  });

  it('falls back to defaults on corrupt or wrong-typed data', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, '{not json');
    expect(loadSettings()).toEqual(defaultSettings());
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ apiKey: 123 }));
    expect(loadSettings()).toEqual(defaultSettings());
  });

  it('merges partial stored data with defaults', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ apiKey: 'k' }));
    const s = loadSettings();
    expect(s.apiKey).toBe('k');
    expect(s.baseUrl).toBe(defaultSettings().baseUrl);
    expect(s.provider).toBe('openai');
    expect(s.thinkingLevel).toBe('medium');
  });

  it('infers the provider from a stored base URL and drops unknown thinking levels', () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ baseUrl: 'https://api.x.ai/v1', model: 'grok-4.5', thinkingLevel: 'xhigh' }),
    );
    const s = loadSettings();
    expect(s.provider).toBe('grok');
    expect(s.thinkingLevel).toBe('high');
  });

  it('validates base URL protocol, key and model', () => {
    const base = { ...defaultSettings(), apiKey: 'k' };
    expect(isSettingsComplete(base)).toBe(true);
    expect(validateSettings({ ...base, baseUrl: 'ftp://x' })).toEqual(['baseUrl']);
    expect(validateSettings({ ...base, baseUrl: 'not a url' })).toEqual(['baseUrl']);
    expect(validateSettings({ ...base, model: '   ' })).toEqual(['model']);
    expect(validateSettings({ ...base, apiKey: '   ' })).toEqual(['apiKey']);
  });

  it('clearSettings removes the entry', () => {
    saveSettings({ ...defaultSettings(), apiKey: 'k' });
    clearSettings();
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
  });

  it('normalizes trailing slashes', () => {
    expect(normalizeBaseUrl(' https://a.test/v1/// ')).toBe('https://a.test/v1');
  });

  it('turns a pasted console endpoint into the base URL', () => {
    expect(normalizeBaseUrl('https://api.x.ai/v1/chat/completions')).toBe('https://api.x.ai/v1');
    expect(normalizeBaseUrl('https://api.x.ai')).toBe('https://api.x.ai/v1');
    expect(normalizeBaseUrl('https://us.api.x.ai/v1/chat/completions?x=1')).toBe(
      'https://us.api.x.ai/v1',
    );
    expect(normalizeBaseUrl('https://api.openai.com/v1/chat/completions')).toBe(
      'https://api.openai.com/v1',
    );
    expect(normalizeBaseUrl('https://api.anthropic.com/v1/messages')).toBe(
      'https://api.anthropic.com/v1',
    );
  });

  it('strips a copied Bearer prefix from the key', () => {
    saveSettings({ ...defaultSettings(), apiKey: 'Bearer xai-test-key' });
    expect(loadSettings().apiKey).toBe('xai-test-key');
  });
});
