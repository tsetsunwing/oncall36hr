import { useMemo, useState } from 'react';
import { dialogue, ui } from '@/i18n';
import type {
  CallLineView,
  CallRowView,
  GameActions,
  LadderStepView,
  PhoneView,
  RankCode,
  WardView,
} from '@/view';
import { SbarPanel } from './SbarPanel';

export interface PhonePanelProps {
  ward: WardView;
  actions: GameActions;
  currentPatientId: string | null;
  onDelegateCall: (callId: string) => void;
}

function lineText(line: CallLineView): string {
  const p = ui.game.ward.phone;
  if (line.text !== null) return line.text;
  const code = line.code ?? '';
  const spoken = (dialogue as Record<string, string>)[
    code.startsWith('REPLY_')
      ? `phone.reply.${code.slice(6)}`
      : code.startsWith('CALLEE_')
        ? `phone.callee.${code.slice(7)}`
        : ''
  ];
  return spoken ?? p.codes[code] ?? '';
}

export function CallTranscript({ lines, testId }: { lines: CallLineView[]; testId?: string }) {
  const p = ui.game.ward.phone;
  if (lines.length === 0) return <p className="muted">{p.transcriptEmpty}</p>;
  return (
    <ol className="call-lines" aria-label={p.transcript} data-testid={testId}>
      {lines.map((line, index) => (
        <li key={`${String(index)}-${line.timeLabel}`} data-speaker={line.speaker}>
          <span className="call-line-meta">
            <time>{line.timeLabel}</time> {line.speaker === 'PLAYER' ? p.you : line.name}
          </span>
          <span className="call-line-text" lang="yue-Hant-HK">
            {lineText(line)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function CallDetail({
  call,
  actions,
  onDelegateCall,
}: {
  call: CallRowView;
  actions: GameActions;
  onDelegateCall: (callId: string) => void;
}) {
  const p = ui.game.ward.phone;
  return (
    <div className="call-detail" data-testid="call-detail" data-call-id={call.id}>
      <p className="call-detail-head">
        <span className="tag" data-tag={call.tag}>
          {p.tag[call.tag]}
        </span>{' '}
        <span className="tag tag--priority" data-priority={call.priority}>
          {p.priority[call.priority]}
        </span>{' '}
        <span className="call-status" data-testid="call-status" data-status={call.status}>
          {p.status[call.status]}
        </span>
      </p>
      <p className="call-from">
        {call.callerName.length > 0 ? `${p.callerLabel}：${call.callerName}` : p.tag[call.tag]}
        {call.bed !== null ? ` ${p.bed(call.bed)} ${call.patientName ?? ''}` : ''}
        {call.deptLabel ? ` ${call.deptLabel}` : ''}
      </p>
      {call.sbar ? (
        <dl className="sbar-readonly" aria-label={p.sbarFromCaller}>
          {(['S', 'B', 'A', 'R'] as const).map((key) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd lang="yue-Hant-HK">{call.sbar?.[key]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <CallTranscript lines={call.lines} />
      {call.canRespond ? (
        <div className="call-actions" role="group" aria-label={p.respondGroup}>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="respond-go-now"
            onClick={() => {
              actions.respondCall(call.id, 'GO_NOW');
            }}
          >
            {p.goNow}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="respond-later"
            onClick={() => {
              actions.respondCall(call.id, 'LATER');
            }}
          >
            {p.later}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="respond-continue"
            onClick={() => {
              actions.respondCall(call.id, 'CONTINUE');
            }}
          >
            {p.continue}
          </button>
          {call.canDelegate ? (
            <button
              type="button"
              className="btn"
              data-testid="respond-delegate"
              onClick={() => {
                onDelegateCall(call.id);
              }}
            >
              {p.delegate}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="call-resolution" data-testid="call-resolution">
          {call.resolution ? (p.resolution[call.resolution] ?? call.resolution) : ''}
          {call.outcome ? ` ${p.outcome[call.outcome] ?? call.outcome}` : ''}
        </p>
      )}
    </div>
  );
}

function Ladder({
  steps,
  playerRank,
  disabled,
  onCall,
}: {
  steps: LadderStepView[];
  playerRank: RankCode;
  disabled: boolean;
  onCall: (rank: RankCode) => void;
}) {
  const e = ui.game.ward.escalate;
  return (
    <ol className="ladder" aria-label={e.ladderHeading} data-testid="ladder">
      <li className="ladder-step ladder-step--you">
        <span className="ladder-rank">{e.rank[playerRank]}</span>
        <span className="ladder-note">{e.you}</span>
      </li>
      {steps.map((step) => (
        <li key={step.rank} className="ladder-step" data-reachable={step.reachable}>
          <span className="ladder-rank">{e.rank[step.rank]}</span>
          {step.contacted ? <span className="ladder-note">{e.contacted}</span> : null}
          {step.skips.length > 0 ? (
            <span className="ladder-skip" data-testid={`skip-${step.rank}`}>
              {e.skipWarning(step.skips.join('、'))}
            </span>
          ) : null}
          {step.reachable ? (
            <button
              type="button"
              className="btn btn-small"
              disabled={disabled}
              data-testid={`call-rank-${step.rank}`}
              onClick={() => {
                onCall(step.rank);
              }}
            >
              {e.call(e.rankShort[step.rank] ?? step.rank)}
            </button>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function PhonePanel({ ward, actions, currentPatientId, onDelegateCall }: PhonePanelProps) {
  const p = ui.game.ward.phone;
  const e = ui.game.ward.escalate;
  const phone: PhoneView = ward.phone;
  const [selected, setSelected] = useState<string | null>(null);
  const occupied = useMemo(() => ward.beds.filter((b) => b.patientId !== null), [ward.beds]);
  const [patientId, setPatientId] = useState<string>(
    currentPatientId ?? occupied[0]?.patientId ?? '',
  );

  const [prevCurrent, setPrevCurrent] = useState(currentPatientId);
  if (prevCurrent !== currentPatientId) {
    setPrevCurrent(currentPatientId);
    if (currentPatientId) setPatientId(currentPatientId);
  }

  const call =
    phone.calls.find((c) => c.id === selected) ??
    phone.calls.find((c) => c.status === 'RINGING') ??
    phone.calls[0] ??
    null;
  const steps = phone.ladders[patientId] ?? [];

  if (phone.draft) {
    return (
      <div className="phone-panel" data-testid="phone-panel">
        <SbarPanel draft={phone.draft} playerRank={ward.playerRank} actions={actions} />
      </div>
    );
  }

  return (
    <div className="phone-panel" data-testid="phone-panel">
      <div className="phone-columns">
        <section aria-labelledby="call-list-heading" className="call-list-col">
          <h3 id="call-list-heading">{p.listLabel}</h3>
          {phone.calls.length === 0 ? (
            <p className="muted" data-testid="call-empty">
              {p.empty}
            </p>
          ) : (
            <ul className="call-list" data-testid="call-list">
              {phone.calls.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="call-row"
                    data-testid="call-row"
                    data-status={c.status}
                    data-priority={c.priority}
                    data-tag={c.tag}
                    aria-pressed={call?.id === c.id}
                    onClick={() => {
                      setSelected(c.id);
                    }}
                  >
                    <span className="tag" data-tag={c.tag}>
                      {p.tag[c.tag]}
                    </span>
                    <span className="call-row-who">
                      {c.callerName.length > 0 ? c.callerName : p.tag[c.tag]}
                    </span>
                    <span className="call-row-time">
                      <time>{c.timeLabel}</time> {p.status[c.status]}
                    </span>
                    <span className="call-row-text" lang="yue-Hant-HK">
                      {c.direction === 'IN'
                        ? c.text
                        : `${p.tag.OUTGOING}：${c.deptLabel ?? c.callerName}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label={p.heading} className="call-detail-col">
          {call ? (
            <CallDetail call={call} actions={actions} onDelegateCall={onDelegateCall} />
          ) : null}
          <div className="escalate">
            <h3>{e.heading}</h3>
            <p className="muted">{e.hint}</p>
            <div className="field">
              <label htmlFor="escalate-patient">{e.patientLabel}</label>
              <select
                id="escalate-patient"
                data-testid="escalate-patient"
                value={patientId}
                onChange={(event) => {
                  setPatientId(event.target.value);
                }}
              >
                <option value="">{e.patientNone}</option>
                {occupied.map((b) => (
                  <option key={b.bed} value={b.patientId ?? ''}>
                    {`${ui.game.ward.bedLabel(b.bed)} ${b.name ?? ''}`}
                  </option>
                ))}
              </select>
            </div>
            <Ladder
              steps={steps}
              playerRank={ward.playerRank}
              disabled={patientId === ''}
              onCall={(rank) => {
                actions.prepareCall(patientId, { kind: 'RANK', rank });
              }}
            />
            <h4>{e.deptHeading}</h4>
            <div className="dept-buttons" role="group" aria-label={e.deptHeading}>
              {phone.depts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="btn btn-small"
                  disabled={patientId === ''}
                  data-testid={`call-dept-${d.id}`}
                  onClick={() => {
                    actions.prepareCall(patientId, { kind: 'DEPT', deptId: d.id });
                  }}
                >
                  {e.deptCall(d.label)}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
