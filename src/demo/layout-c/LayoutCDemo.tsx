import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bath,
  BedDouble,
  Bell,
  ChevronRight,
  ClipboardList,
  Coffee,
  Cross,
  Droplets,
  Eye,
  Gauge,
  HandHeart,
  Hospital,
  Moon,
  Phone,
  Send,
  Settings,
  Siren,
  Stethoscope,
  X,
} from 'lucide-react';
import {
  DEMO_BEDS,
  DEMO_CALL,
  DEMO_CALLS,
  DEMO_CHAT,
  DEMO_CLOCK,
  DEMO_LINES,
  DEMO_NEEDS,
  DEMO_PATIENT,
  DEMO_REPORTS,
  DEMO_VITALS,
  LANDMARKS,
  type LandmarkId,
} from './fakeData';
import './layout-c.css';

type Screen = 'start' | 'floor' | 'bedside' | LandmarkId;

const CHIPS = [
  { id: '觀察', icon: Eye },
  { id: '治療', icon: HandHeart },
  { id: '檢查', icon: ClipboardList },
  { id: '搶救', icon: Siren },
] as const;

const REPORT_LABEL: Record<string, string> = {
  CBC: '血液檢查（CBC）',
  CXR: '胸部 X 光（CXR）',
  ABG: '動脈血氣分析（ABG）',
};

const LANDMARK_PHOTO: Record<LandmarkId, string> = {
  PANTRY: 'demo/layout-c/lc-pantry-photo.jpg',
  REST: 'demo/layout-c/lc-rest-photo.jpg',
  WC: 'demo/layout-c/lc-wc-photo.jpg',
};

