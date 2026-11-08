// @vitest-environment node
/**
 * M2 驗收（§16）：真 engine ＋ 真 gateway ＋ 本地 mock AI server（唔 mock 任何內部模組）。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startMockServer, type MockServer } from '../../test-support/mock-ai-server/server';
import { createAiGateway } from '@/ai';
import { getConfig, getContent } from '@/content';
import { createGameSession, type GameSession, type TimerApi } from './gameSession';
import type { SaveService } from './saveService';

let mock: MockServer;
beforeAll(async () => {
  mock = await startMockServer({ apiKey: 'k' });
});
afterAll(async () => {
  await mock.close();
});
beforeEach(async () => {
  await fetch(`${mock.url}/__reset`, { method: 'POST' });
});

function manualTimer() {
  let nowMs = 0;
  let handler: (() => void) | null = null;
  const api: TimerApi = {
    setInterval: (h) => {
      handler = h;
      return 1;
    },
    clearInterval: () => {
      handler = null;
    },
    now: () => nowMs,
  };
  return {
    api,
    /** 前進真實毫秒（以 tick 間隔 250ms 逐步行） */
    async run(realMs: number, session?: GameSession) {
      for (let spent = 0; spent < realMs; spent += 250) {
        nowMs += 250;
        handler?.();
        if (session) await session.settled();
      }
    },
  };
}

const saveFn = vi.fn<SaveService['save']>(() => Promise.resolve({} as never));
const saves: SaveService = {
  save: (...args) => saveFn(...args),
  load: vi.fn(() => Promise.resolve({ ok: false, error: 'MISSING', message: '' } as never)),
  list: vi.fn(() => Promise.resolve([])),
  remove: vi.fn(() => Promise.resolve()),
  exportSlot: vi.fn(() =>
    Promise.resolve({ ok: false as const, error: 'MISSING' as const, message: '' }),
  ),
  importManual: vi.fn(() =>
    Promise.resolve({ ok: false as const, error: 'INVALID_JSON' as const, message: '' }),
  ),
};

function open(
  model: string,
  options: { timeoutMs?: number; seed?: string; difficulty?: 'EASY' | 'MEDIUM' | 'HARD' } = {},
) {
  const timer = manualTimer();
  const session = createGameSession({
    config: getConfig(),
    tables: getContent().tables,
    params: {
      seed: options.seed ?? 'int-1',
      mode: 'NIGHT',
      difficulty: options.difficulty ?? 'MEDIUM',
      playerRank: 'MO',
    },
    gateway: createAiGateway(
      { baseUrl: mock.baseUrl, apiKey: 'k', model },
      { timeoutMs: options.timeoutMs ?? 2000 },
    ),
    saves,
    timer: timer.api,
  });
  session.start();
  return { session, timer };
}

