/** Figma AL DOM — Start / Setup / Phone / Round / End. Handlers from LayoutGDemo. */
import {
  DEMO_PHONE_CHATS,
  DEMO_PHONE_CONTACTS,
  END_GRADE_ROWS,
  END_OUTCOMES,
  END_STATS,
  ROUND_QUESTION,
  type PhoneContact,
  type PhoneTab,
} from './fakeData';

function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

const SETUP_FIELDS: {
  key: 'rank' | 'difficulty' | 'ward' | 'shift' | 'ai';
  label: string;
  hint: string;
  options: { value: string; label: string }[];
}[] = [
  {
    key: 'rank',
    label: '職級 Rank',
    hint: 'AC、COS 不可選；影響個案複雜度與巡房難度',
    options: [
      { value: 'HO', label: 'HO House Officer' },
      { value: 'MO', label: 'MO Medical Officer' },
      { value: 'RES', label: 'RES Resident' },
    ],
  },
  {
    key: 'difficulty',
    label: '難度 Difficulty',
    hint: '影響使用中床位數、個案複雜度、電話量及護士資歷',
    options: [
      { value: 'EASY', label: '簡單 EASY' },
      { value: 'MEDIUM', label: '中等 MEDIUM' },
      { value: 'HARD', label: '困難 HARD' },
    ],
  },
  {
    key: 'ward',
    label: '病房 Ward',
    hint: '現階段只有內科及外科；其餘日後開放',
    options: [
      { value: 'MED', label: '內科病房 MED' },
      { value: 'SURG', label: '外科病房 SURG' },
    ],
  },
  {
    key: 'shift',
    label: '班次模式 Shift mode',
    hint: '超時最多 2 小時，之後強制交更',
    options: [
      { value: 'DAY', label: '日班 DAY 08:00–18:00' },
      { value: 'NIGHT', label: '夜班 NIGHT 18:00–08:00' },
    ],
  },
  {
    key: 'ai',
    label: 'AI 設定 API',
    hint: 'API key 只存放在這個瀏覽器',
    options: [
      { value: '標準', label: '已就緒 Ready' },
      { value: '嚴格', label: '嚴格 Strict' },
      { value: '關閉', label: '關閉 Off' },
    ],
  },
];

/** Dark main menu — Figma node 155:517 deleted; keep demo gate with token colours. */
export function StartScreen({
  onNew,
  onContinue,
  onEnd,
}: {
  onNew: () => void;
  onContinue: () => void;
  onEnd: () => void;
}) {
  return (
    <section
      className="fal-start"
      data-testid="lg-start"
      data-node-id="155:517-deleted"
      data-name="00 Start · dark gate"
      aria-labelledby="lg-start-title"
    >
      <div className="fal-start-glow" aria-hidden />
      <div className="fal-start-panel" data-name="Start Panel">
        <p className="fal-t-start-kicker">On-Call Alone · Layout G DEMO</p>
        <h1 id="lg-start-title" className="fal-t-start-title">
          單獨值夜
        </h1>
        <p className="fal-t-start-sub">等角病房外殼 · 假數據 isometric shell</p>
        <div className="fal-start-actions">
          <button
            type="button"
            className="fal-cta"
            data-testid="lg-start-new"
            onClick={onNew}
          >
            <p className="fal-t-cta">開始值班 Start Shift</p>
          </button>
          <button
            type="button"
            className="fal-ghost-btn"
            data-testid="lg-start-go"
            onClick={onContinue}
          >
            <p className="fal-t-ghost">繼續 Continue → Floor</p>
          </button>
          <button type="button" className="fal-ghost-btn" data-testid="lg-start-end" onClick={onEnd}>
            <p className="fal-t-ghost">成績表 End</p>
          </button>
          <a className="fal-t-link" href="#/">
            返回正式開始畫面 Main start
          </a>
        </div>
      </div>
    </section>
  );
}

