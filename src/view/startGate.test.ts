import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/storage';
import { selectStartGate } from './startGate';

describe('start gate', () => {
  it('blocks without a key and names the missing field', () => {
    expect(selectStartGate(defaultSettings())).toEqual({ canStart: false, missing: ['apiKey'] });
  });

  it('blocks whitespace-only key', () => {
    expect(selectStartGate({ ...defaultSettings(), apiKey: '   ' }).canStart).toBe(false);
  });

  it('allows start once settings are complete', () => {
    expect(selectStartGate({ ...defaultSettings(), apiKey: 'k' })).toEqual({ canStart: true });
  });
});
