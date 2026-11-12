import { describe, expect, it } from 'vitest';
import { getDrugEffectTables, presetOf, classRowFor } from '@/content/drugEffects';
import type { Effect } from '../core/events';
import { gameStateSchema, type GameState } from '../core/state';
import { orderSchema } from './orderTypes';
import { composeOrderLabel } from './label';
import {
  advance,
  aiRequests,
  feed,
  intentEvent,
  params,
  realEngine,
  realTables,
  zeroNoiseTables,
} from '../test/realEngine';

const tables = zeroNoiseTables();
const engine = realEngine(tables);
const noisy = realEngine(realTables());
const effects = getDrugEffectTables();

function drug(id: string) {
  const row = tables['treatment-drugs'].find((item) => item.id === id);
  if (!row) throw new Error(id);
  return row;
}

function fresh(seed: string) {
  return engine.init(params(seed));
}

function place(
  state: GameState,
  drugId: string,
  dose: { value: number; unit: string } | null,
  route: string | null,
) {
  const name = drug(drugId).name;
  const text =
    `${name} ${dose ? String(dose.value) : ''} ${dose?.unit ?? ''} ${route ?? ''}`.trim();
  return feed(engine, state, [
    intentEvent({
      type: 'PLACE_CATALOG',
      patientId: 'p1',
      catalogId: 'drug.unlisted',
      text,
      params: {
        drugFormularyId: null,
        dose,
        route,
        treatmentDrugId: drugId,
      },
    }),
  ]);
}

function orderOf(state: GameState) {
  const orders = Object.values(state.orders);
  const placed = orders[orders.length - 1];
  if (!placed) throw new Error('沒有醫囑');
  return placed;
}

function kinds(list: readonly Effect[]) {
  return aiRequests(list).map((item) => item.kind);
}

function pharmacyCalls(state: GameState) {
  return state.ward.calls.filter((call) => call.tag === 'PHARMACY');
}

function vitals(state: GameState) {
  const patient = state.patients.p1;
  if (!patient) throw new Error('缺病人');
  return patient.visible.vitals;
}

/** 新機制：藥效有 onset＋漸進＋遞減（下限 residual）＋±15% jitter，所以只驗方向同上下限。 */
function assertDrugDiff(
  diff: { hr: number; sbp: number; rr: number; temp: number },
  full: { hr: number; sbp: number; rr: number; temp: number },
) {
  for (const key of ['hr', 'sbp', 'rr'] as const) {
    const f = full[key];
    if (f === 0) {
      expect(Math.abs(diff[key])).toBeLessThanOrEqual(1);
      continue;
    }
    if (Math.abs(f) < 5) {
      // 細數值經 onset／遞減／jitter／四捨五入後可能跌到 0，只驗上限
      expect(Math.abs(diff[key])).toBeLessThanOrEqual(Math.abs(f) * 1.15 + 1);
      continue;
    }
    expect(Math.sign(diff[key])).toBe(Math.sign(f));
    expect(Math.abs(diff[key])).toBeLessThanOrEqual(Math.abs(f) * 1.15 + 1);
    expect(Math.abs(diff[key])).toBeGreaterThanOrEqual(Math.abs(f) * 0.15 - 1);
  }
  expect(Math.abs(diff.temp)).toBeLessThanOrEqual(Math.abs(full.temp) * 1.15 + 0.2);
}