const numbers = (text: string) =>
  [...text.replace(/SpO2/g, '').matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
const patientsJson = (s: GameSession) => JSON.stringify(s.getState().patients);
const chatKinds = (s: GameSession) => s.getSnapshot().chat?.lines.map((l) => l.kind) ?? [];

describe('快捷詞 → order → 結果（唔經 order.parse）', () => {
  it('check vitals：order 完成、Action Log 結果文字同護士對白數字完全一致（凍結 token）', async () => {
    const { session, timer } = open('mock-ok');
    session.actions.submitChat('p1', 'check vitals');
    await session.settled();
    const sent = mock.requests.map((r) => JSON.stringify(r.body));
    expect(sent.some((b) => b.includes('order.parse'))).toBe(false);

    await timer.run(8000, session);
    const view = session.getSnapshot();
    const row = view.actionLog.patient.find((r) => r.kind === 'ORDER');
    expect(row?.status).toBe('DONE');
    const logNumbers = numbers(row?.resultText ?? '');
    expect(logNumbers).toHaveLength(7);

    const report = view.chat?.lines.find(
      (l) => l.kind === 'NURSE' && l.text?.includes('量完生命體徵'),
    );
    expect(report).toBeDefined();
    const chatNumbers = numbers((report?.text ?? '').split('：').slice(1).join(''));
    expect(chatNumbers).toEqual(logNumbers);
  });

  it('每條 AI 對白入面嘅數字，都等於 engine 當刻凍結嘅 token 值', async () => {
    const { session, timer } = open('mock-ok', { seed: 'int-frozen' });
    session.actions.submitChat('p1', 'check vitals');
    await timer.run(20_000, session);
    const state = session.getState();
    const lines = state.chats.p1?.lines ?? [];
    const aiLines = lines.filter((l) => l.speaker.kind === 'NURSE');
    expect(aiLines.length).toBeGreaterThan(1);
    for (const line of aiLines) {
      for (const [token, value] of Object.entries(line.tokenValues)) {
        expect(line.template).toContain(`{{${token}}}`);
        expect(value).toMatch(/\S/);
      }
      expect(line.template.replace(/\{\{[^}]+\}\}/g, '')).not.toMatch(/\d/);
    }
    const views = session.getSnapshot().chat?.lines.filter((l) => l.kind === 'NURSE') ?? [];
    for (const v of views) expect(v.text).not.toMatch(/\{\{|\}\}/);
  });
});

describe('自由文字 → order.parse → order', () => {
  it('解析 Ceftriaxone 2 g IV，劑量取自玩家原文，order 同護士確認一致', async () => {
    const { session } = open('mock-ok');
    session.actions.submitChat('p1', '幫病人落 Ceftriaxone 2 g IV');
    await session.settled();
    const order = session.getSnapshot().orders[0];
    expect(order?.status).toBe('RUNNING');
    expect(order?.label).toContain('Ceftriaxone');
    expect(order?.label).toContain('2 g');
    const ack = session.getSnapshot().chat?.lines.find((l) => l.kind === 'NURSE');
    expect(ack?.text).toContain('Ceftriaxone');
    expect(session.getSnapshot().aiFailure).toBeNull();
  });

  it('AI 回應期間時鐘自動暫停（C1 B）；回覆後繼續', async () => {
    const { session, timer } = open('mock-ok');
    session.start();
    const t0 = session.getState().clock.t;
    session.actions.submitChat('p1', '幫我睇下 vital signs');
    expect(session.getState().pendingAi.length).toBeGreaterThan(0);
    await timer.run(1000);
    expect(session.getState().clock.t).toBe(t0);
    await session.settled();
    expect(session.getSnapshot().orders).toHaveLength(1);
    await timer.run(2000, session);
    expect(session.getState().clock.t).toBeGreaterThan(t0);
  });
});