export function LayoutCDemo() {
  const [screen, setScreen] = useState<Screen>('start');
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [chip, setChip] = useState<(typeof CHIPS)[number]['id'] | null>(null);
  const [draft, setDraft] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState(DEMO_CALLS[0]?.id ?? null);
  const [setup, setSetup] = useState({
    rank: 'HO',
    mode: '夜間 (Night)',
    ward: '內科病房 6A',
    difficulty: '標準',
  });
  const ringing = DEMO_CALLS.some((c) => c.status === '響鈴中');
  const inWard = screen !== 'start';
  const landmark = screen === 'PANTRY' || screen === 'REST' || screen === 'WC' ? screen : null;
  const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
  const startBg = useMemo(() => asset('demo/layout-c/start-ward-bg.jpg'), []);

  return (
    <div className="lc-demo" data-testid="layout-c-demo" data-screen={screen}>
      {inWard ? (
        <header className="lc-chrome" aria-label="值班頂欄">
          <div className="lc-clock-pill" data-testid="lc-clock">
            <Moon size={14} strokeWidth={2} aria-hidden="true" />
            <div>
              <strong>{DEMO_CLOCK}</strong>
              <span>night</span>
            </div>
          </div>
          <div className="lc-places" role="group" aria-label="地標">
            <PlaceChip
              active={screen === 'floor' || screen === 'bedside'}
              icon={Hospital}
              label="病房"
              testId="lc-place-ward"
              onClick={() => {
                setToast(null);
                setScreen('floor');
              }}
            />
            <PlaceChip
              active={screen === 'PANTRY'}
              icon={Coffee}
              label="茶水間"
              testId="lc-place-pantry"
              onClick={() => {
                setToast(null);
                setScreen('PANTRY');
              }}
            />
            <PlaceChip
              active={screen === 'REST'}
              icon={BedDouble}
              label="休息室"
              testId="lc-place-rest"
              onClick={() => {
                setToast(null);
                setScreen('REST');
              }}
            />
            <PlaceChip
              active={screen === 'WC'}
              icon={Bath}
              label="洗手間"
              testId="lc-place-wc"
              onClick={() => {
                setToast(null);
                setScreen('WC');
              }}
            />
          </div>
          <div className="lc-needs" aria-label="狀態">
            <Need label="疲倦" value={DEMO_NEEDS.fatigue} />
            <Need label="飢餓" value={DEMO_NEEDS.hunger} />
            <Need label="內急" value={DEMO_NEEDS.bladder} />
          </div>
          <button
            type="button"
            className="lc-phone-btn"
            data-ring={ringing}
            data-testid="lc-open-phone"
            aria-expanded={phoneOpen}
            onClick={() => {
              setPhoneOpen(true);
            }}
          >
            <Phone size={15} strokeWidth={2} aria-hidden="true" />
            電話
            {ringing ? <span className="lc-badge">1</span> : null}
          </button>
        </header>
      ) : null}

      <div className="lc-stage">
        {screen === 'start' ? (
          <StartScreen
            bg={startBg}
            setup={setup}
            onSetup={setSetup}
            onStart={() => {
              setScreen('floor');
            }}
          />
        ) : null}

        {screen === 'floor' ? (
          <FloorScreen
            onBed={() => {
              setScreen('bedside');
            }}
            onAnswer={() => {
              setPhoneOpen(true);
            }}
          />
        ) : null}

        {screen === 'bedside' ? (
          <BedsideScreen
            chip={chip}
            draft={draft}
            onChip={setChip}
            onDraft={setDraft}
            onSend={() => {
              setDraft('');
            }}
          />
        ) : null}

        {landmark ? (
          <LandmarkScreen
            id={landmark}
            photo={asset(LANDMARK_PHOTO[landmark])}
            toast={toast}
            need={
              landmark === 'PANTRY'
                ? DEMO_NEEDS.hunger
                : landmark === 'REST'
                  ? DEMO_NEEDS.fatigue
                  : DEMO_NEEDS.bladder
            }
            onAction={(label) => {
              setToast(`（DEMO）已執行：${label}`);
            }}
            onBack={() => {
              setToast(null);
              setScreen('floor');
            }}
          />
        ) : null}

        {phoneOpen ? (
          <PhoneDrawer
            selectedId={selectedCall}
            onSelect={setSelectedCall}
            onClose={() => {
              setPhoneOpen(false);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function PlaceChip({
  active,
  icon: Icon,
  label,
  testId,
  onClick,
}: {
  active: boolean;
  icon: typeof Hospital;
  label: string;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="lc-place"
      data-here={active}
      data-testid={testId}
      onClick={onClick}
    >
      <Icon size={15} strokeWidth={2} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function Need({ label, value }: { label: string; value: number }) {
  return (
    <div className="lc-need">
      <span>
        {label} {value}%
      </span>
      <div className="lc-need-bar" aria-hidden="true">
        <span style={{ width: `${String(value)}%` }} />
      </div>
    </div>
  );
}

function StartScreen({
  bg,
  setup,
  onSetup,
  onStart,
}: {
  bg: string;
  setup: { rank: string; mode: string; ward: string; difficulty: string };
  onSetup: (next: { rank: string; mode: string; ward: string; difficulty: string }) => void;
  onStart: () => void;
}) {
  return (
    <section className="lc-start" aria-labelledby="lc-start-brand" data-testid="lc-start">
      <div className="lc-start-bg" style={{ backgroundImage: `url(${bg})` }} aria-hidden="true" />
      <div className="lc-start-fade" aria-hidden="true" />
      <div className="lc-start-main">
        <p className="lc-start-kicker">
          <Cross size={14} strokeWidth={2.5} aria-hidden="true" />
          BEDSIDE IMMERSION START
        </p>
        <h1 id="lc-start-brand" className="lc-brand">
          單獨值夜
        </h1>
        <div className="lc-brand-rule" aria-hidden="true">
          <span />
          <em>*</em>
          <span />
        </div>
        <p className="lc-tagline">你將獨自負責夜間病房的醫療照護與決策。</p>
        <button type="button" className="lc-start-cta" data-testid="lc-start-go" onClick={onStart}>
          開始值夜
          <ArrowRight size={18} strokeWidth={2.25} aria-hidden="true" />
        </button>
        <a className="lc-start-settings" href="#/settings">
          <Settings size={14} strokeWidth={2} aria-hidden="true" />
          設定
        </a>
      </div>

      <footer className="lc-start-setup" aria-label="值夜設定">
        <p className="lc-start-setup-label">值夜設定</p>
        <div className="lc-start-setup-grid">
          <SetupField
            icon={Stethoscope}
            label="職級"
            value={setup.rank}
            options={['HO', 'MO', 'RES']}
            onChange={(rank) => {
              onSetup({ ...setup, rank });
            }}
          />
          <SetupField
            icon={Moon}
            label="模式"
            value={setup.mode}
            options={['日間 (Day)', '夜間 (Night)', '值班 (On-call)']}
            onChange={(mode) => {
              onSetup({ ...setup, mode });
            }}
          />
          <SetupField
            icon={BedDouble}
            label="病房"
            value={setup.ward}
            options={['內科病房 6A', '外科病房']}
            onChange={(ward) => {
              onSetup({ ...setup, ward });
            }}
          />
          <SetupField
            icon={Gauge}
            label="難度"
            value={setup.difficulty}
            options={['容易', '標準', '困難']}
            onChange={(difficulty) => {
              onSetup({ ...setup, difficulty });
            }}
          />
        </div>
      </footer>
    </section>
  );
}

function SetupField({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: typeof Stethoscope;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="lc-setup-field">
      <span className="lc-setup-label">
        <Icon size={14} strokeWidth={2} aria-hidden="true" />
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function FloorScreen({ onBed, onAnswer }: { onBed: () => void; onAnswer: () => void }) {
  const upper = DEMO_BEDS.filter((b) => b.bed <= 4);
  const lower = DEMO_BEDS.filter((b) => b.bed > 4);
  return (
    <section className="lc-floor" aria-labelledby="lc-floor-heading" data-testid="lc-floor">
      <div className="lc-plan-card">
        <h2 id="lc-floor-heading">
          <span className="lc-plan-dots" aria-hidden="true" />
          病房平面圖
          <span className="lc-plan-dots" aria-hidden="true" />
        </h2>
        <div className="lc-plan" role="group" aria-label="病床">
          <div className="lc-plan-row">
            {upper.map((bed) => (
              <BedTile key={bed.bed} bed={bed} onBed={onBed} />
            ))}
          </div>
          <div className="lc-plan-corridor" aria-hidden="true" />
          <div className="lc-plan-row">
            {lower.map((bed) => (
              <BedTile key={bed.bed} bed={bed} onBed={onBed} />
            ))}
          </div>
        </div>
        <ul className="lc-mews-legend">
          <li>
            <span data-dot="ok" />
            MEWS 0–2 穩定
          </li>
          <li>
            <span data-dot="warn" />
            MEWS 3 留意
          </li>
          <li>
            <span data-dot="alarm" />
            MEWS ≥4 警示
          </li>
        </ul>
      </div>
      <div className="lc-call-banner" data-testid="lc-call-banner">
        <div className="lc-call-icon" aria-hidden="true">
          <Phone size={22} strokeWidth={2} />
        </div>
        <div className="lc-call-copy">
          <p className="lc-call-title">來電：{DEMO_CALL.from}</p>
          <p>
            分機 {DEMO_CALL.ext} · {DEMO_CALL.text}
          </p>
        </div>
        <div className="lc-call-actions">
          <button type="button" className="lc-btn lc-btn-primary" onClick={onAnswer}>
            <Phone size={14} strokeWidth={2} aria-hidden="true" />
            接聽
          </button>
          <button type="button" className="lc-btn">
            稍後回電
          </button>
        </div>
      </div>
    </section>
  );
}

function BedTile({ bed, onBed }: { bed: (typeof DEMO_BEDS)[number]; onBed: () => void }) {
  return (
    <button
      type="button"
      className="lc-bed"
      data-level={bed.level}
      data-testid={`lc-bed-${String(bed.bed)}`}
      onClick={() => {
        if (bed.name) onBed();
      }}
    >
      <span className="lc-bed-top">
        <BedDouble size={15} strokeWidth={2} aria-hidden="true" />
        <span className="lc-bed-no">{bed.bed}</span>
        {bed.level === 'ALARM' ? (
          <Bell size={14} className="lc-bed-alert" aria-hidden="true" />
        ) : null}
        <span className="lc-bed-dot" data-level={bed.level} />
      </span>
      <span className="lc-bed-mews">MEWS {bed.mews}</span>
      <span className="lc-bed-name">{bed.name ?? '空床'}</span>
    </button>
  );
}

function BedsideScreen({
  chip,
  draft,
  onChip,
  onDraft,
  onSend,
}: {
  chip: (typeof CHIPS)[number]['id'] | null;
  draft: string;
  onChip: (value: (typeof CHIPS)[number]['id'] | null) => void;
  onDraft: (value: string) => void;
  onSend: () => void;
}) {
  const last = DEMO_CHAT[DEMO_CHAT.length - 1];
  return (
    <section className="lc-bedside" aria-label="床邊" data-testid="lc-bedside">
      <div className="lc-bedside-cols">
        <article className="lc-panel" aria-labelledby="lc-body-heading">
          <div className="lc-panel-head">
            <h2 id="lc-body-heading">身體示意圖</h2>
            <span>
              {DEMO_PATIENT.bed} 床 · {DEMO_PATIENT.name}
            </span>
          </div>
          <div className="lc-body">
            <svg className="lc-silhouette-svg" viewBox="0 0 160 240" aria-hidden="true">
              <ellipse cx="78" cy="34" rx="20" ry="24" fill="#8b97a1" />
              <path
                d="M52 58 C54 52 102 52 104 58 L118 128 C120 142 112 150 100 152 L94 214 C92 224 66 224 64 214 L58 152 C46 150 38 140 42 128 Z"
                fill="#9aa7b0"
              />
              <path d="M52 78 L22 122 L34 128 L58 92 Z" fill="#9aa7b0" />
              <path d="M104 78 L138 118 L126 126 L100 92 Z" fill="#9aa7b0" />
              <circle cx="92" cy="70" r="3" fill="#107c67" />
              <circle cx="118" cy="118" r="3" fill="#107c67" />
              <circle cx="78" cy="168" r="3" fill="#107c67" />
            </svg>
            <div className="lc-line-tags">
              {DEMO_LINES.map((line) => (
                <span key={line.id} className="lc-line-tag" data-at={line.at}>
                  {line.label}
                </span>
              ))}
            </div>
          </div>
        </article>

        <article className="lc-panel lc-panel-monitor" aria-labelledby="lc-mon-heading">
          <div className="lc-panel-head">
            <h2 id="lc-mon-heading">心臟監察</h2>
            <span>
              {DEMO_PATIENT.age} 歲{DEMO_PATIENT.sex} · {DEMO_PATIENT.complaint}
            </span>
          </div>
          <div className="lc-monitor-frame">
            <div className="lc-monitor" data-testid="lc-monitor">
              <div className="lc-monitor-brand">
                <Activity size={12} aria-hidden="true" /> MONITOR
              </div>
              <svg
                className="lc-wave-svg"
                viewBox="0 0 320 56"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polyline
                  fill="none"
                  stroke="#2ee6a0"
                  strokeWidth="2"
                  points="0,28 20,28 28,28 34,10 42,46 50,28 70,28 78,28 84,8 92,48 100,28 140,28 148,28 154,12 162,44 170,28 220,28 228,28 234,10 242,46 250,28 320,28"
                />
              </svg>
              <dl className="lc-vitals">
                <div className="lc-vital" data-kind="hr">
                  <dt>HR</dt>
                  <dd>
                    {DEMO_VITALS.hr}
                    <small>bpm</small>
                  </dd>
                </div>
                <div className="lc-vital" data-kind="rr">
                  <dt>RR</dt>
                  <dd>
                    {DEMO_VITALS.rr}
                    <small>/min</small>
                  </dd>
                </div>
                <div className="lc-vital" data-kind="spo2">
                  <dt>SpO2</dt>
                  <dd>
                    {DEMO_VITALS.spo2}
                    <small>%</small>
                  </dd>
                </div>
                <div className="lc-vital" data-kind="nibp">
                  <dt>NIBP</dt>
                  <dd>
                    {DEMO_VITALS.nibp}
                    <small>({DEMO_VITALS.map})</small>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </article>

        <article className="lc-panel" aria-labelledby="lc-report-heading">
          <div className="lc-panel-head">
            <h2 id="lc-report-heading">報告</h2>
            <span>化驗／影像</span>
          </div>
          <div className="lc-reports">
            {DEMO_REPORTS.map((report) => (
              <div key={report.id} className="lc-report" data-status={report.status}>
                <div>
                  <strong>{REPORT_LABEL[report.label] ?? report.label}</strong>
                  <span className="lc-report-state">
                    {report.status === 'PENDING' ? '進行中' : '已完成'}
                  </span>
                </div>
                <span className="lc-report-action">
                  {report.status === 'PENDING' ? '待處理' : '已報告 ›'}
                </span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="lc-dock" data-testid="lc-dock">
        <div className="lc-dock-nurse">
          <p className="lc-dock-nurse-who">護理站：{last?.who ?? '張護士'}</p>
          <p className="lc-dock-nurse-text">{last?.text ?? ''}</p>
        </div>
        <div className="lc-input-row">
          <input
            aria-label="輸入對話或指示"
            placeholder="輸入訊息…"
            value={draft}
            data-testid="lc-chat-input"
            onChange={(event) => {
              onDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSend();
            }}
          />
          <button type="button" className="lc-send" aria-label="送出" onClick={onSend}>
            <Send size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div className="lc-chips" role="group" aria-label="快捷醫囑分類">
          {CHIPS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className="lc-chip"
              aria-pressed={chip === id}
              data-testid={`lc-chip-${id}`}
              onClick={() => {
                onChip(chip === id ? null : id);
              }}
            >
              <Icon size={15} strokeWidth={2} aria-hidden="true" />
              {id}
            </button>
          ))}
        </div>
        {chip ? (
          <p className="lc-chip-note">（DEMO）已預留「{chip}」選單位置，尚未接真 order。</p>
        ) : null}
      </div>
    </section>
  );
}

function LandmarkScreen({
  id,
  photo,
  toast,
  need,
  onAction,
  onBack,
}: {
  id: LandmarkId;
  photo: string;
  toast: string | null;
  need: number;
  onAction: (label: string) => void;
  onBack: () => void;
}) {
  const place = LANDMARKS[id];
  const needLabel = id === 'PANTRY' ? '飢餓' : id === 'REST' ? '疲倦' : '內急';
  return (
    <section
      className="lc-landmark"
      data-place={id}
      aria-labelledby="lc-landmark-heading"
      data-testid={`lc-landmark-${id}`}
    >
      <div className="lc-landmark-visual">
        <img src={photo} alt="" />
        <div className="lc-landmark-overlay">
          <p className="lc-landmark-kicker">Concept C · 地標</p>
          <h2 id="lc-landmark-heading">{place.title}</h2>
          <p>{place.hint}</p>
        </div>
      </div>
      <div className="lc-landmark-side">
        <h3>自理選項</h3>
        <p className="lc-landmark-side-hint">選擇一項，照顧自己。</p>
        <div className="lc-landmark-actions">
          {place.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="lc-action-card"
              data-testid={`lc-action-${action.id}`}
              onClick={() => {
                onAction(action.label);
              }}
            >
              <span>
                <strong>{action.label}</strong>
                <small>{action.note}</small>
              </span>
              <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          ))}
          <div className="lc-need-card">
            <div>
              <Droplets size={16} strokeWidth={2} aria-hidden="true" />
              <strong>
                {needLabel}值 · {need}%
              </strong>
            </div>
            <div className="lc-need-bar" aria-hidden="true">
              <span style={{ width: `${String(need)}%` }} />
            </div>
          </div>
        </div>
        {toast ? (
          <p className="lc-toast" role="status">
            {toast}
          </p>
        ) : null}
        <button
          type="button"
          className="lc-btn lc-btn-primary lc-back-ward"
          data-testid="lc-back-ward"
          onClick={onBack}
        >
          <Hospital size={15} strokeWidth={2} aria-hidden="true" />
          返回病房
        </button>
      </div>
    </section>
  );
}

function PhoneDrawer({
  selectedId,
  onSelect,
  onClose,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const call = DEMO_CALLS.find((item) => item.id === selectedId) ?? DEMO_CALLS[0] ?? null;
  return (
    <div className="lc-scrim" data-testid="lc-phone-drawer">
      <aside className="lc-phone-sheet" aria-label="電話">
        <div className="lc-sheet-handle" aria-hidden="true" />
        <div className="lc-drawer-head">
          <h2>
            <Phone size={16} strokeWidth={2} aria-hidden="true" />
            來電
            <span>最近通話</span>
          </h2>
          <button
            type="button"
            className="lc-icon-close"
            data-testid="lc-close-phone"
            onClick={onClose}
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
            <span className="visually-hidden">關閉</span>
          </button>
        </div>
        <div className="lc-phone-grid">
          <div className="lc-call-list" role="listbox" aria-label="來電清單">
            {DEMO_CALLS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="lc-call"
                role="option"
                aria-selected={call?.id === item.id}
                onClick={() => {
                  onSelect(item.id);
                }}
              >
                <div className="lc-call-meta">
                  <span className="lc-call-tag">{item.tag}</span>
                  <span>{item.time}</span>
                </div>
                <strong>
                  {item.tag} · {item.who}
                </strong>
                <span className="lc-call-snippet">{item.text}</span>
              </button>
            ))}
          </div>
          {call ? (
            <div className="lc-call-detail">
              <p className="lc-call-detail-label">留言內容</p>
              <p>{call.text}</p>
              <div className="lc-bed-chip">病床 · 3</div>
              <div className="lc-call-actions">
                <button type="button" className="lc-btn lc-btn-primary">
                  即刻過去
                </button>
                <button type="button" className="lc-btn">
                  稍後
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
