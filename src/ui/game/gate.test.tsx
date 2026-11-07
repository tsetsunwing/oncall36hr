import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GameActions } from '@/view';
import { ui } from '@/i18n';
import { ChatPanel } from './ChatPanel';
import { GatePanel } from './GatePanel';
import { LogPanel } from './LogPanel';
import { chat, gate, order, report } from './fixtures';

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
  } satisfies GameActions;
}

describe('GatePanel：取消／堅持用按鈕', () => {
  it('決定點：顯示把關者、類別同句子；取消同堅持都係按鈕，並叫出正確 orderId', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<GatePanel gates={[gate()]} actions={actions} />);
    const card = screen.getByTestId('gate-card');
    expect(card).toHaveAttribute('data-phase', 'DECISION');
    expect(within(card).getByText('藥房')).toBeInTheDocument();
    expect(within(card).getAllByText(ui.game.gate.category.ALLERGY ?? '')).toHaveLength(2);
    expect(within(card).getByText(/Penicillin 過敏，Augmentin/)).toBeInTheDocument();

    await user.click(screen.getByTestId('insist-button'));
    expect(actions.insistOrder).toHaveBeenCalledWith('o2');
    await user.click(
      screen.getByRole('button', { name: ui.game.orders.cancelLabel('Augmentin 1.2 g IV') }),
    );
    expect(actions.cancelOrder).toHaveBeenCalledWith('o2');
  });

  it('需要堅持兩次時顯示進度；再確認階段按鈕改字', () => {
    const { rerender } = render(<GatePanel gates={[gate()]} actions={makeActions()} />);
    expect(screen.getByTestId('insist-button')).toHaveTextContent('1／2');
    rerender(
      <GatePanel gates={[gate({ phase: 'RECONFIRM', insistCount: 1 })]} actions={makeActions()} />,
    );
    expect(screen.getByTestId('insist-button')).toHaveTextContent(ui.game.gate.insistAgain);
    expect(screen.getByTestId('insist-button')).toHaveTextContent('2／2');
  });

  it('審視中／評估中：冇堅持按鈕，只可取消，並以 role=status 提示', () => {
    render(
      <GatePanel
        gates={[gate({ phase: 'REVIEW', concerns: [], canInsist: false })]}
        actions={makeActions()}
      />,
    );
    expect(screen.queryByTestId('insist-button')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(ui.game.gate.phase.REVIEW ?? '');
    expect(screen.getByRole('button', { name: /取消/ })).toBeInTheDocument();
  });

  it('冇待確認 order 就唔渲染任何嘢', () => {
    const { container } = render(<GatePanel gates={[]} actions={makeActions()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('ChatPanel 內嵌 GatePanel；藥房電話對白標明「電話」來源', () => {
    const view = chat();
    view.lines.push({
      id: 'l9',
      kind: 'PHARMACY',
      speakerId: 'dept:pharmacy',
      speakerName: '藥房',
      text: '呢隻藥有風險。',
      systemCode: null,
      timeLabel: '21:06',
      orderId: 'o2',
      source: 'PHONE',
    });
    render(
      <ChatPanel chat={view} chips={[]} gates={[gate()]} notice={null} actions={makeActions()} />,
    );
    expect(screen.getByTestId('gate-panel')).toBeInTheDocument();
    const lines = screen.getAllByTestId('chat-line');
    expect(lines.at(-1)).toHaveTextContent('電話');
    expect(lines.at(-1)).toHaveAttribute('data-kind', 'PHARMACY');
  });
});

describe('LogPanel：報告同執行者', () => {
  it('PANEL 報告：表格有欄頭、異常標 H／L 文字（唔單靠顏色）、佔位提示', () => {
    render(
      <LogPanel
        orders={[]}
        reports={[report()]}
        log={{ all: [], patient: [] }}
        actions={makeActions()}
        open
        onClose={() => undefined}
      />,
    );
    const table = screen.getByRole('table', { name: ui.game.reports.tableCaption('CBC') });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
    expect(within(table).getByText('18.0 ×10⁹/L').closest('td')).toHaveTextContent(
      ui.game.reports.flag.H ?? '',
    );
    expect(screen.getByText(ui.game.reports.pending)).toBeInTheDocument();
  });

  it('REPORT 型報告顯示文字；冇報告顯示空狀態', () => {
    const { rerender } = render(
      <LogPanel
        orders={[]}
        reports={[report({ kind: 'REPORT', items: [], text: '雙肺陰影。' })]}
        log={{ all: [], patient: [] }}
        actions={makeActions()}
        open
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText('雙肺陰影。')).toBeInTheDocument();
    rerender(
      <LogPanel
        orders={[]}
        reports={[]}
        log={{ all: [], patient: [] }}
        actions={makeActions()}
        open
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText(ui.game.reports.empty)).toBeInTheDocument();
  });

  it('order 列顯示執行者種類同報告狀態；等把關嘅 order 可取消', () => {
    render(
      <LogPanel
        orders={[
          order({ id: 'a', executorKind: 'PLAYER', executorName: null, label: 'Foley' }),
          order({
            id: 'b',
            label: 'CBC',
            status: 'DONE',
            resultStatus: 'PENDING',
            etaSeconds: null,
            cancellable: false,
          }),
          order({ id: 'c', label: 'Augmentin', status: 'GATED', etaSeconds: null }),
        ]}
        log={{ all: [], patient: [] }}
        actions={makeActions()}
        open
        onClose={() => undefined}
      />,
    );
    const rows = screen.getAllByTestId('order-row');
    expect(rows[0]).toHaveTextContent(ui.game.orders.executorKind.PLAYER);
    expect(rows[1]).toHaveTextContent(ui.game.orders.resultStatus.PENDING);
    expect(rows[2]).toHaveAttribute('data-status', 'GATED');
    expect(within(rows[2]!).getByRole('button')).toBeInTheDocument();
  });
});
