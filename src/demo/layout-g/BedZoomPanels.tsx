/** Bed Zoom cards — JSX rebuilt 1:1 from Figma MCP Auto Layout nodes. */
import {
  DEMO_ACTION_LOG,
  DEMO_BODY_MARKERS,
  DEMO_MAR,
  DEMO_NEURO,
  DEMO_PATIENT,
  DEMO_RESULTS,
  marFilterMatch,
  type MarFilter,
  type ResultFilter,
} from './fakeData';

function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

export function MedicalRecordCard({
  collapsed,
  onCollapse,
}: {
  collapsed: boolean;
  onCollapse: () => void;
}) {
  return (
    <div
      className="fal-col fal-fill-x"
      data-node-id="56:414"
      data-name="Medical Record"
      style={{ height: '100%' }}
    >
      <div
        className="fal-card"
        data-pad="14-12"
        data-node-id="35:507"
        data-name="Medical Record"
        data-collapsed={collapsed}
      >
        <div className="fal-card-head" data-node-id="51:965" data-name="Card Header">
          <p className="fal-t-card-title-hud" data-node-id="51:966">
            病歷 Medical Record
          </p>
        </div>
        {!collapsed ? (
          <>
            <div className="fal-field" data-node-id="46:566" data-name="背景 Background">
              <p className="fal-t-label" data-node-id="46:567">
                背景 Background
              </p>
              <p className="fal-t-value" data-node-id="46:568">
                {DEMO_PATIENT.name} · {DEMO_PATIENT.age} · {DEMO_PATIENT.sexLabel}
              </p>
            </div>
            <div
              className="fal-field"
              data-node-id="46:569"
              data-name="入院原因 Reason for Admission"
            >
              <p className="fal-t-label" data-node-id="46:570">
                入院原因 Reason for Admission
              </p>
              <p className="fal-t-value" data-node-id="46:571">
                {DEMO_PATIENT.complaint}
              </p>
            </div>
            <div className="fal-field" data-node-id="46:572" data-name="既往病史 PMH">
              <p className="fal-t-label" data-node-id="46:573">
                既往病史 PMH
              </p>
              <p className="fal-t-value" data-node-id="46:574">
                {DEMO_PATIENT.pmh}
              </p>
            </div>
            <div className="fal-field" data-node-id="46:575" data-name="過敏 Allergies">
              <p className="fal-t-label" data-node-id="46:576">
                過敏 Allergies
              </p>
              <p className="fal-t-value" data-node-id="46:577">
                {DEMO_PATIENT.allergies}
              </p>
            </div>
            <div
              className="fal-col"
              data-node-id="46:578"
              data-name="最近化驗與影像 Results"
              style={{ gap: 4, width: '100%' }}
            >
              <p className="fal-t-section" data-node-id="86:622">
                最近化驗與影像 Results
              </p>
              <p
                className="fal-t-muted-11"
                data-node-id="86:623"
                style={{ whiteSpace: 'normal', width: '100%' }}
              >
                01:40 · CXR：Right lower zone consolidation. No pleural effusion or pneumothorax.
              </p>
              <p className="fal-t-muted-11" data-node-id="86:624">
                01:51 · ABG：pH 7.43 · pCO₂ 4.4 · pO₂ 8.6 L · HCO₃ 22.5 · Lac 2.4 H
              </p>
            </div>
            <div className="fal-field" data-node-id="46:581" data-name="目前診斷 Diagnosis">
              <p className="fal-t-label" data-node-id="46:582">
                目前診斷 Diagnosis
              </p>
              <p className="fal-t-value" data-node-id="46:583">
                {DEMO_PATIENT.diagnosis}
              </p>
            </div>
          </>
        ) : null}
        <button
          type="button"
          className="fal-collapse"
          data-node-id="58:487"
          data-name="Collapse [^]"
          aria-label="collapse"
          onClick={onCollapse}
        >
          <p className="fal-t-collapse" data-node-id="58:488">
            ⌃
          </p>
        </button>
      </div>
    </div>
  );
}

const MAR_FILTERS: { id: MarFilter; label: string }[] = [
  { id: 'all', label: '全部 All' },
  { id: 'due', label: '待給 Due' },
  { id: 'inf', label: '輸注中 Inf' },
  { id: 'reg', label: '常規 Reg' },
  { id: 'prn', label: 'PRN' },
  { id: 'given', label: '已給 Given' },
];

