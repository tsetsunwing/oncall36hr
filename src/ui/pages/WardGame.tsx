import { useEffect, useState } from 'react';
import { BedDouble, ClipboardList, History, Users, X } from 'lucide-react';
import { ui } from '@/i18n';
import { IconButton } from '../IconButton';
import type { GameActions, GameView, WardView } from '@/view';
import { ChatPanel } from '../game/ChatPanel';
import { LogPanel } from '../game/LogPanel';
import { DeathFlowPanel } from '../game/DeathFlowPanel';
import { MonitorPanel } from '../game/MonitorPanel';
import { ResusPanel } from '../game/ResusPanel';
import { DelegationDialog } from '../ward/DelegationDialog';
import { useFrame } from '../frame/PlayFrame';
import { BedTable } from '../ward/BedTable';
import { FloorPlan } from '../ward/FloorPlan';
import { PhonePanel } from '../ward/PhonePanel';
import { QueuePanel } from '../ward/QueuePanel';

export interface WardGameProps {
  view: GameView;
  ward: WardView;
  actions: GameActions;
}

type Tab = 'chat' | 'phone' | 'family';
type Drawer = 'log' | 'labs' | null;

export function WardGame({ view, ward, actions }: WardGameProps) {
  const g = ui.game;
  const w = g.ward;
  const [tab, setTab] = useState<Tab>('chat');
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [bedsOpen, setBedsOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const frame = useFrame();
  const [delegationOpen, setDelegationOpen] = useState(false);
  const [delegationCall, setDelegationCall] = useState<string | null>(null);

  function openDelegation(callId: string | null) {
    setDelegationCall(callId);
    setDelegationOpen(true);
  }

  useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<string>).detail;
      if (command === 'tab-chat') setTab('chat');
      if (command === 'tab-phone') setTab('phone');
      if (command === 'tab-family') setTab('family');
      if (command === 'beds') setBedsOpen(true);
      if (command === 'log') setDrawer('log');
      if (command === 'close') {
        setDrawer(null);
        setBedsOpen(false);
        setPlanOpen(false);
        setDelegationOpen(false);
      }
      if (command === 'focus-input') {
        setTab('chat');
        queueMicrotask(() => {
          document.getElementById('chat-input')?.focus();
        });
      }
    };
    window.addEventListener('dandu-command', onCommand);
    return () => window.removeEventListener('dandu-command', onCommand);
  }, []);

  const atBed = view.patient !== null && view.monitor !== null && view.chat !== null;
  const phoneRinging = ward.phone.calls.filter(
    (call) => call.tag !== 'FAMILY' && call.status === 'RINGING',
  ).length;
  const familyRinging = ward.phone.calls.filter(
    (call) => call.tag === 'FAMILY' && call.status === 'RINGING',
  ).length;
  if (planOpen && frame === 'desktop') {
    return (
      <div className="plan-screen" data-testid="ward-game">
        <FloorPlan
          ward={ward}
          actions={actions}
          compact={false}
          onClose={() => {
            setPlanOpen(false);
          }}
        />
        <BedTable
          ward={ward}
          actions={{
            ...actions,
            goToBed: (bed) => {
              actions.goToBed(bed);
              setPlanOpen(false);
            },
          }}
        />
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
  return (
    <div className="ward-grid" data-testid="ward-game" data-beds={bedsOpen ? 'open' : 'closed'}>
      <div
        className="mobile-tools"
        role="group"
        aria-label={ui.mobile.tools}
        data-testid="mobile-tools"
      >
        <IconButton
          icon={BedDouble}
          label={ui.mobile.beds}
          data-testid="open-beds"
          aria-expanded={bedsOpen}
          aria-keyshortcuts="B"
          onClick={() => {
            setBedsOpen(true);
          }}
        />
        <IconButton
          icon={ClipboardList}
          label={ui.mobile.labs}
          data-testid="open-labs"
          aria-expanded={drawer === 'labs'}
          onClick={() => {
            setDrawer('labs');
          }}
        />
        <IconButton
          icon={History}
          label={g.log.open}
          data-testid="open-log"
          aria-expanded={drawer === 'log'}
          aria-keyshortcuts="L"
          onClick={() => {
            setDrawer('log');
          }}
        />
      </div>
      <div className="ward-map-col">
        <IconButton
          icon={X}
          label={ui.mobile.close}
          className="beds-close"
          data-testid="close-beds"
          onClick={() => {
            setBedsOpen(false);
          }}
        />
        <FloorPlan
          ward={ward}
          actions={actions}
          compact={frame === 'desktop'}
          {...(frame === 'desktop'
            ? {
                onExpand: () => {
                  setPlanOpen(true);
                },
              }
            : {})}
        />
        <QueuePanel ward={ward} reports={view.reports} shift={view.shift} />
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
              aria-keyshortcuts="1"
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
              aria-keyshortcuts="2"
              onClick={() => {
                setTab('phone');
              }}
            >
              {w.tabs.phone}
              {phoneRinging > 0 ? (
                <span className="tab-count" data-testid="phone-count">
                  {phoneRinging}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              role="tab"
              id="tab-family"
              aria-selected={tab === 'family'}
              aria-controls="panel-family"
              className="btn tab"
              data-testid="tab-family"
              aria-keyshortcuts="3"
              onClick={() => {
                setTab('family');
              }}
            >
              {w.tabs.family}
              {familyRinging > 0 ? (
                <span className="tab-count" data-testid="family-count">
                  {familyRinging}
                </span>
              ) : null}
            </button>
          </div>
          <IconButton
            icon={Users}
            label={w.delegation.open}
            data-testid="open-delegation"
            onClick={() => {
              openDelegation(null);
            }}
          />
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
          <div
            role="tabpanel"
            id={tab === 'family' ? 'panel-family' : 'panel-phone'}
            aria-labelledby={tab === 'family' ? 'tab-family' : 'tab-phone'}
          >
            <PhonePanel
              ward={ward}
              actions={actions}
              currentPatientId={view.patient?.id ?? null}
              onDelegateCall={openDelegation}
              scope={tab === 'family' ? 'family' : 'phone'}
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
        open={drawer !== null}
        focus={drawer === 'labs' ? 'labs' : 'log'}
        onClose={() => {
          setDrawer(null);
        }}
      />
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
