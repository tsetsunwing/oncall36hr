import { useState, type FormEvent } from 'react';
import { ui } from '@/i18n';
import type { GameActions, RoundView } from '@/view';

export interface RoundPanelProps {
  round: RoundView;
  actions: GameActions;
}

export function RoundPanel({ round, actions }: RoundPanelProps) {
  const r = ui.shift.rounds;
  const [text, setText] = useState('');
  const reveal = round.phase === 'REVEAL';

  function submit(event: FormEvent) {
    event.preventDefault();
    const answer = text.trim();
    if (answer.length === 0) return;
    actions.answerRound(answer, false);
    setText('');
  }

  const verdictLevel =
    round.verdict === 'CORRECT' ? 'NORMAL' : round.verdict === 'PARTIAL' ? 'CAUTION' : 'ALARM';

  return (
    <section
      className="round-panel"
      aria-labelledby="round-heading"
      data-testid="round-panel"
      data-phase={round.phase}
    >
      <div className="round-banner">
        <h2 id="round-heading" className="panel-title">
          {r.banner(round.number, round.totalRounds)}
        </h2>
        <p className="round-host">{r.host(ui.shift.hostName)}</p>
        <p className="badge" data-level="CAUTION" data-testid="round-progress">
          {r.patient(round.position, round.patientCount)}
        </p>
      </div>
      <p className="hint">{r.noInterrupts}</p>
      <p className="round-patient" data-testid="round-patient">
        <strong>{ui.game.patient.bed(round.patient.bed)}</strong> · {round.patient.name} ·{' '}
        {ui.game.patient.summary(round.patient.age, round.patient.sex)} · {round.patient.complaint}
        <span className="badge" data-level="NORMAL">
          {r.category[round.category]}
        </span>
      </p>

      {round.phase === 'LOADING' ? (
        <p role="status" className="muted" data-testid="round-loading">
          {r.loading}
        </p>
      ) : (
        <blockquote className="round-question" data-testid="round-question">
          <span className="round-speaker">{r.hostLabel(ui.shift.hostName)}</span>
          <p>{round.question}</p>
        </blockquote>
      )}

      {round.phase === 'ASKING' ? (
        <>
          <form className="round-form" onSubmit={submit}>
            <label htmlFor="round-answer">{r.answerLabel}</label>
            <div className="round-form-row">
              <input
                id="round-answer"
                type="text"
                data-testid="round-answer-input"
                value={text}
                maxLength={round.maxChars}
                placeholder={r.answerPlaceholder}
                autoComplete="off"
                onChange={(e) => {
                  setText(e.target.value);
                }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                data-testid="round-submit"
                disabled={text.trim().length === 0}
              >
                {r.answerSubmit}
              </button>
              <button
                type="button"
                className="btn"
                data-testid="round-pass"
                onClick={actions.passRound}
              >
                {r.pass}
              </button>
            </div>
            {round.secondsLeft !== null ? (
              <p className="hint" data-testid="round-time-left">
                {r.timeLeft(round.secondsLeft)}
              </p>
            ) : null}
          </form>
          <div role="group" aria-label={r.hintsHeading} className="round-hints">
            <p className="hint">{r.hintsHeading}</p>
            <ul className="round-hint-list">
              {round.hints.map((hint, index) => (
                <li key={hint}>
                  <button
                    type="button"
                    className="btn round-hint"
                    data-testid={`round-hint-${String(index)}`}
                    onClick={() => {
                      actions.answerRound(hint, true);
                      setText('');
                    }}
                  >
                    {hint}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {round.phase === 'GRADING' ? (
        <p role="status" className="muted" data-testid="round-grading">
          {r.grading}
        </p>
      ) : null}

      {reveal ? (
        <div className="round-reveal" data-testid="round-reveal">
          <p>
            <span className="badge" data-level={verdictLevel} data-testid="round-verdict">
              {r.verdict[round.verdict ?? 'UNANSWERED']}
            </span>{' '}
            {round.viaHint ? <span className="muted">{r.viaHint}</span> : null}
          </p>
          {round.answer ? (
            <p>
              {r.yourAnswer}：{round.answer}
            </p>
          ) : null}
          {round.seniorLine ? (
            <p className="round-senior">
              {ui.shift.hostName}：「{round.seniorLine}」
            </p>
          ) : null}
          {round.keyFacts ? (
            <>
              <h3 className="panel-subtitle">{r.factsHeading}</h3>
              <ul className="round-facts" data-testid="round-facts">
                {round.keyFacts.map((fact) => (
                  <li key={fact.id} data-matched={fact.matched}>
                    <span className="badge" data-level={fact.matched ? 'NORMAL' : 'CAUTION'}>
                      {fact.matched ? r.factMatched : r.factMissed}
                    </span>{' '}
                    {fact.text}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            data-testid="round-next"
            onClick={actions.nextRound}
          >
            {round.isLast ? r.finish : r.next}
          </button>
        </div>
      ) : null}
      <p className="hint">{r.scoreNote}</p>
    </section>
  );
}
