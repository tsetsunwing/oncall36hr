import { describe, expect, it } from 'vitest';
import { dialogue, dialogueTemplate, ui } from '.';

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'object' && value !== null)
    return Object.values(value).flatMap(collectStrings);
  return [];
}

// 粵語專用字：介面（書面語）不應出現；對白則應該用粵語。
const CANTONESE_ONLY = /[嘅唔咗喺啲嘢冇佢哋嚟俾咁囉啩咩嘅]/u;

describe('zh-Hant strings', () => {
  it('UI strings use written Chinese (no Cantonese-only characters)', () => {
    for (const text of collectStrings(ui)) {
      expect(text, text).not.toMatch(CANTONESE_ONLY);
    }
  });

  it('character dialogue is Cantonese', () => {
    for (const text of collectStrings(dialogue)) {
      expect(text, text).toMatch(CANTONESE_ONLY);
    }
  });

  it('dialogue uses {{token}} for numbers instead of bare digits', () => {
    for (const text of collectStrings(dialogue)) {
      const withoutTokens = text.replace(/\{\{[^}]+\}\}/g, '');
      expect(withoutTokens, text).not.toMatch(/\d/);
    }
    expect(dialogueTemplate('nurse.greeting')).toContain('{{');
  });
});
