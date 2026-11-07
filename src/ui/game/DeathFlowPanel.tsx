import { ui } from '@/i18n';
import type { DeathStepView, DeathView, GameActions } from '@/view';

export interface DeathFlowPanelProps {
  death: DeathView;
  actions: GameActions;
  /** 病房模式：開始電話後轉到「電話」分頁 */
  onOpenPhone?: () => void;
}

function fieldValue(field: string, death: DeathView, step: DeathStepView): string {
  const d = ui.game.death;
  const p = death.prefill;
  switch (field) {
    case 'name':
      return p.name;
    case 'ageSex':
      return `${String(p.age)} · ${d.sex[p.sex]}`;
    case 'bed':
      return ui.game.patient.bed(p.bed);
    case 'timeOfDeath':
      return death.diedAtLabel;
    case 'cause':
      return p.cause;
    case 'seniorRank':
      return d.rank[p.seniorRank] ?? p.seniorRank;
    case 'resusSummary':
      return d.summary(p.resusSummary.cycles, p.resusSummary.shocks, p.resusSummary.drugs);
    default:
      return step.step;
  }
}

/**
 * 死亡流程面板：四步按鈕確認（預填內容來自 case 資料）。全部完成前床位不釋放，並持續扣分。
 */
export function DeathFlowPanel({ death, actions, onOpenPhone }: DeathFlowPanelProps) {
  const d = ui.game.death;
  const label = (field: string) => (d.field as Record<string, string>)[field] ?? field;
  return (
    <section
      className="death-flow"
      data-testid="death-panel"
      data-status={death.status}
      aria-labelledby="death-heading"
    >
      <h2 id="death-heading" className="panel-title">
        {d.heading}
      </h2>
      <p
        className="badge"
        data-level={death.status === 'COMPLETE' ? 'NORMAL' : 'ALARM'}
        data-testid="death-status"
      >
        {d.status[death.status]}
      </p>
      <p>
        {d.diedAt}：{death.diedAtLabel}
        {death.delayCharges > 0 ? ` · ${d.delay(death.delayCharges)}` : ''}
      </p>
      <ol className="death-steps">
        {death.steps.map((step) => (
          <li key={step.step} data-done={step.done} data-testid={`death-step-${step.step}`}>
            <div className="death-step-head">
              <strong>{d.step[step.step]}</strong>
              {step.done ? (
                <span className="tag tag-ok">
                  {d.done}
                  {step.completedLabel ? ` · ${step.completedLabel}` : ''}
                </span>
              ) : step.viaPhone ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  data-testid={`death-call-${step.step}`}
                  onClick={() => {
                    actions.startDeathCall(step.step);
                    onOpenPhone?.();
                  }}
                >
                  {step.step === 'NOTIFY_SENIOR' ? d.callSenior : d.callFamily}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  aria-label={d.stepAria(d.step[step.step])}
                  data-testid={`death-confirm-${step.step}`}
                  onClick={() => {
                    actions.completeDeathStep(step.step);
                  }}
                >
                  {d.confirm}
                </button>
              )}
            </div>
            <dl className="death-prefill">
              {step.fields.map((field) => (
                <div key={field}>
                  <dt>{label(field)}</dt>
                  <dd>{fieldValue(field, death, step)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}