describe('治療藥物彈窗', () => {
  it('輸注濃度經落單保存，標籤顯示，並可經存檔 schema 讀回', () => {
    const run = feed(engine, fresh('concentration'), [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'drug.unlisted',
        text: 'Dobutamine 5 mg IV Infusion 5 mL/hr | 4 mg in 50 mL',
        params: {
          drugFormularyId: null,
          dose: { value: 5, unit: 'mg' },
          route: 'IV Infusion',
          rate: { value: 5, unit: 'mL/hr' },
          concentration: '4 mg in 50 mL',
          diluent: 'Neat',
          volumeMl: 50,
          infuseOverMinutes: 30,
          treatmentDrugId: 'dobutamine--sympathomimetics--general-drugs',
        },
      }),
    ]);
    const placed = orderOf(run.state);
    expect(placed.params).toMatchObject({
      concentration: '4 mg in 50 mL',
      diluent: 'Neat',
      volumeMl: 50,
      infuseOverMinutes: 30,
    });
    expect(composeOrderLabel(undefined, placed)).toContain(
      '4 mg in 50 mL, Neat, 50 mL, Infuse over 30 mins',
    );
    expect(orderSchema.parse(JSON.parse(JSON.stringify(placed))).params.concentration).toBe(
      '4 mg in 50 mL',
    );
  });

  it('按需原因經治療藥物落單保存，並能從存檔 schema 讀回', () => {
    const run = feed(engine, fresh('prn-reason'), [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'drug.unlisted',
        text: 'Dobutamine 5 mg IV Q6H | PRN Pain',
        params: {
          drugFormularyId: null,
          dose: { value: 5, unit: 'mg' },
          route: 'IV',
          frequency: 'Q6H',
          prnReason: 'Pain',
          treatmentDrugId: 'dobutamine--sympathomimetics--general-drugs',
        },
      }),
    ]);
    const placed = orderOf(run.state);
    expect(placed.params.prnReason).toBe('Pain');
    expect(composeOrderLabel(undefined, placed)).toContain('PRN Pain');
    expect(orderSchema.parse(JSON.parse(JSON.stringify(placed))).params.prnReason).toBe('Pain');
  });

  it('藥典醫囑與完整狀態存檔保留輸液欄位', () => {
    const run = feed(engine, fresh('catalog-infusion'), [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'drug.adrenaline',
        text: 'Adrenaline 1 mg IV over 30 min',
        params: {
          drugFormularyId: 'adrenaline',
          dose: { value: 1, unit: 'mg' },
          route: 'IV',
          frequency: 'STAT',
          diluent: '0.9% NaCl',
          volumeMl: 50,
          infuseOverMinutes: 30,
        },
      }),
    ]);
    const state = gameStateSchema.parse(JSON.parse(JSON.stringify(run.state)));
    expect(orderOf(state).params).toMatchObject({
      diluent: '0.9% NaCl',
      volumeMl: 50,
      infuseOverMinutes: 30,
    });
  });

  it('藥典目錄醫囑同樣保存按需原因', () => {
    const run = feed(engine, fresh('catalog-prn-reason'), [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'drug.adrenaline',
        text: 'Adrenaline 1 mg IV Q6H | PRN Pain',
        params: {
          drugFormularyId: 'adrenaline',
          dose: { value: 1, unit: 'mg' },
          route: 'IV',
          frequency: 'Q6H',
          prnReason: 'Pain',
        },
      }),
    ]);
    const placed = orderOf(run.state);
    expect(placed.params.prnReason).toBe('Pain');
    expect(orderSchema.parse(JSON.parse(JSON.stringify(placed))).params.prnReason).toBe('Pain');
  });

  it('範圍內套用類別佔位，不呼叫模型，護士用收到模板', () => {
    const id = 'dobutamine--sympathomimetics--general-drugs';
    const row = classRowFor(drug(id).classes, effects.classes);
    if (!row) throw new Error('缺類別列');
    const run = place(fresh('dob-in'), id, { value: 5, unit: 'mg' }, 'IV');
    const order = orderOf(run.state);
    expect(order.catalogId).toBe('drug.unlisted');
    expect(order.effectPreset).toEqual(presetOf(row));
    expect(kinds(run.effects)).not.toContain('order.effect');
    expect(kinds(run.effects)).not.toContain('order.parse');
    expect(pharmacyCalls(run.state)).toHaveLength(0);
    const nurse = run.state.chats.p1?.lines.find((line) => line.speaker.kind === 'NURSE');
    expect(nurse?.template).toContain('收到');
    expect(nurse?.tokenValues['order.1.label']).toContain('Dobutamine');

    // 推進到 IV onset＋漸進完成之後，藥效應該已經全數出現（再乘遞減同 jitter）
    const plain = advance(engine, fresh('dob-in'), 600);
    const after = advance(engine, run.state, 600);
    const diff = {
      hr: vitals(after.state).hr - vitals(plain.state).hr,
      sbp: vitals(after.state).sbp - vitals(plain.state).sbp,
      rr: vitals(after.state).rr - vitals(plain.state).rr,
      temp: vitals(after.state).temp - vitals(plain.state).temp,
    };
    assertDrugDiff(diff, {
      hr: row.deltaHr,
      sbp: row.deltaSbp,
      rr: row.deltaRr,
      temp: row.deltaTempC,
    });
    expect(vitals(after.state).spo2 - vitals(plain.state).spo2).toBe(0);
    expect(after.state.patients.p1?.visible.cuff).toEqual(plain.state.patients.p1?.visible.cuff);
  });

  it('有雜訊時心率會動，袖帶維持上次讀數', () => {
    const id = 'dobutamine--sympathomimetics--general-drugs';
    const start = noisy.init(params('dob-noise'));
    const cuff = start.patients.p1?.visible.cuff;
    const run = feed(noisy, start, [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'drug.unlisted',
        text: 'Dobutamine 5 mg IV',
        params: {
          drugFormularyId: null,
          dose: { value: 5, unit: 'mg' },
          route: 'IV',
          treatmentDrugId: id,
        },
      }),
    ]);
    const readings: number[] = [];
    let state = run.state;
    for (let step = 0; step < 8; step += 1) {
      state = advance(noisy, state, 60).state;
      const hr = state.patients.p1?.visible.vitals.hr;
      if (hr === undefined) throw new Error('缺心率');
      readings.push(hr);
    }
    expect(new Set(readings).size).toBeGreaterThan(1);
    expect(state.patients.p1?.visible.cuff).toEqual(cuff);
  });

  it('超出範圍或途徑不平常才問效果類別，不為這件事打去藥房', () => {
    const id = 'dobutamine--sympathomimetics--general-drugs';
    const high = place(fresh('dob-high'), id, { value: 5000, unit: 'mg' }, 'IV');
    expect(kinds(high.effects)).toContain('order.effect');
    expect(kinds(high.effects)).not.toContain('order.parse');
    expect(orderOf(high.state).effectPreset).toBeUndefined();
    expect(pharmacyCalls(high.state)).toHaveLength(0);
    const prompt = aiRequests(high.effects).find((item) => item.kind === 'order.effect')?.context;
    const categories =
      prompt && typeof prompt === 'object' && 'prompt' in prompt ? prompt.prompt : null;
    const listed =
      categories && typeof categories === 'object' && 'categories' in categories
        ? categories.categories
        : null;
    expect(Array.isArray(listed)).toBe(true);
    if (!Array.isArray(listed)) return;
    expect(
      listed.every(
        (item) => JSON.stringify(Object.keys(item as object).sort()) === '["id","label"]',
      ),
    ).toBe(true);

    const oral = place(fresh('dob-po'), id, { value: 5, unit: 'mg' }, 'PO');
    expect(kinds(oral.effects)).toContain('order.effect');
    expect(pharmacyCalls(oral.state)).toHaveLength(0);

    const missing = place(fresh('dob-missing'), id, null, null);
    expect(kinds(missing.effects)).toContain('order.effect');
    expect(pharmacyCalls(missing.state).length).toBeGreaterThan(0);
  });

  it('沒有類別走 AI；藥典藥名落原有醫囑', () => {
    const acetamide = place(
      fresh('acetamide'),
      'acetamide--drugs-for-treating-poisoning--general-drugs',
      { value: 5, unit: 'mg' },
      'IV',
    );
    expect(kinds(acetamide.effects)).toContain('order.effect');
    expect(orderOf(acetamide.state).catalogId).toBe('drug.unlisted');

    const cef = place(
      fresh('cef'),
      'ceftriaxone--antibacterial-drugs--general-drugs',
      { value: 1, unit: 'g' },
      'IV',
    );
    expect(orderOf(cef.state).catalogId).toBe('drug.ceftriaxone');
    expect(orderOf(cef.state).effectPreset).toBeUndefined();
    expect(kinds(cef.effects)).not.toContain('order.effect');
    expect(kinds(cef.effects)).toContain('gate.pharmacy');
    expect(pharmacyCalls(cef.state)).toHaveLength(0);

    const frusemide = place(
      fresh('fru'),
      'frusemide--diuretics--general-drugs',
      { value: 40, unit: 'mg' },
      'IV',
    );
    expect(orderOf(frusemide.state).catalogId).toBe('drug.furosemide');
    expect(kinds(frusemide.effects)).not.toContain('order.effect');

    const saline = place(
      fresh('nacl'),
      'sodium-chloride--fluids-and-electrolytes--general-drugs',
      { value: 500, unit: 'mL' },
      'IV',
    );
    expect(orderOf(saline.state).catalogId).toBe('drug.unlisted');
    expect(orderOf(saline.state).catalogId).not.toBe('fluid.ns500');
    expect(orderOf(saline.state).effectPreset?.sbp).toBe(
      classRowFor(['FLUIDS AND ELECTROLYTES'], effects.classes)?.deltaSbp,
    );
    expect(kinds(saline.effects)).not.toContain('order.effect');

    const hyoscineId =
      'hyoscine--antispasmodics-and-other-drugs-altering-gut-motility--general-drugs';
    const hyoscine = place(fresh('hyo'), hyoscineId, { value: 10, unit: 'mg' }, 'IV');
    const chosen = classRowFor(drug(hyoscineId).classes, effects.classes);
    expect(orderOf(hyoscine.state).effectPreset).toEqual(chosen ? presetOf(chosen) : undefined);
    expect(chosen?.classKey).toBe('ANTISPASMODICS AND OTHER DRUGS ALTERING GUT MOTILITY');
  });

  it('效果類別 id 才寫進基線，多餘數字或未知 id 不拆進生命表徵', () => {
    const id = 'dobutamine--sympathomimetics--general-drugs';
    const run = place(fresh('ai-brady'), id, { value: 5000, unit: 'mg' }, 'IV');
    const request = aiRequests(run.effects).find((item) => item.kind === 'order.effect');
    if (!request) throw new Error('缺 order.effect');
    const before = vitals(run.state);
    const applied = feed(engine, run.state, [
      { type: 'AI_RESULT', reqId: request.reqId, payload: { effectCategory: 'bradycardia' } },
    ]);
    const preset = effects.categories.find((row) => row.id === 'bradycardia');
    expect(orderOf(applied.state).effectPreset).toEqual(
      preset && {
        sbp: preset.deltaSbp,
        hr: preset.deltaHr,
        rr: preset.deltaRr,
        temp: preset.deltaTempC,
      },
    );
    const after = advance(engine, applied.state, 600);
    const plain = advance(engine, fresh('ai-brady'), 600);
    assertDrugDiff(
      {
        hr: vitals(after.state).hr - vitals(plain.state).hr,
        sbp: vitals(after.state).sbp - vitals(plain.state).sbp,
        rr: vitals(after.state).rr - vitals(plain.state).rr,
        temp: vitals(after.state).temp - vitals(plain.state).temp,
      },
      {
        hr: preset?.deltaHr ?? 0,
        sbp: preset?.deltaSbp ?? 0,
        rr: preset?.deltaRr ?? 0,
        temp: preset?.deltaTempC ?? 0,
      },
    );

    const extra = feed(engine, run.state, [
      {
        type: 'AI_RESULT',
        reqId: request.reqId,
        payload: { effectCategory: 'bradycardia', sbp: 40, note: 'sbp drops by 40' },
      },
    ]);
    expect(extra.state.paused).not.toBeNull();
    expect(orderOf(extra.state).effectPreset).toBeUndefined();
    expect(vitals(extra.state)).toEqual(before);

    const unknown = feed(engine, run.state, [
      { type: 'AI_RESULT', reqId: request.reqId, payload: { effectCategory: 'sbp drops by 40' } },
    ]);
    expect(unknown.state.paused).not.toBeNull();
    expect(vitals(unknown.state)).toEqual(before);
  });
});
