import { describe, expect, it } from 'vitest';
import note from './data/drug-effects-readme.txt?raw';
import { getContent } from './index';
import {
  classRowFor,
  getDrugEffectTables,
  parseDrugEffectTables,
  resolveDrugPreset,
} from './drugEffects';
import { drugOverrideRowSchema } from './schema/csvTables';
import { TABLE_NAMES } from './schema/tables';

const tables = getDrugEffectTables();

describe('藥物效果表', () => {
  it('每個治療藥類別都有一列，例子列不會生效', () => {
    const classes = new Set<string>();
    for (const drug of getContent().tables['treatment-drugs']) {
      for (const name of drug.classes) classes.add(name);
    }
    const keys = tables.classes.map((row) => row.classKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const name of classes) expect(keys, name).toContain(name);
    expect(tables.overrides.every((row) => row.status === 'EXAMPLE')).toBe(true);
    expect(tables.overrides.map((row) => row.drug)).toEqual([
      'EXAMPLE_NOT_A_REAL_DRUG_A',
      'EXAMPLE_NOT_A_REAL_DRUG_B',
    ]);
    for (const row of [...tables.classes, ...tables.overrides, ...tables.categories]) {
      expect(row.note).toContain('PENDING_CLINICAL_REVIEW');
    }
    expect(tables.categories.map((row) => row.label)).toEqual([
      'marked hypotension',
      'marked hypertension',
      'bradycardia',
      'tachycardia',
      'respiratory depression',
      'reduced consciousness',
      'no extra effect',
    ]);
  });

  it('中文欄名可以載入，重複類別會拒絕', () => {
    const parsed = parseDrugEffectTables(
      '類別,常用劑量下限,常用劑量上限,劑量單位,常用途徑,收縮壓變化,心率變化,呼吸變化,體溫變化,備註\n"DEMO",1,2,mg,PO,1,0,0,0,PENDING_CLINICAL_REVIEW\n',
      '藥名,常用劑量下限,常用劑量上限,劑量單位,常用途徑,收縮壓變化,心率變化,呼吸變化,體溫變化,狀態,備註\n"Demo Drug",1,2,mg,IV,3,0,0,0,ACTIVE,PENDING_CLINICAL_REVIEW\n',
      'id,名稱,收縮壓變化,心率變化,呼吸變化,體溫變化,備註\nnone,no extra effect,0,0,0,0,PENDING_CLINICAL_REVIEW\n',
    );
    expect(parsed.classes[0]?.classKey).toBe('DEMO');
    expect(parsed.overrides[0]?.status).toBe('ACTIVE');
    expect(() =>
      parseDrugEffectTables(
        'class,usual_dose_min,usual_dose_max,dose_unit,ordinary_routes,delta_sbp,delta_hr,delta_rr,delta_temp_c,note\nA,1,2,mg,PO,0,0,0,0,x\nA,1,2,mg,PO,0,0,0,0,x\n',
        'drug,usual_dose_min,usual_dose_max,dose_unit,ordinary_routes,delta_sbp,delta_hr,delta_rr,delta_temp_c,status,note\n',
        'id,label,delta_sbp,delta_hr,delta_rr,delta_temp_c,note\nnone,no extra effect,0,0,0,0,x\n',
      ),
    ).toThrow(/重複/);
  });

  it('ACTIVE 覆寫取代類別，不合範圍就不退回類別', () => {
    const drug = { name: 'Demo Drug', classes: ['DEMO'] };
    const inside = resolveDrugPreset(drug, { value: 1, unit: 'mg' }, 'IV', {
      classes: [
        {
          id: 'DEMO',
          classKey: 'DEMO',
          usualDoseMin: 1,
          usualDoseMax: 9,
          doseUnit: 'mg',
          ordinaryRoutes: ['PO'],
          deltaSbp: 1,
          deltaHr: 0,
          deltaRr: 0,
          deltaTempC: 0,
          note: 'PENDING_CLINICAL_REVIEW',
        },
      ],
      overrides: [
        {
          id: 'demo drug',
          drug: 'demo drug',
          status: 'ACTIVE',
          setsFlags: ['ppi.iv'],
          usualDoseMin: 1,
          usualDoseMax: 2,
          doseUnit: 'mg',
          ordinaryRoutes: ['IV'],
          deltaSbp: 4,
          deltaHr: 0,
          deltaRr: 0,
          deltaTempC: 0,
          note: 'PENDING_CLINICAL_REVIEW',
        },
      ],
      categories: [],
    });
    expect(inside).toEqual({
      kind: 'preset',
      classKey: null,
      preset: { sbp: 4, hr: 0, rr: 0, temp: 0 },
      flags: ['ppi.iv'],
    });
    const outside = resolveDrugPreset(drug, { value: 5, unit: 'mg' }, 'IV', {
      classes: [
        {
          id: 'DEMO',
          classKey: 'DEMO',
          usualDoseMin: 1,
          usualDoseMax: 9,
          doseUnit: 'mg',
          ordinaryRoutes: ['IV'],
          deltaSbp: 1,
          deltaHr: 0,
          deltaRr: 0,
          deltaTempC: 0,
          note: '',
        },
      ],
      overrides: [
        {
          id: 'Demo Drug',
          drug: 'Demo Drug',
          status: 'ACTIVE',
          setsFlags: [],
          usualDoseMin: 1,
          usualDoseMax: 2,
          doseUnit: 'mg',
          ordinaryRoutes: ['IV'],
          deltaSbp: 4,
          deltaHr: 0,
          deltaRr: 0,
          deltaTempC: 0,
          note: '',
        },
      ],
      categories: [],
    });
    expect(outside.kind).toBe('ai');
  });

  it('多個類別用第一個有列的，說明檔寫明規則和佔位', () => {
    const hyoscine = getContent().tables['treatment-drugs'].find(
      (row) =>
        row.id === 'hyoscine--antispasmodics-and-other-drugs-altering-gut-motility--general-drugs',
    );
    if (!hyoscine) throw new Error('缺 Hyoscine');
    const chosen = classRowFor(hyoscine.classes, tables.classes);
    expect(chosen?.classKey).toBe(hyoscine.classes[0]);
    expect(chosen?.classKey).not.toBe('GENERAL ANAESTHESIA');
    expect(note).toContain('PENDING_CLINICAL_REVIEW');
    expect(note).toContain('不是臨床指引');
    expect(note).toContain('第一個在 drug-class-effects.csv 有列的類別');
    expect(note).toContain('不會退回類別列');
  });

  it('覆盤 fluid.ns500 顯示 Normal saline，治療藥表不加入這項', () => {
    const required = getContent().tables['required-actions'].filter((row) =>
      row.catalogIds.includes('fluid.ns500'),
    );
    expect(required.length).toBeGreaterThan(0);
    expect(required.every((row) => row.label === 'Normal saline')).toBe(true);
    const names = getContent().tables['treatment-drugs'].map((row) => row.name);
    expect(names).not.toContain('Normal saline');
    expect(names).not.toContain('IV fluid bolus');
    expect(
      getContent().tables['quick-words'].find((row) => row.catalogId === 'fluid.ns500')?.chipLabel,
    ).toBe('Normal saline');
    expect(getContent().tables['quick-words'].some((row) => row.id === 'qw.resus.fluid')).toBe(
      false,
    );
  });
});

