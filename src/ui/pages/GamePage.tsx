import { useState } from 'react';
import { ui } from '@/i18n';
import type { GameActions, GameView } from '@/view';
import { AiFailureBanner } from '../game/AiFailureBanner';
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
import { RoundPanel } from '../shift/RoundPanel';
import { SelfCarePanel } from '../shift/SelfCarePanel';

export interface GamePageProps {
  view: GameView;
  actions: GameActions;
  onExit?: () => void;
}

export function GamePage({ view, actions, onExit }: GamePageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selfCareOpen, setSelfCareOpen] = useState(false);
  const g = ui.game;
  const { shift } = view;
  if (shift.result) {
    return (
      <section aria-labelledby="game-heading" className="game" data-testid="game-screen">
        <h1 id="game-heading" className="visually-hidden">
          {g.heading}
        </h1>
        <ResultPage
          shift={shift}
          result={shift.result}
          onBack={() => {
            onExit?.();
          }}
        />
      </section>
    );
  }
  return (
    <section aria-labelledby="game-heading" className="game" data-testid="game-screen">
      <h1 id="game-heading" className="visually-hidden">
        {g.heading}
      </h1>
      <ClockBar clock={view.clock} shift={shift} actions={actions} />
      {view.aiFailure ? <AiFailureBanner failure={view.aiFailure} actions={actions} /> : null}
      {shift.overtime ? <OvertimeBanner overtime={shift.overtime} actions={actions} /> : null}
      {shift.rounds.active ? <RoundPanel round={shift.rounds.active} actions={actions} /> : null}
      {shift.handover ? (
        <HandoverPanel candidates={shift.handover.candidates} actions={actions} />
      ) : view.ward ? (
        <WardGame view={view} ward={view.ward} actions={actions} />
      ) : view.patient && view.monitor && view.chat ? (
        <div className="game-grid">
          <div className="game-main">
            <MonitorPanel patient={view.patient} monitor={view.monitor} />
            {view.resus?.patientId === view.patient.id ? (
              <ResusPanel
                patientId={view.patient.id}
                resus={view.resus}
                chips={view.quickChips}
                actions={actions}
              />
            ) : null}
            {view.death ? <DeathFlowPanel death={view.death} actions={actions} /> : null}
          </div>
          <div className="game-chat">
            <ChatPanel
              chat={view.chat}
              chips={view.quickChips}
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
          <button
            type="button"
            className="btn drawer-toggle"
            aria-expanded={drawerOpen}
            onClick={() => {
              setDrawerOpen(true);
            }}
          >
            {g.log.open}
          </button>
        </div>
      ) : (
        <p>{g.noPatient}</p>
      )}
      {shift.handover ? null : (
        <div className="selfcare-wrap">
          <button
            type="button"
            className="btn"
            aria-expanded={selfCareOpen}
            aria-controls="selfcare-region"
            data-testid="selfcare-toggle"
            onClick={() => {
              setSelfCareOpen((open) => !open);
            }}
          >
            {ui.shift.selfCare.heading}
          </button>
          {selfCareOpen ? (
            <div id="selfcare-region">
              <SelfCarePanel shift={shift} notice={view.notice} actions={actions} />
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
