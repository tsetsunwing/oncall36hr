import { describe, expect, it } from 'vitest';
import {
  composeDrugOrderPhrase,
  placedDrugParams,
  shortOptionLabel,
  type DrugOrderDraft,
} from './drugOrder';

const draft = (patch: Partial<DrugOrderDraft>): DrugOrderDraft => ({
  stem: 'adrenaline',
  route: 'IV (Intravenous bolus/push)',
  doseValue: '1',
  doseUnit: 'mg',
  frequency: 'BD (twice)',
  diluent: null,
  volume: null,
  rateValue: '',
  rateUnit: null,
  prn: null,
  titration: null,
  infuseOverMins: '',
  afterFood: false,
  rapidFlush: false,
  ...patch,
});

describe('藥物選項括號', () => {
  it('括號前嘅字先出街', () => {
    expect(shortOptionLabel('IV (Intravenous bolus/push)')).toBe('IV');
    expect(shortOptionLabel('IV Infusion (Continuous drip / syringe pump)')).toBe('IV Infusion');
    expect(shortOptionLabel('BD (twice)')).toBe('BD');
    expect(shortOptionLabel('Neat (No diluent)')).toBe('Neat');
    expect(shortOptionLabel('STAT')).toBe('STAT');
  });

  it('聊天句子、途徑同頻次都唔帶括號', () => {
    const bolus = draft({});
    expect(composeDrugOrderPhrase(bolus)).toBe('adrenaline 1 mg IV BD');
    expect(placedDrugParams('adrenaline', bolus)).toMatchObject({
      route: 'IV',
      frequency: 'BD',
    });
    const infusion = draft({
      route: 'IV Infusion (Continuous drip / syringe pump)',
      frequency: null,
      diluent: 'Neat (No diluent)',
      volume: '50 mL',
      rateValue: '5',
      rateUnit: 'mL/hr',
    });
    expect(composeDrugOrderPhrase(infusion)).toBe(
      'adrenaline 1 mg IV Infusion 5 mL/hr | Neat, 50 mL',
    );
    expect(placedDrugParams('adrenaline', infusion)?.route).toBe('IV Infusion');
  });
});
