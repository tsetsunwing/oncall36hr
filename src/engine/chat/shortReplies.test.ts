import { describe, expect, it } from 'vitest';
import type { Beat } from './beats';
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
  { type: 'ALERT_DETERIORATION', speaker: 'NURSE', tokens: vitalTokens, abnormal: [] },
  { type: 'ASK_REPHRASE', speaker: 'NURSE', reason: 'UNKNOWN_ORDER' },
  { type: 'ASK_REPHRASE', speaker: 'NURSE', reason: 'UNSUPPORTED' },
  { type: 'ACK_ORDER', speaker: 'NURSE', labelToken: 'order.1.label', executor: null },
  {
    type: 'ACLS_SHOCK_REFUSED',
    speaker: 'NURSE',
    labelToken: 'order.1.label',
    tokens: ['rhythm.label'],
  },
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
      const limit = beat.type === 'ALERT_DETERIORATION' ? 220 : 140;
      expect(validateTemplate(template ?? '', new Set(tokens), limit), template ?? '').toBeNull();
    }
  });

  it('目錄已經寫好嘅結果句本地使用，唔交模型', () => {
    const beat: Beat = {
      type: 'REPORT_RESULT',
      speaker: 'NURSE',
      labelToken: 'order.1.label',
      tokens: ['vital.hr', 'rhythm.label'],
      abnormal: [],
      preset: 'Pulse {{vital.hr}}/min, {{rhythm.label}}',
    };
    expect(shortReplyTemplate(beat)).toBe('Pulse {{vital.hr}}/min, {{rhythm.label}}');
  });

  it('生命表徵結果沿用既有量度句，唔改成目錄英文', () => {
    const beat: Beat = {
      type: 'REPORT_RESULT',
      speaker: 'NURSE',
      labelToken: 'order.1.label',
      tokens: vitalTokens,
      abnormal: [],
      preset: 'HR {{vital.hr}}',
    };
    expect(shortReplyTemplate(beat)).toContain('量完生命體徵');
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
