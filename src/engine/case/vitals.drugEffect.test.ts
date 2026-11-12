import { describe, expect, it } from 'vitest';
import { createEngine } from '../core/reducer';
import { hashString } from '../core/rng';
import { params, realConfig, realTables } from '../test/realEngine';
import type { Order } from '../orders/orderTypes';
import type { Patient } from './patient';
import { drugScale, effectDeltaAt } from './vitals';

const H = 3600;
const config = realConfig();
const tables = realTables();

function patient(): Patient {
  const state = createEngine(config, { tables }).init(params('infusion-volume'));
  const first = Object.values(state.patients)[0];
  if (!first) throw new Error('missing patient');
  return first;
}

function withBase(patient: Patient, sbp: number): Patient {
  return {
    ...patient,
    hidden: {
      ...patient.hidden,
      base: { hr: 80, sbp, dbp: 100, spo2: 96, rr: 18, temp: 37 },
    },
  };
}

function presetOrder(id: string, patientId: string, route: string | null): Order {
  return {
    id,
    patientId,
    catalogId: 'drug.unlisted',
    createdAt: 0,
    startsAt: 0,
    completesAt: H,
    status: 'RUNNING',
    source: 'QUICKWORD',
    params: { drugFormularyId: null, dose: null, route },
    executor: null,
    executorKind: 'NURSE',
    cancelledAt: null,
    resultStatus: null,
    sampledState: null,
    gate: null,
    effectPreset: { sbp: -10, hr: 0, rr: 0, temp: 0 },
  };
}

describe('drugScale', () => {
  it('降藥：愈極端愈足，貼近正常剩低 residual', () => {
    const extreme = { low: 80, high: 190 };
    expect(drugScale(200, -10, 120, extreme, 0.2)).toBe(1);
    expect(drugScale(130, -10, 120, extreme, 0.2)).toBeCloseTo(0.2 + 0.8 * (10 / 70), 5);
    expect(drugScale(120, -10, 120, extreme, 0.2)).toBe(0.2);
    expect(drugScale(100, -10, 120, extreme, 0.2)).toBe(0.2);
  });

  it('升藥：血壓愈低愈足', () => {
    const extreme = { low: 80, high: 190 };
    expect(drugScale(80, 10, 120, extreme, 0.2)).toBe(1);
    expect(drugScale(115, 10, 120, extreme, 0.2)).toBeCloseTo(0.2 + 0.8 * (5 / 40), 5);
    expect(drugScale(130, 10, 120, extreme, 0.2)).toBe(0.2);
  });

  it('delta 為 0 時不縮放', () => {
    expect(drugScale(120, 0, 120, { low: 80, high: 190 }, 0.2)).toBe(1);
  });
});

describe('藥物途徑 onset 與隨機幅度', () => {
  it('冇 config 時維持舊行為：即刻全數生效', () => {
    const p = withBase(patient(), 200);
    const order = presetOrder('o1', p.id, 'po');
    expect(effectDeltaAt(p, { o1: order }, tables, 60).sbp).toBe(-10);
  });

  it('PO 有 onset：60 秒時未生效', () => {
    const p = withBase(patient(), 200);
    const order = presetOrder('o1', p.id, 'po');
    expect(effectDeltaAt(p, { o1: order }, tables, 60, config).sbp).toBe(0);
  });

  it('PO onset 後漸進：1800 秒時達 75% 再乘 jitter', () => {
    const p = withBase(patient(), 200);
    const order = presetOrder('o1', p.id, 'po');
    const u = ((hashString('o1') % 2001) - 1000) / 1000;
    const expected = -10 * 0.75 * (1 + u * config.drugEffect.jitterFraction);
    expect(effectDeltaAt(p, { o1: order }, tables, 1800, config).sbp).toBeCloseTo(expected, 5);
  });

  it('同一張醫囑 jitter 固定；唔同醫囑都喺 ±15% 內', () => {
    const p = withBase(patient(), 200);
    const iv = presetOrder('o1', p.id, 'iv');
    const first = effectDeltaAt(p, { o1: iv }, tables, H, config).sbp;
    const again = effectDeltaAt(p, { o1: iv }, tables, H, config).sbp;
    expect(again).toBe(first);
    for (let i = 0; i < 50; i += 1) {
      const order = presetOrder(`o-jitter-${String(i)}`, p.id, 'iv');
      const value = effectDeltaAt(p, { o1: order }, tables, H, config).sbp;
      expect(value).toBeGreaterThanOrEqual(-10 * 1.15);
      expect(value).toBeLessThanOrEqual(-10 * 0.85);
    }
  });

  it('IV 起效快過 PO', () => {
    const p = withBase(patient(), 200);
    const iv = effectDeltaAt(p, { o1: presetOrder('o1', p.id, 'iv') }, tables, 300, config).sbp;
    const po = effectDeltaAt(p, { o2: presetOrder('o2', p.id, 'po') }, tables, 300, config).sbp;
    expect(Math.abs(iv)).toBeGreaterThan(Math.abs(po));
  });

  it('冇途徑的醫囑冇 onset 延遲，但仍然有 jitter', () => {
    const p = withBase(patient(), 200);
    const order = presetOrder('o1', p.id, null);
    const u = ((hashString('o1') % 2001) - 1000) / 1000;
    const expected = -10 * (1 + u * config.drugEffect.jitterFraction);
    expect(effectDeltaAt(p, { o1: order }, tables, 60, config).sbp).toBeCloseTo(expected, 5);
  });

  it('遞減效應：接近正常時藥效收細', () => {
    const high = withBase(patient(), 200);
    const near = withBase(patient(), 130);
    const order = presetOrder('o1', 'p1', null);
    const fullScale = effectDeltaAt(
      high,
      { o1: { ...order, patientId: high.id } },
      tables,
      60,
      config,
    ).sbp;
    const shrunk = effectDeltaAt(
      near,
      { o1: { ...order, patientId: near.id } },
      tables,
      60,
      config,
    ).sbp;
    expect(Math.abs(shrunk)).toBeLessThan(Math.abs(fullScale));
    expect(shrunk).toBeCloseTo(fullScale * (0.2 + 0.8 * (10 / 70)), 5);
  });

  it('非藥物醫囑（輸液）不受遞減與 jitter 影響', () => {
    const p = patient();
    const order: Order = {
      id: 'o1',
      patientId: p.id,
      catalogId: 'fluid.maintenance',
      createdAt: 0,
      startsAt: 0,
      completesAt: 24 * H,
      status: 'RUNNING',
      source: 'MANUAL',
      params: { drugFormularyId: null, dose: null, route: 'IV Infusion' },
      executor: null,
      executorKind: 'NURSE',
      cancelledAt: null,
      resultStatus: null,
      sampledState: null,
      gate: null,
      fluidBags: [
        {
          index: 0,
          solution: '0.9% NaCl',
          volumeMl: 500,
          startAt: 0,
          scheduledEndAt: 4 * H,
          endedAt: null,
          status: 'INFUSING',
        },
      ],
    };
    expect(effectDeltaAt(p, { o1: order }, tables, 2 * H, config)).toEqual(
      effectDeltaAt(p, { o1: order }, tables, 2 * H),
    );
  });
});
