import { useEffect, useState } from 'react';
import { BedDouble, ClipboardList, History, MessageSquare, Phone, Users, X } from 'lucide-react';
import { ui } from '@/i18n';
import { IconButton } from '../IconButton';
import type { BodyDiagramView, GameActions, GameView, ShiftView, WardView } from '@/view';
import { ChatPanel } from '../game/ChatPanel';
import { LogPanel } from '../game/LogPanel';
import { DeathFlowPanel } from '../game/DeathFlowPanel';
import { MonitorPanel } from '../game/MonitorPanel';
import { AwayBanner } from '../game/AwayBanner';
import { ResusPanel } from '../game/ResusPanel';
import { DelegationDialog } from '../ward/DelegationDialog';
import { useFrame } from '../frame/PlayFrame';
import { BedTable } from '../ward/BedTable';
import { BodyDiagram } from '../ward/BodyDiagram';
import { FloorPlan } from '../ward/FloorPlan';
import { PlaceRoom, type CarePlace } from '../ward/PlaceRoom';
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
  const [expandedAt, setExpandedAt] = useState<ShiftView['place'] | false>(false);
  const frame = useFrame();
  const [delegationOpen, setDelegationOpen] = useState(false);
  const [delegationCall, setDelegationCall] = useState<string | null>(null);
  const [dischargeOpen, setDischargeOpen] = useState(false);

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
        setExpandedAt(false);
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
  const inRoom = isCarePlace(view.shift.place);
  const showQueue = !atBed;
  const planOpen = expandedAt === view.shift.place && !inRoom;
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
            setExpandedAt(false);
          }}
        />
        <BedTable
          ward={ward}
          actions={{
            ...actions,
            goToBed: (bed) => {
              actions.goToBed(bed);
              setExpandedAt(false);
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
        <MapOrRoom
          place={view.shift.place}
          atBed={atBed}
          body={view.body}
          patientId={view.patient?.id ?? null}
          patient={view.patient}
          orders={view.orders}
          reports={view.reports}
          shift={view.shift}
          ward={ward}
          actions={actions}
          compact={frame === 'desktop'}
          {...(frame === 'desktop'
            ? {
                onExpand: () => {
                  setExpandedAt(view.shift.place);
                },
              }
            : {})}
        />
        {showQueue ? <QueuePanel ward={ward} reports={view.reports} shift={view.shift} /> : null}
      </div>
      <div className="ward-main">
        {atBed && view.patient && view.monitor ? (
          <MonitorPanel
            patient={view.patient}
            monitor={view.monitor}
            onMeasureNibp={() => {
              if (view.patient) actions.measureNibp(view.patient.id);
            }}
          />
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
        {atBed && view.patient ? <AwayBanner patient={view.patient} /> : null}
        {atBed && view.patient && view.resus?.patientId === view.patient.id ? (
          <ResusPanel
            patientId={view.patient.id}
            resus={view.resus}
            chips={view.quickChips}
            medications={view.medications}
            actions={actions}
          />
        ) : null}
        {view.death ? (
          <DeathFlowPanel
            death={view.death}
            actions={actions}
            onOpenPhone={(step) => {
              setTab(step === 'PHONE_FAMILY' ? 'family' : 'phone');
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
              <MessageSquare size={15} strokeWidth={2} aria-hidden="true" />
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
              <Phone size={15} strokeWidth={2} aria-hidden="true" />
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
              <Users size={15} strokeWidth={2} aria-hidden="true" />
              {w.tabs.family}
              {familyRinging > 0 ? (
                <span className="tab-count" data-testid="family-count">
                  {familyRinging}
                </span>
              ) : null}
            </button>
          </div>
          {atBed ? (
            <IconButton
              icon={Users}
              label={w.delegation.open}
              data-testid="open-delegation"
              onClick={() => {
                openDelegation(null);
              }}
            />
          ) : null}
          {atBed && view.patient ? (
            <DischargeControl
              patientId={view.patient.id}
              open={dischargeOpen}
              onOpen={() => {
                setDischargeOpen(true);
              }}
              onCancel={() => {
                setDischargeOpen(false);
              }}
              onConfirm={() => {
                if (view.patient) actions.discharge(view.patient.id);
                setDischargeOpen(false);
              }}
            />
          ) : null}
        </div>
        {tab === 'chat' ? (
          <div role="tabpanel" id="panel-chat" aria-labelledby="tab-chat">
            {view.chat ? (
              <ChatPanel
                chat={view.chat}
                chips={view.quickChips}
                medications={view.medications}
                treatmentMedications={view.treatmentMedications}
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
        {!view.chat && view.notice && view.notice.kind !== 'PLAYER_MOVING' ? (
          <p className="ward-notice" role="status" data-testid="ward-notice">
            {g.notice[view.notice.kind] ?? g.notice.fallback}
          </p>
        ) : null}
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
        currentPatientId={view.patient?.id ?? null}
        onClose={() => {
          setDelegationOpen(false);
        }}
      />
    </div>
  );
}

function DischargeControl({
  patientId,
  open,
  onOpen,
  onCancel,
  onConfirm,
}: {
  patientId: string;
  open: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = ui.game.ward.medicalRecord;
  return (
    <div className="toolbar-discharge" data-patient={patientId}>
      <button type="button" className="btn btn-small" data-testid="discharge" onClick={onOpen}>
        {t.discharge}
      </button>
      {open ? (
        <div role="group" aria-label={t.confirmDischarge}>
          <span>{t.confirmDischarge}</span>
          <button
            type="button"
            className="btn btn-small"
            data-testid="confirm-departure"
            onClick={onConfirm}
          >
            {t.confirm}
          </button>
          <button type="button" className="btn btn-small" onClick={onCancel}>
            {t.cancel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function isCarePlace(place: ShiftView['place']): place is CarePlace {
  return place === 'PANTRY' || place === 'REST' || place === 'WC';
}

function MapOrRoom({
  place,
  atBed,
  body,
  patientId,
  patient,
  orders,
  reports,
  shift,
  ward,
  actions,
  compact,
  onExpand,
}: {
  place: ShiftView['place'];
  atBed: boolean;
  body: BodyDiagramView | null;
  patientId: string | null;
  patient: GameView['patient'];
  orders: GameView['orders'];
  reports: GameView['reports'];
  shift: ShiftView;
  ward: WardView;
  actions: GameActions;
  compact: boolean;
  onExpand?: () => void;
}) {
  if (isCarePlace(place)) {
    return <PlaceRoom place={place} shift={shift} actions={actions} />;
  }
  return (
    <>
      {shift.selfCare.active ? (
        <div className="place-room-active" role="status" data-testid="selfcare-active">
          <p>
            {ui.shift.selfCare.busy(
              ui.shift.selfCare.action[shift.selfCare.active.id] ?? shift.selfCare.active.id,
              shift.selfCare.active.endsLabel,
            )}
          </p>
          <button
            type="button"
            className="btn"
            data-testid="selfcare-stop"
            onClick={actions.stopSelfCare}
          >
            {ui.shift.selfCare.stop}
          </button>
        </div>
      ) : null}
      {atBed && body && patientId && patient ? (
        <BodyDiagram
          key={patientId}
          body={body}
          patientId={patientId}
          patient={patient}
          orders={orders}
          reports={reports}
          actions={actions}
        />
      ) : (
        <FloorPlan
          ward={ward}
          actions={actions}
          compact={compact}
          {...(onExpand ? { onExpand } : {})}
        />
      )}
    </>
  );
}
