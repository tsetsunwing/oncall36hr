import { describe, expect, it } from 'vitest';
import { matchQuickPhrase, normalizePhrase } from './quickPhrase';
import { realTables } from '../test/realEngine';

const tables = realTables();

describe('本地快捷詞 parser', () => {
  it.each([
    ['check vitals', 'obs.vitals'],
    ['  Check   VITALS  ', 'obs.vitals'],
    ['VS', 'obs.vitals'],
    ['check vitals.', 'obs.vitals'],
    ['@何姑娘 check vitals', 'obs.vitals'],
    ['ｃｈｅｃｋ ｖｉｔａｌｓ', 'obs.vitals'],
    ['NRB', 'oxygen.nrb'],
    ['oxygen nasal', 'oxygen.nasal'],
    ['NS 500 mL', 'fluid.ns500'],
    ['量生命體徵', 'obs.vitals'],
  ])('%s → %s', (text, catalogId) => {
    expect(matchQuickPhrase(text, tables)?.catalogId).toBe(catalogId);
  });

  it('藥物句式：劑量、單位、途徑只取自玩家原文，並經 formulary 驗證', () => {
    expect(matchQuickPhrase('ceftriaxone 1 g iv', tables)).toEqual({
      catalogId: 'drug.ceftriaxone',
      executor: null,
      params: { drugFormularyId: 'ceftriaxone', dose: { value: 1, unit: 'g' }, route: 'IV' },
    });
    expect(matchQuickPhrase('Ceftriaxone 2g IV', tables)?.params.dose).toEqual({
      value: 2,
      unit: 'g',
    });
    expect(matchQuickPhrase('paracetamol 500 mg po', tables)?.params).toMatchObject({
      dose: { value: 500, unit: 'mg' },
      route: 'PO',
    });
    expect(matchQuickPhrase('paracetamol 1 g', tables)?.params.route).toBeNull();
  });

  it('唔夠明確就唔中（交畀 order.parse）：未知單位、途徑、零劑量、多餘文字', () => {
    for (const text of [
      'ceftriaxone 1 kg iv',
      'ceftriaxone 1 g sc',
      'ceftriaxone 0 g iv',
      'ceftriaxone',
      'please give ceftriaxone 1 g iv',
      'give oxygen',
      'check vitals and pulse',
      '',
      '   ',
    ]) {
      expect(matchQuickPhrase(text, tables), text).toBeNull();
    }
  });

  it('normalizePhrase：去 @提及、全形轉半形、細楷、壓縮空白', () => {
    expect(normalizePhrase('@何姑娘  Check   Vitals。')).toBe('check vitals');
  });
});
