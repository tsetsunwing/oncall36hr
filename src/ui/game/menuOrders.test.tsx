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
    transferOut: vi.fn(),
    discharge: vi.fn(),
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
    assessGcs: vi.fn(),
    assessPain: vi.fn(),
    assessAgitation: vi.fn(),
    assessNausea: vi.fn(),
    placeTests: vi.fn(),
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

  it('持續輸液收進 Drugs 彈窗，用容量與速率開 2D1S', async () => {
    const user = userEvent.setup();
    const calls = actions();
    render(<ChatPanel chat={chat()} chips={[]} notice={null} actions={calls} />);
    await user.click(screen.getByRole('button', { name: ui.game.chat.chipGroup.treat ?? '' }));
    expect(screen.queryByTestId('treat-fluid')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '持續輸液' })).not.toBeInTheDocument();
    await user.click(screen.getByTestId('treat-drug'));
    expect(screen.getByTestId('drug-order-kind-drug')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('drug-order-kind-ivf'));
    expect(screen.getByTestId('iv-fluid-form')).toBeInTheDocument();
    expect(screen.queryByTestId('drug-order-name')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByTestId('iv-fluid-name'), '2D1S (D5 → D5 → NS)');
    await user.selectOptions(
      screen.getByTestId('iv-fluid-route'),
      'IV Infusion (Continuous drip / syringe pump)',
    );
    await user.selectOptions(screen.getByTestId('iv-fluid-volume'), '500 mL');
    await user.type(screen.getByTestId('iv-fluid-rate'), '62.5');
    await user.selectOptions(screen.getByTestId('iv-fluid-rate-unit'), 'mL/hr');
    await user.type(screen.getByTestId('iv-fluid-concentration'), '20K');
    await user.type(screen.getByTestId('iv-fluid-max-bags'), '2');
    await user.click(screen.getByTestId('drug-order-confirm'));
    expect(calls.placeOrder).toHaveBeenCalledWith(
      'p1',
      'fluid.maintenance',
      expect.stringContaining('D5 → D5 → NS'),
      expect.objectContaining({
        fluidRegimen: {
          solutions: ['D5', 'D5', 'NS'],
          volumeMl: 500,
          durationSeconds: 28800,
          additive: '20K',
          maxBags: 2,
        },
        rate: { value: 62.5, unit: 'mL/hr' },
      }),
    );
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
      'Oxygen therapy Nasal cannula 4 L/min 94–98% None | 按目標血氧飽和度調節氧氣',
      expect.objectContaining({
        dose: { value: 4, unit: 'L/min' },
        summary: 'Oxygen therapy Nasal cannula 4 L/min 94–98% None | 按目標血氧飽和度調節氧氣',
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

  it('Normal saline IV bolus 由 Drugs 的 IV Fluid 落 fluid.ns500', async () => {
    const user = userEvent.setup();
    const calls = actions();
    render(<ChatPanel chat={chat()} chips={[]} notice={null} actions={calls} />);
    await user.click(screen.getByRole('button', { name: ui.game.chat.chipGroup.treat ?? '' }));
    await user.click(screen.getByTestId('treat-drug'));
    await user.click(screen.getByTestId('drug-order-kind-ivf'));
    await user.selectOptions(
      screen.getByTestId('iv-fluid-name'),
      '0.9% Sodium Chloride (Normal saline)',
    );
    await user.selectOptions(screen.getByTestId('iv-fluid-route'), 'IV (Intravenous bolus/push)');
    await user.selectOptions(screen.getByTestId('iv-fluid-volume'), '500 mL');
    await user.type(screen.getByTestId('iv-fluid-rate'), '1000');
    await user.selectOptions(screen.getByTestId('iv-fluid-rate-unit'), 'mL/hr');
    await user.click(screen.getByTestId('drug-order-confirm'));
    expect(calls.placeOrder).toHaveBeenCalledWith(
      'p1',
      'fluid.ns500',
      expect.stringContaining('0.9% Sodium Chloride'),
      expect.objectContaining({
        dose: { value: 500, unit: 'mL' },
        route: 'IV',
        volumeMl: 500,
        rate: { value: 1000, unit: 'mL/hr' },
      }),
    );
  });

  it('導管只打開四張現有醫囑', async () => {
    const user = userEvent.setup();
    const calls = actions();
    render(<ChatPanel chat={chat()} chips={[]} notice={null} actions={calls} />);
    await user.click(screen.getByRole('button', { name: ui.game.chat.chipGroup.treat ?? '' }));
    await user.click(screen.getByTestId('treat-catheters'));
    const dialog = screen.getByTestId('catheter-orders');
    expect(dialog).not.toHaveClass('drug-order');
    expect(within(dialog).getByRole('heading', { name: 'Lines' })).toBeInTheDocument();
    expect(
      CATHETER_ORDERS.map(
        (item) => within(dialog).getByTestId(`catheter-${item.catalogId}`).textContent,
      ),
    ).toEqual(CATHETER_ORDERS.map((item) => item.label));
    expect(within(dialog).queryByRole('menuitem')).not.toBeInTheDocument();
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
