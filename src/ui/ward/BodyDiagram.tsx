import { PersonStanding } from 'lucide-react';
import { ui } from '@/i18n';
import type { BodyDiagramView, GameActions } from '@/view';

const BODY_OUTLINE =
  'M100 16 C128 16 142 34 142 54 C142 70 130 82 116 84 C114 94 112 100 116 108 C140 110 160 114 170 122 C176 132 178 150 174 168 L168 206 C166 218 158 226 148 226 C138 226 132 216 134 204 L144 168 C146 146 138 128 126 120 C120 132 116 144 114 158 C110 184 108 206 114 228 C118 246 120 268 116 304 L112 336 C112 348 100 348 100 336 L104 300 L108 250 C102 240 98 240 92 250 L96 300 L100 336 C100 348 88 348 88 336 L84 304 C80 268 82 246 86 228 C92 206 90 184 86 158 C84 144 80 132 74 120 C62 128 54 146 56 168 L66 204 C68 216 62 226 52 226 C42 226 34 218 32 206 L26 168 C22 150 24 132 30 122 C40 114 60 110 84 108 C88 100 86 94 84 84 C70 82 58 70 58 54 C58 34 72 16 100 16 Z';

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
        <svg className="body-outline" viewBox="0 0 200 360" aria-hidden="true" focusable="false">
          <path className="body-fill" d={BODY_OUTLINE} />
          <path className="body-landmark" d="M78 118 C90 128 110 128 122 118" />
          <path className="body-landmark" d="M100 122 V202" />
          <path className="body-landmark" d="M86 154 H114" />
          <path className="body-landmark" d="M82 176 C92 186 108 186 118 176" />
          <path className="body-landmark" d="M78 206 C92 218 108 218 122 206" />
          <circle className="body-landmark" cx="100" cy="186" r="2.3" />
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
