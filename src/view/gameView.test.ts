import { describe, expect, it } from 'vitest';
import { getConfig, getContent } from '@/content';
import { createEngine, type EngineEvent, type GameState } from '@/engine';
import { formatClock } from './clock';
import { selectGameView, selectMonitor, type ViewEnv } from './gameView';
import {
  bloodPressureBand,
  heartRateBand,
  respiratoryRateBand,
  spo2Band,
  temperatureBand,
} from './vitalBands';

const baseConfig = getConfig();
const config = { ...baseConfig, clock: { ...baseConfig.clock, pauseWhileAiPending: false } };
const tables = getContent().tables;
const engine = createEngine(config, { tables });
const env: ViewEnv = { tables, config };

function play(events: EngineEvent[], seed = 'view-1'): GameState {
  let state = engine.init({ seed, mode: 'NIGHT', difficulty: 'MEDIUM', playerRank: 'MO' });
  for (const event of events) state = engine.reduce(state, event).state;
  return state;
}
const say = (text: string): EngineEvent => ({
  type: 'PLAYER_INTENT',
  intent: { type: 'SUBMIT_CHAT', patientId: 'p1', text },
});
const tick = (gameSeconds: number): EngineEvent => ({
  type: 'TICK',
  dtRealMs: (gameSeconds / 30) * 1000,
});

describe('ViewModel：只映射可見資料', () => {
  it('唔會洩露 hidden：診斷詞、FSM 狀態名、trajectory、base 值、flags', () => {
    const state = play([say('oxygen nrb'), tick(7200 * 2)]);
    const json = JSON.stringify(selectGameView(state, env)).toLowerCase();
    const template = tables['case-templates'][0];
    for (const term of template?.diagnosisTerms ?? [])
      expect(json).not.toContain(term.toLowerCase());
    for (const secret of [
      'septic_shock',
      'deteriorating',
      'stabilising',
      'trajectory',
      'flags',
      'oxygen.on',
      '"hidden"',
      'alertedband',
      'lastsampleat',
    ]) {
      expect(json, secret).not.toContain(secret);
    }
  });

  it('監察儀數字 ＝ visible vitals（血壓一格含 MAP、MEWS）', () => {
    const state = play([tick(1800)]);
    const patient = state.patients.p1;
    const view = selectGameView(state, env).monitor;
    const sbp = patient?.visible.cuff.sbp ?? 0;
    const dbp = patient?.visible.cuff.dbp ?? 0;
    const map = Math.round((sbp + 2 * dbp) / 3);
    expect(view?.hr.text).toBe(String(patient?.visible.vitals.hr));
    expect(view?.bp.text).toBe(`${String(sbp)}/${String(dbp)} (${String(map)})`);
    expect(view?.temp.text).toBe(patient?.visible.vitals.temp.toFixed(1));
    expect(view?.mews.score).toBe(patient?.visible.mews.score);
    expect(view?.lineSlot).toEqual({ kind: null, reviewPending: false });
  });

  it('A-line 或 CVP 只跟現有導管 flag；冇讀數，並標待核對', () => {
    const state = play([]);
    const patient = state.patients.p1;
    if (!patient) throw new Error('缺病人');
    const withFlags = (flags: string[]) =>
      selectMonitor(
        {
          ...patient,
          hidden: { ...patient.hidden, fsm: { ...patient.hidden.fsm, flags } },
        },
        env,
        () => '21:00',
      );
    const cvp = withFlags(['cvc.in']);
    expect(cvp.lineSlot).toEqual({ kind: 'CVP', reviewPending: true });
    expect(cvp.lineSlot).not.toHaveProperty('text');
    expect(withFlags(['aline.in']).lineSlot.kind).toBe('ALINE');
    expect(withFlags(['aline.in', 'cvc.in']).lineSlot.kind).toBe('ALINE');
    expect(withFlags([]).lineSlot).toEqual({ kind: null, reviewPending: false });
    expect(withFlags([]).lines.etco2).toBe(false);
    expect(withFlags(['etco2.on']).lines.etco2).toBe(true);
    expect(withFlags(['airway.secured']).lines.etco2).toBe(true);
    expect(withFlags(['etco2.on'])).not.toHaveProperty('etco2');
  });

  it('警報級別來自 MEWS 表嘅 componentAlert，方向來自表（唔係 view 估）', () => {
    const view = selectGameView(play([]), env).monitor;
    expect(view?.hr).toMatchObject({ level: 'ALARM', direction: 'HIGH' });
    expect(view?.spo2).toMatchObject({ level: 'ALARM', direction: 'LOW' });
    expect(view?.bp).toMatchObject({ level: 'NORMAL', direction: null });
    expect(view?.mews).toMatchObject({ bandId: 'CRITICAL', level: 'ALARM', reviewPending: true });
    const source = play([]).patients.p1?.visible.vitals;
    if (!source) throw new Error('缺生命體徵');
    expect(view?.hr.band).toBe(heartRateBand(source.hr));
    expect(view?.spo2.band).toBe(spo2Band(source.spo2));
    expect(view?.rr.band).toBe(respiratoryRateBand(source.rr));
    expect(view?.temp.band).toBe(temperatureBand(source.temp));
    const cuff = play([]).patients.p1?.visible.cuff;
    if (!cuff) throw new Error('缺袖帶讀數');
    expect(view?.bp.band).toBe(bloodPressureBand(cuff.sbp, cuff.dbp));
  });

  it('快捷 chips 來自 quick-words 表', () => {
    const chips = selectGameView(play([]), env).quickChips;
    expect(chips.map((c) => c.label)).toEqual(
      tables['quick-words'].flatMap((w) => (w.chipLabel ? [w.chipLabel] : [])),
    );
    expect(chips.find((chip) => chip.label === 'CBC')?.report).toEqual({
      bucket: 'laboratory',
      section: 'haem',
    });
    expect(chips.find((chip) => chip.label === 'POCUS')?.report).toEqual({
      bucket: 'radiology',
      section: 'us',
    });
    expect(chips.some((chip) => chip.report?.section === 'cytology')).toBe(false);
  });
});

