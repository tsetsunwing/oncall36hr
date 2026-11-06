import { describe, expect, it } from 'vitest';
import { checkDialogueText, hasBareNumber, leaksDiagnosis } from './numeric';

const rules = {
  allowedTokens: new Set(['vital.spo2', 'order.1.label']),
  denyTerms: ['肺炎', 'sepsis'],
  maxChars: 60,
};

describe('numeric guard（gateway 層）', () => {
  it('合法文字無問題', () => {
    expect(checkDialogueText('血氧 {{vital.spo2}}%，我先處理 {{order.1.label}}。', rules)).toEqual(
      [],
    );
  });

  it.each([
    ['血氧 93', 'BARE_NUMBER'],
    ['血氧 ９３', 'BARE_NUMBER'],
    ['血氧九十三', 'BARE_NUMBER'],
    ['發燒三十八度', 'BARE_NUMBER'],
    ['{{vital.hr}}', 'UNKNOWN_TOKEN'],
    ['{{vital.spo2}', 'MALFORMED_TOKEN'],
    ['可能係肺炎', 'DIAGNOSIS_LEAK'],
    ['Sepsis 嘅可能', 'DIAGNOSIS_LEAK'],
    ['', 'EMPTY'],
    ['好'.repeat(61), 'TOO_LONG'],
  ])('%s → %s', (text, issue) => {
    expect(checkDialogueText(text, rules)).toContain(issue);
  });

  it('口語單個數字唔誤殺；deny 詞忽略 token 內', () => {
    expect(hasBareNumber('等我一下，兩分鐘後再講')).toBe(false);
    expect(leaksDiagnosis('{{vital.spo2}} 偏低', ['spo2'])).toBe(false);
  });
});
