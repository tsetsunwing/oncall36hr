import { ui } from '@/i18n';
import type { PatientView } from '@/view';

/** 病人離開病房（放射科等）：講明去了哪裡、幾點回來，並說明期間量不到血壓。 */
export function AwayBanner({ patient }: { patient: PatientView }) {
  const w = ui.game.ward;
  if (!patient.away) return null;
  return (
    <section className="away-banner" data-testid="patient-away" role="status">
      <p className="away-banner-title">{w.awayTitle(patient.away.place)}</p>
      <p className="away-banner-detail">{w.awayDetail(patient.away.untilLabel)}</p>
    </section>
  );
}
