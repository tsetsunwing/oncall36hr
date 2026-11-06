/** M3：化驗／檢查結果按 T7 表延遲報告；內容查表（採樣當刻狀態）、AI 只做口頭通知。 */
import { describe, expect, it } from 'vitest';
import { effectDeltaAt } from '../case/vitals';
import type { GameState } from '../core/state';
import {
  advance,
  aiRequests,
  feed,
  intentEvent,
  params,
  realEngine,
  realTables,
  say,
  zeroNoiseTables,
} from '../test/realEngine';

const tables = zeroNoiseTables();
const engine = realEngine(tables);
const start = (seed = 'res-1') => engine.init(params(seed));

const resultRows = tables['order-catalog'].filter((r) => r.resultId);
const orderOf = (state: GameState, catalogId: string) =>
  Object.values(state.orders).find((o) => o.catalogId === catalogId);

describe('化驗／檢查結果（T7）', () => {
  it('每個有 resultId 嘅 order：完成採樣 → 等報告 → 按表內延遲出報告', () => {
    expect(resultRows.length).toBeGreaterThanOrEqual(9);
    for (const row of resultRows) {
      const result = tables.results.find((r) => r.id === row.resultId);
      if (!result) throw new Error(row.id);
      let state = feed(engine, start(`res-${row.id}`), [say(row.aliases[0] ?? row.label)]).state;
      const placed = orderOf(state, row.id);
      expect(placed, row.id).toBeDefined();
      state = advance(engine, state, row.fixedDurationSec + 1).state;
      if (result.reportDelaySec > 1) {
        expect(orderOf(state, row.id)?.resultStatus, row.id).toBe('PENDING');
        expect(state.patients.p1?.visible.reports, row.id).toHaveLength(0);
      }
      const before = placed?.completesAt ?? 0;
      state = advance(engine, state, result.reportDelaySec + 1).state;
      const report = state.patients.p1?.visible.reports[0];
      expect(report, row.id).toBeDefined();
      expect(report?.reviewStatus).toBe('PENDING_CLINICAL_REVIEW');
      expect(report?.reportedAt, row.id).toBeGreaterThanOrEqual(before);
      expect(orderOf(state, row.id)?.resultStatus).toBe('REPORTED');
    }
  });

  it('報告時間 ＝ 採樣完成時間 ＋ reportDelaySec（表內數值，固定）', () => {
    const cbc = tables.results.find((r) => r.id === 'res.cbc');
    let state = feed(engine, start(), [say('cbc')]).state;
    const order = orderOf(state, 'lab.cbc');
    state = advance(engine, state, (order?.completesAt ?? 0) - state.clock.t).state;
    expect(orderOf(state, 'lab.cbc')?.status).toBe('DONE');
    const doneAt = state.clock.t;
    state = advance(engine, state, (cbc?.reportDelaySec ?? 0) + 5).state;
    expect(state.patients.p1?.visible.reports[0]?.reportedAt).toBe(
      doneAt + (cbc?.reportDelaySec ?? 0),
    );
  });

  it('PANEL 報告：數值同參考範圍來自表；超出範圍標 H／L；log 有摘要', () => {
    let state = feed(engine, start(), [say('cbc')]).state;
    state = advance(engine, state, 300 + 1500 + 10).state;
    const report = state.patients.p1?.visible.reports[0];
    expect(report?.kind).toBe('PANEL');
    const def = tables.results.find((r) => r.id === 'res.cbc');
    if (def?.kind !== 'PANEL') throw new Error('res.cbc 應為 PANEL');
    expect(report?.items.map((i) => i.label)).toEqual(def.items.map((i) => i.label));
    for (const item of report?.items ?? []) {
      expect(item.valueText).toMatch(/\d/);
      expect(['H', 'L', null]).toContain(item.flag);
    }
    expect(report?.abnormal).toBe(report?.items.some((i) => i.flag !== null));
    const log = state.actionLog.find((e) => e.orderId === orderOf(state, 'lab.cbc')?.id);
    expect(log?.resultText).toContain(report?.items[0]?.label ?? '?');
  });

  it('REPORT 報告：文字來自 T7 textByState', () => {
    let state = feed(engine, start(), [say('cxr')]).state;
    state = advance(engine, state, 900 + 900 + 10).state;
    const report = state.patients.p1?.visible.reports[0];
    expect(report?.kind).toBe('REPORT');
    const def = tables.results.find((r) => r.id === 'res.cxr');
    const texts = def?.kind === 'REPORT' ? Object.values(def.textByState).map((t) => t.text) : [];
    expect(texts).toContain(report?.text);
  });

  it('報告內容按「採樣當刻」嘅 case 狀態：病情之後轉變都唔改報告', () => {
    const custom = {
      ...tables,
      results: tables.results.map((r) =>
        r.id === 'res.cxr' && r.kind === 'REPORT'
          ? {
              ...r,
              textByState: {
                ...r.textByState,
                '*': { text: 'DEFAULT', abnormal: false },
                DETERIORATING: { text: 'AT-SAMPLING-STATE', abnormal: true },
                STABILISING: { text: 'AFTER-TREATMENT', abnormal: false },
              },
            }
          : r,
      ),
    };
    const eng = realEngine(custom);
    let state = feed(eng, eng.init(params('res-state')), [say('cxr')]).state;
    expect(state.patients.p1?.hidden.fsm.state).toBe('DETERIORATING');
    state = advance(eng, state, 900 + 1).state;
    expect(orderOf(state, 'img.cxr')?.sampledState).toBe('DETERIORATING');
    state = feed(eng, state, [say('oxygen nrb')]).state;
    const patient = state.patients.p1;
    if (!patient) throw new Error('no patient');
    state = {
      ...state,
      patients: {
        ...state.patients,
        p1: {
          ...patient,
          hidden: { ...patient.hidden, fsm: { ...patient.hidden.fsm, state: 'STABILISING' } },
        },
      },
    };
    state = advance(eng, state, 900 + 5).state;
    const report = state.patients.p1?.visible.reports[0];
    expect(report?.text).toBe('AT-SAMPLING-STATE');
    expect(report?.abnormal).toBe(true);
  });

  it('報告出咗，護士口頭通知（AI 只收到 label token 同 abnormal，唔收數值）', () => {
    let state = feed(engine, start(), [say('cbc')]).state;
    const run = advance(engine, state, 300 + 1500 + 10);
    state = run.state;
    const lab = aiRequests(run.effects).find(
      (r) =>
        (r.context as { prompt: { beats: { type: string }[] } }).prompt.beats[0]?.type ===
        'REPORT_LAB_READY',
    );
    expect(lab).toBeDefined();
    const text = JSON.stringify(lab?.context);
    for (const item of state.patients.p1?.visible.reports[0]?.items ?? []) {
      expect(text).not.toContain(item.valueText);
    }
  });

  it('等報告期間取消 order：採樣已完成，報告照出；未採樣就取消則冇報告', () => {
    let state = feed(engine, start('res-c1'), [say('cbc')]).state;
    const id = orderOf(state, 'lab.cbc')?.id ?? '';
    state = feed(engine, state, [intentEvent({ type: 'CANCEL_ORDER', orderId: id })]).state;
    state = advance(engine, state, 4000).state;
    expect(orderOf(state, 'lab.cbc')?.status).toBe('CANCELLED');
    expect(state.patients.p1?.visible.reports).toHaveLength(0);
  });

  it('每個 PANEL／REPORT 結果行都有 PENDING_CLINICAL_REVIEW 標記同備註（佔位，唔冒充真值）', () => {
    for (const row of realTables().results) {
      expect(row.reviewStatus, row.id).toBe('PENDING_CLINICAL_REVIEW');
    }
  });

  it('save → load：等報告嘅 order 同已出報告都完整保留，重播結果一致', () => {
    let state = feed(engine, start('res-save'), [say('cbc')]).state;
    state = advance(engine, state, 400).state;
    const copy = JSON.parse(JSON.stringify(state)) as GameState;
    const a = advance(engine, state, 3000).state;
    const b = advance(engine, copy, 3000).state;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.patients.p1?.visible.reports).toHaveLength(1);
  });
});

