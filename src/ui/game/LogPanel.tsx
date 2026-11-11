import { useState, type ReactNode } from 'react';
import { FlaskConical, ScrollText, X } from 'lucide-react';
import { ui } from '@/i18n';
import {
  sectionsFor,
  type ActionRowView,
  type GameActions,
  type GameView,
  type OrderRowView,
  type ReportBucket,
  type ReportView,
} from '@/view';

export interface LogPanelProps {
  orders: OrderRowView[];
  reports?: ReportView[];
  log: GameView['actionLog'];
  actions: GameActions;
  open: boolean;
  onClose: () => void;
  /** 手機抽屜：labs 只顯示報告，log 顯示 order 與記錄。桌面版仍顯示全部。 */
  focus?: 'all' | 'log' | 'labs';
}

function etaText(order: OrderRowView): string | null {
  if (order.etaSeconds === null) return null;
  const minutes = Math.ceil(order.etaSeconds / 60);
  return minutes <= 0 ? ui.game.orders.etaSoon : ui.game.orders.eta(minutes);
}

function executorText(order: OrderRowView): string {
  if (order.executorKind === null) return '';
  const name =
    order.executorKind === 'NURSE'
      ? (order.executorName ?? ui.game.orders.executorKind.NURSE)
      : ui.game.orders.executorKind[order.executorKind];
  return ` · ${ui.game.log.executor}：${name}`;
}

function OrderItem({
  order,
  report,
  actions,
}: {
  order: OrderRowView;
  report: ReportView | undefined;
  actions: GameActions;
}) {
  const o = ui.game.orders;
  const eta = etaText(order);
  return (
    <li className="order-row" data-testid="order-row" data-status={order.status}>
      <div className="order-main">
        <span className="order-label">{order.label}</span>
        <span className="order-actions">
          <span className="status-chip" data-status={order.status}>
            {o.status[order.status]}
          </span>
          {order.cancellable ? (
            <button
              type="button"
              className="chip-btn"
              aria-label={o.cancelLabel(order.label)}
              onClick={() => {
                actions.cancelOrder(order.id);
              }}
            >
              {o.cancel}
            </button>
          ) : null}
        </span>
      </div>
      <div className="order-sub">
        {order.timeLabel}
        {executorText(order)}
        {order.resultStatus ? ` · ${o.resultStatus[order.resultStatus]}` : ''}
        {eta ? ` · ${eta}` : ''}
      </div>
      {order.status === 'DONE' && (report ?? order.resultText) ? (
        <details className="order-result" data-testid="order-result">
          <summary>{o.viewResult}</summary>
          {report ? (
            <ReportBody report={report} />
          ) : (
            <p className="report-text">{order.resultText}</p>
          )}
        </details>
      ) : null}
    </li>
  );
}