describe('三張 CSV 表已納入內容驗證', () => {
  it('drug-class-effects、drug-effect-overrides、effect-categories 都經 validateContent', () => {
    const tables = getContent().tables;
    for (const name of [
      'drug-class-effects',
      'drug-effect-overrides',
      'effect-categories',
    ] as const) {
      expect(TABLE_NAMES).toContain(name);
      expect(tables[name].length).toBeGreaterThan(0);
      expect(new Set(tables[name].map((row) => row.id)).size).toBe(tables[name].length);
    }
    expect(tables['drug-class-effects'].length).toBe(getDrugEffectTables().classes.length);
    expect(tables['drug-effect-overrides'].length).toBe(getDrugEffectTables().overrides.length);
    expect(tables['effect-categories'].length).toBe(getDrugEffectTables().categories.length);
  });

  it('sets_flags 用直線分開，空白等於沒有旗標', () => {
    const parsed = parseDrugEffectTables(
      'class,usual_dose_min,usual_dose_max,dose_unit,ordinary_routes,delta_sbp,delta_hr,delta_rr,delta_temp_c,note\n"DEMO",1,2,mg,PO,0,0,0,0,x\n',
      'drug,usual_dose_min,usual_dose_max,dose_unit,ordinary_routes,delta_sbp,delta_hr,delta_rr,delta_temp_c,status,sets_flags,note\n"Demo Drug",1,2,mg,IV,0,0,0,0,ACTIVE,"ppi.iv|diuretic.iv",x\n"Other Drug",1,2,mg,IV,0,0,0,0,ACTIVE,,x\n',
      'id,label,delta_sbp,delta_hr,delta_rr,delta_temp_c,note\nnone,no extra effect,0,0,0,0,x\n',
    );
    expect(parsed.overrides[0]?.setsFlags).toEqual(['ppi.iv', 'diuretic.iv']);
    expect(parsed.overrides[1]?.setsFlags).toEqual([]);
  });

  it('status 只准 ACTIVE／PROVISIONAL／EXAMPLE，重複藥名會拒絕', () => {
    const good = {
      id: 'Demo Drug',
      drug: 'Demo Drug',
      status: 'ACTIVE',
      setsFlags: ['ppi.iv'],
      usualDoseMin: 1,
      usualDoseMax: 2,
      doseUnit: 'mg',
      ordinaryRoutes: ['IV'],
      deltaSbp: 0,
      deltaHr: 0,
      deltaRr: 0,
      deltaTempC: 0,
      note: 'x',
    };
    expect(drugOverrideRowSchema.safeParse(good).success).toBe(true);
    expect(drugOverrideRowSchema.safeParse({ ...good, status: 'actve' }).success).toBe(false);
    expect(drugOverrideRowSchema.safeParse({ ...good, ordinaryRoutes: [] }).success).toBe(false);
    expect(drugOverrideRowSchema.safeParse({ ...good, deltaSbp: '0' }).success).toBe(false);
    expect(() =>
      parseDrugEffectTables(
        'class,usual_dose_min,usual_dose_max,dose_unit,ordinary_routes,delta_sbp,delta_hr,delta_rr,delta_temp_c,note\n"DEMO",1,2,mg,PO,0,0,0,0,x\n',
        'drug,usual_dose_min,usual_dose_max,dose_unit,ordinary_routes,delta_sbp,delta_hr,delta_rr,delta_temp_c,status,sets_flags,note\n"Demo Drug",1,2,mg,IV,0,0,0,0,ACTIVE,,x\n"demo drug",1,2,mg,IV,0,0,0,0,ACTIVE,,x\n',
        'id,label,delta_sbp,delta_hr,delta_rr,delta_temp_c,note\nnone,no extra effect,0,0,0,0,x\n',
      ),
    ).toThrow(/重複/);
  });
});
