import { ui } from '@/i18n';
import type { GradeCode, ResultView, ShiftView } from '@/view';
import { patientLabel, safetyEngineLine, subscoreReason, whatIfLine } from './reviewText';

export interface ResultPageProps {
  shift: ShiftView;
  result: ResultView;
  onBack: () => void;
  onReview?: () => void;
}

const GRADE_FILLED: Readonly<Record<GradeCode, number>> = {
  NEEDS_IMPROVEMENT: 1,
  FAIR: 2,
  GOOD: 3,
  EXCELLENT: 4,
};

const PREVIEW_LIMIT = 2;

function GradeBar({ grade }: { grade: GradeCode }) {
  const r = ui.shift.result;
  const filled = GRADE_FILLED[grade];
  return (
    <div
      className="grade-bar"
      role="img"
      aria-label={r.gradeBarAria(r.grade[grade] ?? grade, filled)}
      data-grade={grade}
    >
      {[1, 2, 3, 4].map((n) => (
        <span key={n} className="grade-seg" data-filled={n <= filled} />
      ))}
    </div>
  );
}

export function downloadResult(result: ResultView): void {
  if (typeof URL.createObjectURL !== 'function') return;
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = ui.shift.result.saveFileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function ResultPage({ shift, result, onBack, onReview }: ResultPageProps) {
  const r = ui.shift.result;
  const tag = result.tags[0] ?? null;
  const tagKey = tag ?? 'NONE';
  const modeLabel = ui.shift.mode[shift.shiftMode] ?? shift.shiftMode;
  const { review } = result;
  const safetyItem =
    review.safety.find((x) => x.aiReason !== null) ??
    review.safety.find((x) => x.concerns.length > 0);
  const preview = review.whatIf.slice(0, PREVIEW_LIMIT);
  const doneBestPatients = result.patients.filter((p) => p.outcome === 'DECEASED' && p.doneBest);
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
          {result.subscores.map((sub) => {
            const reason = subscoreReason(sub);
            return (
              <article
                key={sub.id}
                className="result-card"
                data-testid={`subscore-${sub.id}`}
                data-grade={sub.grade}
                aria-labelledby={`sub-${sub.id}`}
              >
                <div className="result-card-head">
                  <h2 id={`sub-${sub.id}`}>{r.subscore[sub.id]}</h2>
                  <strong
                    className="grade-label"
                    data-grade={sub.grade}
                    data-testid={`grade-${sub.id}`}
                  >
                    {r.grade[sub.grade]}
                  </strong>
                </div>
                <GradeBar grade={sub.grade} />
                {sub.entries === 0 ? <p className="hint">{r.noItems}</p> : null}
                {reason ? <p className="result-reason">{reason}</p> : null}
                {sub.cappedByDeath ? (
                  <p className="result-reason" data-testid="capped-by-death">
                    {r.cappedByDeath}
                  </p>
                ) : null}
              </article>
            );
          })}
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
                  {p.doneBest ? (
                    <span className="badge" data-level="CAUTION" data-testid="done-best">
                      {r.doneBestTag}
                    </span>
                  ) : null}
                  {result.forced ? null : (
                    <span className="hint">{p.mentioned ? r.mentioned : r.notMentioned}</span>
                  )}
                </li>
              ))}
            </ul>
            {doneBestPatients.map((p) => (
              <p key={p.bed} className="hint" data-testid="done-best-note">
                {r.doneBestNote(p.bed, p.name)}
              </p>
            ))}
            <p className="hint">
              {r.roundsLine(result.rounds.correct, result.rounds.answered, result.rounds.total)}
            </p>
          </section>
          <section className="result-card" aria-labelledby="result-ai" data-testid="result-ai">
            <h2 id="result-ai">{r.aiHeading}</h2>
            <p data-testid="result-safety">
              {safetyItem
                ? safetyItem.aiReason
                  ? r.safetyComment(`${patientLabel(safetyItem)} ${safetyItem.aiReason}`)
                  : safetyEngineLine(safetyItem)
                : r.noSafetyComment}
            </p>
            <p className="hint">{r.reviewIncludes}</p>
            <div className="result-preview" data-testid="result-preview">
              <strong>{r.previewHeading}</strong>
              {preview.length === 0 ? (
                <p className="hint">{r.noWhatIf}</p>
              ) : (
                <ul>
                  {preview.map((item) => (
                    <li key={item.id}>{whatIfLine(item)}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          <div className="result-actions">
            {onReview ? (
              <button
                type="button"
                className="btn btn-primary"
                data-testid="result-review"
                onClick={onReview}
              >
                {r.viewReview}
              </button>
            ) : null}
            <button
              type="button"
              className="btn"
              data-testid="result-save"
              onClick={() => {
                downloadResult(result);
              }}
            >
              {r.saveResult}
            </button>
            <button type="button" className="btn" data-testid="result-back" onClick={onBack}>
              {r.back}
            </button>
          </div>
          <p className="hint" data-testid="result-disclaimer">
            {r.disclaimer}
          </p>
        </aside>
      </div>
    </section>
  );
}
