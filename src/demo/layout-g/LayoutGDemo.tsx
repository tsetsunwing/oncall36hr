import { useEffect, useMemo, useState } from 'react';
import { ui } from '@/i18n';
import { CatheterOrders } from '@/ui/game/CatheterOrders';
import { DrugOrderForm } from '@/ui/game/DrugOrderForm';
import { MonitorPanel } from '@/ui/game/MonitorPanel';
import { ObservePanel } from '@/ui/game/ObservePanel';
import { OxygenOrderForm } from '@/ui/game/OxygenOrderForm';
import { monitor as monitorFixture, patient as patientFixture } from '@/ui/game/fixtures';
import {
  RESUS_MENU,
  TEST_ACTION_ORDER,
  TEST_MENU_BUCKETS,
  TEST_MENU_SECTIONS,
  type ReportBucket,
} from '@/view';
import { ensureLayoutGTokensInjected, layoutGTokenStyle } from './applyTokens';
import { BodyDiagramCard, MarCard, MedicalRecordCard, ResultsAndLog } from './BedZoomPanels';
import { BedHud, BottomDock, FloorHud } from './FigmaChrome';
import {
  EndScreen,
  PhoneScreen,
  RoundFeedback,
  RoundScreen,
  SetupScreen,
  StartScreen,
} from './FigmaFlowScreens';
import {
  DEMO_CHAT,
  DEMO_CLOCK,
  DEMO_MEDICATIONS,
  DEMO_PATIENT,
  LANDMARK_ACTIONS,
  bedsFor,
  landmarksFor,
  mewsTone,
  type DayPart,
  type LandmarkId,
  type MarFilter,
  type PhoneContact,
  type PhoneTab,
  type ResultFilter,
  type ZoneId,
} from './fakeData';
import { BEDZOOM_SLOTS, MEWS_OFFSET } from './figmaLayout';
import { TreatP2Shell, type TreatP2L1, type TreatP2L2 } from './TreatP2Shell';
import './layout-g.css';
import './figma-al.css';

type Screen =
  | 'start'
  | 'setup'
  | 'floor'
  | 'landmark'
  | 'bedzoom'
  | 'phone'
  | 'round'
  | 'roundFeedback'
  | 'end';

type DockChip = 'observe' | 'treat' | 'tests' | 'resus';

function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

