import { describe, expect, it } from 'vitest';
import { getConfig } from '@/content';
import { gameSecondsPerRealMs } from '../core/clock';
import { createEngine } from '../core/reducer';
import { advance, aiRequests, feed, intentEvent, params, realTables } from '../test/realEngine';

const empty = { drugFormularyId: null, dose: null, route: null };

describe('菜單同藥物表按 catalog id 落單', () => {
  it('CBC 唔經 order.parse，本地落單唔暫停時鐘', () => {
    const engine = createEngine(getConfig(), { tables: realTables() });
    const started = engine.init(params('local-cbc'));
    const placed = feed(engine, started, [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'lab.cbc',
        text: 'CBC',
        params: empty,
      }),
    ]);
    expect(aiRequests(placed.effects).map((request) => request.kind)).toEqual([]);
    expect(Object.values(placed.state.orders).map((order) => order.catalogId)).toEqual(['lab.cbc']);
    const nurse = placed.state.chats.p1?.lines.find((line) => line.speaker.kind === 'NURSE');
    expect(nurse?.template).toContain('收到');
    const rate = gameSecondsPerRealMs(engine.config, placed.state);
    expect(rate).toBeGreaterThan(0);
    const later = engine.reduce(placed.state, { type: 'TICK', dtRealMs: 1000 });
    expect(later.state.clock.t).toBeGreaterThan(placed.state.clock.t);
  });

  it('量生命表徵完成後仍講既有提醒，唔只係收到，亦唔叫模型', () => {
    const engine = createEngine(getConfig(), { tables: realTables() });
    const placed = feed(engine, engine.init(params('local-vitals')), [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'obs.vitals',
        text: 'Check vitals',
        params: empty,
      }),
    ]);
    const done = advance(engine, placed.state, 60);
    const lines = done.state.chats.p1?.lines.filter((line) => line.speaker.kind === 'NURSE') ?? [];
    expect(lines.some((line) => line.template.includes('收到'))).toBe(true);
    expect(lines.some((line) => line.template.includes('量完生命體徵'))).toBe(true);
    expect(aiRequests(done.effects).some((request) => request.kind === 'dialogue.turn')).toBe(
      false,
    );
    expect(aiRequests(done.effects).some((request) => request.kind === 'order.parse')).toBe(false);
  });

  it('脈搏結果用目錄原句，唔再叫模型認 order', () => {
    const engine = createEngine(getConfig(), { tables: realTables() });
    const placed = feed(engine, engine.init(params('local-pulse')), [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'obs.pulse',
        text: 'Check pulse',
        params: empty,
      }),
    ]);
    const done = advance(engine, placed.state, 15);
    const report = done.state.chats.p1?.lines.find((line) =>
      line.template.startsWith('Pulse {{vital.hr}}'),
    );
    expect(report?.template).toBe('Pulse {{vital.hr}}/min, {{rhythm.label}}');
    expect(report?.tokenValues['vital.hr']).toMatch(/\d+/);
    expect(aiRequests(done.effects).some((request) => request.kind === 'dialogue.turn')).toBe(
      false,
    );
  });

  it('鼻導管超出 1–6 L/min 唔落單', () => {
    const engine = createEngine(getConfig(), { tables: realTables() });
    const placed = feed(engine, engine.init(params('local-o2')), [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'oxygen.nasal',
        text: 'Oxygen 8 L/min',
        params: { drugFormularyId: null, dose: { value: 8, unit: 'L/min' }, route: null },
      }),
    ]);
    expect(Object.keys(placed.state.orders)).toHaveLength(0);
    expect(placed.effects).toContainEqual({ type: 'NOTICE', kind: 'ORDER_INVALID', tone: 'warn' });
  });

  it('藥物表欄位直接寫入 order，唔經 order.parse', () => {
    const engine = createEngine(getConfig(), { tables: realTables() });
    const placed = feed(engine, engine.init(params('local-adr')), [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'drug.adrenaline',
        text: 'adrenaline 1 mg IV (Intravenous bolus/push) STAT',
        params: {
          drugFormularyId: 'adrenaline',
          dose: { value: 1, unit: 'mg' },
          route: 'IV (Intravenous bolus/push)',
          frequency: 'STAT',
        },
      }),
    ]);
    const order = Object.values(placed.state.orders)[0];
    expect(order?.catalogId).toBe('drug.adrenaline');
    expect(order?.params.dose).toEqual({ value: 1, unit: 'mg' });
    expect(order?.params.route).toBe('IV (Intravenous bolus/push)');
    expect(order?.params.frequency).toBe('STAT');
    expect(aiRequests(placed.effects).some((request) => request.kind === 'order.parse')).toBe(
      false,
    );
    expect(gameSecondsPerRealMs(engine.config, placed.state)).toBeGreaterThan(0);
  });

  it('要把關嘅藥物審視進行中，時鐘仍然行', () => {
    const engine = createEngine(getConfig(), { tables: realTables() });
    const placed = feed(engine, engine.init(params('local-cef')), [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'drug.ceftriaxone',
        text: 'ceftriaxone 1 g IV',
        params: {
          drugFormularyId: 'ceftriaxone',
          dose: { value: 1, unit: 'g' },
          route: 'IV',
        },
      }),
    ]);
    expect(aiRequests(placed.effects).some((request) => request.kind.startsWith('gate.'))).toBe(
      true,
    );
    expect(aiRequests(placed.effects).some((request) => request.kind === 'order.parse')).toBe(
      false,
    );
    expect(gameSecondsPerRealMs(engine.config, placed.state)).toBeGreaterThan(0);
  });
});
