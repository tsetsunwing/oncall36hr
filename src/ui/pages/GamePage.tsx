import { useState } from 'react';
import { ui } from '@/i18n';
import type { GameActions, GameView } from '@/view';
import { AiFailureBanner } from '../game/AiFailureBanner';
import { ChatPanel } from '../game/ChatPanel';
import { ClockBar } from '../game/ClockBar';
import { LogPanel } from '../game/LogPanel';
import { MonitorPanel } from '../game/MonitorPanel';
import { WardGame } from './WardGame';

export interface GamePageProps {
  view: GameView;
  actions: GameActions;
}

export function GamePage({ view, actions }: GamePageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const g = ui.game;
  return (
    <section aria-labelledby="game-heading" className="game" data-testid="game-screen">
      <h1 id="game-heading" className="visually-hidden">
        {g.heading}
      </h1>
      <ClockBar clock={view.clock} actions={actions} />
      {view.aiFailure ? <AiFailureBanner failure={view.aiFailure} actions={actions} /> : null}
      {view.ward ? (
        <WardGame view={view} ward={view.ward} actions={actions} />
      ) : view.patient && view.monitor && view.chat ? (
        <div className="game-grid">
          <div className="game-main">
            <MonitorPanel patient={view.patient} monitor={view.monitor} />
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
    </section>
  );
}
