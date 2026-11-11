import { useState } from 'react';
import { getConfig } from '@/content';
import { ClipboardList, Save } from 'lucide-react';
import { ui } from '@/i18n';
import { IconButton } from '../IconButton';
import type { GameActions, GameView } from '@/view';
import { AiFailureBanner } from '../game/AiFailureBanner';
import { useGameHotkeys } from '../game/useGameHotkeys';
import type { ShortcutCommand } from '../game/shortcuts';
import { ChatPanel } from '../game/ChatPanel';
import { ClockBar } from '../game/ClockBar';
import { DeathFlowPanel } from '../game/DeathFlowPanel';
import { LogPanel } from '../game/LogPanel';
import { MonitorPanel } from '../game/MonitorPanel';
import { WardGame } from './WardGame';
import { ResusPanel } from '../game/ResusPanel';
import { HandoverPanel } from '../shift/HandoverPanel';
import { OvertimeBanner } from '../shift/OvertimeBanner';
import { ResultPage } from '../shift/ResultPage';
import { ReviewPage } from '../shift/ReviewPage';
import { RoundDialog } from '../shift/RoundPanel';

export interface GamePageProps {
  view: GameView;
  actions: GameActions;
  onExit?: () => void;
}

function stepSpeed(view: GameView, actions: GameActions, direction: -1 | 1) {
  const speeds = view.clock.speeds.filter((speed) => speed > 0);
  const index = view.clock.paused ? -1 : speeds.indexOf(view.clock.speed);
  if (index < 0 && direction < 0) return;
  const next = speeds[Math.min(speeds.length - 1, Math.max(0, index + direction))];
  if (next !== undefined) actions.setSpeed(next);
}

