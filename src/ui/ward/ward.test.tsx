import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ui } from '@/i18n';
import type {
  BedView,
  CallRowView,
  GameActions,
  GameView,
  SbarDraftView,
  SelfCareActionView,
  ShiftView,
  WardView,
} from '@/view';
import { WardGame } from '../pages/WardGame';
import { DelegationDialog } from './DelegationDialog';
import { FloorPlan } from './FloorPlan';
import { PhonePanel } from './PhonePanel';
import { QueuePanel } from './QueuePanel';
import { SbarPanel } from './SbarPanel';

function makeActions() {
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

const bed = (n: number, over: Partial<BedView> = {}): BedView => ({
  bed: n,
  zone: n <= 10 ? 'A' : 'B',
  row: Math.floor((n - 1) / 5),
  col: (n - 1) % 5,
  patientId: null,
  name: null,
  age: null,
  sex: null,
  complaint: null,
  mewsScore: null,
  mewsBandId: null,
  level: 'NORMAL',
  newAdmission: false,
  nurseName: null,
  here: false,
  ...over,
});

const beds: BedView[] = Array.from({ length: 20 }, (_, i) => bed(i + 1)).map((b) =>
  b.bed === 7
    ? {
        ...b,
        patientId: 'p1',
        name: '李婆婆',
        age: 78,
        sex: 'F',
        complaint: '氣促',
        mewsScore: 6,
        level: 'ALARM',
      }
    : b.bed === 8
      ? {
          ...b,
          patientId: 'p2',
          name: '吳先生',
          age: 64,
          sex: 'M',
          mewsScore: 1,
          level: 'NORMAL',
          newAdmission: true,
        }
      : b,
);

const call: CallRowView = {
  id: 'c1',
  direction: 'IN',
  tag: 'NURSE',
  priority: 'URGENT',
  callerName: '何姑娘',
  callerRank: null,
  patientId: 'p1',
  bed: 7,
  patientName: '李婆婆',
  deptId: null,
  deptLabel: null,
  text: '7 床李婆婆血氧偏低。',
  status: 'RINGING',
  resolution: null,
  outcome: null,
  timeLabel: '02:10',
  remainingSec: 600,
  defers: 0,
  canRespond: true,
  canDelegate: true,
  sbar: null,
  lines: [],
  purpose: 'GENERAL',
  exchange: null,
};

function ward(over: Partial<WardView> = {}): WardView {
  return {
    beds,
    locationBed: null,
    movingToBed: null,
    arriveInSec: null,
    playerRank: 'MO',
    occupied: 2,
    total: 20,
    phone: {
      ringing: 1,
      calls: [call],
      ladders: {
        p1: [
          { rank: 'RES', reachable: true, skips: [], contacted: false },
          { rank: 'AC', reachable: true, skips: ['RES'], contacted: false },
          { rank: 'COS', reachable: true, skips: ['RES', 'AC'], contacted: false },
        ],
        p2: [],
      },
      depts: [{ id: 'ICU', label: 'ICU' }],
      draft: null,
      focusCallId: null,
    },
    delegation: {
      hasSubordinate: true,
      subordinate: { name: '陳醫生', rank: 'MO', busy: false },
      groups: [
        {
          task: 'PROCEDURE',
          items: [{ id: 'proc.foley', label: 'Foley', needsPatient: true, needsTag: null }],
        },
        {
          task: 'SIMPLE_CALL',
          items: [{ id: 'call.handle', label: '處理來電', needsPatient: false, needsTag: null }],
        },
      ],
      tasks: [],
    },
    ...over,
  };
}

describe('FloorPlan', () => {
  it('20 個床位按鈕；入住床有姓名、MEWS 及文字風險標籤；按床呼叫 goToBed', async () => {
    const actions = makeActions();
    render(<FloorPlan ward={ward()} actions={actions} />);
    expect(screen.getAllByTestId(/^bed-\d+$/)).toHaveLength(20);
    const occupied = screen.getByTestId('bed-7');
    expect(occupied).toHaveTextContent('李婆婆');
    expect(occupied).toHaveTextContent('78/女');
    expect(occupied).toHaveTextContent('氣促');
    expect(occupied).toHaveAttribute('data-level', 'ALARM');
    expect(occupied).not.toHaveTextContent(ui.game.ward.level.ALARM ?? '');
    expect(occupied).not.toHaveTextContent(ui.game.ward.here);
    expect(screen.getByTestId('bed-8')).not.toHaveTextContent(ui.game.ward.newAdmission);
    expect(screen.getByTestId('bed-1')).toHaveTextContent(ui.game.ward.empty);
    expect(screen.getByTestId('occupancy')).toHaveTextContent('2');
    expect(screen.getByText(ui.game.ward.corridor)).toBeInTheDocument();
    expect(screen.queryByTestId('landmark-station')).not.toBeInTheDocument();
    await userEvent.click(occupied);
    expect(actions.goToBed).toHaveBeenCalledWith(7);
  });

  it('新入院提示放喺待辦，唔塞入床格', () => {
    render(<QueuePanel ward={ward()} reports={[]} shift={null} />);
    expect(screen.getByText(ui.game.ward.newAdmission)).toBeInTheDocument();
  });

  it('行緊路時顯示狀態；平面圖冇電話地標', () => {
    render(<FloorPlan ward={ward({ movingToBed: 7, arriveInSec: 40 })} actions={makeActions()} />);
    expect(screen.getByTestId('walking')).toHaveTextContent('前往 7 號床');
    expect(screen.getByTestId('walking')).not.toHaveTextContent('秒');
    expect(screen.queryByTestId('landmark-phone')).toBeNull();
  });
});

const careAction = (id: SelfCareActionView['id']): SelfCareActionView => ({
  id,
  durationSec: 600,
  gainPercent: 10,
  available: true,
  cooldownSec: 0,
  needsMealWindow: id === 'MEAL',
});

function gameAt(
  place: ShiftView['place'],
  active: ShiftView['selfCare']['active'] = null,
): GameView {
  return {
    clock: {
      label: '08:12',
      seconds: 0,
      speed: 1,
      speeds: [1, 2, 4],
      paused: true,
      pausedBy: 'player',
      cprSlow: false,
      effectiveSpeed: 1,
    },
    patient: null,
    monitor: null,
    chat: null,
    orders: [],
    gates: [],
    reports: [],
    actionLog: { all: [], patient: [] },
    quickChips: [],
    medications: [],
    treatmentMedications: [],
    resus: null,
    death: null,
    pendingAiCount: 0,
    aiFailure: null,
    notice: null,
    ward: null,
    shift: {
      shiftMode: 'DAY',
      playerRank: 'HO',
      difficulty: 'MEDIUM',
      phase: 'REGULAR',
      segment: 'DAY',
      waitingForAi: false,
      energy: { percent: 80, level: 'NORMAL' },
      needs: {
        fatigue: { percent: 20, level: 'NORMAL' },
        hunger: { percent: 40, level: 'NORMAL' },
        bladder: { percent: 30, level: 'NORMAL' },
      },
      place,
      rounds: { total: 2, completed: 0, nextAtLabel: null, offered: false, active: null },
      selfCare: {
        active,
        mealWindowOpen: false,
        actions: (['MEAL', 'NAP', 'TOILET', 'WATER', 'PHONE_CHAT', 'MUSIC'] as const).map(
          careAction,
        ),
      },
      overtime: null,
      handover: null,
      result: null,
    },
  };
}

describe('房間取代平面圖', () => {
  it('茶水間、休息室、洗手間隱藏病床圖，按病房先返回', async () => {
    const actions = makeActions();
    const { rerender } = render(
      <WardGame view={gameAt('PANTRY')} ward={ward()} actions={actions} />,
    );
    expect(screen.getByTestId('room-PANTRY')).toHaveTextContent(ui.game.ward.pantry);
    expect(screen.queryByTestId('floor-plan')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: ui.game.ward.mapLabel })).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/^bed-/)).toHaveLength(0);
    expect(screen.getByTestId('not-at-bed')).toBeInTheDocument();

    rerender(
      <WardGame
        view={gameAt('REST', { id: 'NAP', endsLabel: '08:40', remainingSec: 400 })}
        ward={ward()}
        actions={actions}
      />,
    );
    expect(screen.getByTestId('room-REST')).toBeInTheDocument();
    expect(screen.queryByTestId('floor-plan')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('selfcare-stop'));
    expect(actions.stopSelfCare).toHaveBeenCalledOnce();

    rerender(<WardGame view={gameAt('WC')} ward={ward()} actions={actions} />);
    expect(screen.getByTestId('room-WC')).toBeInTheDocument();
    expect(screen.queryByTestId('floor-plan')).not.toBeInTheDocument();

    rerender(<WardGame view={gameAt('STATION')} ward={ward()} actions={actions} />);
    expect(screen.getByTestId('floor-plan')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: ui.game.ward.mapLabel })).toBeInTheDocument();
    expect(screen.getAllByTestId(/^bed-/)).toHaveLength(20);
    expect(screen.queryByTestId(/^room-/)).not.toBeInTheDocument();
  });

  it('展開中的平面圖進入茶水間後收起，返回病房先見小地圖', async () => {
    const actions = makeActions();
    const { rerender } = render(<WardGame view={gameAt(null)} ward={ward()} actions={actions} />);
    await userEvent.click(screen.getByTestId('open-floorplan'));
    expect(screen.getByTestId('bed-table')).toBeInTheDocument();
    rerender(<WardGame view={gameAt('PANTRY')} ward={ward()} actions={actions} />);
    expect(screen.getByTestId('room-PANTRY')).toBeInTheDocument();
    expect(screen.queryByTestId('bed-table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('floor-plan')).not.toBeInTheDocument();
    rerender(<WardGame view={gameAt('STATION')} ward={ward()} actions={actions} />);
    expect(screen.getByTestId('floor-plan')).toHaveClass('floor-plan--compact');
    expect(screen.queryByTestId('bed-table')).not.toBeInTheDocument();
  });
});

