import { ui } from '@/i18n';
import type { PatientView, PupilView } from '@/view';

/**
 * 神經與疼痛：GCS（E/V/M）、瞳孔、疼痛分數。
 * 放喺身體圖欄，唔放心臟監察儀。數字全部來自 engine 狀態；AI 唔會寫入。
 */
export interface NeuroStripProps {
  patient: PatientView;
  /** 評估 GCS。只讀當下清醒程度；唔會自己變。 */
  onAssessGcs?: () => void;
  /** 評估疼痛。分數由病例狀態表決定；未評估＝null。 */
  onAssessPain?: () => void;
  /** 評估煩躁 0–3。 */
  onAssessAgitation?: () => void;
  /** 評估噁心 0–3。 */
  onAssessNausea?: () => void;
}

function Pupil({ label, pupil }: { label: string; pupil: PupilView }) {
  const n = ui.game.neuro;
  return (
    <span className="neuro-pupil" data-testid={`pupil-${label}`}>
      <span className="neuro-pupil-side">{label}</span>
      <span className="num">
        {pupil.sizeMm}
        {n.sizeUnit}
      </span>
      <span className="neuro-pupil-reaction" data-reaction={pupil.reaction}>
        {n.reaction[pupil.reaction] ?? pupil.reaction}
      </span>
    </span>
  );
}

export function NeuroStrip({
  patient,
  onAssessGcs,
  onAssessPain,
  onAssessAgitation,
  onAssessNausea,
}: NeuroStripProps) {
  const n = ui.game.neuro;
  const { gcs, pupils } = patient.neuro;
  return (
    <section className="neuro-strip" data-testid="neuro-strip" aria-labelledby="neuro-heading">
      <h2 id="neuro-heading" className="visually-hidden">
        {n.heading}
      </h2>
      <div className="neuro-item" data-testid="neuro-pain">
        <span className="neuro-label">{n.pain}</span>
        {patient.pain === null ? (
          <span className="neuro-value neuro-unasked">{n.painUnasked}</span>
        ) : (
          <span className="neuro-value num">
            {patient.pain}
            {n.painUnit}
          </span>
        )}
        {onAssessPain ? (
          <button
            type="button"
            className="neuro-action"
            data-testid="assess-pain"
            onClick={onAssessPain}
          >
            {n.assessPain}
          </button>
        ) : null}
      </div>
      <div className="neuro-item" data-testid="neuro-agitation">
        <span className="neuro-label">{n.agitation}</span>
        {patient.agitation === null ? (
          <span className="neuro-value neuro-unasked">{n.painUnasked}</span>
        ) : (
          <span className="neuro-value num">
            {patient.agitation}
            {n.painUnit}
          </span>
        )}
        {onAssessAgitation ? (
          <button
            type="button"
            className="neuro-action"
            data-testid="assess-agitation"
            onClick={onAssessAgitation}
          >
            {n.assessAgitation}
          </button>
        ) : null}
      </div>
      <div className="neuro-item" data-testid="neuro-nausea">
        <span className="neuro-label">{n.nausea}</span>
        {patient.nausea === null ? (
          <span className="neuro-value neuro-unasked">{n.painUnasked}</span>
        ) : (
          <span className="neuro-value num">
            {patient.nausea}
            {n.painUnit}
          </span>
        )}
        {onAssessNausea ? (
          <button
            type="button"
            className="neuro-action"
            data-testid="assess-nausea"
            onClick={onAssessNausea}
          >
            {n.assessNausea}
          </button>
        ) : null}
      </div>
      <div className="neuro-item" data-testid="neuro-gcs">
        <span className="neuro-label">{n.gcs}</span>
        <span className="neuro-value num">{gcs.total}</span>
        <span className="neuro-parts num">
          {n.eye}
          {gcs.e} {n.verbal}
          {gcs.v} {n.motor}
          {gcs.m}
        </span>
      </div>
      {onAssessGcs ? (
        <button
          type="button"
          className="neuro-action"
          data-testid="assess-gcs"
          onClick={onAssessGcs}
        >
          {n.assessGcs}
        </button>
      ) : null}
      <div className="neuro-item neuro-item-pupils" data-testid="neuro-pupils">
        <span className="neuro-label">{n.pupils}</span>
        <Pupil label={n.left} pupil={pupils.left} />
        <Pupil label={n.right} pupil={pupils.right} />
      </div>
    </section>
  );
}
