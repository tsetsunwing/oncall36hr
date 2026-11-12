import { ui } from '@/i18n';
import type { GameActions, GateCardView } from '@/view';

export interface GatePanelProps {
  gates: GateCardView[];
  actions: GameActions;
}

function reviewWaitText(gate: GateCardView): string {
  const g = ui.game.gate;
  if (gate.phase === 'RATING') return g.phase.RATING ?? '';
  const pharmacy = gate.reviewers.includes('PHARMACY');
  const nurse = gate.reviewers.includes('NURSE');
  if (pharmacy && !nurse) return g.phase.REVIEW_PHARMACY ?? g.phase.REVIEW ?? '';
  if (nurse && !pharmacy) return g.phase.REVIEW_NURSE ?? g.phase.REVIEW ?? '';
  return g.phase.REVIEW ?? '';
}

function GateCard({ gate, actions }: { gate: GateCardView; actions: GameActions }) {
  const g = ui.game.gate;
  const insistText = `${gate.phase === 'RECONFIRM' ? g.insistAgain : g.insist}${
    gate.required > 1 ? `（${String(gate.insistCount + 1)}／${String(gate.required)}）` : ''
  }`;
  const waiting = gate.phase === 'REVIEW' || gate.phase === 'RATING';
  return (
    <article
      className="gate-card"
      data-testid="gate-card"
      data-phase={gate.phase}
      aria-labelledby={`gate-${gate.orderId}`}
    >
      <h3 id={`gate-${gate.orderId}`} className="gate-title">
        {gate.label}
      </h3>
      {waiting ? (
        <p className="gate-wait" role="status">
          {reviewWaitText(gate)}
        </p>
      ) : (
        <>
          <p className="gate-lead">{g.phase[gate.phase]}</p>
          <ul className="gate-concerns">
            {gate.concerns.map((concern, index) => (
              <li
                key={`${concern.by}-${String(index)}`}
                className="gate-concern"
                lang="yue-Hant-HK"
              >
                <span className="gate-by">{concern.byName}</span>
                <span className="gate-category">{g.category[concern.category] ?? ''}</span>
                <span className="gate-text">{concern.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="gate-actions">
        <button
          type="button"
          className="btn btn-small"
          aria-label={ui.game.orders.cancelLabel(gate.label)}
          onClick={() => {
            actions.cancelOrder(gate.orderId);
          }}
        >
          {g.cancel}
        </button>
        {gate.canInsist ? (
          <button
            type="button"
            className="btn btn-small btn-danger"
            data-testid="insist-button"
            aria-label={g.insistLabel(insistText, gate.label)}
            onClick={() => {
              actions.insistOrder(gate.orderId);
            }}
          >
            {insistText}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function GatePanel({ gates, actions }: GatePanelProps) {
  if (gates.length === 0) return null;
  return (
    <section className="gate-panel" aria-label={ui.game.gate.heading} data-testid="gate-panel">
      {gates.map((gate) => (
        <GateCard key={gate.orderId} gate={gate} actions={actions} />
      ))}
    </section>
  );
}
