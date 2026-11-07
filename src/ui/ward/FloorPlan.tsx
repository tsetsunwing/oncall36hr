import { ui } from '@/i18n';
import type { BedView, GameActions, WardView } from '@/view';

export interface FloorPlanProps {
  ward: WardView;
  actions: GameActions;
  onOpenPhone: () => void;
  compact?: boolean;
}

function BedButton({ bed, actions }: { bed: BedView; actions: GameActions }) {
  const w = ui.game.ward;
  const occupied =
    bed.patientId !== null && bed.name !== null && bed.age !== null && bed.sex !== null;
  return (
    <button
      type="button"
      className="bed"
      data-testid={`bed-${String(bed.bed)}`}
      data-level={occupied ? bed.level : 'EMPTY'}
      data-here={bed.here}
      aria-pressed={bed.here}
      onClick={() => {
        actions.goToBed(bed.bed);
      }}
    >
      <span className="bed-no">{bed.bed}</span>
      {occupied ? (
        <>
          <span className="bed-name">{bed.name}</span>
          <span className="bed-meta">
            {bed.age}
            {w.sex[bed.sex ?? 'M']}
          </span>
          <span className="bed-mews">{w.mewsShort(bed.mewsScore ?? 0)}</span>
          <span className="bed-level">{w.level[bed.level]}</span>
          {bed.newAdmission ? <span className="bed-tag">{w.newAdmission}</span> : null}
        </>
      ) : (
        <span className="bed-empty">{w.empty}</span>
      )}
      {bed.here ? <span className="bed-here">{w.here}</span> : null}
    </button>
  );
}

export function FloorPlan({ ward, actions, onOpenPhone, compact = false }: FloorPlanProps) {
  const w = ui.game.ward;
  const upper = ward.beds.filter((b) => b.row <= 1);
  const lower = ward.beds.filter((b) => b.row >= 2);
  const atStation = ward.locationBed === null && ward.movingToBed === null;
  return (
    <section
      className={`floor-plan${compact ? ' floor-plan--compact' : ''}`}
      aria-labelledby="floor-plan-heading"
      data-testid="floor-plan"
    >
      <header className="floor-plan-head">
        <h2 id="floor-plan-heading">{w.planHeading}</h2>
        <p className="floor-plan-hint">{w.planHint}</p>
      </header>
      {ward.movingToBed !== null ? (
        <p className="floor-plan-walking" role="status" data-testid="walking">
          {w.walking(ward.movingToBed, ward.arriveInSec ?? 0)}
        </p>
      ) : null}
      <div className="plan-grid" role="group" aria-label={w.mapLabel}>
        {upper.map((bed) => (
          <BedButton key={bed.bed} bed={bed} actions={actions} />
        ))}
        <div className="plan-corridor">
          <button
            type="button"
            className="landmark"
            data-here={atStation}
            data-testid="landmark-station"
            onClick={() => {
              actions.goToBed(null);
            }}
          >
            <span>{w.station}</span>
            {atStation ? <span className="landmark-sub">{w.stationHere}</span> : null}
          </button>
          <button
            type="button"
            className="landmark"
            data-ringing={ward.phone.ringing > 0}
            data-testid="landmark-phone"
            onClick={onOpenPhone}
          >
            <span>{w.phoneLandmark}</span>
            {ward.phone.ringing > 0 ? (
              <span className="landmark-sub">{w.phone.ringing(ward.phone.ringing)}</span>
            ) : null}
          </button>
          <span className="landmark landmark--static">{w.pantry}</span>
          <span className="landmark landmark--static">{w.rest}</span>
          <span className="landmark landmark--static">{w.wc}</span>
          <span className="plan-corridor-label">{w.corridor}</span>
        </div>
        {lower.map((bed) => (
          <BedButton key={bed.bed} bed={bed} actions={actions} />
        ))}
      </div>
      <footer className="floor-plan-foot">
        <span data-testid="occupancy">{w.occupancy(ward.occupied, ward.total)}</span>
        <ul className="legend" aria-label={w.legendMews}>
          <li data-level="NORMAL">{w.legend.NORMAL}</li>
          <li data-level="CAUTION">{w.legend.CAUTION}</li>
          <li data-level="ALARM">{w.legend.ALARM}</li>
          <li data-level="EMPTY">{w.legend.EMPTY}</li>
        </ul>
      </footer>
    </section>
  );
}