describe('PhonePanel', () => {
  it('來電列表帶標籤；稍後同繼續各自回報；可委派來電有委派按鈕', async () => {
    const actions = makeActions();
    const onDelegate = vi.fn();
    render(
      <PhonePanel
        ward={ward()}
        actions={actions}
        currentPatientId={null}
        onDelegateCall={onDelegate}
      />,
    );
    const row = screen.getByTestId('call-row');
    expect(row).toHaveTextContent(ui.game.ward.phone.tag.NURSE ?? '');
    expect(screen.queryByTestId('respond-go-now')).toBeNull();
    await userEvent.click(screen.getByTestId('respond-later'));
    await userEvent.click(screen.getByTestId('respond-continue'));
    expect(actions.respondCall.mock.calls).toEqual([
      ['c1', 'LATER'],
      ['c1', 'CONTINUE'],
    ]);
    await userEvent.click(screen.getByTestId('respond-delegate'));
    expect(onDelegate).toHaveBeenCalledWith('c1');
  });

  it('職級階梯：越級時標示警告；致電科室與職級都會預備 SBAR', async () => {
    const actions = makeActions();
    render(
      <PhonePanel ward={ward()} actions={actions} currentPatientId="p1" onDelegateCall={vi.fn()} />,
    );
    expect(screen.queryByTestId('skip-RES')).toBeNull();
    expect(within(screen.getByTestId('ladder')).getByTestId('skip-AC')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('call-rank-AC'));
    expect(actions.prepareCall).toHaveBeenCalledWith('p1', { kind: 'RANK', rank: 'AC' });
    await userEvent.click(screen.getByTestId('dept-toggle'));
    await userEvent.click(screen.getByTestId('call-dept-ICU'));
    expect(actions.prepareCall).toHaveBeenCalledWith('p1', { kind: 'DEPT', deptId: 'ICU' });
  });

  it('有草稿時顯示 SBAR 面板', () => {
    const draft: SbarDraftView = {
      patientId: 'p1',
      bed: 7,
      patientName: '李婆婆',
      target: { kind: 'RANK', rank: 'AC' },
      sbar: { S: 's', B: 'b', A: 'a', R: 'r' },
      maxChars: 200,
      skips: ['RES'],
      purpose: 'GENERAL',
    };
    const base = ward();
    render(
      <PhonePanel
        ward={{ ...base, phone: { ...base.phone, draft } }}
        actions={makeActions()}
        currentPatientId={null}
        onDelegateCall={vi.fn()}
      />,
    );
    expect(screen.getByTestId('sbar-panel')).toBeInTheDocument();
  });
});