function ReportBody({ report }: { report: ReportView }) {
  const r = ui.game.reports;
  return (
    <>
      {report.kind === 'PANEL' ? (
        <table className="report-table">
          <caption className="visually-hidden">{r.tableCaption(report.label)}</caption>
          <thead>
            <tr>
              <th scope="col">{r.item}</th>
              <th scope="col">{r.value}</th>
              <th scope="col">{r.reference}</th>
              <th scope="col">{r.mark}</th>
            </tr>
          </thead>
          <tbody>
            {report.items.map((item) => (
              <tr key={item.label} data-flag={item.flag ?? ''}>
                <th scope="row">{item.label}</th>
                <td className={item.flag ? 'value-flagged' : undefined}>{item.valueText}</td>
                <td>{item.refText}</td>
                <td>
                  {item.flag ? (
                    <span className="flag" data-flag={item.flag}>
                      {item.flag}
                      <span className="visually-hidden">{r.flag[item.flag]}</span>
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="report-text" lang="yue-Hant-HK">
          {report.text}
        </p>
      )}
      {report.reviewPending ? <p className="hint">{r.pending}</p> : null}
    </>
  );
}

function ReportItem({ report }: { report: ReportView }) {
  return (
    <li className="report-row" data-testid="report-row" data-abnormal={report.abnormal}>
      <div className="order-main">
        <span className="order-label">{report.label}</span>
        <time className="log-time">{report.timeLabel}</time>
      </div>
      <ReportBody report={report} />
    </li>
  );
}

function LogItem({ row }: { row: ActionRowView }) {
  const l = ui.game.log;
  const name = row.label ?? (row.eventCode ? (l.events[row.eventCode] ?? row.eventCode) : null);
  const group = row.group ? ui.game.chat.chipGroup[row.group] : null;
  const delegated = row.eventCode?.startsWith('DELEGATED_') ? l.delegated : null;
  const title = [delegated, group, name].filter(Boolean).join(' · ');
  return (
    <li className="log-row" data-testid="log-row" data-kind={row.kind}>
      <div className="log-main">
        <span className="log-time">{row.timeLabel}</span>
        <span className="log-title">{title}</span>
        {row.status ? (
          <span className="status-chip" data-status={row.status}>
            {ui.game.orders.status[row.status]}
          </span>
        ) : null}
      </div>
      <div className="log-sub">
        {row.bed === null ? l.global : l.patientBed(row.bed)}
        {row.executorName ? ` · ${l.executor}：${row.executorName}` : ''}
        {row.reasonCode ? ` · ${l.reasons[row.reasonCode] ?? row.reasonCode}` : ''}
      </div>
      {row.resultText ? (
        <div className="log-result">
          {l.result}：{row.resultText}
        </div>
      ) : null}
    </li>
  );
}

const REPORT_BUCKETS = ['all', 'laboratory', 'radiology', 'poct'] as const;

function LineIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function ScopeIcon({ kind }: { kind: 'patient' | 'all' }) {
  if (kind === 'patient') {
    return (
      <LineIcon>
        <circle cx="12" cy="8" r="3.25" />
        <path d="M5.5 19.5c.9-3.2 3.1-4.75 6.5-4.75s5.6 1.55 6.5 4.75" />
      </LineIcon>
    );
  }
  return (
    <LineIcon>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.25" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.25" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.25" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.25" />
    </LineIcon>
  );
}

function BucketIcon({ id }: { id: (typeof REPORT_BUCKETS)[number] }) {
  if (id === 'all') {
    return (
      <LineIcon>
        <path d="M5 7h14" />
        <path d="M5 12h14" />
        <path d="M5 17h14" />
      </LineIcon>
    );
  }
  if (id === 'laboratory') {
    return (
      <LineIcon>
        <path d="M9 3h6" />
        <path d="M10 3v5.5L6.2 19.2A2 2 0 0 0 8 21.5h8a2 2 0 0 0 1.8-2.3L14 8.5V3" />
        <path d="M8.2 14.5h7.6" />
      </LineIcon>
    );
  }
  if (id === 'radiology') {
    return (
      <LineIcon>
        <rect x="3.5" y="5" width="17" height="14" rx="2" />
        <circle cx="12" cy="9.5" r="1.35" />
        <path d="M7.5 16c1-2.8 2.4-4.2 4.5-4.2s3.5 1.4 4.5 4.2" />
      </LineIcon>
    );
  }
  return (
    <LineIcon>
      <path d="M12 3.5c2.2 3.1 5 5.8 5 9a5 5 0 0 1-10 0c0-3.2 2.8-5.9 5-9z" />
    </LineIcon>
  );
}

function FilterIconButton({
  pressed,
  label,
  testId,
  onClick,
  children,
}: {
  pressed: boolean;
  label: string;
  testId?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="heading-filter"
      data-testid={testId}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ReportFilters({
  bucket,
  section,
  reports,
  onSection,
}: {
  bucket: 'all' | ReportBucket;
  section: string;
  reports: Pick<ReportView, 'bucket' | 'section'>[];
  onSection: (next: string) => void;
}) {
  const r = ui.game.reports;
  const present =
    bucket === 'all'
      ? []
      : sectionsFor(bucket).filter((id) =>
          reports.some((report) => report.bucket === bucket && report.section === id),
        );
  const selected = section === 'all' || present.includes(section) ? section : 'all';
  return present.length > 0 ? (
    <label className="report-section-pick">
      {r.sectionsLabel}
      <select
        data-testid="report-section"
        aria-label={r.sectionsLabel}
        value={selected}
        onChange={(event) => {
          onSection(event.target.value);
        }}
      >
        <option value="all">{r.section.all}</option>
        {present.map((id) => (
          <option key={id} value={id} data-testid={`report-section-${id}`}>
            {r.section[id] ?? id}
          </option>
        ))}
      </select>
    </label>
  ) : null;
}

export function LogPanel({
  orders,
  reports = [],
  log,
  actions,
  open,
  onClose,
  focus = 'all',
}: LogPanelProps) {
  const l = ui.game.log;
  const [scope, setScope] = useState<'all' | 'patient'>('patient');
  const [bucket, setBucket] = useState<'all' | ReportBucket>('all');
  const [section, setSection] = useState('all');
  const rows = scope === 'all' ? log.all : log.patient;
  const pending = orders.filter(
    (order) => order.status === 'DONE' && order.resultStatus === 'PENDING',
  );
  const pendingShown = pending.filter(
    (order) =>
      bucket === 'all' ||
      (order.resultCategory?.bucket === bucket &&
        (section === 'all' || order.resultCategory.section === section)),
  );
  const shown = reports.filter(
    (report) =>
      bucket === 'all' ||
      (report.bucket === bucket && (section === 'all' || report.section === section)),
  );
  return (
    <aside
      className="side-panel"
      data-open={open}
      data-focus={focus}
      aria-labelledby={focus === 'labs' ? 'reports-heading' : 'orders-heading'}
      data-testid="side-panel"
    >
      <button
        type="button"
        className="btn btn-small side-close icon-btn"
        onClick={onClose}
        aria-label={l.close}
        title={l.close}
      >
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <section aria-labelledby="orders-heading" data-panel="orders">
        <h2 id="orders-heading">{ui.game.orders.heading}</h2>
        {orders.length === 0 ? (
          <p className="hint">{ui.game.orders.empty}</p>
        ) : (
          <ul className="order-list">
            {orders.map((order) => (
              <OrderItem
                key={order.id}
                order={order}
                report={reports.find((item) => item.orderId === order.id)}
                actions={actions}
              />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="reports-heading" data-testid="reports" data-panel="reports">
        <h2 id="reports-heading" aria-labelledby="reports-heading-text">
          <FlaskConical className="heading-icon" size={16} strokeWidth={2} aria-hidden="true" />
          <span id="reports-heading-text" className="heading-label">
            {ui.game.reports.heading}
          </span>
          <span className="report-filters" role="group" aria-label={ui.game.reports.filtersLabel}>
            {REPORT_BUCKETS.map((id) => (
              <FilterIconButton
                key={id}
                pressed={bucket === id}
                label={ui.game.reports.bucket[id] ?? id}
                testId={`report-bucket-${id}`}
                onClick={() => {
                  setBucket(id);
                  setSection('all');
                }}
              >
                <BucketIcon id={id} />
              </FilterIconButton>
            ))}
          </span>
        </h2>
        <ReportFilters
          bucket={bucket}
          section={section}
          reports={[
            ...reports,
            ...pending.flatMap((order) => (order.resultCategory ? [order.resultCategory] : [])),
          ]}
          onSection={setSection}
        />
        {reports.length === 0 && pending.length === 0 ? (
          <p className="hint">{ui.game.reports.empty}</p>
        ) : shown.length === 0 && pendingShown.length === 0 ? (
          <p className="hint">{ui.game.reports.emptyFiltered}</p>
        ) : (
          <ul className="report-list">
            {pendingShown.map((order) => (
              <li className="report-row" key={`pending-${order.id}`} data-testid="report-pending">
                {order.timeLabel} · {order.label} · {ui.game.orders.resultStatus.PENDING}
              </li>
            ))}
            {shown.map((report) => (
              <ReportItem key={report.id} report={report} />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="log-heading" data-panel="log">
        <h2 id="log-heading" aria-labelledby="log-heading-text">
          <ScrollText className="heading-icon" size={16} strokeWidth={2} aria-hidden="true" />
          <span id="log-heading-text" className="heading-label">
            {l.heading}
          </span>
          <span className="scope" role="group" aria-label={l.scopeLabel}>
            <FilterIconButton
              pressed={scope === 'patient'}
              label={l.scopeCurrent}
              onClick={() => {
                setScope('patient');
              }}
            >
              <ScopeIcon kind="patient" />
            </FilterIconButton>
            <FilterIconButton
              pressed={scope === 'all'}
              label={l.scopeAll}
              onClick={() => {
                setScope('all');
              }}
            >
              <ScopeIcon kind="all" />
            </FilterIconButton>
          </span>
        </h2>
        {rows.length === 0 ? (
          <p className="hint">{l.empty}</p>
        ) : (
          <ol className="log-list" data-testid="log-list">
            {rows.map((row) => (
              <LogItem key={row.id} row={row} />
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}
