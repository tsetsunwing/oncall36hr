import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ui } from '@/i18n';
import { CATHETER_ORDERS, type GameActions, type QuickChipView } from '@/view';
import { ChatPanel } from './ChatPanel';
import { chat } from './fixtures';

function actions() {
  return {
    submitChat: vi.fn(),
    placeOrder: vi.fn(),
    togglePause: vi.fn(),
    setSpeed: vi.fn(),
    cancelOrder: vi.fn(),
    insistOrder: vi.fn(),
    retryAi: vi.fn(),
    goToBed: vi.fn(),
    enterPlace: vi.fn(),
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
    beginRound: vi.fn(),
    nextRound: vi.fn(),
    startSelfCare: vi.fn(),
    stopSelfCare: vi.fn(),
    beginHandover: vi.fn(),
    toggleHandover: vi.fn(),
    confirmHandover: vi.fn(),
    saveManual: vi.fn(),
    measureNibp: vi.fn(),
  } satisfies GameActions;
}

describe('治療同觀察選單', () => {
  it('治療剩下 Oxygen therapy、Catheters and drains 同 Drugs', async () => {
    const user = userEvent.setup();
    const calls = actions();
    render(<ChatPanel chat={chat()} chips={[]} notice={null} actions={calls} />);
    await user.click(screen.getByRole('button', { name: ui.game.chat.chipGroup.treat ?? '' }));
    const menu = screen.getByRole('menu', { name: ui.game.chat.chipGroup.treat ?? '' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Oxygen therapy', 'Catheters and drains', 'Drugs']);
    expect(screen.queryByRole('menuitem', { name: 'Ceftriaxone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Normal saline' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Oxygen NRB' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'NG tube' })).not.toBeInTheDocument();
  });

  it('氧氣彈窗用短標籤，超出範圍不落單也不改數字', async () => {
    const user = userEvent.setup();
    const calls = actions();
    render(<ChatPanel chat={chat()} chips={[]} notice={null} actions={calls} />);
    await user.click(screen.getByRole('button', { name: ui.game.chat.chipGroup.treat ?? '' }));
    await user.click(screen.getByTestId('treat-oxygen'));
    await user.selectOptions(screen.getByTestId('oxygen-target'), '94–98% (Standard patient)');
    expect(screen.getByTestId('oxygen-target-face')).toHaveTextContent(/^94–98%$/);
    await user.selectOptions(screen.getByTestId('oxygen-device'), 'Nasal cannula (NC)');
    expect(screen.getByTestId('oxygen-device-face')).toHaveTextContent(/^Nasal cannula$/);
    expect(screen.getByTestId('oxygen-flow')).toBeInTheDocument();
    expect(screen.queryByTestId('oxygen-fio2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('oxygen-peep')).not.toBeInTheDocument();
    await user.type(screen.getByTestId('oxygen-flow'), '4.5');
    expect(screen.getByTestId('oxygen-flow')).toHaveValue('45');
    await user.clear(screen.getByTestId('oxygen-flow'));
    await user.type(screen.getByTestId('oxygen-flow'), '8');
    expect(screen.getByTestId('oxygen-flow')).toHaveValue('8');
    expect(screen.getByTestId('oxygen-error')).toHaveTextContent('1–6');
    expect(screen.getByTestId('oxygen-confirm')).toBeDisabled();
    expect(calls.placeOrder).not.toHaveBeenCalled();
    await user.clear(screen.getByTestId('oxygen-flow'));
    await user.type(screen.getByTestId('oxygen-flow'), '4');
    await user.click(screen.getByTestId('oxygen-check-titrate'));
    await user.click(screen.getByTestId('oxygen-confirm'));
    expect(calls.placeOrder).toHaveBeenCalledWith(
      'p1',
      'oxygen.nasal',
      'Oxygen therapy Nasal cannula 4 L/min 94–98% | 按目標血氧飽和度調節氧氣',
      expect.objectContaining({
        dose: { value: 4, unit: 'L/min' },
        summary: 'Oxygen therapy Nasal cannula 4 L/min 94–98% | 按目標血氧飽和度調節氧氣',
      }),
    );
    expect(calls.submitChat).not.toHaveBeenCalled();
    expect(calls.placeOrder).toHaveBeenCalledWith(
      'p1',
      'oxygen.nasal',
      expect.not.stringContaining('('),
      expect.anything(),
    );
  });

  it('導管只打開四張現有醫囑', async () => {
    const user = userEvent.setup();
    const calls = actions();
    render(<ChatPanel chat={chat()} chips={[]} notice={null} actions={calls} />);
    await user.click(screen.getByRole('button', { name: ui.game.chat.chipGroup.treat ?? '' }));
    await user.click(screen.getByTestId('treat-catheters'));
    const dialog = screen.getByTestId('catheter-orders');
    expect(
      within(dialog)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(CATHETER_ORDERS.map((item) => item.label));
    await user.click(screen.getByTestId('catheter-proc.ngtube'));
    expect(calls.placeOrder).toHaveBeenCalledWith('p1', 'proc.ngtube', 'NG tube', {
      drugFormularyId: null,
      dose: null,
      route: null,
    });
  });

  it('外科引流要玩家填寫位置，空白不能落單', async () => {
    const user = userEvent.setup();
    const calls = actions();
    render(<ChatPanel chat={chat()} chips={[]} notice={null} actions={calls} />);
    await user.click(screen.getByRole('button', { name: ui.game.chat.chipGroup.treat ?? '' }));
    await user.click(screen.getByTestId('treat-catheters'));
    const site = screen.getByTestId('drain-site');
    expect(site).toHaveValue('');
    expect(screen.getByTestId('catheter-proc.drain')).toBeDisabled();
    expect(calls.placeOrder).not.toHaveBeenCalled();
    await user.type(site, '  left chest  ');
    await user.click(screen.getByTestId('catheter-proc.drain'));
    expect(calls.placeOrder).toHaveBeenCalledWith(
      'p1',
      'proc.drain',
      'Surgical drain left chest',
      expect.objectContaining({ site: 'left chest', summary: 'Surgical drain left chest' }),
    );
  });

  it('觀察面板檢查全套生命表徵，其餘間距寫在標籤', async () => {
    const user = userEvent.setup();
    const calls = actions();
    const chips: QuickChipView[] = [
      { id: 'vitals', label: 'Check vitals', text: 'check vitals', category: 'observe' },
    ];
    render(<ChatPanel chat={chat()} chips={chips} notice={null} actions={calls} />);
    await user.click(screen.getByRole('button', { name: ui.game.chat.chipGroup.observe ?? '' }));
    expect(screen.getByRole('menuitem', { name: 'Check vitals' })).toBeInTheDocument();
    expect(screen.getByTestId('observe-parameter')).not.toHaveTextContent('血壓');
    expect(screen.getByTestId('observe-mode')).toHaveTextContent('Check once');
    await user.click(screen.getByTestId('observe-confirm'));
    expect(calls.placeOrder).toHaveBeenCalledWith(
      'p1',
      'obs.vitals',
      '檢查全套生命表徵',
      expect.objectContaining({ summary: '檢查全套生命表徵' }),
    );
    await user.click(screen.getByRole('button', { name: ui.game.chat.chipGroup.observe ?? '' }));
    await user.selectOptions(screen.getByTestId('observe-parameter'), 'Blood pressure');
    await user.selectOptions(screen.getByTestId('observe-mode'), ui.game.chat.observe.monitor);
    expect(screen.getByTestId('observe-interval-face')).toHaveTextContent('Every 15 minutes');
    expect(screen.getByTestId('observe-interval-face')).not.toHaveTextContent('q15min');
    await user.click(screen.getByTestId('observe-confirm'));
    expect(calls.placeOrder).toHaveBeenLastCalledWith(
      'p1',
      'obs.record',
      '血壓 每 15 分鐘',
      expect.objectContaining({ summary: '血壓 每 15 分鐘' }),
    );
    expect(calls.submitChat).not.toHaveBeenCalled();
  });
});
