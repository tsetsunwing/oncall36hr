import { describe, expect, it } from 'vitest';
import { OXYGEN_DEVICES } from '@/engine';
import {
  buildOxygenOrder,
  OXYGEN_CHECKS,
  OXYGEN_DEVICE_OPTIONS,
  OXYGEN_HUMIDIFICATION,
  OXYGEN_TARGETS,
  type OxygenDraft,
} from './oxygenOrder';

const none = OXYGEN_HUMIDIFICATION.find((item) => item.id === 'none')?.phrase ?? '';
const target = OXYGEN_TARGETS[0].phrase;

function draft(patch: Partial<OxygenDraft>): OxygenDraft {
  return {
    targetPhrase: target,
    devicePhrase: '',
    flow: '',
    fio2: '',
    venturiPhrase: '',
    peep: '',
    humidificationPhrase: none,
    checks: OXYGEN_CHECKS.map((id) => ({ id, label: id, checked: false })),
    ...patch,
  };
}

function phrase(id: string): string {
  return OXYGEN_DEVICE_OPTIONS.find((item) => item.id === id)?.phrase ?? '';
}

describe('氧氣治療組句', () => {
  it('裝置清單與引擎目錄對得上，短標籤不含括號', () => {
    expect(OXYGEN_DEVICE_OPTIONS.map((item) => item.id)).toEqual(
      OXYGEN_DEVICES.map((item) => item.id),
    );
    for (const option of OXYGEN_DEVICE_OPTIONS) {
      expect(option.phrase.includes('(') ? option.phrase : `${option.phrase} ()`).toBeTruthy();
    }
    const nasal = buildOxygenOrder(draft({ devicePhrase: phrase('nc'), flow: '4' }));
    expect(nasal.ok).toBe(true);
    if (!nasal.ok) return;
    expect(nasal.catalogId).toBe('oxygen.nasal');
    expect(nasal.text).toBe('Oxygen therapy Nasal cannula 4 L/min 94–98%');
    expect(nasal.text).not.toContain('None');
    expect(nasal.text).not.toContain('(');
    expect(nasal.params.summary).toBe(nasal.text);
    expect(nasal.params.dose).toEqual({ value: 4, unit: 'L/min' });
  });

  it('超出範圍不改寫數字，也不落單', () => {
    const high = buildOxygenOrder(draft({ devicePhrase: phrase('nc'), flow: '8' }));
    expect(high.ok).toBe(false);
    if (high.ok) return;
    expect(high.error).toMatchObject({ field: 'flow', min: 1, max: 6, unit: 'L/min' });
    const low = buildOxygenOrder(draft({ devicePhrase: phrase('simple'), flow: '4' }));
    expect(low.ok).toBe(false);
    const bvm = buildOxygenOrder(draft({ devicePhrase: phrase('bvm'), flow: '9' }));
    expect(bvm.ok).toBe(false);
    const edge = buildOxygenOrder(draft({ devicePhrase: phrase('nrbm'), flow: '15' }));
    expect(edge.ok).toBe(true);
    const decimal = buildOxygenOrder(draft({ devicePhrase: phrase('nc'), flow: '4.5' }));
    expect(decimal.ok).toBe(false);
  });

  it('文丘里只交 FiO2，高流量同正壓只顯示適用欄位的數值', () => {
    const venturi = buildOxygenOrder(
      draft({
        devicePhrase: phrase('venturi'),
        venturiPhrase: '28% (White, 4 L/min)',
        flow: '99',
      }),
    );
    expect(venturi.ok).toBe(true);
    if (!venturi.ok) return;
    expect(venturi.catalogId).toBe('oxygen.venturi');
    expect(venturi.text).toBe('Oxygen therapy Venturi mask 28% 94–98%');
    expect(venturi.text).not.toContain('White');
    expect(venturi.params.dose).toEqual({ value: 28, unit: '%' });
    expect(venturi.params.rate).toBeUndefined();

    const hfnc = buildOxygenOrder(draft({ devicePhrase: phrase('hfnc'), flow: '40', fio2: '50' }));
    expect(hfnc.ok).toBe(true);
    if (!hfnc.ok) return;
    expect(hfnc.params.dose).toEqual({ value: 40, unit: 'L/min' });
    expect(hfnc.params.rate).toEqual({ value: 50, unit: '%' });
    const hfncLow = buildOxygenOrder(
      draft({ devicePhrase: phrase('hfnc'), flow: '9', fio2: '50' }),
    );
    expect(hfncLow.ok).toBe(false);

    const niv = buildOxygenOrder(
      draft({
        devicePhrase: phrase('niv'),
        fio2: '21',
        peep: '5',
        checks: OXYGEN_CHECKS.map((id) => ({
          id,
          label: id,
          checked: id === 'titrate' || id === 'abg',
        })),
      }),
    );
    expect(niv.ok).toBe(true);
    if (!niv.ok) return;
    expect(niv.catalogId).toBe('oxygen.niv');
    expect(niv.params.rate).toEqual({ value: 5, unit: 'cmH2O' });
    expect(niv.text).toContain('21% 5 cmH2O');
    expect(niv.text).toContain('titrate, abg');
    const peepHigh = buildOxygenOrder(
      draft({ devicePhrase: phrase('invasive'), fio2: '100', peep: '21' }),
    );
    expect(peepHigh.ok).toBe(false);
  });
});
