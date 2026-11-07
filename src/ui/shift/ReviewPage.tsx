import { useState } from 'react';
import { ui } from '@/i18n';
import type { ResultView, ReviewTimelineView, TimelineKindCode } from '@/view';
import { patientLabel, whatIfLine } from './reviewText';

export interface ReviewPageProps {
  result: ResultView;
  onBack: () => void;
  onHome: () => void;
}

const r = ui.shift.review;
const rule = (code: string): string => ui.shift.result.rule[code] ?? code;

function timelineText(item: ReviewTimelineView): string {
  const t = r.timeline;
  if (item.kind === 'SCORE') {
    return t.scoreLine(
      rule(item.code),
      item.subscore ? (ui.shift.result.subscore[item.subscore] ?? item.subscore) : '',
      r.delta(item.delta ?? 0),
    );
  }
  if (item.kind === 'CALL') {
    const [direction = '', tag = '', status = ''] = item.code.split(':');
    const who = item.label ? `${t.tag[tag] ?? tag} ${item.label}` : (t.tag[tag] ?? tag);
    return t.callLine(t.direction[direction] ?? direction, who, t.status[status] ?? status);
  }
  const prefix = Object.keys(t.eventPrefix).find((p) => item.code.startsWith(p));
  const base =
    t.event[item.code] ??
    (prefix ? `${t.eventPrefix[prefix] ?? ''}：${item.code.slice(prefix.length)}` : item.code);
  return [item.label, base].filter(Boolean).join(' · ');
}

function Scroll({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // 窄螢幕上表格可橫向捲動，要可用鍵盤聚焦先符合 axe（scrollable-region-focusable）
    <div
      className="review-scroll"
      role="region"
      aria-label={r.table.scrollLabel(label)}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      {children}
    </div>
  );
}

