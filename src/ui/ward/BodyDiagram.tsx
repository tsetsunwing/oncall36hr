import { PersonStanding } from 'lucide-react';
import { ui } from '@/i18n';
import type { BodyDiagramView, GameActions } from '@/view';
import { BODY_SILHOUETTE_PATHS, BODY_VIEWBOX } from './bodySilhouette';

export function BodyDiagram({
  body,
  patientId,
  patientLabel,
  actions,
}: {
  body: BodyDiagramView;
  patientId: string;
  patientLabel: string | null;
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
      <h2 id="body-diagram-heading">
        <PersonStanding className="heading-icon" size={16} strokeWidth={2} aria-hidden="true" />
        <span className="body-heading-copy">
          <span className="heading-label">{w.bodyHeading}</span>
          {patientLabel ? (
            <span className="body-patient" data-testid="body-patient">
              {patientLabel}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          className="body-back"
          data-testid="body-back"
          aria-label={w.backToMap}
          onClick={() => {
            actions.goToBed(null);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M10 7H5.5M5.5 7 8 4.5M5.5 7 8 9.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect
              x="11"
              y="4"
              width="8"
              height="6.2"
              rx="1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <rect
              x="11"
              y="12.2"
              width="8"
              height="6.2"
              rx="1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
          </svg>
        </button>
      </h2>
      <div className="body-diagram-stage">
        <svg className="body-outline" viewBox={BODY_VIEWBOX} aria-hidden="true" focusable="false">
          {BODY_SILHOUETTE_PATHS.map((d, index) => (
            <path key={index} className="body-fill" d={d} />
          ))}
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