export function SetupScreen({
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
  const summary = `你的選擇：${
    setup.ward === 'MED' ? '內科病房 MED' : '外科病房 SURG'
  } · ${setup.rank} · ${
    setup.difficulty === 'EASY' ? '簡單' : setup.difficulty === 'HARD' ? '困難' : '中等'
  } · ${setup.shift === 'NIGHT' ? '夜班 NIGHT' : '日班 DAY'}`;

  return (
    <section
      className="fal-setup"
      data-testid="lg-setup"
      data-node-id="159:517"
      data-name="00 Start · 新遊戲設定 Setup"
    >
      <img
        className="fal-setup-ellipse"
        src={asset('demo/layout-g/setup-ellipse.svg')}
        alt=""
        data-node-id="159:518"
        data-name="Ellipse"
        aria-hidden
      />
      <p className="fal-t-setup-hero" data-node-id="159:519">
        單獨值夜
      </p>
      <div className="fal-setup-row-main" data-node-id="170:1614">
        <div className="fal-setup-form-wrap" data-node-id="170:780">
          <div className="fal-setup-panel" data-node-id="159:523" data-name="Settings Panel">
            {SETUP_FIELDS.map((f) => (
              <label key={f.key} className="fal-setup-field" data-name={`Row ${f.label}`}>
                <span className="fal-setup-label">
                  <span className="fal-t-setup-label">{f.label}</span>
                  <span className="fal-t-setup-hint">{f.hint}</span>
                </span>
                <span className="fal-fill-spacer" />
                <span className="fal-setup-drop">
                  <select
                    className="fal-setup-select"
                    value={setup[f.key]}
                    aria-label={f.label}
                    onChange={(e) => {
                      onSetup({ ...setup, [f.key]: e.target.value });
                    }}
                  >
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <span className="fal-t-setup-caret" aria-hidden>
                    ▾
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="fal-setup-hero-wrap" data-node-id="170:1325">
          <div
            className="fal-setup-hero"
            data-node-id="160:517"
            data-name="Hero Illustration"
            style={{ backgroundImage: `url(${asset('demo/layout-g/isometric-hospital.png')})` }}
            role="img"
            aria-label="Isometric hospital"
          />
        </div>
      </div>
      <p className="fal-t-setup-summary" data-node-id="159:564">
        {summary}
      </p>
      <button
        type="button"
        className="fal-cta fal-setup-cta"
        data-node-id="159:565"
        data-name="CTA"
        data-testid="lg-setup-start"
        onClick={onStart}
      >
        <p className="fal-t-cta">開始值班 Start Shift</p>
      </button>
      <button type="button" className="fal-ghost-btn-light fal-setup-back" onClick={onBack}>
        <p className="fal-t-ghost-dark">返回 Back</p>
      </button>
      <p className="fal-t-setup-disclaimer" data-node-id="159:567">
        免責聲明：本遊戲為教學用途，病例全部虛構，並非臨床指引。
      </p>
    </section>
  );
}

export function PhoneScreen({
  tab,
  onTab,
  chatWith,
  onOpenChat,
  onCloseChat,
  onClose,
  onCall,
}: {
  tab: PhoneTab;
  onTab: (t: PhoneTab) => void;
  chatWith: PhoneContact | null;
  onOpenChat: (c: PhoneContact) => void;
  onCloseChat: () => void;
  onClose: () => void;
  onCall: (who: string) => void;
}) {
  if (chatWith) {
    const thread = DEMO_PHONE_CHATS[chatWith.chatKey];
    return (
      <section
        className="fal-phone"
        data-testid="lg-phone-screen"
        data-node-id={chatWith.kind === 'specialty' ? '74:1146' : '74:1114'}
        data-name={
          chatWith.kind === 'specialty' ? '08b Phone · Call Specialty' : '08 Phone · Call Senior/Junior'
        }
      >
        <p className="fal-t-phone-demo">
          {chatWith.kind === 'specialty'
            ? 'Demo B · Chat Specialty (WhatsApp-style)'
            : 'Demo A · Chat Senior / Junior (WhatsApp-style)'}
        </p>
        <div className="fal-phone-device" data-name="Phone Device">
          <div className="fal-phone-screen" data-name="Screen">
            <header className="fal-phone-chat-head">
              <button
                type="button"
                className="fal-phone-back"
                data-testid="lg-phone-chat-back"
                aria-label="返回聯絡人"
                onClick={onCloseChat}
              >
                <p className="fal-t-phone-back">←</p>
              </button>
              <div className="fal-phone-avatar">
                <p className="fal-t-phone-avatar">{chatWith.initial}</p>
              </div>
              <div className="fal-phone-who">
                <p className="fal-t-phone-name">{chatWith.name}</p>
                <p className="fal-t-phone-role">{chatWith.subtitle}</p>
              </div>
            </header>
            <div className="fal-phone-thread" data-name="Chat Thread">
              {thread.map((m) => (
                <div
                  key={m.id}
                  className={m.dir === 'out' ? 'fal-phone-row-out' : 'fal-phone-row-in'}
                  data-name={m.dir === 'out' ? 'Row Out' : 'Row In'}
                >
                  <div
                    className={m.dir === 'out' ? 'fal-bubble-out' : 'fal-bubble-in'}
                    data-name={m.dir === 'out' ? 'Bubble Out' : 'Bubble In'}
                  >
                    <p className="fal-t-bubble">{m.text}</p>
                    <div className="fal-bubble-meta">
                      <p className="fal-t-bubble-meta">{m.time}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="fal-phone-composer">
              <div className="fal-phone-input">
                <p className="fal-t-phone-placeholder">輸入訊息… Type message…</p>
              </div>
              <button
                type="button"
                className="fal-phone-send"
                aria-label="送出"
                onClick={() => {
                  onCall(`${chatWith.subtitle} ${chatWith.name}`);
                }}
              >
                <p className="fal-t-phone-send">➤</p>
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const groups: { id: PhoneTab; label: string; contacts: PhoneContact[] }[] = [
    { id: 'specialties', label: '專科 Specialties', contacts: DEMO_PHONE_CONTACTS.specialties },
    { id: 'seniors', label: '上級 Seniors', contacts: DEMO_PHONE_CONTACTS.seniors },
    { id: 'juniors', label: '下級 Juniors', contacts: DEMO_PHONE_CONTACTS.juniors },
  ];

  return (
    <section
      className="fal-phone"
      data-testid="lg-phone-screen"
      data-node-id="35:815"
      data-name="07 Phone"
    >
      <p className="fal-t-phone-demo" data-node-id="52:420">
        手機通話 Phone overlay
      </p>
      <div className="fal-phone-device fal-phone-device-bezel" data-node-id="52:421" data-name="Phone Device">
        <div className="fal-phone-screen fal-phone-screen-light" data-node-id="52:422" data-name="Screen">
          <div className="fal-phone-status">
            <p className="fal-t-phone-status">18:05</p>
            <div className="fal-phone-status-right">
              <p className="fal-t-phone-status-sm">▮▮▮</p>
              <p className="fal-t-phone-status-sm">100%</p>
            </div>
          </div>
          <div className="fal-phone-title-row">
            <p className="fal-t-phone-title">訊息 Messages</p>
            <button
              type="button"
              className="fal-phone-close"
              data-testid="lg-phone-close"
              aria-label="close"
              onClick={onClose}
            >
              <p className="fal-t-phone-close">✕</p>
            </button>
          </div>
          <div className="fal-phone-search">
            <div className="fal-phone-search-box">
              <p className="fal-t-phone-placeholder">搜尋聯絡人… Search contacts…</p>
            </div>
          </div>
          <div className="fal-phone-tabs-mini">
            {(
              [
                ['seniors', '上級'],
                ['juniors', '下級'],
                ['specialties', '專科'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="fal-phone-tab"
                data-selected={tab === id}
                onClick={() => {
                  onTab(id);
                }}
              >
                <p className="fal-t-phone-tab">{label}</p>
              </button>
            ))}
          </div>
          <div className="fal-phone-contacts" data-name="Contacts">
            {groups
              .filter((g) => g.id === tab)
              .map((g) => (
                <div key={g.id}>
                  <div className="fal-phone-section">
                    <p className="fal-t-phone-section">{g.label}</p>
                  </div>
                  {g.contacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="fal-phone-contact"
                      data-testid={`lg-phone-contact-${c.id}`}
                      onClick={() => {
                        onOpenChat(c);
                      }}
                    >
                      <div className="fal-phone-contact-av" style={{ background: c.color }}>
                        <p className="fal-t-phone-avatar-w">{c.initial}</p>
                      </div>
                      <div className="fal-phone-contact-text">
                        <p className="fal-t-phone-contact-name">{c.name}</p>
                        <p className="fal-t-phone-contact-sub">{c.subtitle}</p>
                      </div>
                      <div className="fal-phone-call-dot" aria-hidden>
                        <p className="fal-t-phone-call">☎</p>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
          </div>
          <div className="fal-phone-home">
            <div className="fal-phone-home-bar" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function RoundScreen({
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
    <section
      className="fal-round"
      data-testid="lg-round-screen"
      data-node-id="161:517"
      data-name="05 Doctor Round · 巡房 Draft"
    >
      <div className="fal-round-head" data-node-id="170:1669">
        <div className="fal-round-titles" data-node-id="170:1666">
          <p className="fal-t-round-h1" data-node-id="161:518">
            巡房 Doctor Round
          </p>
          <p className="fal-t-round-host" data-node-id="161:519">
            莫教授 Prof. Mok · AC · 主持巡房 Host
          </p>
        </div>
        <div className="fal-round-chips" data-node-id="161:520">
          <div className="fal-round-chip">
            <p className="fal-t-round-chip">第 1 次巡房 · 共 3 次</p>
          </div>
          <div className="fal-round-chip">
            <p className="fal-t-round-chip">巡房 1 ／ 3</p>
          </div>
          <button type="button" className="fal-ghost-btn-light" onClick={onLeave}>
            <p className="fal-t-ghost-dark">離開 Leave</p>
          </button>
        </div>
      </div>
      <div className="fal-round-pause-wrap" data-node-id="170:1667">
        <div className="fal-round-pause" data-node-id="161:525">
          <p className="fal-t-round-pause">⏸ 時間暫停 Paused · 巡房期間不會有來電及護士呼叫</p>
        </div>
      </div>
      <div className="fal-round-body" data-node-id="170:1661">
        <div className="fal-round-case-wrap" data-node-id="170:1660">
          <div className="fal-round-case" data-node-id="161:527">
            <div className="fal-round-case-top" data-node-id="161:528">
              <p className="fal-t-round-patient" data-node-id="161:529">
                {q.bedLabel} {q.patient}
              </p>
              <div className="fal-round-chip">
                <p className="fal-t-round-chip">病史 HISTORY</p>
              </div>
              <div className="fal-round-chip fal-round-chip-warn">
                <p className="fal-t-round-chip-warn">MEWS {q.mews} · CAUTION</p>
              </div>
            </div>
            <p className="fal-t-round-q" data-node-id="161:534">
              {q.promptChi}
            </p>
            <p className="fal-t-round-loading" data-node-id="161:535">
              AC 正在翻閱病歷…… Loading case notes
            </p>
          </div>
        </div>
        <div className="fal-round-mcq" data-node-id="161:536">
          <p className="fal-t-round-mcq-h" data-node-id="161:537">
            選擇答案 MCQ — 選一項
          </p>
          {q.choices.map((c) => {
            const selected = pick === c.id;
            return (
              <button
                key={c.id}
                type="button"
                className="fal-mcq"
                data-name={`MCQ ${c.id}`}
                data-selected={selected}
                onClick={() => {
                  onPick(c.id);
                }}
              >
                <span className="fal-mcq-letter" data-selected={selected}>
                  <p className="fal-t-mcq-letter" data-selected={selected}>
                    {c.id}
                  </p>
                </span>
                <p className="fal-t-mcq" data-selected={selected}>
                  {c.text}
                </p>
              </button>
            );
          })}
          <div className="fal-round-rule" />
          <p className="fal-t-round-mcq-h">或自由回答 Or answer in your own words</p>
          <div className="fal-round-free" data-node-id="161:556" data-name="Free Text">
            <textarea
              className="fal-round-textarea"
              placeholder="輸入你的回答 Type your answer…"
              rows={3}
              aria-label="自由回答 Free text"
            />
          </div>
          <p className="fal-t-round-hint" data-node-id="161:558">
            提示 Hints（可選多於一項；不是每項都正確）：聽診肺部 · BNP · 床邊 ECG
          </p>
          <div className="fal-round-actions" data-node-id="161:559">
            <button
              type="button"
              className="fal-cta-sm"
              data-testid="lg-round-submit"
              disabled={!pick}
              onClick={onSubmit}
            >
              <p className="fal-t-cta-sm">回答 Submit</p>
            </button>
            <button type="button" className="fal-ghost-btn-light" onClick={onLeave}>
              <p className="fal-t-ghost-dark">不作答 Pass</p>
            </button>
            <button type="button" className="fal-ghost-btn-light">
              <p className="fal-t-ghost-dark">提交已選提示 Submit hints</p>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function RoundFeedback({ pick, onNext }: { pick: string | null; onNext: () => void }) {
  const q = ROUND_QUESTION;
  const ok = pick === q.correct;
  const chosen = q.choices.find((c) => c.id === pick);
  return (
    <section
      className="fal-round"
      data-testid="lg-round-feedback"
      data-node-id="161:566"
      data-name="05b Doctor Round · 判決 Feedback"
    >
      <div className="fal-round-titles fal-round-verdict-head" data-node-id="170:1664">
        <p className="fal-t-round-h1" data-node-id="161:567">
          巡房 · 判決 Verdict
        </p>
        <p className="fal-t-round-host" data-node-id="161:568">
          莫教授 Prof. Mok · AC 的回覆 Reply
        </p>
      </div>
      <div className="fal-round-verdict-body" data-node-id="170:1663">
        <div className="fal-round-case" data-node-id="150:572">
          <div className="fal-round-case-top">
            <p className="fal-t-round-patient">
              {q.bedLabel} {q.patient}
            </p>
            <div className="fal-round-chip">
              <p className="fal-t-round-chip">病史 HISTORY</p>
            </div>
            <div className="fal-round-chip fal-round-chip-warn">
              <p className="fal-t-round-chip-warn">MEWS {q.mews} · CAUTION</p>
            </div>
          </div>
          <p className="fal-t-round-q">{q.promptChi}</p>
          <p className="fal-t-round-loading">AC 正在翻閱病歷…… Loading case notes</p>
        </div>
        <div
          className="fal-round-verdict"
          data-node-id="161:569"
          data-ok={ok}
        >
          <p className="fal-t-verdict" data-ok={ok}>
            {ok ? '答對 CORRECT ✓' : '再想想 Review'}
          </p>
          <p className="fal-t-verdict-ans">
            你的回答：{chosen?.text ?? '—'}
            {pick ? `（MCQ 選項 ${pick}）` : ''}
          </p>
          <p className="fal-t-verdict-teach-h">
            教學要點 Teaching points（來自內容表，不是 AI 生成）
          </p>
          <p className="fal-t-verdict-ok">✓ 已答中：{q.hit}</p>
          <p className="fal-t-verdict-miss">✗ 未提及：{q.miss}</p>
          <p className="fal-t-verdict-score">{q.scoring}</p>
        </div>
        <div className="fal-round-actions" data-node-id="161:579">
          <button type="button" className="fal-cta-sm" onClick={onNext}>
            <p className="fal-t-cta-sm">下一位病人 Next patient</p>
          </button>
          <button type="button" className="fal-ghost-btn-light" onClick={onNext}>
            <p className="fal-t-ghost-dark">完成巡房 Finish round</p>
          </button>
        </div>
      </div>
    </section>
  );
}

export function EndScreen({ onAgain }: { onAgain: () => void }) {
  return (
    <section
      className="fal-end"
      data-testid="lg-end"
      data-node-id="136:583"
      data-name="99 End · 成績表 Grade Report"
    >
      <div className="fal-end-outer" data-node-id="149:647" />
      <div className="fal-end-inner" data-node-id="149:648" />
      <header className="fal-end-header" data-node-id="149:649" data-name="Header">
        <img
          src={asset('demo/layout-g/end-logo.svg')}
          alt=""
          width={44}
          height={44}
          data-node-id="149:650"
        />
        <p className="fal-t-end-brand" data-node-id="149:656">
          單獨值夜 ON-CALL ALONE
        </p>
        <p className="fal-t-end-title" data-node-id="149:657">
          交更成績表 Shift Report
        </p>
        <p className="fal-t-end-meta" data-node-id="149:658">
          夜班 NIGHT · 18:00 → 08:12 · 內科病房 MED · 職級 MO · 難度 中等 MEDIUM
        </p>
        <div className="fal-end-meta-row" data-node-id="149:659">
          <div className="fal-end-chip fal-end-chip-ok">
            <p className="fal-t-end-chip-ok">正常交更 Normal handover</p>
          </div>
          <p className="fal-t-end-note">結局不設總分，分項各自列出</p>
        </div>
      </header>
      <div className="fal-end-stamp" data-node-id="149:663" data-name="Stamp">
        <div className="fal-end-stamp-ring">
          <p className="fal-t-stamp-1">已交更</p>
          <p className="fal-t-stamp-2">SHIFT HANDED OVER</p>
          <p className="fal-t-stamp-3">08:12</p>
        </div>
      </div>
      <div className="fal-end-table" data-node-id="149:667" data-name="Grade Table">
        {END_GRADE_ROWS.map((row) => (
          <div key={row.id} className="fal-end-row">
            <div className="fal-end-row-text">
              <p className="fal-t-end-row-title">{row.title}</p>
              <p className="fal-t-end-row-detail">{row.detail}</p>
            </div>
            <span className="fal-fill-spacer fal-end-dash" />
            <div className="fal-end-bars">
              {[0, 1, 2, 3].map((i) => (
                <i
                  key={i}
                  className="fal-end-bar"
                  data-on={i < row.filled}
                  data-tone={row.tone}
                />
              ))}
            </div>
            <div className="fal-end-chip" data-tone={row.tone}>
              <p className="fal-t-end-chip" data-tone={row.tone}>
                {row.grade}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="fal-end-outcomes" data-node-id="149:740">
        <p className="fal-t-end-section">病人結局 Patient outcomes</p>
        {END_OUTCOMES.map((o) => (
          <div key={o.id} className="fal-end-outcome">
            <p className="fal-t-end-outcome-name">{o.name}</p>
            <span className="fal-fill-spacer fal-end-dash" />
            <div className="fal-end-chip" data-tone={o.tone}>
              <p className="fal-t-end-chip" data-tone={o.tone}>
                {o.status}
              </p>
            </div>
            <div className="fal-end-chip" data-tone={o.tagTone}>
              <p className="fal-t-end-chip" data-tone={o.tagTone}>
                {o.tag}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="fal-end-stats" data-node-id="149:770">
        <p className="fal-t-end-section">本局統計 Shift stats</p>
        {END_STATS.map((line) => (
          <p key={line} className="fal-t-end-stat">
            {line}
          </p>
        ))}
      </div>
      <div className="fal-end-actions" data-node-id="149:775">
        <button type="button" className="fal-end-btn-primary">
          <p className="fal-t-end-btn-primary">查看詳細回顧 View review</p>
        </button>
        <button type="button" className="fal-end-btn">
          <p className="fal-t-end-btn">儲存結果 Save</p>
        </button>
        <button type="button" className="fal-end-btn" onClick={onAgain}>
          <p className="fal-t-end-btn">返回主頁 Home</p>
        </button>
      </div>
      <p className="fal-t-end-tutor" data-node-id="149:783">
        導師簽署 Tutor：莫教授 Prof. Mok
      </p>
      <p className="fal-t-end-disclaimer" data-node-id="149:784">
        免責聲明：本遊戲為教學用途，病例全部虛構，並非臨床指引。
      </p>
    </section>
  );
}