describe('惡意／錯誤 AI 輸出：改唔到任何顯示數字', () => {
  const guardModes = ['numbers', 'bad-token', 'diagnosis', 'wrong-speaker'];
  for (const mode of guardModes) {
    it(`mock-${mode}：對白被 guard 擋住 → 暫停＋重試橫幅，病人同 vitals 不變，冇 AI 對白入 chat`, async () => {
      const { session } = open(`mock-${mode}`);
      const before = patientsJson(session);
      const hrBefore = session.getSnapshot().monitor?.hr.text;
      session.actions.submitChat('p1', '病人而家點呀');
      await session.settled();
      const view = session.getSnapshot();
      expect(view.aiFailure?.reason).toBe('GUARD');
      expect(view.clock.paused).toBe(true);
      expect(view.clock.pausedBy).toBe('ai-failure');
      expect(patientsJson(session)).toBe(before);
      expect(view.monitor?.hr.text).toBe(hrBefore);
      expect(chatKinds(session).filter((k) => k === 'NURSE' || k === 'PATIENT')).toEqual([]);
      expect(JSON.stringify(view.chat)).not.toMatch(/99|肺炎|sepsis/i);
      const attempts = mock.requests.length;
      expect(attempts).toBeGreaterThanOrEqual(2);
    });
  }

  it('mock-inject：order.parse 夾帶數字同假 ORDER → 病人同 vitals 不變，護士本地要求重講', async () => {
    const { session } = open('mock-inject');
    const before = patientsJson(session);
    session.actions.submitChat('p1', '病人而家點呀');
    await session.settled();
    const view = session.getSnapshot();
    expect(view.aiFailure).toBeNull();
    expect(patientsJson(session)).toBe(before);
    expect(Object.keys(session.getState().orders)).toHaveLength(0);
    expect(JSON.stringify(view.chat)).toContain('聽唔清楚');
  });

  it('mock-extra-fields：多餘欄位（vitals／diagnosis）被剝除，正常完成，數字不受影響', async () => {
    const { session, timer } = open('mock-extra-fields', { seed: 'int-extra' });
    session.actions.submitChat('p1', '睇下 vital signs');
    await timer.run(8000, session);
    const view = session.getSnapshot();
    expect(view.aiFailure).toBeNull();
    expect(view.monitor?.spo2.text).not.toBe('99');
    expect(JSON.stringify(view)).not.toMatch(/pneumonia|"diagnosis"/i);
    expect(session.getState().patients.p1?.visible.mews.score).toBeGreaterThan(0);
  });

  it('order.parse 虛構 catalogId／劑量：gateway guard 擋住 → GUARD，唔建 order', async () => {
    for (const mode of ['unknown-catalog', 'invented-dose']) {
      const { session } = open(`mock-${mode}`, { seed: `int-${mode}` });
      session.actions.submitChat('p1', '俾佢啲藥');
      await session.settled();
      expect(session.getSnapshot().aiFailure?.reason, mode).toBe('GUARD');
      expect(Object.keys(session.getState().orders), mode).toHaveLength(0);
    }
  });
});

describe('失敗處理（C7 A、spec §21）', () => {
  it('格式錯誤第一次：自動修復重試成功，玩家睇唔到失敗', async () => {
    const { session } = open('mock-flaky', { seed: 'int-flaky' });
    session.actions.submitChat('p1', '幫我睇下 vitals 呀');
    await session.settled();
    expect(session.getSnapshot().aiFailure).toBeNull();
    expect(session.getSnapshot().orders).toHaveLength(1);
  });

  it('連續失敗 → 暫停＋橫幅＋存檔；暫停期間時鐘唔走；重試用同一 reqId 並成功', async () => {
    const { session, timer } = open('mock-fail-twice', { seed: 'int-retry' });
    const saveMock = saveFn;
    const saveCalls = saveMock.mock.calls.length;
    session.actions.submitChat('p1', '幫我睇下 vitals 呀');
    await session.settled();
    const failed = session.getSnapshot();
    expect(failed.aiFailure?.reason).toBe('NETWORK');
    expect(failed.clock.paused).toBe(true);
    expect(saveMock.mock.calls.length).toBeGreaterThan(saveCalls);
    expect(saveMock.mock.calls.at(-1)?.[1]).toEqual({ kind: 'AI_FAILURE' });

    const reqId = failed.aiFailure?.reqId;
    const t = session.getState().clock.t;
    await timer.run(3000);
    expect(session.getState().clock.t).toBe(t);
    session.actions.togglePause();
    expect(session.getSnapshot().clock.paused).toBe(true);

    session.actions.retryAi();
    await session.settled();
    const after = session.getSnapshot();
    expect(after.aiFailure).toBeNull();
    expect(after.clock.paused).toBe(false);
    expect(session.getState().pendingAi.find((p) => p.reqId === reqId)).toBeUndefined();
    expect(chatKinds(session)).toContain('NURSE');
  });

  it('認證失敗：AUTH，唔重試', async () => {
    const { session } = open('mock-auth-fail', { seed: 'int-auth' });
    session.actions.submitChat('p1', '幫我睇下 vitals 呀');
    await session.settled();
    expect(session.getSnapshot().aiFailure?.reason).toBe('AUTH');
    expect(mock.requests).toHaveLength(1);
  });

  it('伺服器無回應：TIMEOUT（重試 1 次後）', async () => {
    const { session } = open('mock-hang', { timeoutMs: 150, seed: 'int-hang' });
    session.actions.submitChat('p1', '幫我睇下 vitals 呀');
    await session.settled();
    expect(session.getSnapshot().aiFailure?.reason).toBe('TIMEOUT');
    expect(mock.requests).toHaveLength(2);
  });
});

