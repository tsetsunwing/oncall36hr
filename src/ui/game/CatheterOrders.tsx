import { useState } from 'react';
import { ui } from '@/i18n';
import {
  CATHETER_ORDERS,
  EMPTY_PLACED_PARAMS,
  SURGICAL_DRAIN,
  type PlacedOrderParams,
} from '@/view';

export function CatheterOrders({
  onSubmit,
  onClose,
}: {
  onSubmit: (order: { catalogId: string; text: string; params: PlacedOrderParams }) => void;
  onClose: () => void;
}) {
  const t = ui.game.chat.catheters;
  const [site, setSite] = useState('');
  const drainSite = site.trim().replace(/\s+/g, ' ');
  return (
    <div
      className="drug-order"
      role="dialog"
      aria-modal="true"
      data-testid="catheter-orders"
      aria-labelledby="catheter-orders-title"
    >
      <h3 id="catheter-orders-title">{t.title}</h3>
      <p className="chip-empty">{t.hint}</p>
      <div className="catheter-orders" role="menu" aria-label={t.title}>
        {CATHETER_ORDERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className="chip"
            data-testid={`catheter-${item.catalogId}`}
            onClick={() => {
              onSubmit({
                catalogId: item.catalogId,
                text: item.label,
                params: EMPTY_PLACED_PARAMS,
              });
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <form
        className="drain-order"
        onSubmit={(event) => {
          event.preventDefault();
          if (drainSite.length === 0) return;
          onSubmit({
            catalogId: SURGICAL_DRAIN.catalogId,
            text: `${SURGICAL_DRAIN.label} ${drainSite}`,
            params: {
              ...EMPTY_PLACED_PARAMS,
              site: drainSite,
              summary: `${SURGICAL_DRAIN.label} ${drainSite}`,
            },
          });
        }}
      >
        <label htmlFor="drain-site">
          {t.drainSite}
          <input
            id="drain-site"
            type="text"
            data-testid="drain-site"
            value={site}
            autoComplete="off"
            onChange={(event) => {
              setSite(event.target.value);
            }}
          />
        </label>
        <p className="chip-empty">{t.drainHint}</p>
        <button
          type="submit"
          className="btn btn-primary"
          data-testid="catheter-proc.drain"
          disabled={drainSite.length === 0}
        >
          {SURGICAL_DRAIN.label}
        </button>
      </form>
      <div className="drug-order-actions">
        <button type="button" className="btn" onClick={onClose}>
          {ui.game.chat.oxygen.cancel}
        </button>
      </div>
    </div>
  );
}