describe('SbarPanel', () => {
  const draft: SbarDraftView = {
    patientId: 'p1',
    bed: 7,
    patientName: '李婆婆',
    target: { kind: 'RANK', rank: 'AC' },
    sbar: { S: '狀況', B: '背景', A: '評估', R: '建議' },
    maxChars: 200,
    skips: ['RES'],
    purpose: 'GENERAL',
  };

  it('預填四段、越級警告、可編輯後傳送、或放棄', async () => {
    const actions = makeActions();
    render(<SbarPanel draft={draft} playerRank="MO" actions={actions} />);
    expect(screen.getByTestId('sbar-skip')).toBeInTheDocument();
    expect(screen.getByTestId('sbar-S')).toHaveValue('狀況');
    const field = screen.getByTestId('sbar-R');
    await userEvent.clear(field);
    await userEvent.type(field, '請覆診');
    await userEvent.click(screen.getByTestId('sbar-send'));
    expect(actions.sendCall).toHaveBeenCalledWith({ S: '狀況', B: '背景', A: '評估', R: '請覆診' });
    await userEvent.click(screen.getByTestId('sbar-discard'));
    expect(actions.discardCall).toHaveBeenCalled();
  });

  it('沒有越級時不顯示警告', () => {
    render(
      <SbarPanel
        draft={{ ...draft, skips: [], target: { kind: 'DEPT', deptId: 'ICU', label: 'ICU' } }}
        playerRank="MO"
        actions={makeActions()}
      />,
    );
    expect(screen.queryByTestId('sbar-skip')).toBeNull();
  });
});

