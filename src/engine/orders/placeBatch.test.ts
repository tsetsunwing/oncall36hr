import { describe, expect, it } from 'vitest';
import { getConfig } from '@/content';
import { createEngine } from '../core/reducer';
import { aiRequests, feed, intentEvent, params, realTables } from '../test/realEngine';

const engine = () => createEngine(getConfig(), { tables: realTables() });

const batch = (catalogIds: string[], text = '抽血：CBC、RFT') =>
  intentEvent({ type: 'PLACE_CATALOG_BATCH', patientId: 'p1', catalogIds, text });

describe('抽血籃：一批落單共用同一個抽血時間', () => {
  it('兩張化驗單同一個 created time，護士只講一次收到', () => {
    const e = engine();
    const run = feed(e, e.init(params('batch-1')), [batch(['lab.cbc', 'lab.rft'])]);
    const orders = Object.values(run.state.orders);
    expect(orders).toHaveLength(2);
    expect(orders.map((order) => order.catalogId).sort()).toEqual(['lab.cbc', 'lab.rft']);
    const times = new Set(orders.map((order) => order.createdAt));
    expect(times.size).toBe(1);
    const nurseLines = run.state.chats.p1?.lines.filter((line) => line.speaker.kind === 'NURSE');
    expect(nurseLines).toHaveLength(1);
    expect(nurseLines?.[0]?.template).toContain('收到');
    expect(Object.values(nurseLines?.[0]?.tokenValues ?? {}).join('')).toContain('、');
    expect(aiRequests(run.effects)).toEqual([]);
  });

  it('重複項目會被拒，唔會落兩張', () => {
    const e = engine();
    const state = e.init(params('batch-dup'));
    const run = feed(e, state, [batch(['lab.cbc', 'lab.cbc'])]);
    expect(Object.keys(run.state.orders)).toHaveLength(0);
    expect(run.effects.some((effect) => effect.type === 'NOTICE')).toBe(true);
  });

  it('空籃會被拒', () => {
    const e = engine();
    const state = e.init(params('batch-empty'));
    const run = feed(e, state, [batch([])]);
    expect(Object.keys(run.state.orders)).toHaveLength(0);
  });

  it('要填劑量或位置的醫囑唔可以入籃', () => {
    const e = engine();
    const state = e.init(params('batch-drug'));
    const run = feed(e, state, [batch(['drug.ceftriaxone'])]);
    expect(Object.keys(run.state.orders)).toHaveLength(0);
    expect(run.effects.some((effect) => effect.type === 'NOTICE')).toBe(true);
  });

  it('認唔到的 catalog id 會被拒', () => {
    const e = engine();
    const state = e.init(params('batch-unknown'));
    const run = feed(e, state, [batch(['lab.nope'])]);
    expect(Object.keys(run.state.orders)).toHaveLength(0);
  });
});
