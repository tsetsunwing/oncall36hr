import { describe, expect, it } from 'vitest';
import { advance, aiRequests, feed, intentEvent, params, realEngine } from '../test/realEngine';

const engine = realEngine();
const empty = { drugFormularyId: null, dose: null, route: null };

describe('觀察面板本地記錄', () => {
  it('全套生命表徵仍然講袖帶血壓同既有提醒', () => {
    const placed = feed(engine, engine.init(params('observe-vitals')), [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'obs.vitals',
        text: '檢查全套生命表徵',
        params: { ...empty, summary: '檢查全套生命表徵' },
      }),
    ]);
    const done = advance(engine, placed.state, 60);
    const lines = done.state.chats.p1?.lines.filter((line) => line.speaker.kind === 'NURSE') ?? [];
    const spoken = lines.find((line) => line.template.includes('量完生命體徵'));
    const cuff = placed.state.patients.p1?.visible.cuff;
    if (!cuff) throw new Error('缺袖帶讀數');
    expect(spoken?.tokenValues['vital.sbp']).toBe(String(cuff.sbp));
    expect(spoken?.tokenValues['vital.dbp']).toBe(String(cuff.dbp));
    expect(aiRequests(done.effects).some((request) => request.kind === 'order.parse')).toBe(false);
  });

  it('沒有引擎間距的項目只寫標籤，護士用收到模板，不報數字', () => {
    const placed = feed(engine, engine.init(params('observe-bp')), [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'obs.record',
        text: '血壓 每 15 分鐘',
        params: { ...empty, summary: '血壓 每 15 分鐘' },
      }),
    ]);
    const done = advance(engine, placed.state, 60);
    const control = advance(engine, engine.init(params('observe-bp')), 60);
    const nurseLines = (state: typeof done.state) =>
      state.chats.p1?.lines.filter((line) => line.speaker.kind === 'NURSE') ?? [];
    const baseline = nurseLines(control.state).map((line) => line.template);
    const extra = nurseLines(done.state).filter((line) => {
      const index = baseline.indexOf(line.template);
      if (index < 0) return true;
      baseline.splice(index, 1);
      return false;
    });
    expect(extra.map((line) => line.template)).toEqual(['收到，我即刻做 {{order.1.label}}。']);
    expect(extra[0]?.tokenValues['order.1.label']).toBe('血壓 每 15 分鐘');
    const order = Object.values(done.state.orders).find((item) => item.catalogId === 'obs.record');
    const log = done.state.actionLog.find((entry) => entry.orderId === order?.id);
    expect(log?.resultText).toBeNull();
    expect(aiRequests(placed.effects)).toEqual([]);
    expect(done.state.patients.p1?.hidden.fsm.flags).not.toContain('monitoring.vitals');
  });
});
