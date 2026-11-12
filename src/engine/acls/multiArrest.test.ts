/**
 * M5：兩個病人同時心臟停頓。每位病人有自己嘅搶救紀錄，一個病人嘅 CPR／電擊／藥物
 * 唔會改到另一個；死亡流程亦各自獨立，床位各自釋放。
 */
import { describe, expect, it } from 'vitest';
import { getConfig } from '@/content';
import { beginArrest } from './arrest';
import { beginDeath, completeDeathStep } from '../death/death';
import type { EngineContext } from '../core/module';
import { params, realEngine } from '../test/realEngine';
import { patientAtBed } from '../ward/movement';

const engine = realEngine();
const config = getConfig();
const ctx: EngineContext = { config, tables: engine.tables };

function ward() {
  const state = engine.init({ ...params('multi-arrest'), ward: true });
  const ids = Object.keys(state.patients).slice(0, 2);
  const [a, b] = ids;
  if (!a || !b) throw new Error('病房要有兩個病人');
  return { state, a, b };
}

function arrestBoth() {
  const { state, a, b } = ward();
  const first = beginArrest(state, a, 'VENTRICULAR_FIBRILLATION', ctx, { rearrest: false });
  const second = beginArrest(first.state, b, 'ASYSTOLE', ctx, { rearrest: false });
  return { state: second.state, a, b };
}

describe('兩個病人同時心臟停頓', () => {
  it('各自有一份搶救紀錄，節律唔會互相覆蓋', () => {
    const { state, a, b } = arrestBoth();
    expect(state.resus[a]?.status).toBe('ARREST');
    expect(state.resus[b]?.status).toBe('ARREST');
    expect(state.resus[a]?.rhythm).toBe('VENTRICULAR_FIBRILLATION');
    expect(state.resus[b]?.rhythm).toBe('ASYSTOLE');
  });

  it('同一位病人再做 CPR，另一位病人嘅紀錄完全不變', () => {
    const { state, a, b } = arrestBoth();
    const beforeB = state.resus[b];
    const cpr = beginArrest(state, a, 'VENTRICULAR_FIBRILLATION', ctx, { rearrest: true });
    expect(cpr.state.resus[a]?.episode).toBe(2);
    expect(cpr.state.resus[b]).toEqual(beforeB);
  });

  it('兩個病人可以同時進行死亡流程，各自完成各自嘅四步', () => {
    const { state, a, b } = arrestBoth();
    const first = beginDeath(state, a, ctx).state;
    const both = beginDeath(first, b, ctx).state;
    expect(both.death[a]?.status).toBe('PENDING_PROCESS');
    expect(both.death[b]?.status).toBe('PENDING_PROCESS');

    let done = both;
    for (const step of ['CERTIFICATE', 'NOTIFY_SENIOR', 'PHONE_FAMILY', 'RECORD'] as const) {
      done = completeDeathStep(done, a, step).state;
    }
    expect(done.death[a]?.status).toBe('COMPLETE');
    expect(done.death[b]?.status).toBe('PENDING_PROCESS');
    expect(done.death[b]?.steps.CERTIFICATE).toBeNull();

    const bedA = both.patients[a]?.bed ?? 0;
    const bedB = both.patients[b]?.bed ?? 0;
    expect(patientAtBed(done, bedA)).toBeNull();
    expect(patientAtBed(done, bedB)).toBe(b);
  });
});