describe('聊天 ViewModel', () => {
  it('SYSTEM 行只有 code；PLAYER 行係原文；AI 行 token 已解析（無 {{ }}）', () => {
    const state = play([say('check vitals'), tick(120)]);
    const chat = selectGameView(state, env).chat;
    const system = chat?.lines.filter((l) => l.kind === 'SYSTEM') ?? [];
    expect(system.map((l) => l.systemCode)).toEqual(['ARRIVE', 'ARRIVE']);
    expect(system.every((l) => l.text === null)).toBe(true);
    expect(chat?.lines.find((l) => l.kind === 'PLAYER')?.text).toBe('check vitals');
    expect(
      selectGameView(state, env).actionLog.patient.find((row) => row.kind === 'ORDER')?.label,
    ).toBe('Check vitals');
    expect(chat?.present.map((p) => p.mentionName)).toEqual([
      '何姑娘',
      state.patients.p1?.demographics.name,
    ]);
  });

  it('輸入中：由 pending AI 請求推算邊個角色回應', () => {
    const state = play([say('病人而家點呀')]);
    expect(selectGameView(state, env).chat?.present.find((p) => p.kind === 'NURSE')?.typing).toBe(
      true,
    );
    expect(selectGameView(state, env).chat?.present.find((p) => p.kind === 'PATIENT')?.typing).toBe(
      false,
    );
  });

  it('上次離開分隔線：離開後有新訊息先出現；資料模型唔需要 UI 觸發', () => {
    let state = play([say('check vitals')]);
    expect(selectGameView(state, env).chat?.lastLeftDividerIndex).toBeNull();
    const lineCount = state.chats.p1?.lines.length ?? 0;
    state = engine.reduce(state, {
      type: 'PLAYER_INTENT',
      intent: { type: 'LEAVE_BED', patientId: 'p1' },
    }).state;
    expect(selectGameView(state, env).chat?.lastLeftDividerIndex).toBeNull();
    state = engine.reduce(state, say('oxygen nrb')).state;
    const chat = selectGameView(state, env).chat;
    expect(chat?.lastLeftDividerIndex).toBe(lineCount);
    expect(chat?.unreadSinceLeave).toBeGreaterThan(0);
  });
});

