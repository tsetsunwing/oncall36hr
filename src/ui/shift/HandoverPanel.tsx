import { ui } from '@/i18n';
import type { GameActions, HandoverCandidateView } from '@/view';

export interface HandoverPanelProps {
  candidates: HandoverCandidateView[];
  actions: GameActions;
}

export function HandoverPanel({ candidates, actions }: HandoverPanelProps) {
  const h = ui.shift.handover;
  return (
    <section className="handover" aria-labelledby="handover-heading" data-testid="handover-panel">
      <h2 id="handover-heading" className="panel-title">
        {h.heading}
      </h2>
      <p>{h.intro}</p>
      <ul className="handover-list">
        {candidates.map((c) => (
          <li key={c.patientId}>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={c.selected}
                data-testid={`handover-${String(c.bed)}`}
                onChange={() => {
                  actions.toggleHandover(c.patientId);
                }}
              />
              <span>
                {h.bed(c.bed, c.name)}{' '}
                <span className="badge" data-level={c.level}>
                  {h.level[c.level]}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-primary"
        data-testid="confirm-handover"
        onClick={actions.confirmHandover}
      >
        {h.confirm}
      </button>
    </section>
  );
}
