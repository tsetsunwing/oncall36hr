import { describe, expect, it } from 'vitest';
import { getContent } from '@/content';
import { gameStateSchema } from '../core/state';
import {
  advance,
  feed,
  intentEvent,
  params,
  realEngine,
  zeroNoiseTables,
} from '../test/realEngine';

const empty = { drugFormularyId: null, dose: null, route: null };

describe('外科引流', () => {
  const tables = zeroNoiseTables();
  const engine = realEngine(tables);

  function place(seed: string, site: string | null) {
    return feed(engine, engine.init(params(seed)), [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'proc.drain',
        text: site ? `Surgical drain ${site}` : 'Surgical drain',
        params: site ? { ...empty, site, summary: `Surgical drain ${site}` } : empty,
      }),
    ]);
  }

  it('每條引流記下玩家填的位置，不設單一 flag，也不改生命表徵', () => {
    const effect = getContent().tables['order-effects'].find(
      (row) => row.catalogId === 'proc.drain',
    );
    expect(effect?.reviewStatus).toBe('PENDING_CLINICAL_REVIEW');
    expect(effect?.delta).toEqual({});
    const catalog = getContent().tables['order-catalog'].find((row) => row.id === 'proc.drain');
    expect(catalog?.setsFlags).toEqual([]);
    expect(catalog?.reviewStatus).toBe('PENDING_CLINICAL_REVIEW');

    const first = place('drain-a', '  Left   Chest ');
    expect(Object.values(first.state.orders)[0]?.params.site).toBe('Left Chest');
    const done = advance(engine, first.state, 601).state;
    const second = feed(engine, done, [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'proc.drain',
        text: 'Surgical drain right abdomen',
        params: { ...empty, site: 'right abdomen', summary: 'Surgical drain right abdomen' },
      }),
    ]);
    const finished = advance(engine, second.state, 601).state;
    const patient = finished.patients.p1;
    expect(patient?.visible.drains.map((item) => item.site)).toEqual([
      'Left Chest',
      'right abdomen',
    ]);
    expect(patient?.hidden.fsm.flags.some((flag) => flag.includes('drain'))).toBe(false);

    const control = advance(engine, engine.init(params('drain-a')), 1202).state;
    expect(patient?.visible.vitals).toEqual(control.patients.p1?.visible.vitals);
    expect(gameStateSchema.safeParse(finished).success).toBe(true);
  });

  it('空白位置不落單', () => {
    const missing = place('drain-empty', null);
    expect(Object.keys(missing.state.orders)).toHaveLength(0);
    expect(missing.effects).toContainEqual({ type: 'NOTICE', kind: 'ORDER_INVALID', tone: 'warn' });
    const blank = place('drain-blank', '   ');
    expect(Object.keys(blank.state.orders)).toHaveLength(0);
  });
});
