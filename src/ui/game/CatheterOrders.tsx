import { ui } from '@/i18n';
import { CATHETER_ORDERS, EMPTY_PLACED_PARAMS, type PlacedOrderParams } from '@/view';

export function CatheterOrders({
  onSubmit,
  onClose,
}: {
  onSubmit: (order: { catalogId: string; text: string; params: PlacedOrderParams }) => void;
  onClose: () => void;
}) {
  const t = ui.game.chat.catheters;
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
      <div className="drug-order-actions">
        <button type="button" className="btn" onClick={onClose}>
          {ui.game.chat.oxygen.cancel}
        </button>
      </div>
    </div>
  );
}
