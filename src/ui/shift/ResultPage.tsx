import { ui } from '@/i18n';
import type { ResultView, ShiftView } from '@/view';

export interface ResultPageProps {
  shift: ShiftView;
  result: ResultView;
  onBack: () => void;
}

export function ResultPage({ shift, result, onBack }: ResultPageProps) {
  const r = ui.shift.result;
  const tag = result.tags[0] ?? null;
  const tagKey = tag ?? 'NONE';
  const modeLabel = ui.shift.mode[shift.shiftMode] ?? shift.shiftMode;
  return (
    <section
      className="result"
      aria-labelledby="result-heading"
      data-testid="result-page"
      data-reason={result.reason}
    >
      <header className="result-head">
        <h1 id="result-heading">{r.heading}</h1>
        <p>
          {r.modeLine(modeLabel, result.atLabel)} · {shift.playerRank} ·{' '}
          {ui.shift.setup.difficulty[shift.difficulty]?.name}
        </p>
        <p className="hint">{r.noTotal}</p>
      </header>
      <section className="result-tag" aria-label={r.tagHeading} data-testid="result-tag-box">
        <strong>{r.tagHeading}</strong>
        {tag ? (
          <span className="badge" data-level="CAUTION" data-testid="result-tag">
            {r.tag[tag]}
          </span>
        ) : (
          <span className="badge" data-level="NORMAL" data-testid="result-tag">
            {r.noTag}
          </span>
        )}
        <span>{r.tagDetail[tagKey]}</span>
        {result.overtimeSec > 0 ? (
          <span>{r.overtimeLine(Math.floor(result.overtimeSec / 60))}</span>
        ) : null}
      </section>
      <div className="result-grid">
        <div className="result-subscores">
          {result.subscores.map((sub) => (
            <article
              key={sub.id}
              className="result-card"
              data-testid={`subscore-${sub.id}`}
              aria-labelledby={`sub-${sub.id}`}
            >
              <h2 id={`sub-${sub.id}`}>{r.subscore[sub.id]}</h2>
              <p
                className="result-sum"
                data-level={sub.sum < 0 ? 'ALARM' : sub.sum > 0 ? 'NORMAL' : 'CAUTION'}
                data-testid={`subscore-sum-${sub.id}`}
              >
                {r.sum(sub.sum)}
              </p>
              {sub.items.length === 0 ? (
                <p className="hint">{r.noItems}</p>
              ) : (
                <ul>
                  {sub.items.map((item) => (
                    <li key={item.rule}>
                      {r.itemLine(r.rule[item.rule] ?? item.rule, item.count, item.delta)}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
        <aside className="result-side">
          <section className="result-card" aria-labelledby="result-patients">
            <h2 id="result-patients">{r.patientsHeading}</h2>
            <ul className="result-patients">
              {result.patients.map((p) => (
                <li key={p.bed} data-testid={`result-patient-${String(p.bed)}`}>
                  {ui.game.patient.bed(p.bed)} {p.name} ·{' '}
                  <span
                    className="badge"
                    data-level={
                      p.outcome === 'STABLE'
                        ? 'NORMAL'
                        : p.outcome === 'CAUTION'
                          ? 'CAUTION'
                          : 'ALARM'
                    }
                  >
                    {r.outcome[p.outcome]}
                  </span>{' '}
                  {result.forced ? null : (
                    <span className="hint">{p.mentioned ? r.mentioned : r.notMentioned}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="hint">
              {r.roundsLine(result.rounds.correct, result.rounds.answered, result.rounds.total)}
            </p>
          </section>
          <p className="hint">{r.disclaimer}</p>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="result-back"
            onClick={onBack}
          >
            {r.back}
          </button>
        </aside>
      </div>
    </section>
  );
}