describe('Action Log、order 取消、提及', () => {
  it('全局同當前病人範圍：事件只喺全局，order 兩邊都有', async () => {
    const { session } = open('mock-ok', { seed: 'int-log' });
    session.actions.submitChat('p1', 'ns 500');
    await session.settled();
    const { all, patient } = session.getSnapshot().actionLog;
    expect(all.some((r) => r.eventCode === 'SHIFT_START')).toBe(true);
    expect(patient.some((r) => r.eventCode === 'SHIFT_START')).toBe(false);
    expect(all.filter((r) => r.kind === 'ORDER')).toHaveLength(1);
    expect(patient.filter((r) => r.kind === 'ORDER')).toHaveLength(1);
  });

  it('進行中 order 可取消（暫停時亦可）；取消後狀態同 Action Log 原因更新、效果移除', async () => {
    const { session } = open('mock-ok', { seed: 'int-cancel' });
    session.actions.submitChat('p1', 'ns 500');
    await session.settled();
    const order = session.getSnapshot().orders[0];
    expect(order?.cancellable).toBe(true);
    session.actions.togglePause();
    session.actions.cancelOrder(order?.id ?? '');
    const view = session.getSnapshot();
    expect(view.orders[0]?.status).toBe('CANCELLED');
    expect(view.actionLog.patient.find((r) => r.kind === 'ORDER')?.reasonCode).toBe(
      'CANCELLED_BY_PLAYER',
    );
  });

  it('暫停中落 order → notice，下一個動作清除', () => {
    const { session } = open('mock-ok', { seed: 'int-notice' });
    session.actions.togglePause();
    session.actions.submitChat('p1', 'check vitals');
    expect(session.getSnapshot().notice?.kind).toBe('ORDER_BLOCKED_PAUSED');
    session.actions.togglePause();
    expect(session.getSnapshot().notice).toBeNull();
  });

  it('@ 提及病人 → 病人對白（症狀來自 content 表）', async () => {
    const { session } = open('mock-ok', { seed: 'int-patient' });
    const name = session.getSnapshot().patient?.name ?? '';
    session.actions.submitChat('p1', `@${name} 你好，胸口痛嗎？`);
    await session.settled();
    const patientLine = session.getSnapshot().chat?.lines.find((l) => l.kind === 'PATIENT');
    expect(patientLine?.speakerName).toBe(name);
    expect(patientLine?.text).toMatch(/氣促|發冷|咳嗽有痰/);
  });

  it('stop() 之後遲到嘅 AI 結果唔會套用', async () => {
    const { session } = open('mock-ok', { seed: 'int-stop' });
    session.actions.submitChat('p1', '幫我睇下 vital signs');
    session.stop();
    await session.settled();
    expect(session.getSnapshot().orders).toHaveLength(0);
  });
});

const requestKinds = () =>
  mock.requests.flatMap((r) => {
    const body = r.body as { messages?: { role: string; content: string }[] };
    const user = body.messages?.find((m) => m.role === 'user');
    if (!user) return [];
    return [(JSON.parse(user.content) as { kind: string }).kind];
  });

