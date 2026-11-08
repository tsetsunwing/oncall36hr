import { describe, expect, it } from 'vitest';
import type { Beat } from './dialogue';
import { shortReplyTemplate } from './shortReplies';
import { extractTokens, validateTemplate } from './tokens';

const vitalTokens = [
  'vital.hr',
  'vital.sbp',
  'vital.dbp',
  'vital.spo2',
  'vital.rr',
  'vital.temp',
  'mews.score',
];

const beats: Beat[] = [
  { type: 'ASK_REPHRASE', speaker: 'NURSE', reason: 'UNKNOWN_ORDER' },
  { type: 'ASK_REPHRASE', speaker: 'NURSE', reason: 'UNSUPPORTED' },
  { type: 'ACK_ORDER', speaker: 'NURSE', labelToken: 'order.1.label', executor: null },
  {
    type: 'REPORT_RESULT',
    speaker: 'NURSE',
    labelToken: 'order.1.label',
    tokens: vitalTokens,
    abnormal: [],
  },
  {
    type: 'REPORT_RESULT',
    speaker: 'NURSE',
    labelToken: 'order.1.label',
    tokens: [],
    abnormal: [],
  },
];

describe('shortReplyTemplate', () => {
  it('每句模板都通過對白 guard（無裸數字、token 齊）', () => {
    for (const beat of beats) {
      const template = shortReplyTemplate(beat);
      expect(template, JSON.stringify(beat)).not.toBeNull();
      const tokens = extractTokens(template ?? '');
      expect(validateTemplate(template ?? '', new Set(tokens), 140), template ?? '').toBeNull();
    }
  });

  it('含其他數值嘅結果交返模型', () => {
    const beat: Beat = {
      type: 'REPORT_RESULT',
      speaker: 'NURSE',
      labelToken: 'order.1.label',
      tokens: ['vital.hr'],
      abnormal: [],
    };
    expect(shortReplyTemplate(beat)).toBeNull();
  });
});
