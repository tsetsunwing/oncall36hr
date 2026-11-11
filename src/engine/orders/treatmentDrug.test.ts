import { describe, expect, it } from 'vitest';
import { getDrugEffectTables, presetOf, classRowFor } from '@/content/drugEffects';
import type { Effect } from '../core/events';
import type { GameState } from '../core/state';
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

describe('治療藥物彈窗', () => {
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

    const plain = advance(engine, fresh('dob-in'), 60);
    const after = advance(engine, run.state, 60);
    expect(vitals(after.state).sbp - vitals(plain.state).sbp).toBe(row.deltaSbp);
    expect(vitals(after.state).hr - vitals(plain.state).hr).toBe(row.deltaHr);
    expect(vitals(after.state).rr - vitals(plain.state).rr).toBe(row.deltaRr);
    expect(vitals(after.state).temp - vitals(plain.state).temp).toBeCloseTo(row.deltaTempC);
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
    const after = advance(engine, applied.state, 60);
    const plain = advance(engine, fresh('ai-brady'), 60);
    expect(vitals(after.state).hr - vitals(plain.state).hr).toBe(preset?.deltaHr);
    expect(vitals(after.state).sbp - vitals(plain.state).sbp).toBe(preset?.deltaSbp);

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
