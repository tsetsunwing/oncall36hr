import { describe, expect, it } from 'vitest';
import { RATE_UNITS } from './drugOrder';
import {
  buildIvFluidOrder,
  durationSecondsFromRate,
  IVF_RATE_UNITS,
  ivFluidReady,
  solutionsFor,
  type IvFluidDraft,
} from './ivFluid';

const draft = (patch: Partial<IvFluidDraft> = {}): IvFluidDraft => ({
  fluidLabel: '2D1S (D5 → D5 → NS)',
  custom: '',
  route: 'IV Infusion (Continuous drip / syringe pump)',
  volume: '500 mL',
  rateValue: '62.5',
  rateUnit: 'mL/hr',
  concentration: '',
  maxBags: '',
  ...patch,
});

describe('IVF 處方', () => {
  it('速率單位只有 mL/hr，不含 µg/kg/min', () => {
    expect(IVF_RATE_UNITS).toEqual(['mL/hr']);
    expect(RATE_UNITS).not.toContain('µg/kg/min');
    expect(RATE_UNITS).not.toContain('mcg/kg/min');
    expect(IVF_RATE_UNITS.every((unit) => RATE_UNITS.includes(unit))).toBe(true);
  });

  it('2D1S 用容量與速率算出每瓶時間，並寫入 fluid.maintenance', () => {
    expect(durationSecondsFromRate(500, 62.5)).toBe(28800);
    expect(solutionsFor('2D1S (D5 → D5 → NS)', '')).toEqual(['D5', 'D5', 'NS']);
    const built = buildIvFluidOrder(
      draft({ maxBags: '2', concentration: '20 mmol KCl in 500 mL' }),
    );
    expect(built?.catalogId).toBe('fluid.maintenance');
    expect(built?.text).toContain('D5 → D5 → NS');
    expect(built?.text).toContain('62.5 mL/hr');
    expect(built?.params.fluidRegimen).toEqual({
      solutions: ['D5', 'D5', 'NS'],
      volumeMl: 500,
      durationSeconds: 28800,
      additive: '20 mmol KCl in 500 mL',
      maxBags: 2,
    });
    expect(built?.params.rate).toEqual({ value: 62.5, unit: 'mL/hr' });
  });

  it('Normal saline 的 IV bolus 落 fluid.ns500，不走維生輸液循環', () => {
    const built = buildIvFluidOrder(
      draft({
        fluidLabel: '0.9% Sodium Chloride (Normal saline)',
        route: 'IV (Intravenous bolus/push)',
        rateValue: '1000',
      }),
    );
    expect(built?.catalogId).toBe('fluid.ns500');
    expect(built?.params.fluidRegimen).toBeUndefined();
    expect(built?.params.dose).toEqual({ value: 500, unit: 'mL' });
    expect(built?.params.route).toBe('IV');
  });

  it('未填輸液、途徑、容量或速率時不能落單', () => {
    expect(ivFluidReady(draft({ fluidLabel: '', custom: '' }))).toBe(false);
    expect(ivFluidReady(draft({ route: null }))).toBe(false);
    expect(ivFluidReady(draft({ volume: null }))).toBe(false);
    expect(ivFluidReady(draft({ rateValue: '' }))).toBe(false);
    expect(ivFluidReady(draft({ rateUnit: 'µg/kg/min' }))).toBe(false);
    expect(ivFluidReady(draft())).toBe(true);
  });

  it('自訂瓶次用逗號或箭頭分隔', () => {
    expect(solutionsFor('Other (comma-separated cycle)', 'D5, NS')).toEqual(['D5', 'NS']);
    expect(solutionsFor('Other (comma-separated cycle)', 'D5 → NS')).toEqual(['D5', 'NS']);
    expect(
      buildIvFluidOrder(draft({ fluidLabel: 'Other (comma-separated cycle)', custom: '  ' })),
    ).toBeNull();
  });
});
