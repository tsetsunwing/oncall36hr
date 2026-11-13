import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bath,
  BedDouble,
  Bell,
  ClipboardList,
  Coffee,
  Cross,
  Eye,
  HandHeart,
  Hospital,
  Moon,
  Phone,
  Send,
  Settings,
  Siren,
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
  ABG: '動脈血氣（ABG）',
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
    mode: '夜間',
    ward: '內科病房 6A',
    difficulty: '標準',
  });
  const ringing = DEMO_CALLS.some((c) => c.status === '響鈴中');
  const inWard = screen !== 'start';
  const landmark = screen === 'PANTRY' || screen === 'REST' || screen === 'WC' ? screen : null;
  const bg = useMemo(() => `${import.meta.env.BASE_URL}demo/layout-c/start-ward-bg.jpg`, []);

  return (
    <div className="lc-demo" data-testid="layout-c-demo" data-screen={screen}>
      <div className="lc-banner">
        <span>
          <strong>Layout C DEMO</strong> · 對齊 mock 視覺 · 假數據 · 唔經 main Pages
        </span>
        <a href="#/">返回正式開始畫面</a>
      </div>

      {inWard ? (
        <header className="lc-chrome" aria-label="值班頂欄">
          <div className="lc-clock-pill" data-testid="lc-clock">
            <Moon size={14} strokeWidth={2} aria-hidden="true" />
            <span>{DEMO_CLOCK}</span>
            <span className="lc-clock-sub">night</span>
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
            bg={bg}
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
            toast={toast}
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
      {label}
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
            label="職級"
            value={setup.rank}
            options={['HO', 'MO', 'RES']}
            onChange={(rank) => {
              onSetup({ ...setup, rank });
            }}
          />
          <SetupField
            label="模式"
            value={setup.mode}
            options={['日間', '夜間', '值班']}
            onChange={(mode) => {
              onSetup({ ...setup, mode });
            }}
          />
          <SetupField
            label="病房"
            value={setup.ward}
            options={['內科病房 6A', '外科病房']}
            onChange={(ward) => {
              onSetup({ ...setup, ward });
            }}
          />
          <SetupField
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
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="lc-setup-field">
      <span>{label}</span>
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
      <h2 id="lc-floor-heading">病房平面圖</h2>
      <div className="lc-plan" role="group" aria-label="病床">
        <div className="lc-plan-row">
          {upper.map((bed) => (
            <BedTile key={bed.bed} bed={bed} onBed={onBed} />
          ))}
        </div>
        <div className="lc-plan-corridor" aria-hidden="true">
          走廊
        </div>
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
      <div className="lc-call-banner" data-testid="lc-call-banner">
        <div>
          <p className="lc-call-title">
            <Bell size={15} strokeWidth={2} aria-hidden="true" />
            來電：{DEMO_CALL.from}
          </p>
          <p>
            分機 {DEMO_CALL.ext} · {DEMO_CALL.text}
          </p>
        </div>
        <div className="lc-call-actions">
          <button type="button" className="lc-btn lc-btn-primary" onClick={onAnswer}>
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

function BedTile({
  bed,
  onBed,
}: {
  bed: (typeof DEMO_BEDS)[number];
  onBed: () => void;
}) {
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
        <BedDouble size={16} strokeWidth={2} aria-hidden="true" />
        <span className="lc-bed-no">{bed.bed}</span>
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
            <svg className="lc-silhouette-svg" viewBox="0 0 120 220" aria-hidden="true">
              <ellipse cx="60" cy="28" rx="18" ry="22" fill="#8b97a1" />
              <path
                d="M38 52 C38 48 82 48 82 52 L92 120 C94 132 88 140 78 142 L72 200 C70 208 50 208 48 200 L42 142 C32 140 26 132 28 120 Z"
                fill="#9aa7b0"
              />
              <path d="M28 78 L12 118 L22 122 L38 90 Z" fill="#9aa7b0" />
              <path d="M92 78 L108 118 L98 122 L82 90 Z" fill="#9aa7b0" />
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
          <div className="lc-monitor" data-testid="lc-monitor">
            <div className="lc-monitor-brand">
              <Activity size={12} aria-hidden="true" /> MONITOR
            </div>
            <svg className="lc-wave-svg" viewBox="0 0 320 56" preserveAspectRatio="none" aria-hidden="true">
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
        <div className="lc-chat-log" aria-live="polite">
          {DEMO_CHAT.map((line) => (
            <p key={line.id}>
              <strong>{line.who}</strong>：{line.text}
            </p>
          ))}
        </div>
        <div className="lc-dock-row">
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
        </div>
        {chip ? <p className="lc-chip-note">（DEMO）已預留「{chip}」選單位置，尚未接真 order。</p> : null}
      </div>
    </section>
  );
}

function LandmarkScreen({
  id,
  toast,
  onAction,
  onBack,
}: {
  id: LandmarkId;
  toast: string | null;
  onAction: (label: string) => void;
  onBack: () => void;
}) {
  const place = LANDMARKS[id];
  return (
    <section
      className="lc-landmark"
      data-place={id}
      aria-labelledby="lc-landmark-heading"
      data-testid={`lc-landmark-${id}`}
    >
      <div className="lc-landmark-card">
        <p className="lc-landmark-kicker">Concept C · 地標</p>
        <h2 id="lc-landmark-heading">{place.title}</h2>
        <p>{place.hint}</p>
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
              <strong>{action.label}</strong>
              <span>{action.note}</span>
            </button>
          ))}
        </div>
        {toast ? (
          <p className="lc-toast" role="status">
            {toast}
          </p>
        ) : null}
        <button type="button" className="lc-btn lc-btn-primary" data-testid="lc-back-ward" onClick={onBack}>
          病房
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
      <aside className="lc-drawer" aria-label="電話">
        <div className="lc-drawer-head">
          <h2>
            <Phone size={16} strokeWidth={2} aria-hidden="true" />
            電話
          </h2>
          <button type="button" className="lc-icon-close" data-testid="lc-close-phone" onClick={onClose}>
            <X size={16} strokeWidth={2} aria-hidden="true" />
            <span className="visually-hidden">關閉</span>
          </button>
        </div>
        <div className="lc-call-list" role="list">
          {DEMO_CALLS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="lc-call"
              role="listitem"
              aria-pressed={call?.id === item.id}
              onClick={() => {
                onSelect(item.id);
              }}
            >
              <div className="lc-call-meta">
                <span>
                  {item.tag} · {item.who}
                </span>
                <span>
                  {item.time} · {item.status}
                </span>
              </div>
              <span>{item.text}</span>
            </button>
          ))}
        </div>
        {call ? (
          <div className="lc-call-detail">
            <p>{call.text}</p>
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
      </aside>
    </div>
  );
}