describe('Orders 同 Action Log', () => {
  it('order 狀態由 state.orders 即時映射；取消後 cancellable 變 false', () => {
    let state = play([say('ns 500')]);
    const [order] = selectGameView(state, env).orders;
    expect(order).toMatchObject({ status: 'RUNNING', cancellable: true, executorName: '何姑娘' });
    state = engine.reduce(state, {
      type: 'PLAYER_INTENT',
      intent: { type: 'CANCEL_ORDER', orderId: order?.id ?? '' },
    }).state;
    expect(selectGameView(state, env).orders[0]).toMatchObject({
      status: 'CANCELLED',
      cancellable: false,
    });
  });

  it('全局 vs 當前病人：事件（無病人）只喺全局；新到嘅紀錄排最前', () => {
    const state = play([say('ns 500'), say('check pulse')]);
    const { all, patient } = selectGameView(state, env).actionLog;
    expect(all.at(-1)?.eventCode).toBe('SHIFT_START');
    expect(patient.every((r) => r.patientId === 'p1')).toBe(true);
    expect(patient).toHaveLength(2);
    expect(patient[0]).toMatchObject({ label: 'Check pulse', group: 'observe' });
    expect(all.length).toBe(patient.length + 1);
  });

  it('order 結果文字係 engine 凍結值（ORDER 完成後出現）', () => {
    const state = play([say('check vitals'), tick(300)]);
    const row = selectGameView(state, env).actionLog.patient.find(
      (r) => r.label === 'Check vitals',
    );
    expect(row).toMatchObject({ status: 'DONE', group: 'observe' });
    expect(row?.resultText).toMatch(/^HR \d+, BP \d+\/\d+, SpO2 \d+%/);
  });

  it('委派紀錄用預設名稱同所屬組，行動記錄唔再顯示內部代碼當標題', () => {
    let state = engine.init({
      seed: 'view-del',
      mode: 'NIGHT',
      difficulty: 'MEDIUM',
      playerRank: 'MO',
      ward: true,
    });
    state = engine.reduce(state, {
      type: 'PLAYER_INTENT',
      intent: {
        type: 'EXTENSION',
        module: 'ward',
        name: 'DELEGATE',
        payload: { task: 'PROCEDURE', itemId: 'lab.abg', patientId: 'p1', callId: null },
      },
    }).state;
    const event = selectGameView(state, env).actionLog.all.find(
      (row) => row.eventCode === 'DELEGATED_lab.abg',
    );
    expect(event).toMatchObject({ label: 'ABG', group: 'tests' });
    expect(
      selectGameView(state, env).actionLog.all.every((row) => row.label !== row.eventCode),
    ).toBe(true);
  });
});

describe('時鐘同 AI 失敗狀態', () => {
  it('formatClock：夜班 18:00 起，跨日循環', () => {
    expect(formatClock(0, 'NIGHT', config)).toBe('18:00');
    expect(formatClock(3600 * 6 + 60 * 5, 'NIGHT', config)).toBe('00:05');
    expect(formatClock(3600 * 14, 'NIGHT', config)).toBe('08:00');
    expect(formatClock(0, 'DAY', config)).toBe('08:00');
  });

  it('AI 失敗：aiFailure 帶 reqId＋原因，暫停標記', () => {
    let state = play([say('隨便')]);
    const reqId = state.pendingAi[0]?.reqId ?? '';
    state = engine.reduce(state, { type: 'AI_FAILURE', reqId, reason: 'TIMEOUT' }).state;
    const view = selectGameView(state, { ...env, aiFailureReason: 'TIMEOUT' });
    expect(view.aiFailure).toEqual({ reqId, reason: 'TIMEOUT', detail: null });
    expect(view.clock).toMatchObject({ paused: true, pausedBy: 'ai-failure' });
  });
});
