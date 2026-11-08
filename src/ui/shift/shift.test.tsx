import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ui } from '@/i18n';
import type { GameActions, RoundView, ShiftView } from '@/view';
import { StartPage } from '../pages/StartPage';
import { ClockBar } from '../game/ClockBar';
import { clock } from '../game/fixtures';
import { HandoverPanel } from './HandoverPanel';
import { OvertimeBanner } from './OvertimeBanner';
import { ResultPage } from './ResultPage';
import { resultFixture } from './resultFixtures';
import { RoundPanel } from './RoundPanel';
import { SelfCarePanel } from './SelfCarePanel';

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

const round = (over: Partial<RoundView> = {}): RoundView => ({
  number: 1,
  totalRounds: 2,
  position: 3,
  patientCount: 8,
  patient: { bed: 7, name: '李大文', age: 68, sex: 'M', complaint: '胸痛' },
  category: 'PHARMACOLOGY',
  phase: 'ASKING',
  question: '用藥方面你會點諗？',
  hints: ['提示甲', '提示乙', '提示丙'],
  answer: null,
  viaHint: false,
  verdict: null,
  seniorLine: null,
  keyFacts: null,
  secondsLeft: 120,
  canAnswer: true,
  maxChars: 200,
  canNext: false,
  isLast: false,
  ...over,
});

const shift = (over: Partial<ShiftView> = {}): ShiftView => ({
  shiftMode: 'DAY',
  playerRank: 'MO',
  difficulty: 'MEDIUM',
  phase: 'REGULAR',
  segment: 'DAY',
  waitingForAi: false,
  energy: { percent: 82, level: 'NORMAL' },
  rounds: { total: 2, completed: 1, nextAtLabel: '14:00', offered: false, active: null },
  selfCare: {
    active: null,
    mealWindowOpen: false,
    actions: [
      {
        id: 'MEAL',
        durationSec: 1800,
        gainPercent: 15,
        available: false,
        cooldownSec: 0,
        needsMealWindow: true,
      },
      {
        id: 'NAP',
        durationSec: 1200,
        gainPercent: 10,
        available: true,
        cooldownSec: 0,
        needsMealWindow: false,
      },
      {
        id: 'TOILET',
        durationSec: 300,
        gainPercent: 0.5,
        available: false,
        cooldownSec: 1200,
        needsMealWindow: false,
      },
    ],
  },
  overtime: null,
  handover: null,
  result: null,
  ...over,
});

