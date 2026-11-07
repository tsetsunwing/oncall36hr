import { useState } from 'react';
import { ui } from '@/i18n';
import type { GameActions, RankCode, SbarDraftView } from '@/view';

export interface SbarPanelProps {
  draft: SbarDraftView;
  playerRank: RankCode;
  actions: GameActions;
}

const KEYS = ['S', 'B', 'A', 'R'] as const;

export function SbarPanel({ draft, actions }: SbarPanelProps) {
  const s = ui.game.ward.sbar;
  const e = ui.game.ward.escalate;
  const [values, setValues] = useState({ ...draft.sbar });
  const targetLabel =
    draft.target.kind === 'RANK'
      ? (e.rank[draft.target.rank] ?? draft.target.rank)
      : draft.target.label;
  return (
    <section className="sbar" aria-labelledby="sbar-heading" data-testid="sbar-panel">
      <h3 id="sbar-heading">{s.heading}</h3>
      <p className="sbar-target" data-testid="sbar-target">
        {s.to(targetLabel)} {s.about(draft.bed, draft.patientName)}
      </p>
      {draft.skips.length > 0 ? (
        <p className="sbar-skip" role="alert" data-testid="sbar-skip">
          {s.skipWarning(draft.skips.join('、'))}
        </p>
      ) : draft.target.kind === 'RANK' ? (
        <p className="muted">{s.stepOk}</p>
      ) : null}
      <p className="muted">{s.hint}</p>
      {KEYS.map((key) => (
        <div className="field sbar-field" key={key}>
          <label htmlFor={`sbar-${key}`}>{s[key]}</label>
          <textarea
            id={`sbar-${key}`}
            data-testid={`sbar-${key}`}
            rows={3}
            maxLength={draft.maxChars}
            value={values[key]}
            onChange={(event) => {
              setValues({ ...values, [key]: event.target.value });
            }}
          />
          <span className="sbar-count">{s.count(values[key].length, draft.maxChars)}</span>
        </div>
      ))}
      <div className="call-actions">
        <button
          type="button"
          className="btn btn-primary"
          data-testid="sbar-send"
          onClick={() => {
            actions.sendCall(values);
          }}
        >
          {s.send}
        </button>
        <button
          type="button"
          className="btn"
          data-testid="sbar-discard"
          onClick={actions.discardCall}
        >
          {s.discard}
        </button>
      </div>
    </section>
  );
}
