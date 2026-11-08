import { ListTodo } from 'lucide-react';
import { ui } from '@/i18n';
import type { GameView, ReportView, WardView } from '@/view';

export interface QueuePanelProps {
  ward: WardView;
  reports: ReportView[];
  shift: GameView['shift'] | null;
}

interface QueueItem {
  id: string;
  tone: 'u' | 'w' | 'n';
  title: string;
  detail: string;
  when: string;
}

/** 待辦只由現有狀態推出（警報床、來電、異常報告、下次巡房），唔新增臨床數字。 */
function buildQueue(
  ward: WardView,
  reports: ReportView[],
  shift: GameView['shift'] | null,
): QueueItem[] {
  const w = ui.game.ward;
  const q = w.queue;
  const items: QueueItem[] = [];
  for (const bed of ward.beds) {
    if (!bed.newAdmission || bed.patientId === null) continue;
    items.push({
      id: `admit-${String(bed.bed)}`,
      tone: 'n',
      title: q.bed(bed.bed, bed.name ?? ''),
      detail: w.newAdmission,
      when: q.now,
    });
  }
  for (const bed of ward.beds) {
    if (bed.patientId === null || bed.level === 'NORMAL') continue;
    const here = bed.here ? ` · ${w.here}` : '';
    items.push({
      id: `bed-${String(bed.bed)}`,
      tone: bed.level === 'ALARM' ? 'u' : 'w',
      title: q.bed(bed.bed, w.level[bed.level] ?? bed.level),
      detail: `${w.mewsShort(bed.mewsScore ?? 0)}${here}`,
      when: q.now,
    });
  }
  for (const call of ward.phone.calls) {
    if (call.status !== 'RINGING' && call.status !== 'DEFERRED') continue;
    const tone = call.priority === 'EMERGENCY' ? 'u' : call.priority === 'URGENT' ? 'w' : 'n';
    const bed = call.bed === null ? '' : `${w.phone.bed(call.bed)} · `;
    items.push({
      id: call.id,
      tone,
      title: `${w.phone.tag[call.tag] ?? call.tag} · ${call.callerName}`,
      detail: `${bed}${call.text}`,
      when: call.timeLabel,
    });
  }
  for (const report of reports) {
    if (!report.abnormal) continue;
    items.push({
      id: report.id,
      tone: 'w',
      title: report.label,
      detail: report.reviewPending ? ui.game.reports.pending : '',
      when: report.timeLabel,
    });
  }
  if (shift?.rounds.nextAtLabel) {
    items.push({
      id: 'next-round',
      tone: 'n',
      title: ui.shift.rounds.heading,
      detail: ui.shift.rounds.nextAt(shift.rounds.nextAtLabel),
      when: shift.rounds.nextAtLabel,
    });
  }
  return items;
}

export function QueuePanel({ ward, reports, shift }: QueuePanelProps) {
  const q = ui.game.ward.queue;
  const items = buildQueue(ward, reports, shift);
  return (
    <section className="panel queue" aria-labelledby="queue-heading" data-testid="queue">
      <h2 id="queue-heading">
        <ListTodo className="heading-icon" size={16} strokeWidth={2} aria-hidden="true" />
        {q.heading}
        <span className="sp" />
        <small>{q.byUrgency}</small>
      </h2>
      {items.length === 0 ? (
        <p className="hint queue-empty">{q.empty}</p>
      ) : (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 可捲動區域要俾鍵盤聚焦
        <div className="queue-list" role="group" aria-label={q.heading} tabIndex={0}>
          {items.map((item) => (
            <div key={item.id} className={`q q-${item.tone}`} data-testid="queue-item">
              <div className="a">
                <span>{item.title}</span>
                <span>{item.when}</span>
              </div>
              {item.detail ? <div className="b">{item.detail}</div> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
