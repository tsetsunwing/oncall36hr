import { useState } from 'react';
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

function ReportFilters({
  bucket,
  section,
  onBucket,
  onSection,
}: {
  bucket: 'all' | ReportBucket;
  section: string;
  onBucket: (next: 'all' | ReportBucket) => void;
  onSection: (next: string) => void;
}) {
  const r = ui.game.reports;
  const buckets = ['all', 'laboratory', 'radiology', 'poct'] as const;
  return (
    <>
      <div className="report-filters" role="group" aria-label={r.filtersLabel}>
        {buckets.map((id) => (
          <button
            key={id}
            type="button"
            className="btn btn-small"
            data-testid={`report-bucket-${id}`}
            aria-pressed={bucket === id}
            onClick={() => {
              onBucket(id);
            }}
          >
            {r.bucket[id]}
          </button>
        ))}
      </div>
      {bucket === 'all' ? null : (
        <div className="report-filters" role="group" aria-label={r.sectionsLabel}>
          <button
            type="button"
            className="btn btn-small"
            data-testid="report-section-all"
            aria-pressed={section === 'all'}
            onClick={() => {
              onSection('all');
            }}
          >
            {r.section.all}
          </button>
          {sectionsFor(bucket).map((id) => (
            <button
              key={id}
              type="button"
              className="btn btn-small"
              data-testid={`report-section-${id}`}
              aria-pressed={section === id}
              onClick={() => {
                onSection(id);
              }}
            >
              {r.section[id] ?? id}
            </button>
          ))}
        </div>
      )}
    </>
  );
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
        <h2 id="reports-heading">
          <FlaskConical className="heading-icon" size={16} strokeWidth={2} aria-hidden="true" />
          {ui.game.reports.heading}
        </h2>
        <ReportFilters
          bucket={bucket}
          section={section}
          onBucket={(next) => {
            setBucket(next);
            setSection('all');
          }}
          onSection={setSection}
        />
        {reports.length === 0 ? (
          <p className="hint">{ui.game.reports.empty}</p>
        ) : shown.length === 0 ? (
          <p className="hint">{ui.game.reports.emptyFiltered}</p>
        ) : (
          <ul className="report-list">
            {shown.map((report) => (
              <ReportItem key={report.id} report={report} />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="log-heading" data-panel="log">
        <h2 id="log-heading">
          <ScrollText className="heading-icon" size={16} strokeWidth={2} aria-hidden="true" />
          {l.heading}
        </h2>
        <div className="scope" role="group" aria-label={l.scopeLabel}>
          <button
            type="button"
            className="btn btn-small"
            aria-pressed={scope === 'patient'}
            onClick={() => {
              setScope('patient');
            }}
          >
            {l.scopeCurrent}
          </button>
          <button
            type="button"
            className="btn btn-small"
            aria-pressed={scope === 'all'}
            onClick={() => {
              setScope('all');
            }}
          >
            {l.scopeAll}
          </button>
        </div>
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