describe('DelegationDialog', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });

  it('只顯示下屬姓名、職級及空閒／忙碌；不顯示能力、可靠度或預計時間', () => {
    render(
      <DelegationDialog
        ward={ward()}
        actions={makeActions()}
        open
        callId={null}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByTestId('delegation-dialog');
    expect(screen.getByTestId('sub-name')).toHaveTextContent('陳醫生');
    expect(screen.getByTestId('sub-status')).toHaveAttribute('data-busy', 'false');
    expect(dialog.textContent).not.toMatch(
      /NOVICE|NORMAL|SENIOR|reliability|可靠度[:：]?\s*\d|\d+\s*%/i,
    );
  });

  it('沒有下屬（HO）時只顯示說明；有下屬時提交委派並關閉', async () => {
    const none = ward({
      delegation: { hasSubordinate: false, subordinate: null, groups: [], tasks: [] },
    });
    const { unmount } = render(
      <DelegationDialog ward={none} actions={makeActions()} open callId={null} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('no-subordinate')).toBeInTheDocument();
    unmount();

    const actions = makeActions();
    const onClose = vi.fn();
    render(
      <DelegationDialog ward={ward()} actions={actions} open callId={null} onClose={onClose} />,
    );
    await userEvent.click(screen.getByTestId('delegate-submit'));
    expect(actions.delegate).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'PROCEDURE', itemId: 'proc.foley', callId: null }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('由來電打開時預選處理來電並帶上 callId', async () => {
    const actions = makeActions();
    render(<DelegationDialog ward={ward()} actions={actions} open callId="c1" onClose={vi.fn()} />);
    await userEvent.click(screen.getByTestId('delegate-submit'));
    expect(actions.delegate).toHaveBeenCalledWith({
      task: 'SIMPLE_CALL',
      itemId: 'call.handle',
      patientId: null,
      callId: 'c1',
    });
  });
});

