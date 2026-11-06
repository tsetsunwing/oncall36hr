import { describe, expect, it } from 'vitest';
import { parseMentions, stripMentions } from './mentions';
import {
  extractTokens,
  hasBareNumber,
  leaksDiagnosis,
  renderTemplate,
  UNRESOLVED_TOKEN_TEXT,
  validateTemplate,
} from './tokens';
import type { Present } from './chatTypes';

const allowed = new Set(['vital.spo2', 'vital.hr', 'order.1.label']);
const check = (text: string) => validateTemplate(text, allowed, 140);

describe('numeric guard（engine 最後防線）', () => {
  it('只有 {{token}} 嘅數值係合法', () => {
    expect(check('血氧 {{vital.spo2}}%，心跳 {{vital.hr}}。')).toBeNull();
    expect(check('收到，即刻做 {{order.1.label}}。')).toBeNull();
  });

  it.each([
    ['血氧 93 呀', 'BARE_NUMBER'],
    ['血氧 ９３', 'BARE_NUMBER'],
    ['血氧九十三', 'BARE_NUMBER'],
    ['體溫三十八度', 'BARE_NUMBER'],
    ['心跳一百二', 'BARE_NUMBER'],
    ['血氧 {{vital.spo2}}，仲有 99', 'BARE_NUMBER'],
    ['血氧 {{vital.secret}}', 'UNKNOWN_TOKEN'],
    ['血氧 {{ vital.spo2 }}', 'MALFORMED_TOKEN'],
    ['血氧 {{vital.spo2}', 'MALFORMED_TOKEN'],
    ['   ', 'EMPTY'],
    ['好'.repeat(141), 'TOO_LONG'],
  ])('%s → %s', (text, issue) => {
    expect(check(text)).toBe(issue);
  });

  it('日常中文單個數字（一下、兩個）唔當作數值', () => {
    expect(check('我睇一下，等一陣。')).toBeNull();
    expect(check('幫你抽兩支血。')).toBeNull();
    expect(hasBareNumber('千萬唔好')).toBe(false);
    expect(hasBareNumber('萬一有事')).toBe(false);
  });

  it('診斷洩露：deny 詞（忽略大細楷／全形），token 內文唔計', () => {
    const deny = ['肺炎', 'sepsis', 'LRTI'];
    expect(leaksDiagnosis('我覺得係肺炎', deny)).toBe(true);
    expect(leaksDiagnosis('可能 SEPSIS', deny)).toBe(true);
    expect(leaksDiagnosis('可能係ＬＲＴＩ', deny)).toBe(true);
    expect(leaksDiagnosis('血氧偏低，要唔要加氧？', deny)).toBe(false);
    expect(leaksDiagnosis('{{order.1.label}} 已經安排', ['label'])).toBe(false);
    expect(leaksDiagnosis('任何文字', [''])).toBe(false);
  });

  it('extractTokens／renderTemplate：未知值顯示佔位字，唔會露出 token 名', () => {
    expect(extractTokens('{{vital.hr}} 同 {{vital.spo2}}')).toEqual(['vital.hr', 'vital.spo2']);
    expect(renderTemplate('心率 {{vital.hr}}，{{vital.x}}', { 'vital.hr': '112' })).toBe(
      `心率 112，${UNRESOLVED_TOKEN_TEXT}`,
    );
    expect(renderTemplate('{{constructor}}', {})).toBe(UNRESOLVED_TOKEN_TEXT);
  });
});

describe('@ 提及', () => {
  const present: Present[] = [
    { id: 'nurse:N1', kind: 'NURSE', name: '何姑娘', tone: null, mentionKeys: ['何姑娘', 'nurse'] },
    {
      id: 'patient:p1',
      kind: 'PATIENT',
      name: '黃國強',
      tone: null,
      mentionKeys: ['黃國強', '病人'],
    },
  ];

  it('由 engine 解析 @，唔信 AI', () => {
    expect(parseMentions('@何姑娘 check vitals', present)).toEqual(['nurse:N1']);
    expect(parseMentions('@nurse 同 @病人，', present)).toEqual(['nurse:N1', 'patient:p1']);
    expect(parseMentions('@全部 你好', present)).toEqual(['nurse:N1', 'patient:p1']);
    expect(parseMentions('冇提及', present)).toEqual([]);
    expect(parseMentions('@不存在 你好', present)).toEqual([]);
  });

  it('stripMentions', () => {
    expect(stripMentions('@何姑娘  check   vitals')).toBe('check vitals');
  });
});