export function ReviewPage({ result, onBack, onHome }: ReviewPageProps) {
  const { review } = result;
  const s = r.sections;
  const [kind, setKind] = useState<'ALL' | TimelineKindCode>('ALL');
  const timeline = review.timeline.filter((item) => kind === 'ALL' || item.kind === kind);
  const anchors: [string, string][] = [
    ['table', s.table],
    ['timeline', s.timeline],
    ['whatif', s.whatIf],
    ['guideline', s.guideline],
    ['safety', s.safety],
    ['deaths', s.deaths],
  ];
  return (
    <section
      className="review"
      aria-labelledby="review-heading"
      data-testid="review-page"
      data-reason={result.reason}
    >
      <header className="result-head">
        <h1 id="review-heading">{r.heading}</h1>
        <p>{r.intro}</p>
        <nav aria-label={r.jump} className="review-nav">
          {anchors.map(([id, label]) => (
            <a
              key={id}
              href={`#review-${id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`review-${id}`)?.scrollIntoView({ block: 'start' });
              }}
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <section className="result-card" aria-labelledby="review-table" id="review-table-section">
        <h2 id="review-table">{s.table}</h2>
        <p className="hint">{r.table.note}</p>
        {review.table.map((sub) => (
          <div key={sub.id} data-testid={`review-table-${sub.id}`}>
            <h3>
              {r.table.caption(
                ui.shift.result.subscore[sub.id] ?? sub.id,
                ui.shift.result.grade[sub.grade] ?? sub.grade,
              )}
            </h3>
            {sub.rows.length === 0 ? (
              <p className="hint">{r.table.empty}</p>
            ) : (
              <Scroll label={ui.shift.result.subscore[sub.id] ?? sub.id}>
                <table className="review-table">
                  <thead>
                    <tr>
                      <th scope="col">{r.table.time}</th>
                      <th scope="col">{r.table.item}</th>
                      <th scope="col">{r.table.patient}</th>
                      <th scope="col">{r.table.effect}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sub.rows.map((row) => (
                      <tr key={row.id} data-testid="review-entry">
                        <td>{row.timeLabel}</td>
                        <td>{rule(row.rule)}</td>
                        <td>{row.bed === null ? '—' : patientLabel(row)}</td>
                        <td className="num">{r.delta(row.delta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroll>
            )}
          </div>
        ))}
      </section>

      <section
        className="result-card"
        aria-labelledby="review-timeline"
        id="review-timeline-section"
      >
        <h2 id="review-timeline">{s.timeline}</h2>
        <p className="hint">{r.timeline.note}</p>
        <div className="review-filter" role="group" aria-label={r.timeline.filter}>
          {(['ALL', 'ORDER', 'EVENT', 'CALL', 'SCORE'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className="btn"
              aria-pressed={kind === k}
              data-testid={`timeline-filter-${k}`}
              onClick={() => {
                setKind(k);
              }}
            >
              {k === 'ALL' ? r.timeline.all : r.timeline.kinds[k]}
            </button>
          ))}
        </div>
        {timeline.length === 0 ? (
          <p className="hint">{r.timeline.empty}</p>
        ) : (
          <Scroll label={s.timeline}>
            <table className="review-table" data-testid="review-timeline">
              <thead>
                <tr>
                  <th scope="col">{r.timeline.time}</th>
                  <th scope="col">{r.timeline.kind}</th>
                  <th scope="col">{r.table.patient}</th>
                  <th scope="col">{r.timeline.content}</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((item) => (
                  <tr key={item.key} data-kind={item.kind} data-testid="review-timeline-row">
                    <td>{item.timeLabel}</td>
                    <td>{r.timeline.kinds[item.kind]}</td>
                    <td>{item.bed === null ? '—' : patientLabel(item)}</td>
                    <td>
                      {timelineText(item)}
                      {item.detail && item.kind !== 'SCORE' ? (
                        <span className="hint"> {item.detail}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
        )}
      </section>

      <section className="result-card" aria-labelledby="review-whatif" id="review-whatif-section">
        <h2 id="review-whatif">{s.whatIf}</h2>
        <p className="hint">{r.whatIf.note}</p>
        {review.whatIf.length === 0 ? (
          <p className="hint">{r.whatIf.empty}</p>
        ) : (
          <ul data-testid="review-whatif">
            {review.whatIf.map((item) => (
              <li key={item.id}>{whatIfLine(item)}</li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="result-card"
        aria-labelledby="review-guideline"
        id="review-guideline-section"
      >
        <h2 id="review-guideline">{s.guideline}</h2>
        <p className="hint">{r.guideline.note}</p>
        {review.guidelines.length === 0 ? (
          <p className="hint">{r.guideline.empty}</p>
        ) : (
          <ul className="review-list" data-testid="review-guideline">
            {review.guidelines.map((g) => (
              <li key={g.id} data-status={g.status}>
                <strong>
                  {patientLabel(g)}：{g.label}
                </strong>{' '}
                <span className="badge" data-level={g.status === 'ON_TIME' ? 'NORMAL' : 'CAUTION'}>
                  {r.guideline.status[g.status]}
                </span>
                <div>
                  {r.guideline.window(g.windowMin)}；{r.guideline.yours(g.status, g.delayMin)}
                </div>
                <div>
                  {g.title}：{g.text}
                </div>
                <div className="hint">
                  {r.guideline.source(g.source)}
                  {g.pendingReview ? `（${r.guideline.pending}）` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="result-card" aria-labelledby="review-safety" id="review-safety-section">
        <h2 id="review-safety">{s.safety}</h2>
        <p className="hint">{r.safety.note}</p>
        {review.safety.length === 0 ? (
          <p className="hint">{r.safety.empty}</p>
        ) : (
          <ul className="review-list" data-testid="review-safety">
            {review.safety.map((x) => (
              <li key={x.orderId} data-outcome={x.outcome}>
                <strong>
                  {x.timeLabel} {patientLabel(x)}：{x.orderLabel}
                </strong>{' '}
                <span
                  className="badge"
                  data-level={x.outcome === 'CANCELLED' ? 'NORMAL' : 'CAUTION'}
                >
                  {r.safety.outcome[x.outcome]}
                </span>
                {x.concerns.map((c, i) => (
                  <div key={`${c.by}-${c.category}-${String(i)}`}>
                    {r.safety.concernLine(
                      r.safety.by[c.by] ?? c.by,
                      ui.game.gate.category[c.category] ?? c.category,
                    )}
                  </div>
                ))}
                {x.insistCount > 0 ? <div>{r.safety.insist(x.insistCount)}</div> : null}
                {x.aiScore !== null ? <div>{r.safety.aiScore(x.aiScore)}</div> : null}
                {x.aiReason ? (
                  <div data-testid="review-ai-reason">{r.safety.aiReason(x.aiReason)}</div>
                ) : (
                  <div className="hint">{r.safety.engineReason}</div>
                )}
                {x.danger ? (
                  <div>
                    {r.safety.danger(
                      r.safety.level[x.danger.level] ?? x.danger.level,
                      ui.game.gate.category[x.danger.category] ?? x.danger.category,
                    )}
                    {x.danger.reason ? `：${x.danger.reason}` : ''}
                    {x.danger.hit === null
                      ? ''
                      : `（${x.danger.hit ? r.safety.hit : r.safety.miss}）`}
                  </div>
                ) : null}
                {x.rules.length > 0 ? (
                  <div className="hint">{r.safety.rules(x.rules.map(rule).join('、'))}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="result-card" aria-labelledby="review-deaths" id="review-deaths-section">
        <h2 id="review-deaths">{s.deaths}</h2>
        <p className="hint">{r.deaths.note}</p>
        {review.deaths.length === 0 ? (
          <p className="hint">{r.deaths.empty}</p>
        ) : (
          <ul className="review-list" data-testid="review-deaths">
            {review.deaths.map((d) => (
              <li key={`${String(d.bed)}-${d.timeLabel}`}>
                <strong>{r.deaths.line(patientLabel(d), d.timeLabel)}</strong>{' '}
                {d.doneBest ? (
                  <span className="badge" data-level="CAUTION">
                    {ui.shift.result.doneBestTag}
                  </span>
                ) : null}
                <div>{d.doneBest ? r.deaths.doneBest : r.deaths.salvageable}</div>
                <div className="hint">{r.deaths.process[String(d.processComplete)]}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="hint" data-testid="review-disclaimer">
        {r.disclaimer}
      </p>
      <div className="result-actions">
        <button
          type="button"
          className="btn btn-primary"
          data-testid="review-back"
          onClick={onBack}
        >
          {r.back}
        </button>
        <button type="button" className="btn" data-testid="review-home" onClick={onHome}>
          {r.home}
        </button>
      </div>
    </section>
  );
}
