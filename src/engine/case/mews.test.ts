import { describe, expect, it } from 'vitest';
import { bandFor, computeMews, findRange, meanArterialPressure } from './mews';
import { realTables } from '../test/realEngine';

const mews = realTables().mews[0];
if (!mews) throw new Error('content 缺少 mews 表');

const vitals = (hr: number, sbp: number, rr: number, temp: number, spo2: number) => ({
  hr,
  sbp,
  rr,
  temp,
  spo2,
});

describe('MEWS（table-driven，對照手算）', () => {
  it('正常成人 ＝ 0 分、LOW band、無警報', () => {
    const r = computeMews(vitals(80, 120, 14, 36.8, 98), 'A', mews);
    expect(r).toMatchObject({ score: 0, band: 'LOW', alert: 'NONE' });
  });

  it('RR 20 仍是 0 分，21 才算過高', () => {
    expect(computeMews(vitals(80, 120, 20, 36.8, 98), 'A', mews).components.rr).toBe(0);
    expect(computeMews(vitals(80, 120, 21, 36.8, 98), 'A', mews).components.rr).toBe(2);
  });

  it('個案起始（HR 113、SBP 103、RR 23、Temp 38.3、SpO2 93、A）＝ 2+0+2+0+2 ＝ 6，HIGH', () => {
    const r = computeMews(vitals(113, 103, 23, 38.3, 93), 'A', mews);
    expect(r.components).toEqual({ avpu: 0, rr: 2, hr: 2, sbp: 0, temp: 0, spo2: 2 });
    expect(r).toMatchObject({ score: 6, band: 'HIGH', alert: 'ALARM' });
  });

  it('休克樣（HR 135、SBP 70、RR 32、Temp 39、SpO2 88、V）＝ 3+3+3+2+3+1 ＝ 15，CRITICAL', () => {
    const r = computeMews(vitals(135, 70, 32, 39, 88), 'V', mews);
    expect(r.score).toBe(15);
    expect(r.band).toBe('CRITICAL');
  });

  it('AVPU 分數：A0、V1、P2、U3', () => {
    const base = vitals(80, 120, 14, 36.8, 98);
    expect((['A', 'V', 'P', 'U'] as const).map((c) => computeMews(base, c, mews).score)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('區間係 [min, max)：邊界值落入上一段', () => {
    const hr = (v: number) => findRange(mews.components.hr, v)?.score;
    expect([
      hr(40),
      hr(41),
      hr(50),
      hr(51),
      hr(100),
      hr(101),
      hr(110),
      hr(111),
      hr(129),
      hr(130),
    ]).toEqual([2, 1, 1, 0, 0, 1, 1, 2, 2, 3]);
    const sbp = (v: number) => findRange(mews.components.sbp, v)?.score;
    expect([sbp(70), sbp(71), sbp(80), sbp(81), sbp(100), sbp(101), sbp(199), sbp(200)]).toEqual([
      3, 2, 2, 1, 1, 0, 0, 2,
    ]);
    const spo2 = (v: number) => findRange(mews.components.spo2, v)?.score;
    expect([spo2(91), spo2(92), spo2(93), spo2(94), spo2(95), spo2(96)]).toEqual([
      3, 2, 2, 1, 1, 0,
    ]);
  });

  it('band 邊界：2→LOW、3→MID、4→MID、5→HIGH、6→HIGH、7→CRITICAL，並同表內 alert 一致', () => {
    expect([0, 2, 3, 4, 5, 6, 7, 20].map((s) => bandFor(mews, s).id)).toEqual([
      'LOW',
      'LOW',
      'MID',
      'MID',
      'HIGH',
      'HIGH',
      'CRITICAL',
      'CRITICAL',
    ]);
    expect(bandFor(mews, 3).alert).toBe('CAUTION');
    expect(bandFor(mews, 5).alert).toBe('ALARM');
  });

  it('生理範圍內任何整數／一位小數都有對應區間（表冇洞）', () => {
    const limits = { hr: [20, 240], sbp: [40, 260], rr: [4, 50], spo2: [50, 100] } as const;
    for (const [key, [lo, hi]] of Object.entries(limits)) {
      for (let v = lo; v <= hi; v += 1) {
        expect(
          findRange(mews.components[key as keyof typeof limits], v),
          `${key}=${String(v)}`,
        ).toBeDefined();
      }
    }
    for (let t = 340; t <= 420; t += 1)
      expect(findRange(mews.components.temp, t / 10)).toBeDefined();
  });

  it('MAP ＝ round((SBP + 2×DBP) / 3)', () => {
    expect(meanArterialPressure(120, 80)).toBe(93);
    expect(meanArterialPressure(82, 50)).toBe(61);
  });
});
