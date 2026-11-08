import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ui } from '@/i18n';
import type { DeathView, GameActions, ResusView } from '@/view';
import { ClockBar } from './ClockBar';
import { DeathFlowPanel } from './DeathFlowPanel';
import { MonitorPanel } from './MonitorPanel';
import { ResusPanel } from './ResusPanel';
import { clock, monitor, patient } from './fixtures';

function makeActions() {
  return {
    submitChat: vi.fn(),
    togglePause: vi.fn(),
    setSpeed: vi.fn(),
    cancelOrder: vi.fn(),
    insistOrder: vi.fn(),
    retryAi: vi.fn(),
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
    goToBed: vi.fn(),
    enterPlace: vi.fn(),
    respondCall: vi.fn(),
    prepareCall: vi.fn(),
    sendCall: vi.fn(),
    discardCall: vi.fn(),
    delegate: vi.fn(),
    saveManual: vi.fn(),
  } satisfies GameActions;
}

const chips = [
  'qw.cpr',
  'qw.rhythm',
  'qw.defib200',
  'qw.adrenaline',
  'qw.amiodarone',
  'qw.pocus',
  'qw.stopcpr',
  'qw.ecg',
].map((id) => ({
  id,
  label: `chip ${id}`,
  text: `text ${id}`,
  category: id === 'qw.ecg' ? ('tests' as const) : ('resus' as const),
}));

function resusView(over: Partial<ResusView> = {}): ResusView {
  return {
    patientId: 'p1',
    status: 'ARREST',
    episode: 1,
    rhythmLabel: 'Ventricular Fibrillation (VF)',
    shockable: true,
    cpr: 'ACTIVE',
    elapsedSec: 185,
    cycleSeconds: 120,
    cycleElapsedSec: 65,
    cycles: 1,
    minCyclesBeforeStop: 3,
    canStop: false,
    shocks: 1,
    handsOffSec: 20,
    drugs: [{ label: 'Adrenaline 1 mg', timeLabel: '23:05' }],
    causes: [
      { id: 'cause.hypoxia', label: 'Hypoxia', group: 'H', checked: true, treated: false },
      {
        id: 'cause.tamponade',
        label: 'Cardiac tamponade',
        group: 'T',
        checked: false,
        treated: true,
      },
    ],
    postRosc: null,
    ...over,
  };
}

function deathView(over: Partial<DeathView> = {}): DeathView {
  return {
    patientId: 'p1',
    status: 'PENDING_PROCESS',
    diedAtLabel: '23:40',
    prefill: {
      name: '阮美玲',
      bed: 7,
      age: 86,
      sex: 'F',
      cause: '末期疾病惡化引致心臟停頓',
      seniorRank: 'RES',
      resusSummary: { cycles: 3, shocks: 0, drugs: 2 },
    },
    steps: [
      {
        step: 'CERTIFICATE',
        done: true,
        completedLabel: '23:45',
        fields: ['name', 'cause'],
        viaPhone: false,
      },
      {
        step: 'NOTIFY_SENIOR',
        done: false,
        completedLabel: null,
        fields: ['seniorRank'],
        viaPhone: false,
      },
      {
        step: 'PHONE_FAMILY',
        done: false,
        completedLabel: null,
        fields: ['name'],
        viaPhone: false,
      },
      {
        step: 'RECORD',
        done: false,
        completedLabel: null,
        fields: ['resusSummary'],
        viaPhone: false,
      },
    ],
    delayCharges: 2,
    bedReleased: false,
    ...over,
  };
}

describe('ResusPanel', () => {
  it('顯示節律、CPR（護士做）、cycle、電擊、藥物、H 同 T 狀態', () => {
    render(<ResusPanel patientId="p1" resus={resusView()} chips={chips} actions={makeActions()} />);
    expect(screen.getByTestId('resus-panel')).toHaveAttribute('data-status', 'ARREST');
    expect(screen.getByTestId('resus-rhythm')).toHaveTextContent(ui.game.resus.shockable);
    expect(screen.getByTestId('resus-cpr')).toHaveTextContent(ui.game.resus.cpr.ACTIVE);
    expect(screen.getByTestId('resus-cycles')).toHaveTextContent('1');
    expect(screen.getByTestId('resus-shocks')).toHaveTextContent('1');
    expect(screen.getByText(/Adrenaline 1 mg/)).toBeInTheDocument();
    expect(
      within(screen.getByTestId('cause-cause.hypoxia')).getByText(ui.game.resus.causeChecked),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('cause-cause.tamponade')).getByText(ui.game.resus.causeTreated),
    ).toBeInTheDocument();
  });

  it('只出搶救相關快捷（唔出 ECG），按鈕送出對應指令，冇「壓胸」操作', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<ResusPanel patientId="p1" resus={resusView()} chips={chips} actions={actions} />);
    expect(screen.queryByTestId('resus-qw.ecg')).not.toBeInTheDocument();
    expect(screen.getByText(ui.game.resus.ordersHint)).toBeInTheDocument();
    await user.click(screen.getByTestId('resus-qw.defib200'));
    expect(actions.submitChat).toHaveBeenCalledWith('p1', 'text qw.defib200');
    expect(screen.getByText(ui.game.resus.stopHint(1, 3))).toBeInTheDocument();
  });

  it('ROSC 之後唔再顯示指示按鈕，改為顯示 post-ROSC bundle', () => {
    const view = resusView({
      status: 'ROSC',
      postRosc: {
        windowRemainingSec: 300,
        bundle: [
          { id: 'ecg', label: '12-lead ECG', done: true },
          { id: 'abg', label: 'ABG', done: false },
        ],
      },
    });
    render(<ResusPanel patientId="p1" resus={view} chips={chips} actions={makeActions()} />);
    expect(screen.queryByTestId('resus-qw.cpr')).not.toBeInTheDocument();
    const box = screen.getByTestId('postrosc');
    expect(within(box).getByText(/12-lead ECG/)).toHaveTextContent(ui.game.resus.bundleDone);
    expect(within(box).getByText(/ABG/)).toHaveTextContent(ui.game.resus.bundlePending);
  });
});

