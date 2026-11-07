import { useState } from 'react';
import { ui } from '@/i18n';
import type { GameActions, GameView, WardView } from '@/view';
import { ChatPanel } from '../game/ChatPanel';
import { LogPanel } from '../game/LogPanel';
import { DeathFlowPanel } from '../game/DeathFlowPanel';
import { MonitorPanel } from '../game/MonitorPanel';
import { ResusPanel } from '../game/ResusPanel';
import { DelegationDialog } from '../ward/DelegationDialog';
import { FloorPlan } from '../ward/FloorPlan';
import { PhonePanel } from '../ward/PhonePanel';

export interface WardGameProps {
  view: GameView;
  ward: WardView;
  actions: GameActions;
}

type Tab = 'chat' | 'phone';

export function WardGame({ view, ward, actions }: WardGameProps) {
  const g = ui.game;
  const w = g.ward;
  const [tab, setTab] = useState<Tab>('chat');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [delegationOpen, setDelegationOpen] = useState(false);
  const [delegationCall, setDelegationCall] = useState<string | null>(null);

  function openDelegation(callId: string | null) {
    setDelegationCall(callId);
    setDelegationOpen(true);
  }

  const atBed = view.patient !== null && view.monitor !== null && view.chat !== null;
  return (
    <div className="ward-grid" data-testid="ward-game">
      <div className="ward-map-col">
        <FloorPlan
          ward={ward}
          actions={actions}
          compact={atBed}
          onOpenPhone={() => {
            setTab('phone');
          }}
        />
      </div>
      <div className="ward-main">
        {atBed && view.patient && view.monitor ? (
          <MonitorPanel patient={view.patient} monitor={view.monitor} />
        ) : (
          <section
            className="not-at-bed"
            aria-labelledby="not-at-bed-heading"
            data-testid="not-at-bed"
          >
            <h2 id="not-at-bed-heading">{w.notAtBedHeading}</h2>
            <p>{w.notAtBed}</p>
          </section>
        )}
        {atBed && view.patient && view.resus?.patientId === view.patient.id ? (
          <ResusPanel
            patientId={view.patient.id}
            resus={view.resus}
            chips={view.quickChips}
            actions={actions}
          />
        ) : null}
        {view.death ? (
          <DeathFlowPanel
            death={view.death}
            actions={actions}
            onOpenPhone={() => {
              setTab('phone');
            }}
          />
        ) : null}
        <div className="ward-toolbar">
          <div className="tabs" role="tablist" aria-label={w.tabs.label}>
            <button
              type="button"
              role="tab"
              id="tab-chat"
              aria-selected={tab === 'chat'}
              aria-controls="panel-chat"
              className="btn tab"
              data-testid="tab-chat"
              onClick={() => {
                setTab('chat');
              }}
            >
              {w.tabs.chat}
            </button>
            <button
              type="button"
              role="tab"
              id="tab-phone"
              aria-selected={tab === 'phone'}
              aria-controls="panel-phone"
              className="btn tab"
              data-testid="tab-phone"
              onClick={() => {
                setTab('phone');
              }}
            >
              {w.tabs.phone}
              {ward.phone.ringing > 0 ? (
                <span className="tab-count" data-testid="phone-count">
                  {ward.phone.ringing}
                </span>
              ) : null}
            </button>
          </div>
          <button
            type="button"
            className="btn"
            data-testid="open-delegation"
            onClick={() => {
              openDelegation(null);
            }}
          >
            {w.delegation.open}
          </button>
        </div>
        {tab === 'chat' ? (
          <div role="tabpanel" id="panel-chat" aria-labelledby="tab-chat">
            {view.chat ? (
              <ChatPanel
                chat={view.chat}
                chips={view.quickChips}
                gates={view.gates}
                notice={view.notice}
                actions={actions}
              />
            ) : (
              <p className="muted" data-testid="chat-unavailable">
                {w.notAtBed}
              </p>
            )}
          </div>
        ) : (
          <div role="tabpanel" id="panel-phone" aria-labelledby="tab-phone">
            <PhonePanel
              ward={ward}
              actions={actions}
              currentPatientId={view.patient?.id ?? null}
              onDelegateCall={openDelegation}
            />
          </div>
        )}
        {view.chat ? null : (
          <p className="ward-notice" role="status" data-testid="ward-notice">
            {view.notice ? (g.notice[view.notice.kind] ?? g.notice.fallback) : ''}
          </p>
        )}
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
      <DelegationDialog
        ward={ward}
        actions={actions}
        open={delegationOpen}
        callId={delegationCall}
        onClose={() => {
          setDelegationOpen(false);
        }}
      />
    </div>
  );
}