const SECTION_LABEL: Record<string, string> = {
  due: '待給 Due',
  inf: '輸注中 Infusing',
  reg: '常規 Regular',
  prn: '按需要 PRN',
  given: '已給 Given',
};

export function MarCard({
  collapsed,
  filter,
  onFilter,
  onCollapse,
}: {
  collapsed: boolean;
  filter: MarFilter;
  onFilter: (f: MarFilter) => void;
  onCollapse: () => void;
}) {
  const rows = DEMO_MAR.filter((r) => marFilterMatch(r, filter));
  const sections = (['due', 'inf', 'reg', 'prn', 'given'] as const).filter((s) =>
    rows.some((r) => r.section === s),
  );

  return (
    <div
      className="fal-card"
      data-kind="mar"
      data-node-id="114:1439"
      data-name="藥物醫囑及給藥 MAR v2"
      data-testid="lg-mar"
      data-collapsed={collapsed}
    >
      <div
        className="fal-row fal-fill-x"
        data-node-id="114:1440"
        data-name="Card Header"
        style={{ justifyContent: 'flex-start' }}
      >
        <p className="fal-t-card-title" data-node-id="114:1441">
          藥物醫囑及給藥 Medication / MAR
        </p>
      </div>
      <button
        type="button"
        className="fal-collapse"
        data-node-id="114:1442"
        data-name="Collapse [^]"
        aria-label="collapse"
        onClick={onCollapse}
      >
        <p className="fal-t-collapse-12" data-node-id="114:1443">
          ⌃
        </p>
      </button>
      {!collapsed ? (
        <>
          <div
            className="fal-row fal-fill-x"
            data-node-id="114:1444"
            data-name="Filter Chips"
            style={{ gap: 5, justifyContent: 'flex-start' }}
          >
            {MAR_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className="fal-chip"
                data-selected={filter === f.id}
                onClick={() => {
                  onFilter(f.id);
                }}
              >
                <p className="fal-t-8" style={{ color: filter === f.id ? '#1a1a1a' : '#737880' }}>
                  {f.label}
                </p>
              </button>
            ))}
          </div>
          {sections.map((section) => (
            <div key={section} className="fal-col fal-fill-x" style={{ gap: 4, width: '100%' }}>
              <div className="fal-row fal-fill-x" style={{ gap: 6, justifyContent: 'flex-start' }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background:
                      section === 'due'
                        ? '#b86b0d'
                        : section === 'inf'
                          ? '#004dbf'
                          : section === 'given'
                            ? '#148c4d'
                            : '#737880',
                    flexShrink: 0,
                  }}
                  aria-hidden
                />
                <p className="fal-t-9" style={{ color: '#737880' }}>
                  {SECTION_LABEL[section]}
                </p>
                <div className="fal-fill-spacer" style={{ background: '#d9dee3', height: 1 }} />
              </div>
              {rows
                .filter((r) => r.section === section)
                .map((row) => (
                  <div
                    key={row.id}
                    className="fal-row fal-fill-x"
                    style={{ gap: 10, alignItems: 'flex-start', padding: '3px 0', width: '100%' }}
                  >
                    <div className="fal-col" style={{ width: 38, flexShrink: 0 }}>
                      <p className="fal-t-8" style={{ color: '#737880' }}>
                        {row.startDate}
                      </p>
                    </div>
                    <div className="fal-col" style={{ gap: 2, width: 188, flexShrink: 0 }}>
                      <div className="fal-row" style={{ gap: 5, justifyContent: 'flex-start' }}>
                        <span className="fal-chip" data-route={row.route}>
                          <p className="fal-t-8b">{row.routeLabel}</p>
                        </span>
                        <p className="fal-t-10" style={{ color: '#1a1a1a' }}>
                          {row.drug}
                        </p>
                        {row.vetted ? (
                          <img
                            src={asset('demo/layout-g/pharmacy-vetted.svg')}
                            alt=""
                            width={12}
                            height={12}
                          />
                        ) : null}
                      </div>
                      <p className="fal-t-9" style={{ color: '#004dbf' }}>
                        {row.doseLine}
                      </p>
                    </div>
                    <div className="fal-col" style={{ width: 150, flexShrink: 0 }}>
                      {row.right.kind === 'due' ? (
                        <span
                          className="fal-chip"
                          style={{
                            background: 'rgba(184,107,13,0.15)',
                            border: '1px solid #b86b0d',
                          }}
                        >
                          <p className="fal-t-8b" style={{ color: '#b86b0d' }}>
                            • {row.right.time}
                          </p>
                        </span>
                      ) : null}
                      {row.right.kind === 'inf' ? (
                        <div
                          style={{
                            width: '100%',
                            height: 8,
                            background: '#d9dee3',
                            borderRadius: 4,
                            overflow: 'hidden',
                          }}
                        >
                          <i
                            style={{
                              display: 'block',
                              height: '100%',
                              width: `${String(Math.round(row.right.progress * 100))}%`,
                              background: '#004dbf',
                            }}
                          />
                        </div>
                      ) : null}
                      {row.right.kind === 'reg' ? (
                        <div
                          className="fal-row"
                          style={{ gap: 4, flexWrap: 'wrap', justifyContent: 'flex-start' }}
                        >
                          {row.right.ticks.map((t) => (
                            <span key={t.label} className="fal-chip">
                              <p className="fal-t-8" style={{ color: '#737880' }}>
                                {t.label}
                              </p>
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {row.right.kind === 'prn' ? (
                        <span className="fal-chip">
                          <p className="fal-t-8" style={{ color: '#737880' }}>
                            上一劑 {row.right.last} · 可給 {row.right.next}
                          </p>
                        </span>
                      ) : null}
                      {row.right.kind === 'given' ? (
                        <span className="fal-chip" style={{ background: 'rgba(20,140,77,0.12)' }}>
                          <p className="fal-t-8b" style={{ color: '#148c4d' }}>
                            ✓ {row.right.time}
                          </p>
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}

const MARKER_COLORS: Record<string, string> = {
  teal: '#338c8c',
  purple: '#8059bf',
  amber: '#e58c26',
  blue: '#4085d9',
  red: '#d94d4d',
};

export function BodyDiagramCard({
  collapsed,
  onCollapse,
}: {
  collapsed: boolean;
  onCollapse: () => void;
}) {
  return (
    <div
      className="fal-card"
      data-kind="body"
      data-node-id="42:497"
      data-name="Body Diagram Card"
      data-testid="lg-body"
      data-collapsed={collapsed}
    >
      <div className="fal-card-head" data-name="Card Header" style={{ overflow: 'hidden' }}>
        <p className="fal-t-card-title-hud">身體圖 Body Diagram</p>
      </div>
      <button
        type="button"
        className="fal-collapse"
        style={{ top: 12 }}
        data-name="Collapse [^]"
        aria-label="collapse"
        onClick={onCollapse}
      >
        <p className="fal-t-collapse">⌃</p>
      </button>
      {!collapsed ? (
        <>
          <div
            className="fal-col fal-fill-x"
            data-name="NeuroStrip"
            style={{ gap: 6, padding: '8px 10px', borderRadius: 10, width: '100%' }}
          >
            {DEMO_NEURO.map((n) => (
              <div
                key={n.id}
                className="fal-row fal-fill-x"
                data-name={`Neuro ${n.label}`}
                style={{
                  height: 24,
                  justifyContent: 'space-between',
                  overflow: 'hidden',
                  width: '100%',
                }}
              >
                <div className="fal-row" style={{ gap: 8, justifyContent: 'flex-start' }}>
                  <p className="fal-t-11m" style={{ color: '#738594' }}>
                    {n.label}
                  </p>
                  <p className="fal-t-11m" style={{ color: '#242e3d', fontWeight: 700 }}>
                    {n.value}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`refresh ${n.label}`}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: 0,
                    background: '#e5edf5',
                    color: '#738594',
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  ↻
                </button>
              </div>
            ))}
          </div>
          <div
            data-name="Diagram Stage"
            style={{
              position: 'relative',
              width: '100%',
              height: 420,
              background: '#edf2f7',
              borderRadius: 12,
              flexShrink: 0,
            }}
          >
            <img
              src={asset('demo/layout-g/body-silhouette.svg')}
              alt=""
              width={190}
              height={380}
              style={{ position: 'absolute', left: 66, top: 20 }}
            />
            {DEMO_BODY_MARKERS.map((m) => (
              <span
                key={m.id}
                data-name={`Marker ${m.label}`}
                style={{
                  position: 'absolute',
                  left: `${String(m.x)}%`,
                  top: `${String(m.y)}%`,
                  transform: 'translate(-50%, -50%)',
                  background: MARKER_COLORS[m.tone] ?? '#8059bf',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '0 8px',
                  fontFamily: "Inter, 'DM Sans', 'Noto Sans TC', sans-serif",
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: 'normal',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.label}
              </span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function ResultsAndLog({
  resultsCollapsed,
  logCollapsed,
  filter,
  onFilter,
  onCollapseResults,
  onCollapseLog,
}: {
  resultsCollapsed: boolean;
  logCollapsed: boolean;
  filter: ResultFilter;
  onFilter: (f: ResultFilter) => void;
  onCollapseResults: () => void;
  onCollapseLog: () => void;
}) {
  const rows = DEMO_RESULTS.filter((r) => filter === 'all' || r.filter === filter);
  return (
    <div
      className="fal-right-lower"
      data-node-id="51:977"
      data-name="Right Lower Panels"
      style={{ height: '100%' }}
    >
      <div
        className="fal-card"
        data-kind="results"
        data-node-id="129:947"
        data-name="報告 Results"
        data-testid="lg-results"
        data-collapsed={resultsCollapsed}
        style={{ flex: '1 1 auto', minHeight: 0 }}
      >
        <div
          className="fal-row fal-fill-x"
          data-node-id="129:948"
          data-name="Card Header"
          style={{ gap: 8, justifyContent: 'flex-start' }}
        >
          <p className="fal-t-card-title" data-node-id="129:949">
            報告 Results
          </p>
          <div
            className="fal-row"
            data-node-id="129:950"
            data-name="Result Filters SVG"
            style={{ gap: 6 }}
          >
            {(
              [
                { id: 'all' as const, label: '全部 All' },
                { id: 'labs' as const, label: 'Labs' },
                { id: 'radiology' as const, label: 'Radiology' },
                { id: 'poct' as const, label: 'POCT' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                className="fal-filter-icon"
                data-selected={filter === f.id}
                title={f.label}
                aria-label={f.label}
                onClick={() => {
                  onFilter(f.id);
                }}
              >
                {f.id === 'poct' ? (
                  <img src={asset('demo/layout-g/filter-poct.svg')} alt="" width={28} height={28} />
                ) : (
                  <span
                    aria-hidden
                    style={{
                      display: 'block',
                      width: 14,
                      height: 14,
                      margin: '7px auto',
                      background: filter === f.id ? '#1a1a1a' : '#737880',
                      borderRadius: 2,
                    }}
                  />
                )}
              </button>
            ))}
          </div>
          <div className="fal-fill-spacer" />
          <button
            type="button"
            className="fal-filter-icon"
            data-node-id="129:967"
            data-name="Collapse [^]"
            aria-label="collapse results"
            onClick={onCollapseResults}
            style={{ position: 'relative', top: 0, right: 0, boxShadow: 'none' }}
          >
            <p className="fal-t-collapse-12">⌃</p>
          </button>
        </div>
        {!resultsCollapsed
          ? rows.map((r) =>
              r.kind === 'group' ? (
                <div key={r.id} className="fal-col fal-fill-x" style={{ gap: 6, width: '100%' }}>
                  <div className="fal-row" style={{ gap: 6, justifyContent: 'flex-start' }}>
                    <p className="fal-t-10" style={{ color: '#1a1a1a' }}>
                      {r.title}
                    </p>
                    <span className="fal-badge" data-kind={r.badgeKind}>
                      <p className="fal-t-7b">{r.badge}</p>
                    </span>
                  </div>
                  {r.items.map((item) => (
                    <div
                      key={item.id}
                      className="fal-row fal-fill-x"
                      style={{ gap: 6, paddingLeft: 12, width: '100%' }}
                    >
                      <p className="fal-t-9" style={{ color: '#1a1a1a' }}>
                        {item.label}
                      </p>
                      <div className="fal-fill-spacer" />
                      <div className="fal-row" style={{ gap: 4 }}>
                        {item.chips.map((c, i) => (
                          <span
                            key={`${item.id}-${String(i)}`}
                            className="fal-rec"
                            data-grade={c.grade}
                            data-latest={c.latest === true}
                          >
                            <p className="fal-t-9">
                              {c.v}
                              {c.grade !== 'N' ? ` ${c.grade}` : ''}
                            </p>
                          </span>
                        ))}
                      </div>
                      <div style={{ width: 96, flexShrink: 0 }}>
                        <p className="fal-t-8" style={{ color: '#737880' }}>
                          {item.ref}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  key={r.id}
                  className="fal-row fal-fill-x"
                  style={{ gap: 6, alignItems: 'flex-start', width: '100%' }}
                >
                  <p className="fal-t-10" style={{ color: '#1a1a1a' }}>
                    {r.title}
                  </p>
                  <span className="fal-badge" data-kind={r.badgeKind}>
                    <p className="fal-t-7b">{r.badge}</p>
                  </span>
                  {r.time ? (
                    <p className="fal-t-8" style={{ color: '#737880' }}>
                      {r.time}
                    </p>
                  ) : null}
                  {r.detail ? (
                    <p
                      className="fal-t-8"
                      style={{ color: '#737880', whiteSpace: 'normal', flex: 1, fontSize: 8.5 }}
                    >
                      {r.detail}
                    </p>
                  ) : null}
                  {r.chips ? (
                    <>
                      <div className="fal-fill-spacer" />
                      <div className="fal-row" style={{ gap: 4 }}>
                        {r.chips.map((c) => (
                          <span
                            key={`${r.id}-${c.k}-${c.v}`}
                            className="fal-rec"
                            data-grade={c.grade}
                            data-latest={c.latest === true}
                          >
                            <p className="fal-t-9">
                              {c.k ? `${c.k} ` : ''}
                              {c.v}
                              {c.grade !== 'N' ? ` ${c.grade}` : ''}
                            </p>
                          </span>
                        ))}
                      </div>
                      {r.ref ? (
                        <div style={{ width: 96, flexShrink: 0 }}>
                          <p className="fal-t-8" style={{ color: '#737880' }}>
                            {r.ref}
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ),
            )
          : null}
      </div>

      <div
        className="fal-card"
        data-kind="log"
        data-node-id="51:984"
        data-name="行動記錄 Action Log"
        data-testid="lg-action-log"
        data-collapsed={logCollapsed}
        style={{ position: 'relative' }}
      >
        <div className="fal-card-head" data-node-id="51:985" data-name="Card Header">
          <p className="fal-t-card-title-hud" data-node-id="51:986">
            行動記錄 Action Log
          </p>
        </div>
        <button
          type="button"
          className="fal-collapse"
          data-node-id="58:493"
          data-name="Collapse [^]"
          aria-label="collapse log"
          onClick={onCollapseLog}
        >
          <p className="fal-t-collapse" data-node-id="58:494">
            ⌃
          </p>
        </button>
        {!logCollapsed
          ? DEMO_ACTION_LOG.map((row) => (
              <div
                key={row.id}
                className="fal-col fal-fill-x"
                data-node-id="88:782"
                data-name="Action Log Item"
                style={{ gap: 4, width: '100%', overflow: 'hidden' }}
              >
                <div
                  className="fal-row fal-fill-x"
                  data-name="Log Main"
                  style={{ gap: 8, overflow: 'hidden', width: '100%' }}
                >
                  <p className="fal-t-11m" style={{ color: '#738594' }}>
                    {row.time}
                  </p>
                  <p
                    className="fal-t-11m"
                    style={{ color: '#242e3d', fontWeight: 400, flex: 1, whiteSpace: 'normal' }}
                  >
                    {row.text}
                  </p>
                  <span className="fal-status-ordered" data-name="Status 已開立 ORDERED">
                    <p className="fal-t-ordered">{row.status}</p>
                  </span>
                </div>
                <p className="fal-t-muted-10" style={{ width: '100%' }}>
                  5 號床 · 執行：護士 Nurse
                </p>
              </div>
            ))
          : null}
      </div>
    </div>
  );
}
