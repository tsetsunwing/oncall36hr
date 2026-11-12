import { useState, type FormEvent } from 'react';
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

  function submitDrain(event: FormEvent) {
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
  }

  return (
    <div
      className="catheter-dialog"
      role="dialog"
      aria-modal="true"
      data-testid="catheter-orders"
      aria-labelledby="catheter-orders-title"
    >
      <h3 id="catheter-orders-title">{t.title}</h3>
      <section className="catheter-dialog-section" aria-labelledby="catheter-lines-title">
        <h4 id="catheter-lines-title">{t.lines}</h4>
        <div className="catheter-actions">
          {CATHETER_ORDERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="catheter-action"
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
      </section>
      <section
        className="catheter-dialog-section catheter-drain"
        aria-labelledby="catheter-drain-title"
      >
        <h4 id="catheter-drain-title">{t.drainTitle}</h4>
        <p className="catheter-drain-hint">{t.drainHint}</p>
        <form className="catheter-drain-form" onSubmit={submitDrain}>
          <label className="catheter-drain-site" htmlFor="drain-site">
            {t.drainSite}
            <input
              id="drain-site"
              type="text"
              data-testid="drain-site"
              value={site}
              autoComplete="off"
              placeholder={t.drainPlaceholder}
              onChange={(event) => {
                setSite(event.target.value);
              }}
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            data-testid="catheter-proc.drain"
            disabled={drainSite.length === 0}
          >
            {t.insertDrain}
          </button>
        </form>
      </section>
      <div className="catheter-dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          {ui.game.chat.oxygen.cancel}
        </button>
      </div>
    </div>
  );
}
