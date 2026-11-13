import { describe, expect, it } from 'vitest';
import {
  composeDrugOrderPhrase,
  placedDrugParams,
  RATE_UNITS,
  shortOptionLabel,
  suggestTreatmentDrugs,
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
  concentration: '',
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

  it('輸注濃度會寫入結構化欄位，速率只用泵可設定的單位', () => {
    const infusion = draft({
      route: 'IV Infusion (Continuous drip / syringe pump)',
      frequency: null,
      diluent: 'Neat (No diluent)',
      volume: '50 mL',
      rateValue: '5',
      rateUnit: 'mL/hr',
      concentration: '  4 mg in 50 mL  ',
      infuseOverMins: '30',
    });
    expect(RATE_UNITS).toEqual(['mL/hr', 'unit/hr']);
    expect(placedDrugParams('adrenaline', infusion)).toMatchObject({
      concentration: '4 mg in 50 mL',
      diluent: 'Neat',
      volumeMl: 50,
      infuseOverMinutes: 30,
      rate: { value: 5, unit: 'mL/hr' },
    });
    expect(composeDrugOrderPhrase(infusion)).toContain('4 mg in 50 mL');
    expect(placedDrugParams('adrenaline', { ...infusion, concentration: '  ' })).not.toHaveProperty(
      'concentration',
    );
  });

  it('按需原因同頻次分開寫入結構化欄位', () => {
    const bolus = draft({ frequency: 'Q6H', prn: 'Fever', prnComparison: '≥', prnThreshold: '38' });
    expect(placedDrugParams('adrenaline', bolus)).toMatchObject({
      frequency: 'Q6H',
      prnReason: 'Fever',
      prnCondition: { metric: 'TEMPERATURE', comparison: '>=', threshold: 38 },
    });
    expect(composeDrugOrderPhrase(bolus)).toContain('PRN Fever');
  });

  it('accepts pain PRN with a pain-score threshold', () => {
    const pending = draft({
      frequency: 'Q4H',
      prn: 'Pain',
      prnComparison: '＞',
      prnThreshold: '4',
    });
    expect(placedDrugParams('adrenaline', pending)).toMatchObject({
      prnReason: 'Pain',
      prnCondition: { metric: 'PAIN', comparison: '>', threshold: 4 },
    });
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

describe('suggestTreatmentDrugs', () => {
  it('少過三個英文字唔出名單，夠三個先對傳入嘅治療藥表', () => {
    expect(suggestTreatmentDrugs('', medications)).toEqual([]);
    expect(suggestTreatmentDrugs('ce', medications)).toEqual([]);
    expect(suggestTreatmentDrugs('藥物', medications)).toEqual([]);
    expect(suggestTreatmentDrugs('12', medications)).toEqual([]);
    expect(suggestTreatmentDrugs('cef', medications).map((item) => item.id)).toEqual([
      'ceftriaxone',
    ]);
    expect(suggestTreatmentDrugs('EPI', medications).map((item) => item.id)).toEqual([
      'adrenaline',
    ]);
    expect(suggestTreatmentDrugs('roc', medications).map((item) => item.id)).toEqual([
      'ceftriaxone',
    ]);
    expect(suggestTreatmentDrugs('zzz', medications)).toEqual([]);
  });

  it('已揀類別時以類別篩選，不必先打三個字母', () => {
    const rows: MedicationOption[] = [
      {
        id: 'hyoscine',
        label: 'Hyoscine',
        stem: 'hyoscine',
        catalogId: '',
        classes: ['ANTISPASMODICS AND OTHER DRUGS ALTERING GUT MOTILITY', 'GENERAL ANAESTHESIA'],
      },
      {
        id: 'cefaclor',
        label: 'Cefaclor',
        stem: 'cefaclor',
        catalogId: '',
        classes: ['ANTIBACTERIAL DRUGS'],
      },
      {
        id: 'acetamide',
        label: 'Acetamide',
        stem: 'acetamide',
        catalogId: '',
        classes: [],
      },
    ];
    expect(suggestTreatmentDrugs('', rows, 'GENERAL ANAESTHESIA').map((item) => item.id)).toEqual([
      'hyoscine',
    ]);
    expect(suggestTreatmentDrugs('hy', rows, 'GENERAL ANAESTHESIA').map((item) => item.id)).toEqual(
      ['hyoscine'],
    );
    expect(suggestTreatmentDrugs('hyo', rows).map((item) => item.id)).toEqual(['hyoscine']);
    expect(
      suggestTreatmentDrugs('hyo', rows, 'GENERAL ANAESTHESIA').map((item) => item.id),
    ).toEqual(['hyoscine']);
    expect(
      suggestTreatmentDrugs('hyo', rows, 'ANTIBACTERIAL DRUGS').map((item) => item.id),
    ).toEqual([]);
    expect(suggestTreatmentDrugs('ace', rows).map((item) => item.id)).toEqual(['acetamide']);
    expect(suggestTreatmentDrugs('ace', rows, 'ANTIBACTERIAL DRUGS')).toEqual([]);
    expect(suggestTreatmentDrugs('cef', rows, null).map((item) => item.id)).toEqual(['cefaclor']);
  });
});
