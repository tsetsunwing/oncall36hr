import { describe, expect, it } from 'vitest';
import { getConfig } from '@/content';
import { createEngine } from '../core/reducer';
import { advance, feed, intentEvent, params, realTables } from '../test/realEngine';

const empty = { drugFormularyId: null, dose: null, route: null };
const engine = () => createEngine(getConfig(), { tables: realTables() });

const place = (catalogId: string) =>
  intentEvent({
    type: 'PLACE_CATALOG',
    patientId: 'p1',
    catalogId,
    text: catalogId,
    params: empty,
  });

describe('病人離開病房做檢查', () => {
  it('CT 期間唔可以量血壓，掃描完成後恢復', () => {
    const e = engine();
    const placed = feed(e, e.init(params('away-1')), [place('img.ct.thorax')]);
    expect(placed.state.patients.p1?.visible.vitals.sbp).toBeGreaterThan(0);

    const during = feed(e, placed.state, [intentEvent({ type: 'MEASURE_NIBP', patientId: 'p1' })]);
    expect(during.effects.map((effect) => effect.type)).toContain('NOTICE');
    expect(during.state.patients.p1?.visible.cuff).toEqual(placed.state.patients.p1?.visible.cuff);

    const later = advance(e, placed.state, 4000).state;
    const back = feed(e, later, [intentEvent({ type: 'MEASURE_NIBP', patientId: 'p1' })]);
    expect(back.state.patients.p1?.visible.cuff).not.toEqual(
      placed.state.patients.p1?.visible.cuff,
    );
  });

  it('離開期間唔可以再落單', () => {
    const e = engine();
    const placed = feed(e, e.init(params('away-2')), [place('img.ct.thorax')]);
    const blocked = feed(e, placed.state, [place('lab.cbc')]);
    const before = Object.keys(placed.state.orders).length;
    expect(Object.keys(blocked.state.orders).length).toBe(before);
  });

  it('要對比劑的 CT 未篩查會被拒，篩查後才落得', () => {
    const e = engine();
    const state = e.init(params('away-3'));
    const refused = feed(e, state, [place('img.ctpa')]);
    expect(Object.keys(refused.state.orders)).toHaveLength(0);

    const screened = feed(e, state, [place('obs.contrast')]);
    const done = advance(e, screened.state, 300).state;
    const allowed = feed(e, done, [place('img.ctpa')]);
    expect(Object.values(allowed.state.orders).map((order) => order.catalogId)).toEqual([
      'obs.contrast',
      'img.ctpa',
    ]);
  });

  it('牀邊做的超聲波唔會令病人離開', () => {
    const e = engine();
    const placed = feed(e, e.init(params('away-4')), [place('img.pocus')]);
    const measured = feed(e, placed.state, [
      intentEvent({ type: 'MEASURE_NIBP', patientId: 'p1' }),
    ]);
    expect(measured.effects.map((effect) => effect.type)).not.toContain('NOTICE');
  });
});
