import { describe, expect, it } from 'vitest';
import {
  contractFor,
  dialogueContract,
  orderEffectContract,
  orderParseContract,
  roundsGradeContract,
  roundsQuestionContract,
} from '.';
import { GATE_PHARMACY_SYSTEM } from '../prompts/system';
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
    expect(
      guard({ intent: 'ORDER', actions: [{ catalogId: 'drug.not-in-catalog' }] }),
    ).toHaveLength(1);
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
    card: { openOrders: [], active: [] },
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
    'rounds.question',
    'rounds.grade',
  ]) {
    expect(contractFor(kind), kind).toBeDefined();
  }
  expect(contractFor('gate.unknown')).toBeUndefined();
});

describe('dialogue.turn：搶救／死亡 beats', () => {
  const beats: DialoguePrompt['beats'] = [
    { type: 'ARREST_ANNOUNCED', speaker: 'NURSE', tokens: ['rhythm.label'], rearrest: false },
    { type: 'ACLS_CYCLE_DUE', speaker: 'NURSE', tokens: ['rhythm.label'] },
    { type: 'ACLS_ACTION_DONE', speaker: 'NURSE', action: 'CPR_STARTED', labelToken: null },
    {
      type: 'ACLS_ACTION_DONE',
      speaker: 'NURSE',
      action: 'DRUG_GIVEN',
      labelToken: 'order.1.label',
    },
    { type: 'ACLS_RHYTHM_REPORTED', speaker: 'NURSE', tokens: ['rhythm.label'], shockable: true },
    { type: 'ACLS_ROSC', speaker: 'NURSE' },
    { type: 'ACLS_STOP_REFUSED', speaker: 'NURSE', tokens: ['acls.cycles', 'acls.minCycles'] },
    { type: 'ACLS_NOT_APPLICABLE', speaker: 'NURSE', labelToken: 'order.1.label' },
    {
      type: 'ACLS_SHOCK_REFUSED',
      speaker: 'NURSE',
      labelToken: 'order.1.label',
      tokens: ['rhythm.label'],
    },
    { type: 'DEATH_PRONOUNCED', speaker: 'NURSE', tokens: ['patient.name', 'patient.bed'] },
  ];
  const prompt: DialoguePrompt = {
    patientId: 'p1',
    speakers: [{ id: 'nurse:N1', kind: 'NURSE', name: '何姑娘', tone: null }],
    addressed: [],
    beats,
    allowedTokens: ['rhythm.label', 'acls.cycles', 'acls.minCycles', 'order.1.label'],
    card: { openOrders: [], active: [] },
    recent: [],
    maxLines: 9,
    maxLineChars: 80,
  };

  it('所有新 beat 通過 prompt schema', () => {
    expect(dialogueContract.promptSchema.safeParse(prompt).success).toBe(true);
    expect(
      dialogueContract.promptSchema.safeParse({
        ...prompt,
        beats: [{ type: 'ACLS_ROSC', speaker: 'PATIENT' }],
      }).success,
    ).toBe(false);
  });

  it('system prompt 聲明 engine 先決定結果、AI 只措辭，唔提生存機率', () => {
    expect(dialogueContract.system).toMatch(/engine alone decides every outcome/);
    expect(dialogueContract.system).toMatch(/never state or hint at a chance of survival/);
  });
});

