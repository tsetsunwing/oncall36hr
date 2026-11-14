import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ClipboardList,
  Eye,
  HandHeart,
  Moon,
  Phone,
  Save,
  Siren,
  Sun,
  X,
} from 'lucide-react';
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
import {
  DEMO_ACTION_LOG,
  DEMO_CHAT,
  DEMO_CLOCK,
  DEMO_MAR,
  DEMO_MEDICATIONS,
  DEMO_NEEDS,
  DEMO_PATIENT,
  DEMO_PHONE,
  DEMO_RESULTS,
  END_REPORT,
  LANDMARK_ACTIONS,
  ROUND_QUESTION,
  bedsFor,
  landmarksFor,
  mewsTone,
  type DayPart,
  type LandmarkId,
  type ZoneId,
} from './fakeData';
import './layout-g.css';

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
type TreatL1 = 'oxygen' | 'catheters' | 'drugs' | null;

const DOCK: { id: DockChip; label: string; eng: string; icon: typeof Eye }[] = [
  { id: 'observe', label: ui.game.chat.chipGroup.observe ?? '觀察', eng: 'Observe', icon: Eye },
  { id: 'treat', label: ui.game.chat.chipGroup.treat ?? '治療', eng: 'Treat', icon: HandHeart },
  { id: 'tests', label: ui.game.chat.chipGroup.tests ?? '檢查', eng: 'Test', icon: ClipboardList },
  { id: 'resus', label: ui.game.chat.chipGroup.resus ?? '搶救', eng: 'Resus', icon: Siren },
];

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
  const [treatL1, setTreatL1] = useState<TreatL1>(null);
  const [testBucket, setTestBucket] = useState<ReportBucket | null>(null);
  const [testSection, setTestSection] = useState<string | null>(null);
  const [testBasket, setTestBasket] = useState<string[]>([]);
  const [resusCol, setResusCol] = useState<(typeof RESUS_MENU)[number]['id'] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [chat, setChat] = useState(DEMO_CHAT);
  const [phoneTab, setPhoneTab] = useState<'seniors' | 'juniors' | 'specialties'>('seniors');
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
    setTestBucket(null);
    setTestSection(null);
    setResusCol(null);
    setToast(null);
    setScreen('floor');
  }

  function openBed(id: string) {
    setBedId(id);
    setDock(null);
    setTreatL1(null);
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
    setChat((prev) => [
      ...prev,
      { id: `c-${String(prev.length + 1)}`, who: '系統 System', text },
    ]);
    setDock(null);
    setTreatL1(null);
    setTestBucket(null);
    setTestSection(null);
    setTestBasket([]);
    setResusCol(null);
  }

  function toggleCollapse(key: string) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="lg-demo" data-testid="layout-g-demo" data-screen={screen} data-day={dayPart}>
      {screen !== 'start' && screen !== 'setup' && screen !== 'end' ? (
        <Hud
          clock={clock}
          dayPart={dayPart}
          zone={zone}
          speed={speed}
          showZone={screen === 'floor' || screen === 'landmark'}
          onZone={setZone}
          onDayPart={setDayPart}
          onSpeed={setSpeed}
          onPhone={() => {
            setScreen('phone');
          }}
          onBack={() => {
            if (screen === 'bedzoom' || screen === 'landmark' || screen === 'phone') goFloor();
            else if (screen === 'round' || screen === 'roundFeedback') goFloor();
            else setScreen('start');
          }}
          onRound={() => {
            setRoundPick(null);
            setScreen('round');
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
          <FloorScreen
            zone={zone}
            bg={floorBg}
            onBed={openBed}
            onLandmark={openLandmark}
          />
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
            testBucket={testBucket}
            testSection={testSection}
            testBasket={testBasket}
            resusCol={resusCol}
            draft={draft}
            chat={chat}
            collapsed={collapsed}
            toast={toast}
            onDock={(id) => {
              setDock((cur) => (cur === id ? null : id));
              setTreatL1(null);
              setTestBucket(null);
              setTestSection(null);
              setResusCol(null);
            }}
            onTreatL1={setTreatL1}
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
            }}
          />
        ) : null}

        {screen === 'phone' ? (
          <PhoneScreen
            tab={phoneTab}
            onTab={setPhoneTab}
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

        {screen === 'roundFeedback' ? (
          <RoundFeedback
            pick={roundPick}
            onNext={goFloor}
          />
        ) : null}

        {screen === 'end' ? (
          <EndScreen
            onAgain={() => {
              setScreen('start');
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function Hud({
  clock,
  dayPart,
  zone,
  speed,
  showZone,
  onZone,
  onDayPart,
  onSpeed,
  onPhone,
  onBack,
  onRound,
}: {
  clock: string;
  dayPart: DayPart;
  zone: ZoneId;
  speed: string;
  showZone: boolean;
  onZone: (z: ZoneId) => void;
  onDayPart: (d: DayPart) => void;
  onSpeed: (s: string) => void;
  onPhone: () => void;
  onBack: () => void;
  onRound: () => void;
}) {
  return (
    <header className="lg-hud" aria-label="Layout G HUD">
      <div className="lg-hud-left">
        <div className="lg-hud-chip" data-testid="lg-clock">
          {dayPart === 'night' ? <Moon size={14} aria-hidden /> : <Sun size={14} aria-hidden />}
          <strong>{clock}</strong>
        </div>
        <div className="lg-needs" aria-label="Need meters">
          <Need label="疲倦 Fatigue" value={DEMO_NEEDS.fatigue} />
          <Need label="飢餓 Hunger" value={DEMO_NEEDS.hunger} />
          <Need label="內急 Bladder" value={DEMO_NEEDS.bladder} />
        </div>
      </div>
      <div className="lg-hud-spacer" />
      <div className="lg-hud-right">
        {showZone ? (
          <>
            <button
              type="button"
              className="lg-hud-btn"
              data-selected={zone === 'A'}
              data-testid="lg-zone-a"
              onClick={() => {
                onZone('A');
              }}
            >
              Zone A
            </button>
            <button
              type="button"
              className="lg-hud-btn"
              data-selected={zone === 'B'}
              data-testid="lg-zone-b"
              onClick={() => {
                onZone('B');
              }}
            >
              Zone B
            </button>
            <button
              type="button"
              className="lg-hud-btn"
              data-testid="lg-daynight"
              onClick={() => {
                onDayPart(dayPart === 'night' ? 'day' : 'night');
              }}
            >
              {dayPart === 'night' ? '夜間 Night' : '日間 Day'}
            </button>
          </>
        ) : null}
        {(['00', '1x', '2x', '4x'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className="lg-hud-btn lg-hud-btn-sm"
            data-selected={speed === s}
            onClick={() => {
              onSpeed(s);
            }}
          >
            {s}
          </button>
        ))}
        <button type="button" className="lg-hud-btn lg-hud-btn-sm" aria-label="儲存 Save">
          <Save size={14} aria-hidden />
        </button>
        <button type="button" className="lg-hud-btn" data-testid="lg-round" onClick={onRound}>
          巡房 Round
        </button>
        <button type="button" className="lg-hud-btn" data-testid="lg-phone" onClick={onPhone}>
          <Phone size={14} aria-hidden />
          電話 Phone
        </button>
        <button type="button" className="lg-hud-btn" data-testid="lg-back" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden />
          返回 Back
        </button>
      </div>
    </header>
  );
}

function Need({ label, value }: { label: string; value: number }) {
  return (
    <div className="lg-need" title={label}>
      <span>{label.split(' ')[0]} {value}%</span>
      <div className="lg-need-bar" aria-hidden>
        <i style={{ width: `${String(value)}%` }} />
      </div>
    </div>
  );
}

function StartScreen({
  onNew,
  onContinue,
  onEnd,
}: {
  onNew: () => void;
  onContinue: () => void;
  onEnd: () => void;
}) {
  return (
    <section className="lg-start" data-testid="lg-start" aria-labelledby="lg-start-title">
      <div
        className="lg-start-bg"
        style={{ backgroundImage: `url(${asset('demo/layout-g/isometric-hospital.png')})` }}
        aria-hidden
      />
      <div className="lg-start-panel lg-card">
        <p className="lg-kicker">Layout G DEMO</p>
        <h1 id="lg-start-title">單獨值夜</h1>
        <p className="lg-tagline">On-call 36hr · isometric ward shell（假數據）</p>
        <div className="lg-start-actions">
          <button type="button" className="lg-confirm" data-testid="lg-start-new" onClick={onNew}>
            新遊戲 New game
          </button>
          <button type="button" className="lg-hud-btn" data-testid="lg-start-go" onClick={onContinue}>
            繼續 Continue → Floor
          </button>
          <button type="button" className="lg-hud-btn" data-testid="lg-start-end" onClick={onEnd}>
            成績表 End
          </button>
          <a className="lg-link" href="#/">
            返回正式開始畫面 Main start
          </a>
        </div>
      </div>
    </section>
  );
}

function SetupScreen({
  setup,
  onSetup,
  onStart,
  onBack,
}: {
  setup: { rank: string; difficulty: string; ward: string; shift: string; ai: string };
  onSetup: (s: typeof setup) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const fields: { key: keyof typeof setup; label: string; options: string[] }[] = [
    { key: 'rank', label: '職級 Rank', options: ['HO', 'MO', 'RES'] },
    { key: 'difficulty', label: '難度 Difficulty', options: ['EASY', 'MEDIUM', 'HARD'] },
    { key: 'ward', label: '病房 Ward', options: ['MED', 'SURG'] },
    { key: 'shift', label: '班次 Shift', options: ['DAY', 'NIGHT'] },
    { key: 'ai', label: 'AI', options: ['標準', '嚴格', '關閉'] },
  ];
  return (
    <section className="lg-setup" data-testid="lg-setup">
      <div
        className="lg-setup-art"
        style={{ backgroundImage: `url(${asset('demo/layout-g/isometric-hospital.png')})` }}
        aria-hidden
      />
      <form
        className="lg-setup-form lg-card"
        onSubmit={(e) => {
          e.preventDefault();
          onStart();
        }}
      >
        <h2>新遊戲設定 Setup</h2>
        {fields.map((f) => (
          <label key={f.key} className="lg-setup-row">
            <span>{f.label}</span>
            <select
              value={setup[f.key]}
              onChange={(e) => {
                onSetup({ ...setup, [f.key]: e.target.value });
              }}
            >
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="submit" className="lg-confirm" data-testid="lg-setup-start">
          開始值夜 Start duty
        </button>
        <button type="button" className="lg-hud-btn" onClick={onBack}>
          返回 Back
        </button>
      </form>
    </section>
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
      <div className="lg-bleed" style={{ backgroundImage: `url(${bg})` }} role="img" aria-label={`Zone ${zone} floor`} />
      <div className="lg-hotspots">
        {beds.map((bed) => (
          <button
            key={bed.id}
            type="button"
            className="lg-bed-pin"
            style={{ left: `${String(bed.xPct)}%`, top: `${String(bed.yPct)}%` }}
            data-testid={`lg-bed-${bed.id}`}
            data-mews={mewsTone(bed.mews)}
            onClick={() => {
              onBed(bed.id);
            }}
          >
            <span className="lg-bed-id">{bed.id}</span>
            <span className="lg-mews" data-tone={mewsTone(bed.mews)}>
              {bed.mews}
            </span>
            {bed.alert ? <span className="lg-alert-dot" aria-label="alert" /> : null}
          </button>
        ))}
        {pins.map((pin) => (
          <button
            key={pin.id}
            type="button"
            className="lg-landmark-pin"
            style={{ left: `${String(pin.xPct)}%`, top: `${String(pin.yPct)}%` }}
            data-testid={`lg-landmark-${pin.id}`}
            onClick={() => {
              onLandmark(pin.id);
            }}
          >
            {pin.labelChi} {pin.labelEng}
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
        <button type="button" className="lg-confirm" data-testid="lg-landmark-back" onClick={onBack}>
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
  testBucket,
  testSection,
  testBasket,
  resusCol,
  draft,
  chat,
  collapsed,
  toast,
  onDock,
  onTreatL1,
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
  treatL1: TreatL1;
  testBucket: ReportBucket | null;
  testSection: string | null;
  testBasket: string[];
  resusCol: (typeof RESUS_MENU)[number]['id'] | null;
  draft: string;
  chat: typeof DEMO_CHAT;
  collapsed: Record<string, boolean>;
  toast: string | null;
  onDock: (id: DockChip) => void;
  onTreatL1: (id: TreatL1) => void;
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
    testSection && testSection in TEST_ACTION_ORDER
      ? (TEST_ACTION_ORDER[testSection] ?? [])
      : [];

  return (
    <section className="lg-bedzoom" data-testid="lg-bedzoom">
      <div className="lg-bleed lg-bedzoom-bg" style={{ backgroundImage: `url(${art})` }} aria-hidden />

      <div className="lg-bedzoom-grid">
        <div className="lg-panel-monitor" data-collapsed={collapsed.monitor === true}>
          <MonitorPanel patient={patient} monitor={monitor} onMeasureNibp={() => undefined} />
        </div>

        <article className="lg-card lg-panel-body" data-collapsed={collapsed.body === true}>
          <header className="lg-panel-head">
            <h2>
              身形圖 Body · {bedId} · {DEMO_PATIENT.name}
            </h2>
            <button type="button" className="lg-collapse" onClick={() => onCollapse('body')} aria-label="collapse">
              ⌃
            </button>
          </header>
          {!collapsed.body ? (
            <div className="lg-body-wrap">
              <img src={asset('demo/layout-g/body-silhouette.svg')} alt="" className="lg-body-sil" />
              <ul className="lg-line-list">
                <li>Nasal cannula 2 L/min</li>
                <li>Peripheral IV</li>
                <li>Foley</li>
              </ul>
            </div>
          ) : null}
        </article>

        <article className="lg-card lg-panel-mar" data-collapsed={collapsed.mar === true}>
          <header className="lg-panel-head">
            <h2>處方 MAR</h2>
            <button type="button" className="lg-collapse" onClick={() => onCollapse('mar')} aria-label="collapse">
              ⌃
            </button>
          </header>
          {!collapsed.mar ? (
            <ul className="lg-mar-list">
              {DEMO_MAR.map((row) => (
                <li key={row.id}>
                  <span className="lg-chip lg-route" data-route={row.route}>
                    {row.route}
                  </span>
                  <div>
                    <strong>
                      {row.drug} · {row.dose} {row.freq}
                    </strong>
                    <span>
                      {row.status} · {row.due}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </article>

        <article className="lg-card lg-panel-record" data-collapsed={collapsed.record === true}>
          <header className="lg-panel-head">
            <h2>病歷 Record</h2>
            <button type="button" className="lg-collapse" onClick={() => onCollapse('record')} aria-label="collapse">
              ⌃
            </button>
          </header>
          {!collapsed.record ? (
            <dl className="lg-record">
              <div>
                <dt>背景 Background</dt>
                <dd>COPD · HTN</dd>
              </div>
              <div>
                <dt>入院原因 Admission</dt>
                <dd>{DEMO_PATIENT.complaint}</dd>
              </div>
              <div>
                <dt>過敏 Allergy</dt>
                <dd>NKDA</dd>
              </div>
            </dl>
          ) : null}
        </article>

        <article className="lg-card lg-panel-results" data-collapsed={collapsed.results === true}>
          <header className="lg-panel-head">
            <h2>報告 Results</h2>
            <button type="button" className="lg-collapse" onClick={() => onCollapse('results')} aria-label="collapse">
              ⌃
            </button>
          </header>
          {!collapsed.results ? (
            <ul className="lg-results">
              {DEMO_RESULTS.map((r) => (
                <li key={r.id}>
                  <span className="lg-badge">{r.group}</span>
                  <strong>
                    {r.time} · {r.label}
                  </strong>
                  {'detail' in r && r.detail ? <p>{r.detail}</p> : null}
                  {'chips' in r && r.chips ? (
                    <div className="lg-result-chips">
                      {r.chips.map((c) => (
                        <span key={c.k} className="lg-chip" data-kind="current">
                          {c.k} {c.v}{' '}
                          <span className="lg-grade" data-grade={c.grade}>
                            {c.grade === 'N' ? '' : c.grade}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </article>

        <article className="lg-card lg-panel-log" data-collapsed={collapsed.log === true}>
          <header className="lg-panel-head">
            <h2>行動記錄 Action Log</h2>
            <button type="button" className="lg-collapse" onClick={() => onCollapse('log')} aria-label="collapse">
              ⌃
            </button>
          </header>
          {!collapsed.log ? (
            <ul className="lg-log">
              {DEMO_ACTION_LOG.map((row) => (
                <li key={row.id}>
                  <time>{row.time}</time> {row.text}
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      </div>

      {dock ? (
        <div className="lg-dock-popover lg-card" data-testid="lg-dock-popover" data-dock={dock}>
          {dock === 'observe' ? (
            <ObservePanel
              onSubmit={(order) => {
                onOrderNote(`觀察 Observe · ${order.text}`);
              }}
            />
          ) : null}

          {dock === 'treat' && treatL1 === null ? (
            <div className="lg-menu-l1">
              <button type="button" className="lg-menu-row" data-testid="lg-treat-oxygen" onClick={() => onTreatL1('oxygen')}>
                Oxygen
              </button>
              <button type="button" className="lg-menu-row" data-testid="lg-treat-catheters" onClick={() => onTreatL1('catheters')}>
                Catheters
              </button>
              <button type="button" className="lg-menu-row" data-testid="lg-treat-drugs" onClick={() => onTreatL1('drugs')}>
                Drugs
              </button>
            </div>
          ) : null}
          {dock === 'treat' && treatL1 === 'oxygen' ? (
            <OxygenOrderForm
              onSubmit={(order) => {
                onOrderNote(`治療 Treat · ${order.text}`);
              }}
              onClose={onCloseForms}
            />
          ) : null}
          {dock === 'treat' && treatL1 === 'catheters' ? (
            <CatheterOrders
              onSubmit={(order) => {
                onOrderNote(`治療 Treat · ${order.text}`);
              }}
              onClose={onCloseForms}
            />
          ) : null}
          {dock === 'treat' && treatL1 === 'drugs' ? (
            <DrugOrderForm
              drugId=""
              medications={DEMO_MEDICATIONS}
              treatmentSearch
              onSubmit={(order) => {
                onOrderNote(`治療 Treat · ${order.text}`);
              }}
              onClose={onCloseForms}
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
                  {sections.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="lg-menu-row"
                      data-selected={testSection === s}
                      onClick={() => {
                        onTestSection(s);
                      }}
                    >
                      {ui.game.reports.menuSection[s] ?? s}
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

      <footer className="lg-dock" data-testid="lg-dock">
        <div className="lg-dock-chat">
          <div className="lg-chat-history" aria-live="polite">
            {chat.slice(-6).map((line) => (
              <div key={line.id} className="lg-chat-line">
                <strong>{line.who}</strong>
                <span>{line.text}</span>
              </div>
            ))}
          </div>
          <div className="lg-chat-compose">
            <input
              value={draft}
              data-testid="lg-chat-input"
              placeholder="對話 Message"
              onChange={(e) => {
                onDraft(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSend();
              }}
            />
            <button type="button" className="lg-hud-btn" onClick={onSend}>
              傳送 Send
            </button>
          </div>
        </div>
        <div className="lg-dock-chips" role="toolbar" aria-label="Bed dock">
          {DOCK.map((chip) => {
            const Icon = chip.icon;
            return (
              <button
                key={chip.id}
                type="button"
                className="lg-dock-chip"
                data-selected={dock === chip.id}
                data-testid={`lg-chip-${chip.id}`}
                onClick={() => {
                  onDock(chip.id);
                }}
              >
                <Icon size={16} aria-hidden />
                {chip.label}
                <small>{chip.eng}</small>
              </button>
            );
          })}
        </div>
        {toast ? <p className="lg-toast lg-toast-dock">{toast}</p> : null}
      </footer>
    </section>
  );
}

function PhoneScreen({
  tab,
  onTab,
  onClose,
  onCall,
}: {
  tab: 'seniors' | 'juniors' | 'specialties';
  onTab: (t: 'seniors' | 'juniors' | 'specialties') => void;
  onClose: () => void;
  onCall: (who: string) => void;
}) {
  const list = DEMO_PHONE[tab];
  return (
    <section className="lg-phone" data-testid="lg-phone-screen">
      <div className="lg-phone-sheet lg-card">
        <header className="lg-panel-head">
          <h2>電話 Phone</h2>
          <button type="button" className="lg-collapse" data-testid="lg-phone-close" onClick={onClose} aria-label="close">
            <X size={16} />
          </button>
        </header>
        <div className="lg-phone-tabs">
          {(
            [
              ['seniors', '上級 Seniors'],
              ['juniors', '下級 Juniors'],
              ['specialties', '專科 Specialties'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="lg-hud-btn"
              data-selected={tab === id}
              onClick={() => {
                onTab(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <ul className="lg-phone-list">
          {list.map((row) => (
            <li key={row.id}>
              <div>
                <strong>{row.name}</strong>
                <span>{row.title}</span>
              </div>
              <button
                type="button"
                className="lg-hud-btn"
                onClick={() => {
                  onCall(`${row.title} ${row.name}`);
                }}
              >
                {row.status}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function RoundScreen({
  pick,
  onPick,
  onSubmit,
  onLeave,
}: {
  pick: string | null;
  onPick: (id: string) => void;
  onSubmit: () => void;
  onLeave: () => void;
}) {
  const q = ROUND_QUESTION;
  return (
    <section className="lg-round" data-testid="lg-round-screen">
      <div className="lg-round-card lg-card">
        <header className="lg-panel-head">
          <h2>
            巡房 Doctor Round · {q.bed} {q.patient}
          </h2>
          <button type="button" className="lg-hud-btn" onClick={onLeave}>
            離開 Leave
          </button>
        </header>
        <p className="lg-round-q">
          {q.promptChi}
          <br />
          <small>{q.promptEng}</small>
        </p>
        <div className="lg-round-choices">
          {q.choices.map((c) => (
            <button
              key={c.id}
              type="button"
              className="lg-menu-row"
              data-selected={pick === c.id}
              onClick={() => {
                onPick(c.id);
              }}
            >
              {c.text}
            </button>
          ))}
        </div>
        <textarea className="lg-round-free" placeholder="自由文字 Free text" rows={3} />
        <button type="button" className="lg-confirm" data-testid="lg-round-submit" disabled={!pick} onClick={onSubmit}>
          提交 Submit
        </button>
      </div>
    </section>
  );
}

function RoundFeedback({ pick, onNext }: { pick: string | null; onNext: () => void }) {
  const ok = pick === ROUND_QUESTION.correct;
  return (
    <section className="lg-round" data-testid="lg-round-feedback">
      <div className="lg-round-card lg-card">
        <h2>{ok ? '答對 Correct' : '再想想 Review'}</h2>
        <p>
          {ROUND_QUESTION.teachingChi}
          <br />
          <small>{ROUND_QUESTION.teachingEng}</small>
        </p>
        <button type="button" className="lg-confirm" onClick={onNext}>
          下一位 Next
        </button>
      </div>
    </section>
  );
}

function EndScreen({ onAgain }: { onAgain: () => void }) {
  return (
    <section className="lg-end" data-testid="lg-end">
      <div className="lg-end-sheet lg-card">
        <h1>
          成績表 Grade Report · {END_REPORT.grade}
        </h1>
        <p className="lg-end-score">{END_REPORT.score}</p>
        <ul>
          {END_REPORT.lines.map((line) => (
            <li key={line.labelEng}>
              <span>
                {line.labelChi} / {line.labelEng}
              </span>
              <strong>{line.value}</strong>
            </li>
          ))}
        </ul>
        <button type="button" className="lg-confirm" onClick={onAgain}>
          再來一次 Play again
        </button>
        <a className="lg-link" href="#/">
          返回主畫面 Main
        </a>
      </div>
    </section>
  );
}
