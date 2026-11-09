import { describe, expect, it } from 'vitest';
import {
  composeDrugOrderPhrase,
  placedDrugParams,
  shortOptionLabel,
  suggestFormularyDrugs,
  type DrugOrderDraft,
} from './drugOrder';
import type { MedicationOption } from './types';

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

const medications: MedicationOption[] = [
  {
    id: 'ceftriaxone',
    label: 'Ceftriaxone',
    stem: 'ceftriaxone',
    catalogId: 'drug.ceftriaxone',
    aliases: ['ceftriaxone', 'rocephin'],
  },
  {
    id: 'adrenaline',
    label: 'Adrenaline',
    stem: 'adrenaline',
    catalogId: 'drug.adrenaline',
    aliases: ['adrenaline', 'epinephrine', 'epi'],
  },
];

describe('suggestFormularyDrugs', () => {
  it('少過三個英文字唔出名單，夠三個先對名稱同別名', () => {
    expect(suggestFormularyDrugs('', medications)).toEqual([]);
    expect(suggestFormularyDrugs('ce', medications)).toEqual([]);
    expect(suggestFormularyDrugs('藥物', medications)).toEqual([]);
    expect(suggestFormularyDrugs('12', medications)).toEqual([]);
    expect(suggestFormularyDrugs('cef', medications).map((item) => item.id)).toEqual([
      'ceftriaxone',
    ]);
    expect(suggestFormularyDrugs('EPI', medications).map((item) => item.id)).toEqual([
      'adrenaline',
    ]);
    expect(suggestFormularyDrugs('roc', medications).map((item) => item.id)).toEqual([
      'ceftriaxone',
    ]);
    expect(suggestFormularyDrugs('zzz', medications)).toEqual([]);
  });
});