describe('DeathFlowPanel', () => {
  it('四步：未完成有確認掣，已完成顯示時間；床位未釋放提示', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<DeathFlowPanel death={deathView()} actions={actions} />);
    expect(screen.getByTestId('death-status')).toHaveTextContent(
      ui.game.death.status.PENDING_PROCESS,
    );
    expect(screen.queryByTestId('death-confirm-CERTIFICATE')).not.toBeInTheDocument();
    expect(screen.getByTestId('death-step-CERTIFICATE')).toHaveTextContent('23:45');
    expect(screen.getByText(ui.game.death.delay(2), { exact: false })).toBeInTheDocument();
    await user.click(screen.getByTestId('death-confirm-NOTIFY_SENIOR'));
    expect(actions.completeDeathStep).toHaveBeenCalledWith('NOTIFY_SENIOR');
    expect(screen.getByText(ui.game.death.rank.RES!)).toBeInTheDocument();
  });

  it('病房模式：通知上一級同致電家屬改為開始電話，並轉去電話分頁', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    const onOpenPhone = vi.fn();
    const base = deathView();
    const steps = base.steps.map((step) =>
      step.step === 'NOTIFY_SENIOR' || step.step === 'PHONE_FAMILY'
        ? { ...step, viaPhone: true }
        : step,
    );
    render(
      <DeathFlowPanel death={deathView({ steps })} actions={actions} onOpenPhone={onOpenPhone} />,
    );
    expect(screen.queryByTestId('death-confirm-NOTIFY_SENIOR')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('death-call-NOTIFY_SENIOR'));
    expect(actions.startDeathCall).toHaveBeenCalledWith('NOTIFY_SENIOR');
    await user.click(screen.getByTestId('death-call-PHONE_FAMILY'));
    expect(actions.startDeathCall).toHaveBeenCalledWith('PHONE_FAMILY');
    expect(onOpenPhone).toHaveBeenCalledTimes(2);
  });

  it('全部完成：顯示床位已釋放，冇確認掣', () => {
    const steps = deathView().steps.map((s) => ({ ...s, done: true, completedLabel: '23:50' }));
    render(
      <DeathFlowPanel
        death={deathView({ status: 'COMPLETE', steps, bedReleased: true })}
        actions={makeActions()}
      />,
    );
    expect(screen.getByTestId('death-status')).toHaveTextContent(ui.game.death.status.COMPLETE);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('監察儀：停頓節律', () => {
  it('無脈搏顯示破折號，節律警報用文字標籤（靜態）', () => {
    const view = monitor({
      rhythmLabel: 'Ventricular Fibrillation (VF)',
      rhythmAlarm: 'ALARM',
      pulseless: true,
      hr: { text: '—', level: 'NORMAL', direction: null, band: 'normal' },
    });
    render(<MonitorPanel patient={patient} monitor={view} />);
    const tag = screen.getByTestId('rhythm-alarm-tag');
    expect(tag).toHaveTextContent(ui.game.monitor.rhythmAlarm.ALARM);
    expect(tag).toHaveTextContent(ui.game.monitor.pulseless);
    expect(screen.getByTestId('monitor')).toHaveAttribute('data-level', 'ALARM');
    expect(screen.getByTestId('vital-hr')).toHaveTextContent('—');
  });
});

describe('ClockBar：CPR 慢速', () => {
  it('CPR 期間顯示標示，速度鍵停用（玩家倍速被忽略）', () => {
    render(
      <ClockBar clock={clock({ cprSlow: true, effectiveSpeed: 0.5 })} actions={makeActions()} />,
    );
    expect(screen.getByTestId('cpr-slow-badge')).toHaveTextContent(ui.game.cprSlowBadge);
    for (const speed of [1, 2, 4]) {
      expect(screen.getByRole('button', { name: ui.game.speedOption(speed) })).toBeDisabled();
    }
  });

  it('非 CPR 時冇標示，速度鍵可用', () => {
    render(<ClockBar clock={clock()} actions={makeActions()} />);
    expect(screen.queryByTestId('cpr-slow-badge')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: ui.game.speedOption(2) })).toBeEnabled();
  });
});
