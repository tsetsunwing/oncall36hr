import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GameActions } from '@/view';
import { ui } from '@/i18n';
import { AiFailureBanner } from './AiFailureBanner';
import { ChatPanel } from './ChatPanel';
import { ClockBar } from './ClockBar';
import { LogPanel } from './LogPanel';
import { MonitorPanel } from './MonitorPanel';
import { chat, clock, monitor, order, patient, row } from './fixtures';

function makeActions() {
  return {
    submitChat: vi.fn(),
    togglePause: vi.fn(),
    setSpeed: vi.fn(),
    cancelOrder: vi.fn(),
    insistOrder: vi.fn(),
    retryAi: vi.fn(),
    goToBed: vi.fn(),
    respondCall: vi.fn(),
    prepareCall: vi.fn(),
    sendCall: vi.fn(),
    discardCall: vi.fn(),
    delegate: vi.fn(),
    completeDeathStep: vi.fn(),
    sendFollowup: vi.fn(),
    endCall: vi.fn(),
    familyOption: vi.fn(),
    familySay: vi.fn(),
    startDeathCall: vi.fn(),
    answerRound: vi.fn(),
    passRound: vi.fn(),
    nextRound: vi.fn(),
    startSelfCare: vi.fn(),
    stopSelfCare: vi.fn(),
    beginHandover: vi.fn(),
    toggleHandover: vi.fn(),
    confirmHandover: vi.fn(),
    saveManual: vi.fn(),
  } satisfies GameActions;
}

describe('MonitorPanel：床邊監護儀風格＋閃爍數值＋黃色三角警示', () => {
  it('數值全部來自 view；異常只用閃爍數值同黃色三角（唔寫句子）', () => {
    render(<MonitorPanel patient={patient} monitor={monitor()} />);
    expect(screen.getByTestId('vital-hr')).toHaveTextContent('118');
    expect(screen.getByTestId('vital-hr')).toHaveAttribute('data-level', 'ALARM');
    expect(screen.getByTestId('vital-hr')).toHaveTextContent(ui.game.monitor.direction.HIGH);
    expect(screen.getByTestId('vital-spo2')).toHaveTextContent(ui.game.monitor.direction.LOW);
    expect(screen.getByTestId('vital-bp')).toHaveTextContent('96/58 (71)');
    expect(screen.getByTestId('vital-line')).toBeEmptyDOMElement();
    expect(screen.queryByTestId('vital-map')).not.toBeInTheDocument();
    const monitorEl = screen.getByTestId('monitor');
    expect(monitorEl.querySelectorAll('.alert-tri')).toHaveLength(5);
    expect(screen.queryByTestId('alarm-tags')).not.toBeInTheDocument();
    expect(screen.getByTestId('alert-hr')).toHaveTextContent(ui.game.monitor.level.ALARM);
    expect(
      within(screen.getByTestId('vital-hr')).getByText('118').closest('.tile-value'),
    ).not.toBeNull();
    expect(screen.getByTestId('mews-badge')).toHaveTextContent('6');
    expect(screen.getByText(ui.game.monitor.mewsPending)).toBeInTheDocument();
  });

  it('全部正常：冇三角警示，面板 level 為 NORMAL', () => {
    const normal = monitor({
      hr: { text: '80', level: 'NORMAL', direction: null },
      bp: { text: '120/80', level: 'NORMAL', direction: null, sbp: 120, dbp: 80 },
      spo2: { text: '98', level: 'NORMAL', direction: null },
      rr: { text: '16', level: 'NORMAL', direction: null },
      temp: { text: '36.8', level: 'NORMAL', direction: null },
      mews: { score: 0, bandId: 'LOW', level: 'NORMAL', components: [], reviewPending: false },
    });
    render(<MonitorPanel patient={patient} monitor={normal} />);
    expect(screen.getByTestId('monitor').querySelectorAll('.alert-tri')).toHaveLength(0);
    expect(screen.getByTestId('monitor')).toHaveAttribute('data-level', 'NORMAL');
    expect(screen.queryByText(ui.game.monitor.mewsPending)).not.toBeInTheDocument();
  });

  it('已插 CVC 先顯示 CVP，冇數字，並標 PENDING_CLINICAL_REVIEW', () => {
    render(
      <MonitorPanel
        patient={patient}
        monitor={monitor({ lineSlot: { kind: 'CVP', reviewPending: true } })}
      />,
    );
    const cell = screen.getByTestId('vital-line');
    expect(cell).toHaveAttribute('data-review', 'PENDING_CLINICAL_REVIEW');
    expect(cell).toHaveTextContent('CVP');
    expect(cell).toHaveTextContent('PENDING_CLINICAL_REVIEW');
    expect(cell.textContent).not.toMatch(/\d/);
  });

  it('有 Lead II 同 Pleth 兩條波形（canvas）', () => {
    const { container } = render(<MonitorPanel patient={patient} monitor={monitor()} />);
    expect(container.querySelectorAll('canvas')).toHaveLength(2);
  });
});

