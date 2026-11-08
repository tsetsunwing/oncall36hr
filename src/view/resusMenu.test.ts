import { describe, expect, it } from 'vitest';
import { getContent } from '@/content';
import { RESUS_MENU } from './resusMenu';

const tables = getContent().tables;

const CATALOG: Record<string, string> = {
  'qw.rhythm': 'acls.rhythmcheck',
  'qw.resus.pulse': 'obs.pulse',
  'qw.resus.etco2': 'monitor.etco2',
  'qw.resus.ecg': 'ecg.12lead',
  'qw.resus.glucose': 'poct.glucose',
  'qw.resus.pocus': 'img.pocus',
  'qw.resus.ct': 'proc.ct.noncontrast',
  'qw.cpr': 'acls.cpr',
  'qw.resus.bvm': 'proc.bvm',
  'qw.intubation': 'proc.intubation',
  'qw.resus.ventilation': 'proc.ventilation',
  'qw.resus.ivio': 'proc.ivio',
  'qw.resus.ttm': 'proc.ttm',
  'qw.decompression': 'proc.decompression',
  'qw.pericardial': 'proc.pericardiocentesis',
  'qw.resus.cath': 'proc.cathlab',
  'qw.adrenaline': 'drug.adrenaline',
  'qw.amiodarone': 'drug.amiodarone',
  'qw.resus.lidocaine': 'drug.lidocaine',
  'qw.resus.magnesium': 'drug.magnesium',
  'qw.resus.atropine': 'drug.atropine',
  'qw.resus.adenosine': 'drug.adenosine',
  'qw.resus.dopamine': 'drug.dopamine',
  'qw.resus.norepinephrine': 'drug.norepinephrine',
  'qw.resus.procainamide': 'drug.procainamide',
  'qw.resus.sotalol': 'drug.sotalol',
  'qw.resus.aspirin': 'drug.aspirin',
  'qw.resus.nitroglycerin': 'drug.nitroglycerin',
  'qw.resus.morphine': 'drug.morphine',
  'qw.resus.alteplase': 'drug.alteplase',
  'qw.resus.fluid': 'fluid.ns500',
  'qw.resus.bicarbonate': 'drug.bicarbonate',
  'qw.resus.calciumchloride': 'drug.calciumchloride',
  'qw.resus.naloxone': 'drug.naloxone',
  'qw.defib200': 'acls.defib',
  'qw.resus.cardioversion': 'proc.cardioversion',
  'qw.resus.pacing': 'proc.pacing',
};

const NEW_IDS = [
  'monitor.etco2',
  'proc.ct.noncontrast',
  'proc.bvm',
  'proc.ventilation',
  'proc.ivio',
  'proc.ttm',
  'proc.cathlab',
  'proc.cardioversion',
  'proc.pacing',
  'drug.lidocaine',
  'drug.magnesium',
  'drug.atropine',
  'drug.adenosine',
  'drug.dopamine',
  'drug.norepinephrine',
  'drug.procainamide',
  'drug.sotalol',
  'drug.aspirin',
  'drug.nitroglycerin',
  'drug.morphine',
  'drug.bicarbonate',
  'drug.calciumchloride',
] as const;

describe('搶救選單', () => {
  it('每個按鈕用指定英文，並且對到現有或新加嘅 order', () => {
    const shown = new Set<string>();
    for (const column of RESUS_MENU) {
      for (const item of column.items) {
        shown.add(item.id);
        const word = tables['quick-words'].find((row) => row.id === item.id);
        expect(word?.chipLabel, item.id).toBe(item.label);
        expect(word?.chipGroup, item.id).toBe('resus');
        expect(word?.catalogId, item.id).toBe(CATALOG[item.id]);
        expect(word?.params?.dose, item.id).toBeUndefined();
        expect(word?.promptDefaults, item.id).toBeUndefined();
      }
    }
    expect(shown.has('qw.stopcpr')).toBe(false);
    expect(shown.has('qw.chesttube')).toBe(false);
    expect(shown.has('qw.rewarm')).toBe(false);
    expect(tables['quick-words'].some((row) => row.id === 'qw.stopcpr')).toBe(true);
    expect(tables['quick-words'].some((row) => row.id === 'qw.chesttube')).toBe(true);
    expect(tables['order-catalog'].some((row) => row.id === 'acls.terminate')).toBe(true);
    expect(tables['order-catalog'].some((row) => row.id === 'proc.chesttube')).toBe(true);
  });

  it('新 order 冇劑量、冇報告句，Capnography 只開 EtCO2 波形', () => {
    for (const id of NEW_IDS) {
      const row = tables['order-catalog'].find((item) => item.id === id);
      expect(row, id).toBeDefined();
      expect(row?.reviewStatus, id).toBe('PENDING_CLINICAL_REVIEW');
      expect(row?.fixedDurationSec, id).toBe(0);
      expect(row?.resultTemplate, id).toBeUndefined();
      expect(row?.resultId, id).toBeUndefined();
    }
    const etco2 = tables['order-catalog'].find((row) => row.id === 'monitor.etco2');
    expect(etco2?.setsFlags).toEqual(['etco2.on']);
    const model = tables['acls-transitions'].find((row) => row.id === 'acls.model');
    if (model?.kind !== 'MODEL') throw new Error('缺 ACLS model');
    expect(model.shock.defaultEnergyJ).toBe(200);
    expect(model.drugs.find((drug) => drug.formularyId === 'adrenaline')?.dose).toEqual({
      value: 1,
      unit: 'mg',
    });
    for (const drug of tables.formulary) {
      if (!drug.catalogId.startsWith('drug.')) continue;
      expect(drug.typicalDose, drug.id).toBeNull();
    }
    expect(tables.formulary.find((row) => row.id === 'calcium-chloride')?.catalogId).toBe(
      'drug.calciumchloride',
    );
    expect(tables.formulary.find((row) => row.id === 'calcium-gluconate')?.catalogId).toBe(
      'drug.calcium',
    );
  });
});