describe('RoundPanel', () => {
  it('發問階段：顯示 AC 提問、答題輸入同三個提示；提交會帶 viaHint', async () => {
    const actions = makeActions();
    render(<RoundPanel round={round()} actions={actions} />);
    expect(screen.getByTestId('round-question')).toHaveTextContent(ui.shift.hostName);
    expect(screen.getByTestId('round-question')).toHaveTextContent('用藥方面你會點諗？');
    expect(screen.getByTestId('round-progress')).toHaveTextContent('3 ／ 8');
    expect(screen.getByText(ui.shift.rounds.noInterrupts)).toBeInTheDocument();
    expect(screen.getByTestId('round-submit')).toBeDisabled();

    await userEvent.type(screen.getByTestId('round-answer-input'), '我會先核對過敏');
    await userEvent.click(screen.getByTestId('round-submit'));
    expect(actions.answerRound).toHaveBeenCalledWith('我會先核對過敏', false);

    await userEvent.click(screen.getByTestId('round-hint-1'));
    expect(actions.answerRound).toHaveBeenLastCalledWith('提示乙', true);
    await userEvent.click(screen.getByTestId('round-pass'));
    expect(actions.passRound).toHaveBeenCalledOnce();
  });

  it('載入、評分中：冇輸入框；揭曉：顯示結果、key facts，可進入下一位', async () => {
    const actions = makeActions();
    const { rerender } = render(
      <RoundPanel
        round={round({ phase: 'LOADING', question: null, hints: [] })}
        actions={actions}
      />,
    );
    expect(screen.getByTestId('round-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('round-answer-input')).not.toBeInTheDocument();

    rerender(<RoundPanel round={round({ phase: 'GRADING', answer: '甲' })} actions={actions} />);
    expect(screen.getByTestId('round-grading')).toBeInTheDocument();

    rerender(
      <RoundPanel
        round={round({
          phase: 'REVEAL',
          verdict: 'PARTIAL',
          answer: '甲',
          seniorLine: '方向啱',
          canNext: true,
          keyFacts: [
            { id: 'a', text: '要核對過敏', matched: true },
            { id: 'b', text: '要考慮腎功能', matched: false },
          ],
        })}
        actions={actions}
      />,
    );
    expect(screen.getByTestId('round-verdict')).toHaveTextContent(
      ui.shift.rounds.verdict.PARTIAL ?? '',
    );
    expect(screen.getByTestId('round-facts').querySelectorAll('li')).toHaveLength(2);
    await userEvent.click(screen.getByTestId('round-next'));
    expect(actions.nextRound).toHaveBeenCalledOnce();
  });
});

describe('SelfCarePanel', () => {
  it('列出動作；不可用的按鈕停用並說明原因；休息提醒由 engine notice 觸發', async () => {
    const actions = makeActions();
    render(<SelfCarePanel shift={shift()} notice={{ kind: 'REST_NUDGE' }} actions={actions} />);
    expect(screen.getByTestId('selfcare-MEAL')).toBeDisabled();
    expect(screen.getByText(ui.shift.selfCare.unavailableMeal)).toBeInTheDocument();
    expect(screen.getByTestId('selfcare-TOILET')).toBeDisabled();
    expect(screen.getByTestId('rest-nudge')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('selfcare-NAP'));
    expect(actions.startSelfCare).toHaveBeenCalledWith('NAP');
  });

  it('進行中：顯示完成時間，可提早結束', async () => {
    const actions = makeActions();
    render(
      <SelfCarePanel
        shift={shift({
          selfCare: {
            active: { id: 'NAP', endsLabel: '10:20', remainingSec: 600 },
            mealWindowOpen: true,
            actions: [],
          },
        })}
        notice={null}
        actions={actions}
      />,
    );
    expect(screen.getByTestId('selfcare-active')).toHaveTextContent('10:20');
    expect(screen.getByTestId('meal-window')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('selfcare-stop'));
    expect(actions.stopSelfCare).toHaveBeenCalledOnce();
  });
});

describe('ClockBar（M6）', () => {
  it('顯示模式、精力條與等待 AI 標記', () => {
    render(
      <ClockBar
        clock={clock()}
        shift={shift({ waitingForAi: true, energy: { percent: 38, level: 'LOW' } })}
        actions={makeActions()}
      />,
    );
    expect(screen.getByTestId('mode-badge')).toHaveTextContent(ui.shift.mode.DAY ?? '');
    expect(screen.getByTestId('energy-meter')).toHaveAttribute('aria-valuenow', '38');
    expect(screen.getByTestId('energy-meter')).toHaveAttribute('data-level', 'LOW');
    expect(screen.getByTestId('waiting-ai-badge')).toBeInTheDocument();
    expect(screen.getByTestId('round-count')).toHaveTextContent('1 ／ 2');
  });
});

describe('超時與交更', () => {
  it('超時橫額可開始交更；交更名單可勾選並確認', async () => {
    const actions = makeActions();
    render(
      <OvertimeBanner
        overtime={{ remainingSec: 3600, deadlineLabel: '20:00', canHandover: true }}
        actions={actions}
      />,
    );
    expect(screen.getByTestId('overtime-banner')).toHaveTextContent('20:00');
    await userEvent.click(screen.getByTestId('begin-handover'));
    expect(actions.beginHandover).toHaveBeenCalledOnce();

    render(
      <HandoverPanel
        candidates={[
          { patientId: 'p1', bed: 2, name: '張婆婆', level: 'NORMAL', selected: false },
          { patientId: 'p2', bed: 7, name: '李大文', level: 'ALARM', selected: true },
        ]}
        actions={actions}
      />,
    );
    await userEvent.click(screen.getByTestId('handover-2'));
    expect(actions.toggleHandover).toHaveBeenCalledWith('p1');
    expect(screen.getByTestId('handover-7')).toBeChecked();
    await userEvent.click(screen.getByTestId('confirm-handover'));
    expect(actions.confirmHandover).toHaveBeenCalledOnce();
  });
});

describe('ResultPage', () => {
  it('超時：只顯示超時標籤；六個分項各自評級，冇總分、冇分數', async () => {
    const onBack = vi.fn();
    render(
      <ResultPage
        shift={shift({ phase: 'ENDED' })}
        result={resultFixture()}
        onBack={onBack}
        onReview={vi.fn()}
      />,
    );
    expect(screen.getByTestId('result-tag')).toHaveTextContent(ui.shift.result.tag.OVERTIME ?? '');
    expect(screen.getByText(ui.shift.result.noTotal)).toBeInTheDocument();
    expect(screen.getByTestId('grade-TIMELINESS')).toHaveTextContent(
      ui.shift.result.grade.FAIR ?? '',
    );
    expect(screen.getByTestId('grade-SELF_CARE')).toHaveTextContent(
      ui.shift.result.grade.NEEDS_IMPROVEMENT ?? '',
    );
    expect(screen.getAllByRole('article')).toHaveLength(6);
    expect(screen.queryByText(/總分|倍數/u, { selector: 'h2, strong' })).toBeNull();
    expect(screen.getByTestId('capped-by-death')).toBeInTheDocument();
    expect(screen.getByTestId('result-patient-7')).toHaveTextContent(
      ui.shift.result.outcome.DECEASED ?? '',
    );
    expect(screen.getByTestId('done-best')).toHaveTextContent(ui.shift.result.doneBestTag);
    await userEvent.click(screen.getByTestId('result-back'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('暈倒：只顯示暈倒標籤，不另有超時', () => {
    render(
      <ResultPage
        shift={shift({ phase: 'ENDED' })}
        result={resultFixture({ reason: 'FAINT', tags: ['FAINT'], overtimeSec: 0 })}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByTestId('result-tag')).toHaveTextContent(ui.shift.result.tag.FAINT ?? '');
    expect(screen.getAllByTestId('result-tag')).toHaveLength(1);
    expect(screen.getByTestId('result-tag')).not.toHaveTextContent(
      ui.shift.result.tag.OVERTIME ?? 'x',
    );
  });
});

describe('StartPage 設定畫面', () => {
  it('揀職級、難度、模式後開始，帶出所選值', async () => {
    const onStart = vi.fn();
    render(<StartPage gate={{ canStart: true }} onStart={onStart} />);
    expect(screen.getByTestId('setup-summary')).toHaveTextContent('MO');
    await userEvent.click(screen.getByTestId('choice-rank-RES'));
    await userEvent.click(screen.getByTestId('choice-difficulty-HARD'));
    await userEvent.click(screen.getByTestId('choice-mode-ONCALL'));
    await userEvent.click(screen.getByRole('button', { name: ui.start.startButton }));
    expect(onStart).toHaveBeenCalledWith({ rank: 'RES', difficulty: 'HARD', mode: 'ONCALL' });
  });

  it('AI 設定可直接在設定畫面修改，API key 缺少時不能開始', async () => {
    const onSettingsChange = vi.fn();
    render(
      <StartPage
        gate={{ canStart: false, missing: ['apiKey'] }}
        onStart={vi.fn()}
        settings={{
          provider: 'openai',
          baseUrl: 'https://x/v1',
          apiKey: '',
          model: 'm',
          thinkingLevel: '',
          nurseConfirmHighRisk: true,
        }}
        onSettingsChange={onSettingsChange}
      />,
    );
    await userEvent.type(screen.getByLabelText(ui.settings.apiKeyLabel), 'k');
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKey: 'k', baseUrl: 'https://x/v1' }),
    );
    expect(screen.queryByTestId('start-blocked')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: ui.start.startButton })).toBeDisabled();
  });
});