describe('雙向通話（M4b）', () => {
  const exchange = (over: Partial<NonNullable<CallRowView['exchange']>> = {}) => ({
    phase: 'OPEN' as const,
    waiting: false,
    clarity: 2,
    asks: ['A.VITALS'],
    canFollowUp: true,
    followupsLeft: 2,
    followupMaxChars: 200,
    canHangUp: true,
    family: null,
    ...over,
  });
  const outgoing = (over: Partial<CallRowView> = {}): CallRowView => ({
    ...call,
    id: 'k9',
    direction: 'OUT',
    tag: 'OUTGOING',
    callerName: 'RES',
    canRespond: false,
    canDelegate: false,
    status: 'DONE',
    resolution: 'SENT',
    text: '',
    exchange: exchange(),
    lines: [
      {
        speaker: 'CALLEE',
        name: 'RES',
        text: '你再講多啲：最新嘅生命表徵。',
        code: null,
        timeLabel: '02:11',
      },
    ],
    ...over,
  });
  const withCall = (c: CallRowView): WardView => {
    const base = ward();
    return { ...base, phone: { ...base.phone, calls: [c], focusCallId: c.id } };
  };

  it('對方想知道嘅項目、清晰度、補充送出（逐字傳畀 engine）同掛線', async () => {
    const actions = makeActions();
    render(
      <PhonePanel
        ward={withCall(outgoing())}
        actions={actions}
        currentPatientId="p1"
        onDelegateCall={vi.fn()}
      />,
    );
    expect(screen.getByTestId('exchange-clarity')).toHaveAttribute('data-clarity', '2');
    expect(screen.getByTestId('exchange-asks')).toHaveTextContent(
      ui.game.ward.phone.exchange.ask['A.VITALS']!,
    );
    const send = screen.getByTestId('followup-send');
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByTestId('followup-text'), '血氧 91');
    await userEvent.click(send);
    expect(actions.sendFollowup).toHaveBeenCalledWith('k9', '血氧 91');
    await userEvent.click(screen.getByTestId('hang-up'));
    expect(actions.endCall).toHaveBeenCalledWith('k9');
  });

  it('等緊對方回覆：status 區域宣告，唔可以補充或掛線', () => {
    render(
      <PhonePanel
        ward={withCall(
          outgoing({
            exchange: exchange({
              phase: 'AWAITING_REPLY',
              waiting: true,
              canFollowUp: false,
              canHangUp: false,
            }),
          }),
        )}
        actions={makeActions()}
        currentPatientId="p1"
        onDelegateCall={vi.fn()}
      />,
    );
    const status = screen.getByTestId('exchange-waiting');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent(ui.game.ward.phone.exchange.waiting);
    expect(screen.queryByTestId('followup-send')).toBeNull();
    expect(screen.queryByTestId('hang-up')).toBeNull();
  });

  it('家屬電話：揀預設講法或自己輸入', async () => {
    const actions = makeActions();
    const family = outgoing({
      tag: 'FAMILY',
      purpose: 'DEATH_FAMILY',
      exchange: exchange({
        clarity: null,
        asks: [],
        canFollowUp: false,
        family: {
          stage: 'OPENING',
          informed: false,
          options: [
            { id: 'direct', label: '直接告知病人已離世' },
            { id: 'gentle', label: '先表達關心，再慢慢說明' },
          ],
          canSay: true,
          maxChars: 200,
          turnsLeft: 3,
        },
      }),
    });
    render(
      <PhonePanel
        ward={withCall(family)}
        actions={actions}
        currentPatientId="p1"
        onDelegateCall={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId('family-option-gentle'));
    expect(actions.familyOption).toHaveBeenCalledWith('k9', 'gentle');
    await userEvent.type(screen.getByTestId('family-say-text'), '我好遺憾');
    await userEvent.click(screen.getByTestId('family-say'));
    expect(actions.familySay).toHaveBeenCalledWith('k9', '我好遺憾');
  });

  it('通話結束後只顯示已結束', () => {
    render(
      <PhonePanel
        ward={withCall(
          outgoing({
            exchange: exchange({ phase: 'CLOSED', canFollowUp: false, canHangUp: false, asks: [] }),
          }),
        )}
        actions={makeActions()}
        currentPatientId="p1"
        onDelegateCall={vi.fn()}
      />,
    );
    expect(screen.getByTestId('exchange-ended')).toBeInTheDocument();
  });
});
