import { useEffect, useRef, useState } from 'react';
import { ui } from '@/i18n';
import type { DelegationTaskCode, GameActions, WardView } from '@/view';

export interface DelegationDialogProps {
  ward: WardView;
  actions: GameActions;
  open: boolean;
  /** 由來電按「委派下屬」打開時預選的來電 */
  callId: string | null;
  onClose: () => void;
}

export function DelegationDialog({ ward, actions, open, callId, onClose }: DelegationDialogProps) {
  const d = ui.game.ward.delegation;
  const { delegation } = ward;
  const ref = useRef<HTMLDialogElement>(null);
  const [task, setTask] = useState<DelegationTaskCode>('PROCEDURE');
  const [itemId, setItemId] = useState<string>('');
  const [patientId, setPatientId] = useState<string>('');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const [prevKey, setPrevKey] = useState<string | null>(null);
  const key = `${String(open)}:${callId ?? ''}`;
  if (prevKey !== key) {
    setPrevKey(key);
    if (open && callId) {
      setTask('SIMPLE_CALL');
      setItemId('call.handle');
    }
  }

  const group = delegation.groups.find((g) => g.task === task);
  const item = group?.items.find((i) => i.id === itemId) ?? group?.items[0];
  const needsTag = item?.needsTag ?? false;
  const eligiblePatients = ward.beds.filter(
    (b) => b.patientId !== null && (needsTag ? b.newAdmission : true),
  );
  const patient = eligiblePatients.find((b) => b.patientId === patientId) ?? eligiblePatients[0];
  const sub = delegation.subordinate;
  const busy = sub?.busy ?? false;
  const needsCall = task === 'SIMPLE_CALL';
  const canSubmit =
    sub !== null &&
    !busy &&
    item !== undefined &&
    (needsCall ? callId !== null : !item.needsPatient || patient?.patientId != null);

  return (
    <dialog
      ref={ref}
      className="delegation-dialog"
      aria-labelledby="delegation-heading"
      data-testid="delegation-dialog"
      onClose={onClose}
      onCancel={onClose}
    >
      <header className="dialog-head">
        <h2 id="delegation-heading">{d.heading}</h2>
        <button type="button" className="btn btn-small" onClick={onClose} aria-label={d.close}>
          ✕
        </button>
      </header>
      {sub === null ? (
        <p data-testid="no-subordinate">{d.noSubordinate}</p>
      ) : (
        <div className="delegation-body">
          <section className="delegation-left" aria-label={d.subordinate(sub.name, sub.rank)}>
            <p className="sub-name" data-testid="sub-name">
              {d.subordinate(sub.name, ui.game.ward.escalate.rankShort[sub.rank] ?? sub.rank)}
            </p>
            <p>
              {d.statusLabel}：
              <span
                className="badge"
                data-level={busy ? 'CAUTION' : 'NORMAL'}
                data-testid="sub-status"
                data-busy={busy}
              >
                {busy ? d.status.busy : d.status.idle}
              </span>
            </p>
            <p className="muted">{d.note}</p>
            {busy ? <p className="muted">{d.busyHint}</p> : null}
            <h3>{d.historyHeading}</h3>
            {delegation.tasks.length === 0 ? (
              <p className="muted">{d.historyEmpty}</p>
            ) : (
              <ul className="delegation-history" data-testid="delegation-history">
                {delegation.tasks.map((t) => (
                  <li key={t.id} data-status={t.status}>
                    <time>{t.startLabel}</time> {t.label}
                    {t.bed !== null ? `・${ui.game.ward.bedLabel(t.bed)}` : ''}
                    <br />
                    {t.status === 'RUNNING'
                      ? d.running
                      : t.status === 'DONE'
                        ? d.done(Math.max(1, Math.round((t.elapsedSec ?? 0) / 60)))
                        : `${d.failed}${t.failureCode ? `：${d.failure[t.failureCode] ?? ''}` : ''}`}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="delegation-right">
            <fieldset>
              <legend>{d.taskStep}</legend>
              <div className="chip-row">
                {delegation.groups.map((g) => (
                  <button
                    key={g.task}
                    type="button"
                    className="btn btn-small"
                    aria-pressed={task === g.task}
                    data-testid={`task-${g.task}`}
                    onClick={() => {
                      setTask(g.task);
                      setItemId(g.items[0]?.id ?? '');
                    }}
                  >
                    {d.task[g.task]}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>{d.itemStep}</legend>
              <div className="chip-row">
                {(group?.items ?? []).map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    className="btn btn-small"
                    aria-pressed={item?.id === i.id}
                    data-testid={`item-${i.id}`}
                    onClick={() => {
                      setItemId(i.id);
                    }}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            </fieldset>
            {needsCall ? (
              <p>
                {d.callStep}：{callId ? d.forCall : d.noEligible}
              </p>
            ) : item?.needsPatient ? (
              <fieldset>
                <legend>{d.patientStep}</legend>
                {eligiblePatients.length === 0 ? (
                  <p className="muted">{d.noEligible}</p>
                ) : (
                  <div className="chip-row">
                    {eligiblePatients.map((b) => (
                      <button
                        key={b.bed}
                        type="button"
                        className="btn btn-small"
                        aria-pressed={patient?.bed === b.bed}
                        data-testid={`patient-${String(b.bed)}`}
                        onClick={() => {
                          setPatientId(b.patientId ?? '');
                        }}
                      >
                        {`${ui.game.ward.bedLabel(b.bed)}・${b.name ?? ''}`}
                      </button>
                    ))}
                  </div>
                )}
              </fieldset>
            ) : null}
            <p>
              {d.executorStep}：{d.executorSub}
            </p>
            <p className="muted">{d.responsibility}</p>
            <div className="call-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canSubmit}
                data-testid="delegate-submit"
                onClick={() => {
                  if (!item) return;
                  actions.delegate({
                    task,
                    itemId: item.id,
                    patientId: needsCall ? null : (patient?.patientId ?? null),
                    callId: needsCall ? callId : null,
                  });
                  onClose();
                }}
              >
                {d.submit}
              </button>
              <button type="button" className="btn" onClick={onClose}>
                {d.cancel}
              </button>
            </div>
          </section>
        </div>
      )}
    </dialog>
  );
}
