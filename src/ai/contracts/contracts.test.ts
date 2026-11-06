import { describe, expect, it } from 'vitest';
import { contractFor, dialogueContract, orderParseContract } from '.';
import type { DialoguePrompt } from './dialogueTurn';
import type { OrderParsePrompt } from './orderParse';

const orderPrompt: OrderParsePrompt = {
  text: 'give ceftriaxone 2 g iv',
  patientId: 'p1',
  speakers: [{ id: 'nurse:N1', kind: 'NURSE', name: '何姑娘' }],
  catalog: [
    {
      id: 'drug.ceftriaxone',
      type: 'DRUG',
      label: 'Ceftriaxone',
      aliases: [],
      formularyId: 'ceftriaxone',
      executors: ['NURSE'],
    },
    {
      id: 'oxygen.nrb',
      type: 'OXYGEN',
      label: 'Oxygen NRB',
      aliases: ['nrb'],
      formularyId: null,
      executors: ['NURSE'],
    },
  ],
  formulary: [
    { id: 'ceftriaxone', label: 'Ceftriaxone', aliases: [], units: ['g', 'mg'], routes: ['IV'] },
  ],
  openOrders: [{ id: 'o1', catalogId: 'oxygen.nrb' }],
};
const orderLocal = { patientId: 'p1', playerText: orderPrompt.text, submittedAt: 0 };

describe('order.parse 契約', () => {
  const guard = (data: unknown, text = orderPrompt.text) => {
    const parsed = orderParseContract.dataSchema.parse(data);
    return orderParseContract.guard(parsed, orderPrompt, { ...orderLocal, playerText: text })
      .issues;
  };

  it('schema：預設空陣列、剝除多餘欄位（vitals／diagnosis 等）', () => {
    const parsed = orderParseContract.dataSchema.parse({
      intent: 'CHAT',
      vitals: { spo2: 99 },
      diagnosis: 'x',
      actions: [{ catalogId: 'oxygen.nrb', mews: 0 }],
    });
    expect(parsed).toEqual({
      intent: 'CHAT',
      actions: [{ catalogId: 'oxygen.nrb' }],
      cancelTargets: [],
    });
  });

  it('schema：拒絕未知 intent 同錯誤型別', () => {
    expect(orderParseContract.dataSchema.safeParse({ intent: 'HACK' }).success).toBe(false);
    expect(orderParseContract.dataSchema.safeParse({ intent: 'ORDER', actions: 'x' }).success).toBe(
      false,
    );
    expect(orderParseContract.dataSchema.safeParse(null).success).toBe(false);
  });

  it('guard：合法 → 無問題', () => {
    expect(
      guard({
        intent: 'ORDER',
        actions: [
          {
            catalogId: 'drug.ceftriaxone',
            drug: { formularyId: 'ceftriaxone', dose: { value: 2, unit: 'g' }, route: 'IV' },
          },
        ],
      }),
    ).toEqual([]);
  });

  it('guard：虛構 catalogId／formulary／劑量／單位／cancel 目標都會被報告', () => {
    expect(guard({ intent: 'ORDER', actions: [{ catalogId: 'drug.morphine' }] })).toHaveLength(1);
    expect(
      guard({
        intent: 'ORDER',
        actions: [{ catalogId: 'drug.ceftriaxone', drug: { formularyId: 'morphine' } }],
      }),
    ).toHaveLength(1);
    expect(
      guard({
        intent: 'ORDER',
        actions: [
          {
            catalogId: 'drug.ceftriaxone',
            drug: { formularyId: 'ceftriaxone', dose: { value: 99, unit: 'g' } },
          },
        ],
      })[0],
    ).toMatch(/does not appear/);
    expect(
      guard({
        intent: 'ORDER',
        actions: [
          {
            catalogId: 'drug.ceftriaxone',
            drug: { formularyId: 'ceftriaxone', dose: { value: 2, unit: 'kg' } },
          },
        ],
      })[0],
    ).toMatch(/not valid/);
    expect(guard({ intent: 'CANCEL', cancelTargets: ['o1', 'o9'] })).toHaveLength(1);
  });
});

describe('dialogue.turn 契約', () => {
  const prompt: DialoguePrompt = {
    patientId: 'p1',
    speakers: [
      { id: 'nurse:N1', kind: 'NURSE', name: '何姑娘', tone: null },
      { id: 'patient:p1', kind: 'PATIENT', name: '黃國強', tone: null },
    ],
    addressed: [],
    beats: [{ type: 'REPORT_STATUS', speaker: 'NURSE', tokens: ['vital.spo2'], abnormal: [] }],
    allowedTokens: ['vital.spo2'],
    recent: [],
    maxLines: 2,
    maxLineChars: 40,
  };
  const local = {
    patientId: 'p1',
    speakerIds: ['nurse:N1', 'patient:p1'],
    allowedTokens: ['vital.spo2'],
    denyTerms: ['肺炎'],
    frozenTokens: { 'vital.spo2': '93' },
  };
  const run = (data: unknown) =>
    dialogueContract.guard(dialogueContract.dataSchema.parse(data), prompt, local).issues;

  it('合法對白無問題；多餘欄位被剝除', () => {
    const data = dialogueContract.dataSchema.parse({
      lines: [{ speaker: 'nurse:N1', text: '血氧 {{vital.spo2}}', vitals: 1 }],
      diagnosis: 'x',
    });
    expect(data).toEqual({ lines: [{ speaker: 'nurse:N1', text: '血氧 {{vital.spo2}}' }] });
    expect(run(data)).toEqual([]);
  });

  it('違規：裸數字、未知 token、診斷、未知 speaker、太多行、太長', () => {
    expect(run({ lines: [{ speaker: 'nurse:N1', text: '血氧 99%' }] })[0]).toMatch(/number/);
    expect(run({ lines: [{ speaker: 'nurse:N1', text: '{{vital.hr}}' }] })[0]).toMatch(/token/);
    expect(run({ lines: [{ speaker: 'nurse:N1', text: '肺炎' }] })[0]).toMatch(/diagnosis/);
    expect(run({ lines: [{ speaker: 'boss', text: '好' }] })[0]).toMatch(/speaker/);
    expect(
      run({ lines: Array.from({ length: 3 }, () => ({ speaker: 'nurse:N1', text: '好' })) })[0],
    ).toMatch(/At most 2/);
    expect(run({ lines: [{ speaker: 'nurse:N1', text: '好'.repeat(41) }] })[0]).toMatch(/longer/);
  });

  it('schema：lines 不可為空', () => {
    expect(dialogueContract.dataSchema.safeParse({ lines: [] }).success).toBe(false);
  });
});

it('contractFor：只認識已登記嘅 kind', () => {
  for (const kind of [
    'order.parse',
    'dialogue.turn',
    'gate.pharmacy',
    'gate.nurse',
    'gate.danger',
  ]) {
    expect(contractFor(kind), kind).toBeDefined();
  }
  expect(contractFor('gate.unknown')).toBeUndefined();
});
