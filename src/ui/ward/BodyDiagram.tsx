import { ui } from '@/i18n';
import { useState } from 'react';
import { Droplets } from 'lucide-react';
import type { BodyDiagramView, GameActions, OrderRowView, PatientView, ReportView } from '@/view';

export function BodyDiagram({
  body,
  patientId,
  actions,
  patient,
  orders,
  reports,
}: {
  body: BodyDiagramView;
  patientId: string;
  actions: GameActions;
  patient: PatientView;
  orders: OrderRowView[];
  reports: ReportView[];
}) {
  const [recordOpen, setRecordOpen] = useState(false);
  const [departure, setDeparture] = useState<'transfer' | 'discharge' | null>(null);
  const w = ui.game.ward;
  const ioOrder = body.ioOrder;
  return (
    <section
      className="body-diagram"
      aria-labelledby="body-diagram-heading"
      data-testid="body-diagram"
    >
      <header className="floor-plan-head">
        <h2 id="body-diagram-heading">{w.bodyHeading}</h2>
        <button
          type="button"
          className="btn btn-small"
          data-testid="open-medical-record"
          aria-expanded={recordOpen}
          aria-controls="medical-record"
          onClick={() => {
            setRecordOpen(!recordOpen);
          }}
        >
          {w.medicalRecord.open}
        </button>
        <button
          type="button"
          className="btn btn-small"
          data-testid="leave-bed"
          onClick={() => {
            actions.enterPlace('STATION');
          }}
        >
          {w.medicalRecord.leave}
        </button>
      </header>
      {recordOpen ? <MedicalRecord patient={patient} orders={orders} reports={reports} /> : null}
      <div className="departure-actions">
        {patient.icuTransferReady ? (
          <button
            type="button"
            className="btn btn-small"
            data-testid="transfer-out"
            onClick={() => {
              setDeparture('transfer');
            }}
          >
            {w.medicalRecord.transfer}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-small"
          data-testid="discharge"
          onClick={() => {
            setDeparture('discharge');
          }}
        >
          {w.medicalRecord.discharge}
        </button>
        {departure ? (
          <div
            role="group"
            aria-label={
              departure === 'transfer'
                ? w.medicalRecord.confirmTransfer
                : w.medicalRecord.confirmDischarge
            }
          >
            <span>
              {departure === 'transfer'
                ? w.medicalRecord.confirmTransfer
                : w.medicalRecord.confirmDischarge}
            </span>
            <button
              type="button"
              className="btn btn-small"
              data-testid="confirm-departure"
              onClick={() => {
                if (departure === 'transfer') actions.transferOut(patientId);
                else actions.discharge(patientId);
                setDeparture(null);
              }}
            >
              {w.medicalRecord.confirm}
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                setDeparture(null);
              }}
            >
              {w.medicalRecord.cancel}
            </button>
          </div>
        ) : null}
      </div>
      <div className="body-diagram-stage">
        <svg className="body-outline" viewBox="0 0 200 360" aria-hidden="true" focusable="false">
          <circle cx="100" cy="40" r="26" />
          <path d="M90 64h20l4 18H86Z" />
          <path d="M70 88c0 0-15 22-18 62s6 64 26 72h44c20-8 29-32 26-72s-18-62-26-62c-12 16-40 16-52 0Z" />
          <path d="M68 104c-28 16-40 56-38 86 2 16 16 18 20 4 6-24 12-54 24-76 2-4 0-12-6-14Z" />
          <path d="M132 104c28 16 40 56 38 86-2 16-16 18-20 4-6-24-12-54-24-76-2-4 0-12 6-14Z" />
          <path d="M78 220l-8 100c0 16 16 20 22 8l6-108Z" />
          <path d="M122 220l8 100c0 16-16 20-22 8l-6-108Z" />
        </svg>
        <div className="body-markers" role="group" aria-label={w.bodyLabel}>
          {body.markers.map((marker) => {
            const style = { left: `${String(marker.x)}%`, top: `${String(marker.y)}%` };
            if (marker.kind === 'foley' && ioOrder) {
              return (
                <button
                  key={marker.id}
                  type="button"
                  className="body-marker"
                  style={style}
                  data-testid={`body-${marker.id}`}
                  data-kind={marker.kind}
                  aria-label={w.foleyIo}
                  onClick={() => {
                    actions.placeOrder(patientId, ioOrder.catalogId, ioOrder.text, ioOrder.params);
                  }}
                >
                  {marker.label}
                </button>
              );
            }
            return (
              <span
                key={marker.id}
                className="body-marker"
                style={style}
                data-testid={`body-${marker.id}`}
                data-kind={marker.kind}
              >
                {marker.kind === 'infusion' ? <Droplets size={13} aria-hidden="true" /> : null}
                {marker.label}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** 只顯示可見記錄，不暴露引擎的隱藏診斷。醫囑狀態不是給藥紀錄。 */
function MedicalRecord({
  patient,
  orders,
  reports,
}: {
  patient: PatientView;
  orders: OrderRowView[];
  reports: ReportView[];
}) {
  const t = ui.game.ward.medicalRecord;
  const medicines = orders.filter((order) => order.isMedication);
  const results = reports
    .filter(
      (report) =>
        report.bucket === 'laboratory' || report.bucket === 'radiology' || report.bucket === 'nm',
    )
    .slice(0, 5);
  return (
    <section
      className="medical-record"
      id="medical-record"
      aria-label={t.open}
      data-testid="medical-record"
    >
      <h3>{t.open}</h3>
      <h4>{t.background}</h4>
      <p>
        {patient.name} · {patient.age} · {ui.game.ward.sex[patient.sex]}
      </p>
      <p>
        {t.reason}: {patient.complaint || t.unknown}
      </p>
      <p>
        {t.pmh}: {t.unknown}
      </p>
      <h4>{t.allergies}</h4>
      <p>{patient.allergies.length ? patient.allergies.join('、') : t.unknown}</p>
      <h4>{t.medications}</h4>
      <p>{t.marNote}</p>
      {medicines.length ? (
        <ul>
          {medicines.map((order) => (
            <li key={order.id}>
              {order.timeLabel} · {order.label} · {ui.game.orders.status[order.status]}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t.noOrders}</p>
      )}
      <h4>{t.results}</h4>
      {results.length ? (
        <ul>
          {results.map((report) => (
            <li key={report.id}>
              {report.timeLabel} · {report.label}:{' '}
              {report.text ??
                (report.items.map((item) => `${item.label} ${item.valueText}`).join('、') ||
                  t.unknown)}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t.noReports}</p>
      )}
      <h4>{t.diagnosis}</h4>
      <p>{t.unknown}</p>
    </section>
  );
}