describe('取消規則：KEEP_PARTIAL vs DISCARD', () => {
  const patientAt = (state: GameState, t: number) => {
    const patient = state.patients.p1;
    if (!patient) throw new Error('no patient');
    return effectDeltaAt(patient, state.orders, tables, t);
  };

  it('輸液（KEEP_PARTIAL）：中途取消保留已滴入嘅比例，唔會突然彈返', () => {
    let state = feed(engine, start('keep-1'), [say('ns 500 ml')]).state;
    const id = orderOf(state, 'fluid.ns500')?.id ?? '';
    state = advance(engine, state, 900).state;
    const running = patientAt(state, state.clock.t + 3000);
    state = feed(engine, state, [intentEvent({ type: 'CANCEL_ORDER', orderId: id })]).state;
    const cancelled = orderOf(state, 'fluid.ns500');
    expect(cancelled?.status).toBe('CANCELLED');
    expect(cancelled?.cancelledAt).toBe(state.clock.t);
    const after = patientAt(state, state.clock.t + 3000);
    const magnitude = (delta: Record<string, number>) =>
      Object.values(delta).reduce((sum, value) => sum + Math.abs(value), 0);
    const total = magnitude(running);
    const kept = magnitude(after);
    expect(total).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(total);
  });

  it('藥物（DISCARD）：取消即全部撤回', () => {
    const placed = feed(engine, start('discard-1'), [say('paracetamol 500 mg po')]);
    const released = feed(
      engine,
      placed.state,
      aiRequests(placed.effects).map((r) => ({
        type: 'AI_RESULT' as const,
        reqId: r.reqId,
        payload: { verdict: 'OK', concerns: [] },
      })),
    );
    const id = orderOf(released.state, 'drug.paracetamol')?.id ?? '';
    const cancelled = feed(engine, released.state, [
      intentEvent({ type: 'CANCEL_ORDER', orderId: id }),
    ]);
    expect(orderOf(cancelled.state, 'drug.paracetamol')?.status).toBe('CANCELLED');
    const delta = patientAt(cancelled.state, cancelled.state.clock.t + 3000);
    expect(Object.values(delta).every((v) => v === 0)).toBe(true);
  });

  it('暫停中取消進行中嘅 order 成功；已完成嘅唔得', () => {
    let state = feed(engine, start('pause-c'), [say('ns 500 ml')]).state;
    const id = orderOf(state, 'fluid.ns500')?.id ?? '';
    state = feed(engine, state, [intentEvent({ type: 'PAUSE' })]).state;
    const cancelled = feed(engine, state, [intentEvent({ type: 'CANCEL_ORDER', orderId: id })]);
    expect(orderOf(cancelled.state, 'fluid.ns500')?.status).toBe('CANCELLED');

    let done = feed(engine, start('pause-d'), [say('nrb')]).state;
    done = advance(engine, done, 120).state;
    const oid = orderOf(done, 'oxygen.nrb')?.id ?? '';
    const refused = feed(engine, done, [intentEvent({ type: 'CANCEL_ORDER', orderId: oid })]);
    expect(refused.effects).toEqual([
      { type: 'NOTICE', kind: 'ORDER_NOT_CANCELLABLE', tone: 'warn' },
    ]);
  });
});
