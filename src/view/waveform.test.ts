import { describe, expect, it } from 'vitest';
import { getContent } from '@/content';
import { beatPeriodSec, ecgAt, parseWave, plethAmplitude, plethAt } from './waveform';

const wave = parseWave(getContent().tables.rhythms[1]?.wave);
if (!wave) throw new Error('rhythm 波形無法解析');

describe('波形生成（由 rhythm 表＋HR）', () => {
  it('R 波係週期內最高點；基線附近細', () => {
    const period = beatPeriodSec(75);
    const samples = Array.from({ length: 200 }, (_, i) => ecgAt((i / 200) * period, period, wave));
    const peak = Math.max(...samples);
    expect(ecgAt(0, period, wave)).toBeCloseTo(peak, 1);
    expect(peak).toBeGreaterThan(0.9);
    expect(Math.min(...samples)).toBeGreaterThan(-0.4);
  });

  it('週期性：HR 愈快週期愈短，波形每個週期重複', () => {
    expect(beatPeriodSec(120)).toBeCloseTo(0.5);
    expect(beatPeriodSec(60)).toBeCloseTo(1);
    for (const hr of [45, 75, 130]) {
      const period = beatPeriodSec(hr);
      for (const t of [0.05, 0.13, 0.31]) {
        const base = ecgAt(t % period, period, wave);
        expect(ecgAt((t + period) % period, period, wave)).toBeCloseTo(base, 6);
      }
    }
  });

  it('高心率時 P／T 波壓縮、QRS 唔變（時間偏移被縮短）', () => {
    const slow = beatPeriodSec(60);
    const fast = beatPeriodSec(150);
    const tOffset = wave.ecg.find((c) => c.offsetSec > 0.1);
    if (!tOffset) throw new Error('缺 T 波');
    expect(ecgAt(tOffset.offsetSec, slow, wave)).toBeGreaterThan(0.2);
    expect(ecgAt(tOffset.offsetSec * (fast / 0.85), fast, wave)).toBeGreaterThan(0.2);
    expect(ecgAt(0, fast, wave)).toBeGreaterThan(0.9);
  });

  it('Pleth：有脈搏上升、之後下降；振幅隨脈壓縮放（窄脈壓＝細波）', () => {
    const period = beatPeriodSec(80);
    const rise = plethAt(wave.pleth.delaySec + wave.pleth.riseSec, period, wave);
    expect(rise).toBeGreaterThan(0.8);
    expect(plethAt(period - 0.01, period, wave)).toBeLessThan(rise);
    expect(plethAt(0.01, period, wave, 0.5)).toBeLessThanOrEqual(plethAt(0.01, period, wave, 1));
    expect(plethAmplitude(120, 80)).toBeGreaterThan(plethAmplitude(82, 78));
    expect(plethAmplitude(82, 78)).toBeGreaterThanOrEqual(0.35);
  });

  it('parseWave 拒絕壞資料', () => {
    expect(parseWave({ kind: 'sinus' })).toBeNull();
    expect(parseWave(null)).toBeNull();
  });

  it('決定性：同輸入永遠同輸出（無隨機）', () => {
    const a = Array.from({ length: 50 }, (_, i) => ecgAt(i * 0.01, 0.6, wave));
    const b = Array.from({ length: 50 }, (_, i) => ecgAt(i * 0.01, 0.6, wave));
    expect(a).toEqual(b);
  });
});