describe('M3：把關（真 gateway ＋ mock AI）', () => {
  it('Augmentin（penicillin 過敏）：藥房／護士提出關注 → gate 卡 → 堅持兩次 → 評級 → 放行 → 護士確認', async () => {
    const { session } = open('mock-ok', { seed: 'int-gate' });
    session.actions.submitChat('p1', 'augmentin 1.2 g iv');
    await session.settled();
    let view = session.getSnapshot();
    expect(view.orders[0]?.status).toBe('GATED');
    expect(view.gates[0]).toMatchObject({ phase: 'DECISION', required: 2, canInsist: true });
    expect(view.chat?.lines.some((l) => l.kind === 'PHARMACY' && l.source === 'PHONE')).toBe(true);

    session.actions.insistOrder(view.gates[0]?.orderId ?? '');
    await session.settled();
    view = session.getSnapshot();
    expect(view.gates[0]?.phase).toBe('RECONFIRM');
    expect(view.chat?.lines.filter((l) => l.kind === 'PHARMACY').length).toBeGreaterThanOrEqual(2);

    session.actions.insistOrder(view.gates[0]?.orderId ?? '');
    await session.settled();
    view = session.getSnapshot();
    expect(view.gates).toEqual([]);
    expect(view.orders[0]?.status).toBe('RUNNING');
    expect(requestKinds()).toContain('gate.danger');
    expect(view.aiFailure).toBeNull();
    const text = JSON.stringify(view.chat?.lines);
    expect(text).not.toMatch(/\{\{|\}\}/);
  });

  it('藥房一律把關；HARD（新入職護士）唔會發 gate.nurse', async () => {
    const { session } = open('mock-ok', { seed: 'int-gate-new', difficulty: 'HARD' });
    session.actions.submitChat('p1', 'paracetamol 500 mg po');
    await session.settled();
    const kinds = requestKinds();
    expect(kinds).toContain('gate.pharmacy');
    expect(kinds).not.toContain('gate.nurse');
    expect(session.getSnapshot().orders[0]?.status).toBe('RUNNING');
  });

  it('把關句子含裸數字（mock-gate-bad-line）→ guard 擋住：暫停＋重試橫幅，order 仍然等待，冇把關對白入 chat', async () => {
    const { session } = open('mock-gate-bad-line', { seed: 'int-gate-bad' });
    session.actions.submitChat('p1', 'augmentin 1.2 g iv');
    await session.settled();
    const view = session.getSnapshot();
    expect(view.aiFailure?.reason).toBe('GUARD');
    expect(view.clock.paused).toBe(true);
    expect(view.orders[0]?.status).toBe('GATED');
    expect(view.chat?.lines.some((l) => l.kind === 'PHARMACY')).toBe(false);
  });

  it('取消等把關嘅 order：暫停中亦可以取消', async () => {
    const { session } = open('mock-ok', { seed: 'int-gate-cancel' });
    session.actions.submitChat('p1', 'augmentin 1.2 g iv');
    await session.settled();
    session.actions.togglePause();
    session.actions.cancelOrder(session.getSnapshot().orders[0]?.id ?? '');
    const view = session.getSnapshot();
    expect(view.orders[0]?.status).toBe('CANCELLED');
    expect(view.gates).toEqual([]);
  });

  it('化驗：order 完成後按表內延遲出報告，護士口頭通知，報告數值唔來自 AI', async () => {
    const { session, timer } = open('mock-ok', { seed: 'int-lab' });
    session.actions.submitChat('p1', 'cbc');
    await timer.run(250_000, session);
    const view = session.getSnapshot();
    expect(view.reports[0]?.kind).toBe('PANEL');
    expect(view.orders[0]?.resultStatus).toBe('REPORTED');
    const nurseText = (view.chat?.lines ?? [])
      .filter((l) => l.kind === 'NURSE')
      .map((l) => l.text)
      .join('|');
    expect(nurseText).toContain('報告出咗');
    for (const item of view.reports[0]?.items ?? [])
      expect(nurseText).not.toContain(item.valueText);
  });
});