describe('rounds.question／rounds.grade 契約', () => {
  const question = {
    hostRank: 'AC',
    playerRank: 'MO',
    category: 'HISTORY',
    focus: '肺炎病人的病史重點',
    keyFacts: [
      { id: 'f1', text: '典型症狀包括發燒、咳嗽' },
      { id: 'f2', text: '要問吸煙史' },
      { id: 'f3', text: '了解近期入院' },
    ],
    patient: { age: 70, sex: 'M', presentingComplaint: '氣促' },
    hintCount: 3,
    maxQuestionChars: 40,
    maxHintChars: 20,
  } as const;
  const qGuard = (data: unknown) =>
    roundsQuestionContract.guard(
      roundsQuestionContract.dataSchema.parse(data),
      roundsQuestionContract.promptSchema.parse(question),
      { number: 1, patientId: 'p1', topicId: 't1' },
    ).issues;

  it('題目：合法輸出通過；數字、token、超長、提示數量錯、重複提示都被擋', () => {
    expect(
      qGuard({ question: '你會問啲咩病史？', hints: ['發燒咳嗽', '吸煙史', '近期入院'] }),
    ).toEqual([]);
    expect(qGuard({ question: '血氧九十三', hints: ['甲', '乙', '丙'] }).join()).toMatch(/number/);
    expect(qGuard({ question: '請答 3 點', hints: ['甲', '乙', '丙'] }).join()).toMatch(/digit/);
    expect(qGuard({ question: '血氧 {{vital.spo2}}', hints: ['甲', '乙', '丙'] }).join()).toMatch(
      /tokens/,
    );
    expect(qGuard({ question: '好'.repeat(41), hints: ['甲', '乙', '丙'] }).join()).toMatch(
      /longer/,
    );
    expect(qGuard({ question: '你會問啲咩？', hints: ['甲', '乙'] }).join()).toMatch(/exactly 3/);
    expect(qGuard({ question: '你會問啲咩？', hints: ['甲', '甲', '丙'] }).join()).toMatch(
      /different/,
    );
  });

  const grade = {
    ...question,
    question: '你會問啲咩？',
    answer: '發燒咳嗽',
    viaHint: false,
    maxLineChars: 30,
  };
  const gGuard = (data: unknown) =>
    roundsGradeContract.guard(
      roundsGradeContract.dataSchema.parse(data),
      roundsGradeContract.promptSchema.parse(grade),
      { number: 1, patientId: 'p1', topicId: 't1' },
    ).issues;

  it('評分：只可引用 key fact id；非答錯必須有命中；seniorLine 唔准有數字', () => {
    expect(gGuard({ verdict: 'CORRECT', matchedKeyFacts: ['f1'], seniorLine: '啱' })).toEqual([]);
    expect(gGuard({ verdict: 'WRONG', matchedKeyFacts: [] })).toEqual([]);
    expect(gGuard({ verdict: 'CORRECT', matchedKeyFacts: ['zzz'] }).join()).toMatch(/copied/);
    expect(gGuard({ verdict: 'PARTIAL', matchedKeyFacts: [] }).join()).toMatch(
      /needs at least one/,
    );
    expect(gGuard({ verdict: 'WRONG', matchedKeyFacts: [], seniorLine: '畀 9 分' }).join()).toMatch(
      /digit/,
    );
    expect(roundsGradeContract.dataSchema.safeParse({ verdict: 'GREAT' }).success).toBe(false);
  });
});

describe('order.effect', () => {
  const prompt = {
    text: 'Dobutamine 5000 mg IV',
    drugName: 'Dobutamine',
    dose: { value: 5000, unit: 'mg' },
    route: 'IV',
    classes: ['SYMPATHOMIMETICS'],
    categories: [
      { id: 'bradycardia', label: 'bradycardia' },
      { id: 'none', label: 'no extra effect' },
    ],
  };
  const local = { orderId: 'o1', patientId: 'p1' };

  it('只接受名單上的 id，多出的數字欄過不了 schema', () => {
    expect(orderEffectContract.system).toMatch(/diagnosis/i);
    expect(orderEffectContract.system).toMatch(/never write any digit/i);
    expect(orderEffectContract.system).not.toMatch(/Hong Kong Cantonese/);
    const parsed = orderEffectContract.promptSchema.parse(prompt);
    expect(parsed.categories.every((item) => Object.keys(item).sort().join() === 'id,label')).toBe(
      true,
    );
    expect(
      orderEffectContract.guard(
        { effectCategory: 'bradycardia' },
        parsed,
        orderEffectContract.localSchema.parse(local),
      ).issues,
    ).toEqual([]);
    expect(
      orderEffectContract
        .guard({ effectCategory: 'sbp-40' }, parsed, orderEffectContract.localSchema.parse(local))
        .issues.join(' '),
    ).toMatch(/not in categories/);
    expect(
      orderEffectContract.dataSchema.safeParse({ effectCategory: 'bradycardia', sbp: 40 }).success,
    ).toBe(false);
  });
});

describe('把關提示', () => {
  it('typicalDose 係 null 時仍然要攔明顯唔係治療劑量嘅醫囑', () => {
    expect(GATE_PHARMACY_SYSTEM).not.toMatch(/do NOT judge the dose/);
    expect(GATE_PHARMACY_SYSTEM).toMatch(/plainly not a therapeutic dose/);
  });
});
