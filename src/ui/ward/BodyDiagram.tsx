import { ui } from '@/i18n';
import type { BodyDiagramView, GameActions } from '@/view';

export function BodyDiagram({
  body,
  patientId,
  actions,
}: {
  body: BodyDiagramView;
  patientId: string;
  actions: GameActions;
}) {
  const w = ui.game.ward;
  const ioOrder = body.ioOrder;
  return (
    <section
      className="body-diagram"
      aria-labelledby="body-diagram-heading"
      data-testid="body-diagram"
    >
      <header className="floor-plan-head">
        <h2 id="body-diagram-heading">{w.bodyHeading}</h2>
      </header>
      <div className="body-diagram-stage">
        <svg className="body-outline" viewBox="0 0 200 360" aria-hidden="true" focusable="false">
          <circle cx="100" cy="40" r="26" />
          <path d="M90 64h20l4 18H86Z" />
          <path d="M70 88c0 0-15 22-18 62s6 64 26 72h44c20-8 29-32 26-72s-18-62-26-62c-12 16-40 16-52 0Z" />
          <path d="M68 104c-28 16-40 56-38 86 2 16 16 18 20 4 6-24 12-54 24-76 2-4 0-12-6-14Z" />
          <path d="M132 104c28 16 40 56 38 86-2 16-16 18-20 4-6-24-12-54-24-76-2-4 0-12 6-14Z" />
          <path d="M78 220l-8 100c0 16 16 20 22 8l6-108Z" />
          <path d="M122 220l8 100c0 16-16 20-22 8l-6-108Z" />
        </svg>
        <div className="body-markers" role="group" aria-label={w.bodyLabel}>
          {body.markers.map((marker) => {
            const style = { left: `${String(marker.x)}%`, top: `${String(marker.y)}%` };
            if (marker.kind === 'foley' && ioOrder) {
              return (
                <button
                  key={marker.id}
                  type="button"
                  className="body-marker"
                  style={style}
                  data-testid={`body-${marker.id}`}
                  data-kind={marker.kind}
                  aria-label={w.foleyIo}
                  onClick={() => {
                    actions.placeOrder(patientId, ioOrder.catalogId, ioOrder.text, ioOrder.params);
                  }}
                >
                  {marker.label}
                </button>
              );
            }
            return (
              <span
                key={marker.id}
                className="body-marker"
                style={style}
                data-testid={`body-${marker.id}`}
                data-kind={marker.kind}
              >
                {marker.label}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
