import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RESUS_MENU, type GameActions, type QuickChipView } from '@/view';
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
  } satisfies GameActions;
}

describe('MonitorPanel：床邊監護儀風格＋閃爍數值＋驚嘆號', () => {
  it('中度同嚴重先出驚嘆號，唔寫注意或警報句子', () => {
    render(<MonitorPanel patient={patient} monitor={monitor()} />);
    expect(screen.getByTestId('vital-hr')).toHaveTextContent('118');
    expect(screen.getByTestId('vital-hr')).toHaveAttribute('data-band', 'moderate');
    expect(screen.getByTestId('alert-hr')).toHaveAttribute('data-band', 'moderate');
    expect(screen.getByTestId('vital-spo2')).toHaveAttribute('data-band', 'severe');
    expect(screen.getByTestId('alert-spo2')).toHaveAttribute('data-band', 'severe');
    expect(screen.getByTestId('vital-bp')).toHaveTextContent('96/58 (71)');
    expect(screen.getByTestId('vital-bp')).toHaveAttribute('data-band', 'mild');
    expect(screen.queryByTestId('alert-bp')).not.toBeInTheDocument();
    expect(screen.queryByTestId('vital-line')).not.toBeInTheDocument();
    expect(screen.queryByTestId('vital-map')).not.toBeInTheDocument();
    const monitorEl = screen.getByTestId('monitor');
    expect(monitorEl.querySelectorAll('.vital-mark')).toHaveLength(4);
    expect(monitorEl).not.toHaveTextContent('注意');
    expect(monitorEl).not.toHaveTextContent('警報');
    expect(screen.queryByTestId('alarm-tags')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('vital-hr')).getByText('118').closest('.tile-value'),
    ).not.toBeNull();
    expect(screen.getByTestId('mews-badge')).toHaveTextContent('6');
    expect(screen.queryByText(ui.game.monitor.mewsPending)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: ui.game.monitor.leadMenu })).toHaveValue('II');
  });

  it('血氧 95 只閃、93 黃色驚嘆號、91 紅色驚嘆號', () => {
    const { rerender } = render(
      <MonitorPanel
        patient={patient}
        monitor={monitor({ spo2: { text: '95', level: 'NORMAL', direction: null, band: 'mild' } })}
      />,
    );
    expect(screen.getByTestId('vital-spo2')).toHaveAttribute('data-band', 'mild');
    expect(screen.queryByTestId('alert-spo2')).not.toBeInTheDocument();
    rerender(
      <MonitorPanel
        patient={patient}
        monitor={monitor({
          spo2: { text: '93', level: 'NORMAL', direction: null, band: 'moderate' },
        })}
      />,
    );
    expect(screen.getByTestId('alert-spo2')).toHaveAttribute('data-band', 'moderate');
    rerender(
      <MonitorPanel
        patient={patient}
        monitor={monitor({
          spo2: { text: '91', level: 'NORMAL', direction: null, band: 'severe' },
        })}
      />,
    );
    expect(screen.getByTestId('alert-spo2')).toHaveAttribute('data-band', 'severe');
    expect(screen.getByTestId('vital-spo2')).not.toHaveTextContent('注意');
    expect(screen.getByTestId('vital-spo2')).not.toHaveTextContent('警報');
  });

  it('全部正常：冇三角警示，面板 level 為 NORMAL', () => {
    const normal = monitor({
      hr: { text: '80', level: 'NORMAL', direction: null, band: 'normal' },
      bp: { text: '120/80', level: 'NORMAL', direction: null, band: 'normal', sbp: 120, dbp: 80 },
      spo2: { text: '98', level: 'NORMAL', direction: null, band: 'normal' },
      rr: { text: '16', level: 'NORMAL', direction: null, band: 'normal' },
      temp: { text: '36.8', level: 'NORMAL', direction: null, band: 'normal' },
      mews: { score: 0, bandId: 'LOW', level: 'NORMAL', components: [], reviewPending: false },
    });
    render(<MonitorPanel patient={patient} monitor={normal} />);
    expect(screen.getByTestId('monitor').querySelectorAll('.vital-mark')).toHaveLength(0);
    expect(screen.getByTestId('monitor').querySelectorAll('.alert-tri')).toHaveLength(0);
    expect(screen.getByTestId('monitor')).toHaveAttribute('data-level', 'NORMAL');
    expect(screen.queryByText(ui.game.monitor.mewsPending)).not.toBeInTheDocument();
  });

  it('可選 CVP 波形，數值格冇數字', async () => {
    const user = userEvent.setup();
    render(
      <MonitorPanel
        patient={patient}
        monitor={monitor({
          lineSlot: { kind: 'CVP', reviewPending: true },
          lines: { abp: true, cvp: true, etco2: false },
        })}
      />,
    );
    expect(screen.queryByTestId('vital-cvp')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: ui.game.monitor.waveMenu }));
    await user.click(screen.getByRole('checkbox', { name: 'CVP' }));
    const cell = screen.getByTestId('vital-cvp');
    expect(cell).toHaveAttribute('data-review', 'PENDING_CLINICAL_REVIEW');
    expect(cell).toHaveTextContent('CVP');
    expect(cell.querySelector('.num')?.textContent).toBe('—');
    await user.click(screen.getByRole('checkbox', { name: 'ABP' }));
    expect(screen.getByRole('checkbox', { name: 'EtCO2' })).toBeDisabled();
    expect(screen.queryByTestId('vital-etco2')).not.toBeInTheDocument();
  });

  it('NIBP 保持上次讀數，按量 NIBP 先更新', async () => {
    const user = userEvent.setup();
    const first = monitor();
    const { rerender } = render(<MonitorPanel patient={patient} monitor={first} />);
    expect(screen.getByTestId('vital-bp')).toHaveTextContent('96/58 (71)');
    rerender(
      <MonitorPanel
        patient={patient}
        monitor={monitor({
          bp: {
            text: '140/90 (107)',
            level: 'ALARM',
            direction: 'HIGH',
            band: 'mild',
            sbp: 140,
            dbp: 90,
          },
        })}
      />,
    );
    expect(screen.getByTestId('vital-bp')).toHaveTextContent('96/58 (71)');
    expect(screen.getByTestId('vital-bp')).not.toHaveTextContent('140/90');
    const measure = screen.getByTestId('measure-nibp');
    expect(measure).toHaveAttribute('aria-label', ui.game.monitor.measureNibp);
    expect(measure.closest('.tile-name')).not.toBeNull();
    expect(measure.parentElement).not.toHaveTextContent('mmHg');
    await user.click(measure);
    expect(screen.getByTestId('vital-bp')).toHaveTextContent('140/90 (107)');
    expect(screen.getByTestId('vital-bp')).toHaveAttribute('data-band', 'mild');
    expect(screen.queryByTestId('alert-bp')).not.toBeInTheDocument();
  });

  it('體溫保持上次讀數，按量度先更新', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MonitorPanel patient={patient} monitor={monitor()} />);
    expect(screen.getByTestId('vital-temp')).toHaveTextContent('38.4');
    const measure = screen.getByTestId('measure-temp');
    expect(measure.closest('.tile-name')).not.toBeNull();
    rerender(
      <MonitorPanel
        patient={patient}
        monitor={monitor({
          temp: { text: '39.6', level: 'ALARM', direction: 'HIGH', band: 'severe' },
        })}
      />,
    );
    expect(screen.getByTestId('vital-temp')).toHaveTextContent('38.4');
    expect(screen.getByTestId('vital-temp')).not.toHaveTextContent('39.6');
    await user.click(measure);
    expect(screen.getByTestId('vital-temp')).toHaveTextContent('39.6');
    expect(screen.getByTestId('vital-temp')).toHaveAttribute('data-band', 'severe');
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
  it('只有偏離正常嘅數值會閃，驚嘆號唔受動畫影響', () => {
    expect(css).toMatch(/\.tile\[data-band='mild'\] \.tile-value/);
    expect(css).toMatch(/\.tile\[data-band='moderate'\] \.tile-value/);
    expect(css).toMatch(/\.tile\[data-band='severe'\] \.tile-value/);
    expect(css).toMatch(/\.vital-mark\[data-band='severe'\]/);
    expect(css).not.toMatch(/\.tile\[data-band='normal'\] \.tile-value/);
    expect(css).not.toMatch(/\.vital-mark[^{]*\{[^}]*animation/);
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

  it('檢查選單由左至右跟報告分類，空部門沒有假項目', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(
      <ChatPanel
        chat={chat()}
        chips={[
          {
            id: 'qw.cbc',
            label: 'CBC',
            text: 'cbc',
            category: 'tests',
            catalogId: 'lab.cbc',
            report: { bucket: 'laboratory', section: 'haem' },
          },
          {
            id: 'qw.crossmatch',
            label: 'Cross-match',
            text: 'crossmatch',
            category: 'tests',
            catalogId: 'lab.crossmatch',
            report: { bucket: 'laboratory', section: 'haem' },
          },
          {
            id: 'qw.cxr',
            label: 'Chest X-ray',
            text: 'cxr',
            category: 'tests',
            catalogId: 'img.cxr',
            report: { bucket: 'radiology', section: 'xr' },
          },
          { id: 'vitals', label: 'Check vitals', text: 'check vitals', category: 'observe' },
        ]}
        notice={null}
        actions={actions}
      />,
    );
    await user.click(screen.getByRole('button', { name: ui.game.chat.chipGroup.tests ?? '' }));
    expect(screen.getByTestId('test-col-bucket')).toBeInTheDocument();
    expect(screen.queryByTestId('test-col-section')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('test-bucket-laboratory'));
    const sections = screen.getByTestId('test-col-section');
    expect(sections).toHaveTextContent(ui.game.reports.section.haem ?? '');
    expect(sections).toHaveTextContent(ui.game.reports.section.cytology ?? '');
    expect(screen.queryByTestId('test-col-action')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('test-section-cytology'));
    expect(screen.getByTestId('test-empty')).toHaveTextContent(ui.game.chat.testsEmpty);
    expect(screen.queryByTestId('test-action-qw.cbc')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('test-section-haem'));
    expect(screen.getByTestId('test-action-qw.cbc')).toHaveTextContent('CBC');
    expect(screen.getByTestId('test-action-qw.crossmatch')).toHaveTextContent('Cross-match');
    await user.click(screen.getByTestId('test-action-qw.cbc'));
    expect(actions.submitChat).toHaveBeenCalledWith('p1', 'cbc');
    expect(screen.queryByTestId('test-menu')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: ui.game.chat.chipGroup.observe ?? '' }));
    expect(screen.getByRole('menuitem', { name: 'Check vitals' })).toBeInTheDocument();
    expect(screen.queryByTestId('test-col-bucket')).not.toBeInTheDocument();
  });

  it('搶救選單由左至右只出指定分類同按鈕', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    const chips: QuickChipView[] = [
      ...RESUS_MENU.flatMap((column) =>
        column.items.map((item) => ({
          id: item.id,
          label: item.label,
          text: item.label,
          category: 'resus' as const,
          ...(item.id === 'qw.adrenaline'
            ? {
                prompt: {
                  stem: 'adrenaline',
                  fields: [
                    {
                      id: 'dose' as const,
                      kind: 'amount' as const,
                      units: ['mg'],
                      value: null,
                      unit: 'mg',
                      required: true,
                    },
                    {
                      id: 'route' as const,
                      kind: 'select' as const,
                      options: ['IV', 'IO'],
                      value: null,
                      required: true,
                    },
                  ],
                },
              }
            : {}),
        })),
      ),
      { id: 'qw.stopcpr', label: 'Stop CPR', text: 'stop cpr', category: 'resus' },
      { id: 'qw.chesttube', label: 'Chest tube', text: 'chest tube', category: 'resus' },
      { id: 'qw.ecg', label: 'ECG', text: 'ecg', category: 'tests' },
      { id: 'vitals', label: 'Check vitals', text: 'check vitals', category: 'observe' },
    ];
    render(<ChatPanel chat={chat()} chips={chips} notice={null} actions={actions} />);
    await user.click(screen.getByRole('button', { name: ui.game.chat.chipGroup.resus ?? '' }));
    const groups = screen.getByTestId('resus-col-group');
    expect(
      within(groups)
        .getAllByRole('menuitemradio')
        .map((button) => button.textContent),
    ).toEqual(RESUS_MENU.map((column) => column.label));
    expect(screen.queryByTestId('resus-col-action')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Stop CPR' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Chest tube' })).not.toBeInTheDocument();
    await user.click(screen.getByTestId('resus-group-drugs'));
    const drugs = screen.getByTestId('resus-col-action');
    expect(
      within(drugs)
        .getAllByRole('menuitem')
        .map((button) => button.textContent),
    ).toEqual(RESUS_MENU.find((column) => column.id === 'drugs')?.items.map((item) => item.label));
    await user.click(screen.getByTestId('resus-action-qw.adrenaline'));
    expect(actions.submitChat).not.toHaveBeenCalled();
    const dose = screen.getByRole('spinbutton', { name: ui.game.chat.prompt.dose });
    expect(dose).toHaveValue(null);
    await user.click(screen.getByRole('button', { name: ui.game.chat.chipGroup.observe ?? '' }));
    expect(screen.getByRole('menuitem', { name: 'Check vitals' })).toBeInTheDocument();
    expect(screen.queryByTestId('resus-menu')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: ui.game.chat.chipGroup.tests ?? '' }));
    expect(screen.getByTestId('test-col-bucket')).toBeInTheDocument();
  });

  it('快捷 chips 直接提交其文字', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(
      <ChatPanel
        chat={chat()}
        chips={[{ id: 'c1', label: '查看生命表徵', text: 'check vitals', category: 'observe' }]}
        notice={null}
        actions={actions}
      />,
    );
    await user.click(screen.getByRole('button', { name: ui.game.chat.chipGroup.observe ?? '' }));
    await user.click(screen.getByRole('menuitem', { name: '查看生命表徵' }));
    expect(actions.submitChat).toHaveBeenCalledWith('p1', 'check vitals');
  });

  it('有數值嘅快捷先開小窗，確認後先送出劑量同頻次', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(
      <ChatPanel
        chat={chat()}
        chips={[
          {
            id: 'drug',
            label: 'Ceftriaxone',
            text: 'ceftriaxone 1 g iv',
            category: 'treat',
            prompt: {
              stem: 'ceftriaxone',
              fields: [
                {
                  id: 'dose',
                  kind: 'amount',
                  units: ['g', 'mg'],
                  value: 1,
                  unit: 'g',
                  required: true,
                },
                { id: 'route', kind: 'select', options: ['IV'], value: 'IV', required: true },
                { id: 'frequency', kind: 'frequency', value: null, every: null, required: false },
                {
                  id: 'times',
                  kind: 'select',
                  options: ['x1', 'x2', 'x3'],
                  value: null,
                  required: false,
                },
              ],
            },
          },
        ]}
        notice={null}
        actions={actions}
      />,
    );
    await user.click(screen.getByRole('button', { name: ui.game.chat.chipGroup.treat ?? '' }));
    await user.click(screen.getByRole('menuitem', { name: 'Ceftriaxone' }));
    expect(actions.submitChat).not.toHaveBeenCalled();
    expect(screen.getByTestId('chip-prompt')).toBeInTheDocument();
    const dose = screen.getByRole('spinbutton', { name: ui.game.chat.prompt.dose });
    await user.clear(dose);
    await user.type(dose, '2');
    await user.selectOptions(
      screen.getByRole('combobox', { name: ui.game.chat.prompt.frequency }),
      'TDS',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: ui.game.chat.prompt.times }),
      'x2',
    );
    await user.click(screen.getByTestId('chip-prompt-confirm'));
    expect(actions.submitChat).toHaveBeenCalledWith('p1', 'ceftriaxone 2 g IV TDS x2');
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
        group: null,
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

  it('委派紀錄顯示所屬組同預設名稱', () => {
    render(
      <LogPanel
        orders={[]}
        log={{
          all: [
            row({
              kind: 'EVENT',
              label: 'ABG',
              group: 'tests',
              eventCode: 'DELEGATED_lab.abg',
              status: null,
              resultText: null,
            }),
          ],
          patient: [
            row({
              kind: 'EVENT',
              label: 'ABG',
              group: 'tests',
              eventCode: 'DELEGATED_lab.abg',
              status: null,
              resultText: null,
            }),
          ],
        }}
        actions={makeActions()}
        open
        onClose={() => undefined}
      />,
    );
    expect(screen.getByTestId('log-row')).toHaveTextContent('已委派 · 檢查 · ABG');
    expect(screen.getByTestId('log-row')).not.toHaveTextContent('DELEGATED_');
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

  it('護士站、茶水間、休息室、洗手間在頂欄，護士站可返回', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(
      <ClockBar
        clock={clock()}
        actions={actions}
        places={{
          here: null,
          onPlace: (place) => {
            actions.enterPlace(place);
          },
        }}
      />,
    );
    expect(screen.getByText(ui.game.ward.pantry)).toBeInTheDocument();
    expect(screen.getByText(ui.game.ward.rest)).toBeInTheDocument();
    expect(screen.getByText(ui.game.ward.wc)).toBeInTheDocument();
    await user.click(screen.getByTestId('landmark-station'));
    expect(actions.enterPlace).toHaveBeenCalledWith('STATION');
    await user.click(screen.getByTestId('landmark-pantry'));
    expect(actions.enterPlace).toHaveBeenCalledWith('PANTRY');
  });
});
