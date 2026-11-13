import { useState } from 'react';
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

const CHIPS = ['觀察', '治療', '檢查', '搶救'] as const;

export function LayoutCDemo() {
  const [screen, setScreen] = useState<Screen>('start');
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [chip, setChip] = useState<(typeof CHIPS)[number] | null>(null);
  const [draft, setDraft] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState(DEMO_CALLS[0]?.id ?? null);
  const ringing = DEMO_CALLS.some((c) => c.status === '響鈴中');

  const inWard = screen !== 'start';
  const landmark = screen === 'PANTRY' || screen === 'REST' || screen === 'WC' ? screen : null;

  return (
    <div className="lc-demo" data-testid="layout-c-demo" data-screen={screen}>
      <div className="lc-banner">
        <span>
          <strong>Layout C DEMO</strong> · 假數據 · 唔接引擎 · 唔經 main Pages
        </span>
        <a href="#/">返回正式開始畫面</a>
      </div>

      {inWard ? (
        <header className="lc-chrome" aria-label="值班頂欄">
          <div className="lc-clock" data-testid="lc-clock">
            {DEMO_CLOCK}
          </div>
          <div className="lc-places" role="group" aria-label="地標">
            <button
              type="button"
              className="lc-place"
              data-here={screen === 'floor' || screen === 'bedside'}
              data-testid="lc-place-ward"
              onClick={() => {
                setToast(null);
                setScreen('floor');
              }}
            >
              病房
            </button>
            <button
              type="button"
              className="lc-place"
              data-here={screen === 'PANTRY'}
              data-testid="lc-place-pantry"
              onClick={() => {
                setToast(null);
                setScreen('PANTRY');
              }}
            >
              茶水間
            </button>
            <button
              type="button"
              className="lc-place"
              data-here={screen === 'REST'}
              data-testid="lc-place-rest"
              onClick={() => {
                setToast(null);
                setScreen('REST');
              }}
            >
              休息室
            </button>
            <button
              type="button"
              className="lc-place"
              data-here={screen === 'WC'}
              data-testid="lc-place-wc"
              onClick={() => {
                setToast(null);
                setScreen('WC');
              }}
            >
              洗手間
            </button>
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
            電話
            {ringing ? <span className="lc-badge">1</span> : null}
          </button>
        </header>
      ) : null}

      <div className="lc-stage">
        {screen === 'start' ? (
          <StartScreen
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

function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <section className="lc-start" aria-labelledby="lc-start-brand" data-testid="lc-start">
      <div className="lc-start-hero">
        <h1 id="lc-start-brand" className="lc-brand">
          單獨值夜
        </h1>
        <p className="lc-tagline">你是內科病房的值班醫生。今晚，病房只有你一人。</p>
        <div className="lc-cta-row">
          <button type="button" className="lc-btn lc-btn-primary" data-testid="lc-start-go" onClick={onStart}>
            開始值夜（DEMO）
          </button>
          <a className="lc-btn lc-btn-ghost" href="#/">
            正式版開始畫面
          </a>
        </div>
      </div>
      <div className="lc-start-meta">
        <span>職級 · MO</span>
        <span>班次 · 夜班</span>
        <span>病房 · 內科</span>
        <span>難度 · 中等</span>
      </div>
    </section>
  );
}

function FloorScreen({ onBed, onAnswer }: { onBed: () => void; onAnswer: () => void }) {
  return (
    <section className="lc-floor" aria-labelledby="lc-floor-heading" data-testid="lc-floor">
      <h2 id="lc-floor-heading">病房平面圖</h2>
      <div className="lc-plan-grid" role="group" aria-label="病床">
        {DEMO_BEDS.map((bed) => (
          <button
            key={bed.bed}
            type="button"
            className="lc-bed"
            data-level={bed.level}
            data-testid={`lc-bed-${String(bed.bed)}`}
            onClick={() => {
              if (bed.name) onBed();
            }}
          >
            <span className="lc-bed-no">{bed.bed}</span>
            <span className="lc-bed-mews">MEWS {bed.mews}</span>
            <span className="lc-bed-name">{bed.name ?? '空床'}</span>
          </button>
        ))}
      </div>
      <div className="lc-call-banner" data-testid="lc-call-banner">
        <p>
          來電：{DEMO_CALL.from} · 分機 {DEMO_CALL.ext} — {DEMO_CALL.text}
        </p>
        <div className="lc-call-actions">
          <button type="button" className="lc-btn lc-btn-primary" onClick={onAnswer}>
            接聽
          </button>
          <button type="button" className="lc-btn">
            稍後
          </button>
        </div>
      </div>
    </section>
  );
}

function BedsideScreen({
  chip,
  draft,
  onChip,
  onDraft,
  onSend,
}: {
  chip: (typeof CHIPS)[number] | null;
  draft: string;
  onChip: (value: (typeof CHIPS)[number] | null) => void;
  onDraft: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <section className="lc-bedside" aria-label="床邊" data-testid="lc-bedside">
      <div className="lc-bedside-cols">
        <article className="lc-panel" aria-labelledby="lc-body-heading">
          <div className="lc-panel-head">
            <h2 id="lc-body-heading">身形圖</h2>
            <span>
              {DEMO_PATIENT.bed} 床 · {DEMO_PATIENT.name}
            </span>
          </div>
          <div className="lc-body">
            <div className="lc-silhouette" aria-hidden="true" />
            <div className="lc-line-tags">
              {DEMO_LINES.map((line) => (
                <span key={line.id} className="lc-line-tag" data-at={line.at}>
                  {line.label}
                </span>
              ))}
            </div>
          </div>
        </article>

        <article className="lc-panel" aria-labelledby="lc-mon-heading">
          <div className="lc-panel-head">
            <h2 id="lc-mon-heading">心臟監察</h2>
            <span>
              {DEMO_PATIENT.age} 歲{DEMO_PATIENT.sex} · {DEMO_PATIENT.complaint}
            </span>
          </div>
          <div className="lc-monitor" data-testid="lc-monitor">
            <div className="lc-wave" aria-hidden="true" />
            <dl className="lc-vitals">
              <div className="lc-vital" data-kind="hr">
                <dt>HR</dt>
                <dd>{DEMO_VITALS.hr}</dd>
              </div>
              <div className="lc-vital" data-kind="rr">
                <dt>RR</dt>
                <dd>{DEMO_VITALS.rr}</dd>
              </div>
              <div className="lc-vital" data-kind="spo2">
                <dt>SpO2</dt>
                <dd>{DEMO_VITALS.spo2}%</dd>
              </div>
              <div className="lc-vital" data-kind="nibp">
                <dt>NIBP</dt>
                <dd>
                  {DEMO_VITALS.nibp} ({DEMO_VITALS.map})
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
                <strong>{report.label}</strong>
                <span>{report.detail}</span>
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
        <div className="lc-input-row">
          <input
            aria-label="輸入對話或指示"
            placeholder="輸入回應或指示…"
            value={draft}
            data-testid="lc-chat-input"
            onChange={(event) => {
              onDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSend();
            }}
          />
          <button type="button" className="lc-btn lc-btn-primary" onClick={onSend}>
            送出
          </button>
        </div>
        <div className="lc-chips" role="group" aria-label="快捷醫囑分類">
          {CHIPS.map((label) => (
            <button
              key={label}
              type="button"
              className="lc-chip"
              aria-pressed={chip === label}
              data-testid={`lc-chip-${label}`}
              onClick={() => {
                onChip(chip === label ? null : label);
              }}
            >
              {label}
            </button>
          ))}
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
    <section className="lc-landmark" aria-labelledby="lc-landmark-heading" data-testid={`lc-landmark-${id}`}>
      <h2 id="lc-landmark-heading">{place.title}</h2>
      <p>{place.hint}</p>
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
      <div>
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
          <h2>電話</h2>
          <button type="button" className="lc-btn" data-testid="lc-close-phone" onClick={onClose}>
            關閉
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