export function LayoutGDemo() {
  const [screen, setScreen] = useState<Screen>('start');
  const [zone, setZone] = useState<ZoneId>('A');
  const [dayPart, setDayPart] = useState<DayPart>('night');
  const [landmark, setLandmark] = useState<LandmarkId>('pantry');
  const [bedId, setBedId] = useState(DEMO_PATIENT.bedId);
  const [dock, setDock] = useState<DockChip | null>(null);
  const [treatL1, setTreatL1] = useState<TreatP2L1>(null);
  const [treatL2, setTreatL2] = useState<TreatP2L2>(null);
  const [testBucket, setTestBucket] = useState<ReportBucket | null>(null);
  const [testSection, setTestSection] = useState<string | null>(null);
  const [testBasket, setTestBasket] = useState<string[]>([]);
  const [resusCol, setResusCol] = useState<(typeof RESUS_MENU)[number]['id'] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [chat, setChat] = useState(DEMO_CHAT);
  const [phoneTab, setPhoneTab] = useState<PhoneTab>('seniors');
  const [phoneChat, setPhoneChat] = useState<PhoneContact | null>(null);
  const [roundPick, setRoundPick] = useState<string | null>(null);
  const [setup, setSetup] = useState({
    rank: 'MO',
    difficulty: 'MEDIUM',
    ward: 'MED',
    shift: 'NIGHT',
    ai: '標準',
  });
  const [speed, setSpeed] = useState('1x');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [marFilter, setMarFilter] = useState<MarFilter>('all');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');

  const clock = DEMO_CLOCK[dayPart];
  const demoPatient = useMemo(
    () => ({
      ...patientFixture,
      id: DEMO_PATIENT.id,
      bed: Number(bedId.replace(/\D/g, '')) || 5,
      name: DEMO_PATIENT.name,
      age: DEMO_PATIENT.age,
      sex: DEMO_PATIENT.sex,
      complaint: DEMO_PATIENT.complaint,
    }),
    [bedId],
  );
  const demoMonitor = useMemo(
    () =>
      monitorFixture({
        mews: { score: 6, bandId: 'HIGH', level: 'ALARM', components: [], reviewPending: true },
        asOfLabel: clock,
      }),
    [clock],
  );

  const floorBg = asset(`demo/layout-g/zone-${zone.toLowerCase()}-${dayPart}.jpg`);
  const landmarkSrc =
    landmark === 'wc'
      ? asset('demo/layout-g/landmark-wc.jpg')
      : asset(`demo/layout-g/landmark-${landmark}-${dayPart}.jpg`);

  function goFloor() {
    setDock(null);
    setTreatL1(null);
    setTreatL2(null);
    setTestBucket(null);
    setTestSection(null);
    setResusCol(null);
    setToast(null);
    setPhoneChat(null);
    setScreen('floor');
  }

  function openBed(id: string) {
    setBedId(id);
    setDock(null);
    setTreatL1(null);
    setTreatL2(null);
    setScreen('bedzoom');
  }

  function openLandmark(id: LandmarkId) {
    setLandmark(id);
    setDock(null);
    setToast(null);
    setScreen('landmark');
  }

  function noteOrder(text: string) {
    setToast(text);
    setChat((prev) => [...prev, { id: `c-${String(prev.length + 1)}`, who: '系統 System', text }]);
    setDock(null);
    setTreatL1(null);
    setTreatL2(null);
    setTestBucket(null);
    setTestSection(null);
    setTestBasket([]);
    setResusCol(null);
  }

  function toggleCollapse(key: string) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    ensureLayoutGTokensInjected();
  }, []);

  const showFloorHud = screen === 'floor' || screen === 'landmark';
  const showBedHud =
    screen === 'bedzoom' || screen === 'phone' || screen === 'round' || screen === 'roundFeedback';

  return (
    <div
      className="lg-demo"
      data-testid="layout-g-demo"
      data-screen={screen}
      data-day={dayPart}
      data-tokens="figma-mcp"
      data-figma-al="1"
      style={layoutGTokenStyle()}
    >
      <div className="lg-figma-canvas" data-name="Figma 1920x1080 canvas">
        {showFloorHud ? (
          <FloorHud
            clock={clock}
            dayPart={dayPart}
            zone={zone}
            onZone={setZone}
            onDayPart={setDayPart}
            onPhone={() => {
              setPhoneChat(null);
              setScreen('phone');
            }}
            onRound={() => {
              setRoundPick(null);
              setScreen('round');
            }}
          />
        ) : null}
        {showBedHud ? (
          <BedHud
            clock={clock}
            dayPart={dayPart}
            bedId={bedId}
            speed={speed}
            onSpeed={setSpeed}
            onPhone={() => {
              setPhoneChat(null);
              setScreen('phone');
            }}
            onBack={() => {
              goFloor();
            }}
          />
        ) : null}

        <div className="lg-stage">
          {screen === 'start' ? (
            <StartScreen
              onNew={() => {
                setScreen('setup');
              }}
              onContinue={() => {
                setDayPart('night');
                goFloor();
              }}
              onEnd={() => {
                setScreen('end');
              }}
            />
          ) : null}

          {screen === 'setup' ? (
            <SetupScreen
              setup={setup}
              onSetup={setSetup}
              onStart={() => {
                setDayPart(setup.shift === 'NIGHT' ? 'night' : 'day');
                goFloor();
              }}
              onBack={() => {
                setScreen('start');
              }}
            />
          ) : null}

          {screen === 'floor' ? (
            <FloorScreen zone={zone} bg={floorBg} onBed={openBed} onLandmark={openLandmark} />
          ) : null}

          {screen === 'landmark' ? (
            <LandmarkScreen
              id={landmark}
              bg={landmarkSrc}
              toast={toast}
              onAction={(label) => {
                setToast(`已執行 ${label}`);
              }}
              onBack={goFloor}
            />
          ) : null}

          {screen === 'bedzoom' ? (
            <BedZoomScreen
              bedId={bedId}
              patient={demoPatient}
              monitor={demoMonitor}
              dock={dock}
              treatL1={treatL1}
              treatL2={treatL2}
              testBucket={testBucket}
              testSection={testSection}
              testBasket={testBasket}
              resusCol={resusCol}
              draft={draft}
              chat={chat}
              collapsed={collapsed}
              marFilter={marFilter}
              resultFilter={resultFilter}
              toast={toast}
              onMarFilter={setMarFilter}
              onResultFilter={setResultFilter}
              onDock={(id) => {
                setDock((cur) => (cur === id ? null : id));
                setTreatL1(null);
                setTreatL2(null);
                setTestBucket(null);
                setTestSection(null);
                setResusCol(null);
              }}
              onTreatL1={setTreatL1}
              onTreatL2={setTreatL2}
              onTestBucket={(b) => {
                setTestBucket(b);
                setTestSection(null);
              }}
              onTestSection={setTestSection}
              onToggleTest={(id) => {
                setTestBasket((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                );
              }}
              onConfirmTests={() => {
                if (testBasket.length === 0) return;
                noteOrder(`檢查 Test · ${testBasket.join(', ')}`);
              }}
              onResusCol={setResusCol}
              onResusItem={(label) => {
                noteOrder(`搶救 Resus · ${label}`);
              }}
              onDraft={setDraft}
              onSend={() => {
                if (!draft.trim()) return;
                setChat((prev) => [
                  ...prev,
                  { id: `u-${String(prev.length + 1)}`, who: '你 You', text: draft.trim() },
                ]);
                setDraft('');
              }}
              onCollapse={toggleCollapse}
              onOrderNote={noteOrder}
              onCloseForms={() => {
                setTreatL1(null);
                setTreatL2(null);
              }}
            />
          ) : null}

          {screen === 'phone' ? (
            <PhoneScreen
              tab={phoneTab}
              onTab={setPhoneTab}
              chatWith={phoneChat}
              onOpenChat={setPhoneChat}
              onCloseChat={() => {
                setPhoneChat(null);
              }}
              onClose={goFloor}
              onCall={(who) => {
                setToast(`已呼叫 ${who}`);
                goFloor();
              }}
            />
          ) : null}

          {screen === 'round' ? (
            <RoundScreen
              pick={roundPick}
              onPick={setRoundPick}
              onSubmit={() => {
                if (roundPick) setScreen('roundFeedback');
              }}
              onLeave={goFloor}
            />
          ) : null}

          {screen === 'roundFeedback' ? <RoundFeedback pick={roundPick} onNext={goFloor} /> : null}

          {screen === 'end' ? (
            <EndScreen
              onAgain={() => {
                setScreen('start');
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FloorScreen({
  zone,
  bg,
  onBed,
  onLandmark,
}: {
  zone: ZoneId;
  bg: string;
  onBed: (id: string) => void;
  onLandmark: (id: LandmarkId) => void;
}) {
  const beds = bedsFor(zone);
  const pins = landmarksFor(zone);
  return (
    <section className="lg-floor" data-testid="lg-floor" data-zone={zone}>
      <div
        className="lg-bleed"
        style={{ backgroundImage: `url(${bg})` }}
        role="img"
        aria-label={`Zone ${zone} floor`}
      />
      <div className="lg-hotspots">
        {beds.map((bed) => (
          <div
            key={bed.id}
            className="fal-bed-wrap"
            style={{ left: bed.x, top: bed.y }}
            data-name={`Bed ${bed.id}`}
          >
            <button
              type="button"
              className="fal-bed-pin"
              data-testid={`lg-bed-${bed.id}`}
              data-mews={mewsTone(bed.mews)}
              onClick={() => {
                onBed(bed.id);
              }}
            >
              <p className="fal-t-bed">{bed.id}</p>
              {bed.alert ? <span className="fal-alert-dot" aria-label="alert" /> : null}
            </button>
            <span
              className="fal-mews"
              data-tone={mewsTone(bed.mews)}
              style={{ left: MEWS_OFFSET.dx, top: MEWS_OFFSET.dy }}
            >
              <p className="fal-t-mews">{bed.mews}</p>
            </span>
          </div>
        ))}
        {pins.map((pin) => (
          <button
            key={pin.id}
            type="button"
            className="fal-landmark"
            style={{ left: pin.x, top: pin.y }}
            data-testid={`lg-landmark-${pin.id}`}
            onClick={() => {
              onLandmark(pin.id);
            }}
          >
            <img
              src={asset('demo/layout-g/landmark-dot.svg')}
              alt=""
              width={8}
              height={8}
              className="lg-landmark-dot"
            />
            <p className="fal-t-landmark">
              {pin.labelChi} {pin.labelEng}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

function LandmarkScreen({
  id,
  bg,
  toast,
  onAction,
  onBack,
}: {
  id: LandmarkId;
  bg: string;
  toast: string | null;
  onAction: (label: string) => void;
  onBack: () => void;
}) {
  const meta = LANDMARK_ACTIONS[id];
  return (
    <section className="lg-landmark" data-testid={`lg-landmark-screen-${id}`}>
      <div className="lg-bleed" style={{ backgroundImage: `url(${bg})` }} aria-hidden />
      <div className="lg-landmark-overlay lg-card">
        <h2>
          {meta.titleChi} <small>{meta.titleEng}</small>
        </h2>
        <div className="lg-landmark-actions">
          {meta.actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className="lg-hud-btn"
              data-testid={`lg-landmark-action-${a.id}`}
              onClick={() => {
                onAction(`${a.labelChi} ${a.labelEng}`);
              }}
            >
              <strong>
                {a.labelChi} {a.labelEng}
              </strong>
              <span>{a.note}</span>
            </button>
          ))}
        </div>
        {toast ? <p className="lg-toast">{toast}</p> : null}
        <button
          type="button"
          className="lg-confirm"
          data-testid="lg-landmark-back"
          onClick={onBack}
        >
          返回病房 Back to ward
        </button>
      </div>
    </section>
  );
}

function BedZoomScreen({
  bedId,
  patient,
  monitor,
  dock,
  treatL1,
  treatL2,
  testBucket,
  testSection,
  testBasket,
  resusCol,
  draft,
  chat,
  collapsed,
  marFilter,
  resultFilter,
  toast,
  onMarFilter,
  onResultFilter,
  onDock,
  onTreatL1,
  onTreatL2,
  onTestBucket,
  onTestSection,
  onToggleTest,
  onConfirmTests,
  onResusCol,
  onResusItem,
  onDraft,
  onSend,
  onCollapse,
  onOrderNote,
  onCloseForms,
}: {
  bedId: string;
  patient: typeof patientFixture;
  monitor: ReturnType<typeof monitorFixture>;
  dock: DockChip | null;
  treatL1: TreatP2L1;
  treatL2: TreatP2L2;
  testBucket: ReportBucket | null;
  testSection: string | null;
  testBasket: string[];
  resusCol: (typeof RESUS_MENU)[number]['id'] | null;
  draft: string;
  chat: typeof DEMO_CHAT;
  collapsed: Record<string, boolean>;
  marFilter: MarFilter;
  resultFilter: ResultFilter;
  toast: string | null;
  onMarFilter: (f: MarFilter) => void;
  onResultFilter: (f: ResultFilter) => void;
  onDock: (id: DockChip) => void;
  onTreatL1: (id: TreatP2L1) => void;
  onTreatL2: (id: TreatP2L2) => void;
  onTestBucket: (b: ReportBucket) => void;
  onTestSection: (s: string) => void;
  onToggleTest: (id: string) => void;
  onConfirmTests: () => void;
  onResusCol: (id: (typeof RESUS_MENU)[number]['id']) => void;
  onResusItem: (label: string) => void;
  onDraft: (v: string) => void;
  onSend: () => void;
  onCollapse: (key: string) => void;
  onOrderNote: (text: string) => void;
  onCloseForms: () => void;
}) {
  const art = asset(`demo/layout-g/${DEMO_PATIENT.artKey}`);
  const sections = testBucket ? TEST_MENU_SECTIONS[testBucket] : [];
  const actions: readonly string[] =
    testSection && testSection in TEST_ACTION_ORDER ? (TEST_ACTION_ORDER[testSection] ?? []) : [];
  const s = BEDZOOM_SLOTS;

  return (
    <section className="lg-bedzoom" data-testid="lg-bedzoom" data-layout="figma-03e">
      <div
        className="lg-bleed lg-bedzoom-bg"
        style={{ backgroundImage: `url(${art})` }}
        aria-hidden
      />

      <div
        className="fal-abs-slot fal-monitor-slot"
        style={{ left: s.monitor.x, top: s.monitor.y, width: s.monitor.w, height: s.monitor.h }}
        data-node-id="81:927"
        data-name="Cardiac Monitor"
      >
        <MonitorPanel patient={patient} monitor={monitor} onMeasureNibp={() => undefined} />
      </div>

      <div
        className="fal-abs-slot"
        style={{ left: s.body.x, top: s.body.y, width: s.body.w, height: s.body.h }}
      >
        <BodyDiagramCard
          collapsed={collapsed.body === true}
          onCollapse={() => {
            onCollapse('body');
          }}
        />
      </div>

      <div
        className="fal-abs-slot"
        style={{ left: s.mar.x, top: s.mar.y, width: s.mar.w, height: s.mar.h }}
      >
        <MarCard
          collapsed={collapsed.mar === true}
          filter={marFilter}
          onFilter={onMarFilter}
          onCollapse={() => {
            onCollapse('mar');
          }}
        />
      </div>

      <div
        className="fal-abs-slot"
        style={{ left: s.record.x, top: s.record.y, width: s.record.w, height: s.record.h }}
      >
        <MedicalRecordCard
          collapsed={collapsed.record === true}
          onCollapse={() => {
            onCollapse('record');
          }}
        />
      </div>

      <div
        className="fal-abs-slot"
        style={{
          left: s.rightLower.x,
          top: s.rightLower.y,
          width: s.rightLower.w,
          height: s.rightLower.h,
        }}
      >
        <ResultsAndLog
          resultsCollapsed={collapsed.results === true}
          logCollapsed={collapsed.log === true}
          filter={resultFilter}
          onFilter={onResultFilter}
          onCollapseResults={() => {
            onCollapse('results');
          }}
          onCollapseLog={() => {
            onCollapse('log');
          }}
        />
      </div>

      <div
        className="fal-abs-slot"
        style={{
          left: s.chatHistory.x,
          top: s.chatHistory.y,
          width: s.chatHistory.w,
          height: s.chatHistory.h,
          zIndex: 20,
        }}
        data-node-id="72:1164"
        data-name="Chat History"
      >
        <div
          className="fal-col"
          style={{
            gap: 6,
            width: '100%',
            height: '100%',
            padding: 10,
            overflow: 'auto',
            background: 'rgba(255,255,255,0.92)',
            borderRadius: 14,
            boxShadow: '0 4px 6px rgba(0,0,0,0.18)',
            boxSizing: 'border-box',
          }}
        >
          {chat.slice(-6).map((line) => (
            <div
              key={line.id}
              style={{
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.97)',
                borderRadius: 10,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <p className="fal-t-11m" style={{ color: '#242e3d', fontWeight: 700 }}>
                {line.who}
              </p>
              <p
                className="fal-t-11m"
                style={{ color: '#242e3d', fontWeight: 400, whiteSpace: 'normal' }}
              >
                {line.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {dock ? (
        <div
          className="lg-dock-popover lg-card"
          data-testid="lg-dock-popover"
          data-dock={dock}
          style={{ position: 'absolute', right: 24, bottom: 100, zIndex: 50 }}
        >
          {dock === 'observe' ? (
            <ObservePanel
              onSubmit={(order) => {
                onOrderNote(`觀察 Observe · ${order.text}`);
              }}
            />
          ) : null}
          {dock === 'treat' ? (
            <TreatP2Shell
              l1={treatL1}
              l2={treatL2}
              onL1={onTreatL1}
              onL2={onTreatL2}
              l3={
                treatL1 === 'oxygen' ? (
                  <OxygenOrderForm
                    onSubmit={(order) => {
                      onOrderNote(`治療 Treat · ${order.text}`);
                    }}
                    onClose={onCloseForms}
                  />
                ) : treatL1 === 'catheters' ? (
                  <CatheterOrders
                    onSubmit={(order) => {
                      onOrderNote(`治療 Treat · ${order.text}`);
                    }}
                    onClose={onCloseForms}
                  />
                ) : treatL1 === 'drugs' ? (
                  <DrugOrderForm
                    drugId=""
                    medications={DEMO_MEDICATIONS}
                    treatmentSearch
                    onSubmit={(order) => {
                      onOrderNote(`治療 Treat · ${order.text}`);
                    }}
                    onClose={onCloseForms}
                  />
                ) : treatL1 === 'ivfluids' ? (
                  <button
                    type="button"
                    className="fal-cta-sm"
                    data-testid="lg-treat-ivfluids"
                    onClick={() => {
                      onOrderNote('治療 Treat · IV Normal Saline 500 mL');
                    }}
                  >
                    <p className="fal-t-cta-sm">確認醫囑 Confirm order</p>
                  </button>
                ) : null
              }
            />
          ) : null}
          {dock === 'tests' ? (
            <div className="lg-tests-menu" data-testid="lg-tests-menu">
              <div className="lg-menu-l1">
                {TEST_MENU_BUCKETS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    className="lg-menu-row"
                    data-selected={testBucket === b}
                    onClick={() => {
                      onTestBucket(b);
                    }}
                  >
                    {ui.game.reports.menuBucket[b] ?? b}
                  </button>
                ))}
              </div>
              {testBucket ? (
                <div className="lg-menu-l2">
                  {sections.map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      className="lg-menu-row"
                      data-selected={testSection === sec}
                      onClick={() => {
                        onTestSection(sec);
                      }}
                    >
                      {ui.game.reports.menuSection[sec] ?? sec}
                    </button>
                  ))}
                </div>
              ) : null}
              {testSection ? (
                <div className="lg-menu-l3">
                  {actions.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="lg-chip"
                      data-selected={testBasket.includes(id)}
                      onClick={() => {
                        onToggleTest(id);
                      }}
                    >
                      {id}
                    </button>
                  ))}
                  <button type="button" className="lg-confirm" onClick={onConfirmTests}>
                    確認 {String(testBasket.length)} 項 Confirm
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {dock === 'resus' ? (
            <div className="lg-resus-menu" data-testid="lg-resus-menu">
              <div className="lg-menu-l1">
                {RESUS_MENU.map((col) => (
                  <button
                    key={col.id}
                    type="button"
                    className="lg-menu-row"
                    data-selected={resusCol === col.id}
                    onClick={() => {
                      onResusCol(col.id);
                    }}
                  >
                    {col.label}
                  </button>
                ))}
              </div>
              {resusCol ? (
                <div className="lg-menu-l2">
                  {RESUS_MENU.find((c) => c.id === resusCol)?.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="lg-menu-row"
                      onClick={() => {
                        onResusItem(item.label);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <BottomDock draft={draft} dock={dock} onDraft={onDraft} onSend={onSend} onDock={onDock} />
      {toast ? (
        <p className="lg-toast" style={{ position: 'absolute', left: 24, bottom: 80, zIndex: 60 }}>
          {toast}
        </p>
      ) : null}
      <span className="visually-hidden">{bedId}</span>
    </section>
  );
}
