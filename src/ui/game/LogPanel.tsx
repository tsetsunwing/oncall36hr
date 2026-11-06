import { useState } from 'react';
import { ui } from '@/i18n';
import type { ActionRowView, GameActions, GameView, OrderRowView } from '@/view';

export interface LogPanelProps {
  orders: OrderRowView[];
  log: GameView['actionLog'];
  actions: GameActions;
  open: boolean;
  onClose: () => void;
}

function etaText(order: OrderRowView): string | null {
  if (order.etaSeconds === null) return null;
  const minutes = Math.ceil(order.etaSeconds / 60);
  return minutes <= 0 ? ui.game.orders.etaSoon : ui.game.orders.eta(minutes);
}

function OrderItem({ order, actions }: { order: OrderRowView; actions: GameActions }) {
  const o = ui.game.orders;
  const eta = etaText(order);
  return (
    <li className="order-row" data-testid="order-row" data-status={order.status}>
      <div className="order-main">
        <span className="order-label">{order.label}</span>
        <span className="status-chip" data-status={order.status}>
          {o.status[order.status]}
        </span>
      </div>
      <div className="order-sub">
        {order.timeLabel}
        {order.executorName ? ` · ${ui.game.log.executor}：${order.executorName}` : ''}
        {eta ? ` · ${eta}` : ''}
      </div>
      {order.cancellable ? (
        <button
          type="button"
          className="btn btn-small"
          aria-label={o.cancelLabel(order.label)}
          onClick={() => {
            actions.cancelOrder(order.id);
          }}
        >
          {o.cancel}
        </button>
      ) : null}
    </li>
  );
}

function LogItem({ row }: { row: ActionRowView }) {
  const l = ui.game.log;
  const title = row.kind === 'ORDER' ? row.label : (l.events[row.eventCode ?? ''] ?? row.eventCode);
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

export function LogPanel({ orders, log, actions, open, onClose }: LogPanelProps) {
  const l = ui.game.log;
  const [scope, setScope] = useState<'all' | 'patient'>('patient');
  const rows = scope === 'all' ? log.all : log.patient;
  return (
    <aside
      className="side-panel"
      data-open={open}
      aria-labelledby="orders-heading"
      data-testid="side-panel"
    >
      <button type="button" className="btn btn-small side-close" onClick={onClose}>
        {l.close}
      </button>
      <section aria-labelledby="orders-heading">
        <h2 id="orders-heading">{ui.game.orders.heading}</h2>
        {orders.length === 0 ? (
          <p className="hint">{ui.game.orders.empty}</p>
        ) : (
          <ul className="order-list">
            {orders.map((order) => (
              <OrderItem key={order.id} order={order} actions={actions} />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="log-heading">
        <h2 id="log-heading">{l.heading}</h2>
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