export function GamePage({ view, actions, onExit }: GamePageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const g = ui.game;
  const manualSlots = getConfig().saves.manualSlots;

  function leave() {
    onExit?.();
  }

  function pauseAndLeave() {
    if (!view.clock.paused) actions.togglePause();
    leave();
  }

  useGameHotkeys((command: ShortcutCommand) => {
    if (view.shift.result) return;
    if (command === 'pause') actions.togglePause();
    else if (command === 'speed-down') stepSpeed(view, actions, -1);
    else if (command === 'speed-up') stepSpeed(view, actions, 1);
    else if (command === 'close') {
      setSaveOpen(false);
      if (!view.ward) setDrawerOpen(false);
    } else if (!view.ward && (command === 'focus-input' || command === 'tab-chat')) {
      document.getElementById('chat-input')?.focus();
    } else if (!view.ward && command === 'log') {
      setDrawerOpen(true);
    }
    window.dispatchEvent(new CustomEvent('dandu-command', { detail: command }));
  });
  const { shift } = view;
  if (shift.result) {
    return (
      <section aria-labelledby="game-heading" className="game" data-testid="game-screen">
        <h1 id="game-heading" className="visually-hidden">
          {g.heading}
        </h1>
        {reviewOpen ? (
          <ReviewPage
            result={shift.result}
            onBack={() => {
              setReviewOpen(false);
            }}
            onHome={() => {
              onExit?.();
            }}
          />
        ) : (
          <ResultPage
            shift={shift}
            result={shift.result}
            onReview={() => {
              setReviewOpen(true);
            }}
            onBack={() => {
              onExit?.();
            }}
          />
        )}
      </section>
    );
  }
  return (
    <section aria-labelledby="game-heading" className="game" data-testid="game-screen">
      <h1 id="game-heading" className="visually-hidden">
        {g.heading}
      </h1>
      {view.ward ? (
        <p className="ward-current" data-testid="ward-current">
          {view.ward.name}
        </p>
      ) : null}
      <ClockBar
        clock={view.clock}
        shift={shift}
        actions={actions}
        {...(view.ward
          ? {
              places: {
                here:
                  view.ward.locationBed === null && view.ward.movingToBed === null
                    ? (shift.place ?? 'STATION')
                    : null,
                onPlace: (place) => {
                  actions.enterPlace(place);
                },
              },
            }
          : {})}
        tools={
          shift.handover ? null : (
            <>
              <IconButton
                icon={Save}
                label={ui.saves.open}
                className="bar-btn"
                aria-expanded={saveOpen}
                aria-controls="save-dialog"
                data-testid="open-save"
                onClick={() => {
                  setSaveOpen(true);
                }}
              />
            </>
          )
        }
      />
      {view.aiFailure ? (
        <AiFailureBanner failure={view.aiFailure} actions={actions} onLeave={leave} />
      ) : null}
      {shift.overtime ? <OvertimeBanner overtime={shift.overtime} actions={actions} /> : null}
      {shift.rounds.offered ? (
        <div className="round-offer" data-testid="round-offer">
          <p>{ui.shift.rounds.offer(ui.shift.hostName)}</p>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="begin-round"
            onClick={actions.beginRound}
          >
            {ui.shift.rounds.begin}
          </button>
        </div>
      ) : null}
      {shift.rounds.active ? <RoundDialog round={shift.rounds.active} actions={actions} /> : null}
      {shift.handover ? (
        <HandoverPanel candidates={shift.handover.candidates} actions={actions} />
      ) : view.ward ? (
        <WardGame view={view} ward={view.ward} actions={actions} />
      ) : view.patient && view.monitor && view.chat ? (
        <div className="game-grid">
          <div className="game-main">
            <MonitorPanel
              patient={view.patient}
              monitor={view.monitor}
              onMeasureNibp={() => {
                const patient = view.patient;
                if (patient) actions.measureNibp(patient.id);
              }}
            />
            {view.resus?.patientId === view.patient.id ? (
              <ResusPanel
                patientId={view.patient.id}
                resus={view.resus}
                chips={view.quickChips}
                medications={view.medications}
                actions={actions}
              />
            ) : null}
            {view.death ? <DeathFlowPanel death={view.death} actions={actions} /> : null}
          </div>
          <div className="game-chat">
            <ChatPanel
              chat={view.chat}
              chips={view.quickChips}
              medications={view.medications}
              treatmentMedications={view.treatmentMedications}
              gates={view.gates}
              notice={view.notice}
              actions={actions}
            />
          </div>
          <LogPanel
            orders={view.orders}
            reports={view.reports}
            log={view.actionLog}
            actions={actions}
            open={drawerOpen}
            onClose={() => {
              setDrawerOpen(false);
            }}
          />
          <IconButton
            icon={ClipboardList}
            label={g.log.open}
            className="drawer-toggle"
            aria-expanded={drawerOpen}
            onClick={() => {
              setDrawerOpen(true);
            }}
          />
        </div>
      ) : (
        <p>{g.noPatient}</p>
      )}
      {!shift.handover && saveOpen ? (
        <div className="selfcare-wrap">
          <div
            id="save-dialog"
            className="save-dialog"
            role="dialog"
            aria-labelledby="save-heading"
            data-testid="save-dialog"
          >
            <h2 id="save-heading">{ui.saves.heading}</h2>
            <p className="hint">{ui.saves.manualHint}</p>
            <div className="save-slot-buttons" role="group" aria-label={ui.saves.heading}>
              {Array.from({ length: manualSlots }, (_, index) => index + 1).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  className="btn"
                  data-testid={`save-slot-${String(slot)}`}
                  onClick={() => {
                    actions.saveManual(slot);
                    setSaveNote(ui.saves.saved(slot));
                  }}
                >
                  {ui.saves.slot(slot)}
                </button>
              ))}
            </div>
            {saveNote ? (
              <p className="notice notice-info" role="status" data-testid="save-note">
                {saveNote}
              </p>
            ) : null}
            <div className="save-dialog-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSaveOpen(false);
                }}
              >
                {ui.saves.close}
              </button>
              <button
                type="button"
                className="btn"
                data-testid="pause-leave"
                onClick={pauseAndLeave}
              >
                {ui.saves.pauseLeave}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