describe('閃爍數值：只由 CSS 驅動，並尊重 reduced-motion', () => {
  const css = `${readFileSync('src/app/styles.css', 'utf8')}\n${readFileSync('src/app/v2.css', 'utf8')}`;
  it('只有一組 monitor-blink 動畫，reduced-motion 下關閉', () => {
    expect(css.match(/@keyframes/g)).toHaveLength(1);
    expect(css).toMatch(/@keyframes monitor-blink/);
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{[^}]*\.tile \.tile-value[^}]*\{\s*animation: none/,
    );
    expect(css).not.toMatch(/text-decoration\s*:[^;]*blink/);
  });
  it('只有異常數值會閃（NORMAL 唔閃）', () => {
    expect(css).toMatch(/\.tile:not\(\[data-level='NORMAL'\]\) \.tile-value/);
  });
  it('組件原始碼冇用 setInterval 切換 alarm 樣式', () => {
    const src = readFileSync('src/ui/game/MonitorPanel.tsx', 'utf8');
    expect(src).not.toMatch(/setInterval|setTimeout/);
  });
});

describe('ChatPanel', () => {
  it('SYSTEM 行由 code 顯示；NURSE 行顯示已解析文字；輸入中指示', () => {
    const view = chat();
    view.present[0] = { ...view.present[0]!, typing: true };
    render(<ChatPanel chat={view} chips={[]} notice={null} actions={makeActions()} />);
    const lines = screen.getAllByTestId('chat-line');
    expect(lines[0]).toHaveTextContent(ui.game.chat.system.ARRIVE ?? '');
    expect(screen.getByText('血壓 96/58，我即刻幫你量。')).toBeInTheDocument();
    expect(screen.getByTestId('typing')).toHaveTextContent('何姑娘');
  });

  it('上次離開分隔線喺資料指定位置出現', () => {
    render(
      <ChatPanel
        chat={chat({ lastLeftDividerIndex: 2 })}
        chips={[]}
        notice={null}
        actions={makeActions()}
      />,
    );
    expect(screen.getAllByRole('separator')).toHaveLength(1);
    expect(screen.getByRole('separator')).toHaveTextContent(ui.game.chat.lastLeft);
  });

  it('@ 觸發 combobox：過濾、方向鍵、Enter 插入名稱；Escape 關閉', async () => {
    const user = userEvent.setup();
    render(<ChatPanel chat={chat()} chips={[]} notice={null} actions={makeActions()} />);
    const input = screen.getByRole('combobox');
    await user.type(input, '@');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(input).toHaveValue('@陳大文 ');
    expect(input).toHaveAttribute('aria-expanded', 'false');

    await user.clear(input);
    await user.type(input, '@何');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('提交會 trim、清空輸入，並帶 patientId；空白唔可提交', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<ChatPanel chat={chat()} chips={[]} notice={null} actions={actions} />);
    const send = screen.getByRole('button', { name: ui.game.chat.send });
    expect(send).toBeDisabled();
    await user.type(screen.getByRole('combobox'), '  量血壓  {Enter}');
    expect(actions.submitChat).toHaveBeenCalledWith('p1', '量血壓');
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('快捷 chips 直接提交其文字', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(
      <ChatPanel
        chat={chat()}
        chips={[{ id: 'c1', label: '查看生命表徵', text: 'check vitals' }]}
        notice={null}
        actions={actions}
      />,
    );
    await user.click(screen.getByRole('button', { name: '查看生命表徵' }));
    expect(actions.submitChat).toHaveBeenCalledWith('p1', 'check vitals');
  });

  it('被拒絕嘅動作顯示 notice（role=status）', () => {
    render(
      <ChatPanel
        chat={chat()}
        chips={[]}
        notice={{ kind: 'unknown', tone: 'warn' }}
        actions={makeActions()}
      />,
    );
    expect(screen.getByTestId('chat-notice')).toHaveTextContent(ui.game.notice.fallback ?? '');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('LogPanel', () => {
  const log = {
    all: [
      row({
        id: 'a2',
        kind: 'EVENT',
        label: null,
        eventCode: 'SHIFT_START',
        status: null,
        patientId: null,
        bed: null,
        resultText: null,
      }),
      row(),
    ],
    patient: [row()],
  };

  it('預設顯示當前病人；切換到「全局」見到事件', async () => {
    const user = userEvent.setup();
    render(
      <LogPanel orders={[]} log={log} actions={makeActions()} open onClose={() => undefined} />,
    );
    expect(screen.getAllByTestId('log-row')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: ui.game.log.scopeAll }));
    expect(screen.getAllByTestId('log-row')).toHaveLength(2);
    expect(screen.getByRole('button', { name: ui.game.log.scopeAll })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('可取消 order 有取消鈕；已完成冇', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(
      <LogPanel
        orders={[order(), order({ id: 'o2', status: 'DONE', cancellable: false, label: '抽血' })]}
        log={log}
        actions={actions}
        open
        onClose={() => undefined}
      />,
    );
    const buttons = screen.getAllByRole('button', { name: /取消/ });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]!);
    expect(actions.cancelOrder).toHaveBeenCalledWith('o1');
  });
});

describe('AiFailureBanner', () => {
  it('role=alert，顯示原因；重試呼叫 retryAi', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    const onLeave = vi.fn();
    render(
      <AiFailureBanner
        failure={{ reqId: 'r1', reason: 'TIMEOUT', detail: null }}
        actions={actions}
        onLeave={onLeave}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(ui.game.aiFailure.reason.TIMEOUT ?? '');
    await user.click(screen.getByRole('button', { name: ui.game.aiFailure.retry }));
    expect(actions.retryAi).toHaveBeenCalledOnce();
    await user.click(screen.getByTestId('ai-failure-leave'));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('認證失敗顯示供應商狀態同原文，唔會只寫網絡錯誤', () => {
    render(
      <AiFailureBanner
        failure={{
          reqId: 'r1',
          reason: 'AUTH',
          detail:
            'HTTP 400：Please pass a valid API key（https://generativelanguage.googleapis.com/v1beta/openai/chat/completions）',
        }}
        actions={makeActions()}
        onLeave={() => undefined}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('認證失敗');
    expect(alert).toHaveTextContent('HTTP 400');
    expect(alert).toHaveTextContent('Please pass a valid API key');
    expect(alert).not.toHaveTextContent(ui.game.aiFailure.reason.NETWORK ?? '網絡錯誤');
  });

  it('模型 404 唔寫成網絡錯誤，並保留供應商原文', () => {
    render(
      <AiFailureBanner
        failure={{
          reqId: 'r1',
          reason: 'NETWORK',
          detail:
            'HTTP 404：The model grok-4.7 does not exist or your team does not have access to it.（https://api.x.ai/v1/chat/completions） 這條 key 可用的模型：grok-4.3、grok-4.5。',
        }}
        actions={makeActions()}
        onLeave={() => undefined}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(ui.game.aiFailure.reason.MODEL ?? '');
    expect(alert).toHaveTextContent('HTTP 404');
    expect(alert).toHaveTextContent('grok-4.3');
    expect(alert).not.toHaveTextContent(ui.game.aiFailure.reason.NETWORK ?? '網絡錯誤');
  });
});

describe('ClockBar', () => {
  it('AI 失敗暫停時唔可手動恢復；顯示暫停徽章', () => {
    render(
      <ClockBar clock={clock({ paused: true, pausedBy: 'ai-failure' })} actions={makeActions()} />,
    );
    expect(screen.getByTestId('pause-toggle')).toBeDisabled();
    expect(screen.getByTestId('paused-badge')).toBeInTheDocument();
  });

  it('玩家暫停可恢復；速度鍵來自 config（排除 0）', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<ClockBar clock={clock({ paused: true, pausedBy: 'player' })} actions={actions} />);
    await user.click(screen.getByTestId('pause-toggle'));
    expect(actions.togglePause).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: ui.game.speedOption(4) }));
    expect(actions.setSpeed).toHaveBeenCalledWith(4);
    expect(screen.getAllByRole('button')).toHaveLength(1 + 3);
  });
});
