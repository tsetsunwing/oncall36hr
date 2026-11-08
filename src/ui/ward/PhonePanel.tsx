import { useMemo, useState } from 'react';
import { dialogue, ui } from '@/i18n';
import type {
  CallLineView,
  CallRowView,
  FamilyCallView,
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
  /** phone 隱藏家屬；family 只顯示家屬。預設全部，供既有測試使用。 */
  scope?: 'all' | 'phone' | 'family';
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

function ExchangePane({ call, actions }: { call: CallRowView; actions: GameActions }) {
  const x = ui.game.ward.phone.exchange;
  const f = ui.game.ward.phone.family;
  const exchange = call.exchange;
  const [followup, setFollowup] = useState('');
  const [say, setSay] = useState('');
  if (!exchange) return null;
  const family: FamilyCallView | null = exchange.family;
  return (
    <div className="exchange" data-testid="exchange" data-phase={exchange.phase}>
      <p
        className="exchange-status"
        role="status"
        aria-live="polite"
        data-testid="exchange-waiting"
      >
        {exchange.waiting ? x.waiting : ''}
      </p>
      {exchange.clarity !== null ? (
        <p data-testid="exchange-clarity" data-clarity={exchange.clarity}>
          {x.clarityLabel}：{x.clarity[exchange.clarity] ?? ''}
        </p>
      ) : null}
      {exchange.phase === 'OPEN' && exchange.asks.length > 0 ? (
        <div data-testid="exchange-asks">
          <p>{x.asksHeading}</p>
          <ul>
            {exchange.asks.map((id) => (
              <li key={id} data-ask={id}>
                {x.ask[id] ?? id}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {exchange.canFollowUp ? (
        <div className="field exchange-followup">
          <label htmlFor={`followup-${call.id}`}>{x.followupLabel}</label>
          <textarea
            id={`followup-${call.id}`}
            data-testid="followup-text"
            rows={3}
            maxLength={exchange.followupMaxChars}
            value={followup}
            onChange={(event) => {
              setFollowup(event.target.value);
            }}
          />
          <div className="call-actions">
            <button
              type="button"
              className="btn btn-primary"
              data-testid="followup-send"
              disabled={followup.trim().length === 0}
              onClick={() => {
                actions.sendFollowup(call.id, followup);
                setFollowup('');
              }}
            >
              {x.followupSend}
            </button>
            <span className="muted">{x.followupsLeft(exchange.followupsLeft)}</span>
          </div>
        </div>
      ) : null}
      {family?.canSay ? (
        <div className="exchange-family" data-testid="family-controls" data-stage={family.stage}>
          <p>{family.stage === 'OPENING' ? f.openingHeading : f.followupHeading}</p>
          <div className="call-actions" role="group" aria-label={f.openingHeading}>
            {family.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="btn"
                data-testid={`family-option-${option.id}`}
                onClick={() => {
                  actions.familyOption(call.id, option.id);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor={`family-say-${call.id}`}>{f.sayLabel}</label>
            <textarea
              id={`family-say-${call.id}`}
              data-testid="family-say-text"
              rows={2}
              maxLength={family.maxChars}
              value={say}
              onChange={(event) => {
                setSay(event.target.value);
              }}
            />
            <div className="call-actions">
              <button
                type="button"
                className="btn btn-primary"
                data-testid="family-say"
                disabled={say.trim().length === 0}
                onClick={() => {
                  actions.familySay(call.id, say);
                  setSay('');
                }}
              >
                {f.say}
              </button>
              <span className="muted">{f.turnsLeft(family.turnsLeft)}</span>
            </div>
          </div>
        </div>
      ) : null}
      {family?.informed ? (
        <p className="muted" data-testid="family-informed">
          {f.informed}
        </p>
      ) : null}
      {exchange.canHangUp ? (
        <button
          type="button"
          className="btn"
          data-testid="hang-up"
          onClick={() => {
            actions.endCall(call.id);
          }}
        >
          {x.hangUp}
        </button>
      ) : exchange.phase === 'CLOSED' ? (
        <p className="muted" data-testid="exchange-ended">
          {x.ended}
        </p>
      ) : null}
    </div>
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
      {call.purpose !== 'GENERAL' ? (
        <p className="muted" data-testid="call-purpose">
          {p.purpose[call.purpose] ?? ''}
        </p>
      ) : null}
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
      <CallTranscript lines={call.lines} testId="call-lines" />
      <ExchangePane key={call.id} call={call} actions={actions} />
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
          {step.reachable ? (
            <button
              type="button"
              className="btn btn-small ladder-call"
              disabled={disabled}
              data-testid={`call-rank-${step.rank}`}
              onClick={() => {
                onCall(step.rank);
              }}
            >
              {e.call(e.rankShort[step.rank] ?? step.rank)}
            </button>
          ) : null}
          {step.contacted ? <span className="ladder-note">{e.contacted}</span> : null}
          {step.skips.length > 0 ? (
            <span className="ladder-skip" data-testid={`skip-${step.rank}`}>
              {e.skipWarning(step.skips.join('、'))}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function PhonePanel({
  ward,
  actions,
  currentPatientId,
  onDelegateCall,
  scope = 'all',
}: PhonePanelProps) {
  const p = ui.game.ward.phone;
  const e = ui.game.ward.escalate;
  const phone: PhoneView = ward.phone;
  const [selected, setSelected] = useState<string | null>(null);
  const occupied = useMemo(() => ward.beds.filter((b) => b.patientId !== null), [ward.beds]);
  const [patientId, setPatientId] = useState<string>(
    currentPatientId ?? occupied[0]?.patientId ?? '',
  );
  const [deptsOpen, setDeptsOpen] = useState(false);

  const [prevCurrent, setPrevCurrent] = useState(currentPatientId);
  if (prevCurrent !== currentPatientId) {
    setPrevCurrent(currentPatientId);
    if (currentPatientId) setPatientId(currentPatientId);
  }

  const [prevFocus, setPrevFocus] = useState(phone.focusCallId);
  if (prevFocus !== phone.focusCallId) {
    setPrevFocus(phone.focusCallId);
    if (phone.focusCallId) setSelected(phone.focusCallId);
  }

  const visibleCalls = phone.calls.filter((c) => {
    // 引擎正在聚焦的通話（例如死亡流程的家屬電話）要留在目前分頁，唔好被範圍濾走。
    if (phone.focusCallId !== null && c.id === phone.focusCallId) return true;
    if (scope === 'family') return c.tag === 'FAMILY';
    if (scope === 'phone') return c.tag !== 'FAMILY';
    return true;
  });
  const call =
    visibleCalls.find((c) => c.id === selected) ??
    visibleCalls.find((c) => c.id === phone.focusCallId) ??
    visibleCalls.find((c) => c.status === 'RINGING') ??
    visibleCalls[0] ??
    null;
  const steps = phone.ladders[patientId] ?? [];

  if (phone.draft && scope !== 'family') {
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
          {visibleCalls.length === 0 ? (
            <p className="muted" data-testid="call-empty">
              {scope === 'family' ? p.emptyFamily : p.empty}
            </p>
          ) : (
            <ul className="call-list" data-testid="call-list">
              {visibleCalls.map((c) => (
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
                        : c.tag === 'FAMILY'
                          ? `${p.tag.FAMILY}：${c.patientName ?? ''}`
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
          {scope === 'family' ? null : (
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
              <button
                type="button"
                className="btn btn-small dept-toggle"
                aria-expanded={deptsOpen}
                data-testid="dept-toggle"
                onClick={() => {
                  setDeptsOpen((open) => !open);
                }}
              >
                {e.deptHeading}
              </button>
              {deptsOpen ? (
                <div className="dept-buttons" role="group" aria-label={e.deptHeading}>
                  {phone.depts.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="btn btn-small dept-badge"
                      disabled={patientId === ''}
                      data-testid={`call-dept-${d.id}`}
                      onClick={() => {
                        actions.prepareCall(patientId, { kind: 'DEPT', deptId: d.id });
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
