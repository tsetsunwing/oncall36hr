import { useEffect, useState } from 'react';
import { ui } from '@/i18n';
import {
  buildOxygenOrder,
  oxygenDeviceByPhrase,
  oxygenFieldError,
  OXYGEN_CHECKS,
  OXYGEN_DEVICE_OPTIONS,
  OXYGEN_HUMIDIFICATION,
  OXYGEN_TARGETS,
  VENTURI_OPTIONS,
  type OxygenCheckId,
  type PlacedOrderParams,
} from '@/view';
import { ChoiceSelect } from './ChoiceSelect';

function deviceKind(phrase: string) {
  return oxygenDeviceByPhrase(phrase)?.kind ?? null;
}

export function OxygenOrderForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (order: { catalogId: string; text: string; params: PlacedOrderParams }) => void;
  onClose: () => void;
}) {
  const t = ui.game.chat.oxygen;
  const [target, setTarget] = useState('');
  const [device, setDevice] = useState('');
  const [flow, setFlow] = useState('');
  const [fio2, setFio2] = useState('');
  const [venturi, setVenturi] = useState('');
  const [peep, setPeep] = useState('');
  const [humidification, setHumidification] = useState<string>(
    OXYGEN_HUMIDIFICATION.find((item) => item.id === 'none')?.phrase ?? 'None',
  );
  const [checks, setChecks] = useState<Record<OxygenCheckId, boolean>>({
    titrate: false,
    wean: false,
    meals: false,
    abg: false,
    oximetry: false,
  });

  const kind = deviceKind(device);
  const checkLabels: Record<OxygenCheckId, string> = {
    titrate: t.titrate,
    wean: t.wean,
    meals: t.meals,
    abg: t.abg,
    oximetry: t.oximetry,
  };
  const draft = {
    targetPhrase: target,
    devicePhrase: device,
    flow,
    fio2,
    venturiPhrase: venturi,
    peep,
    humidificationPhrase: humidification,
    checks: OXYGEN_CHECKS.map((id) => ({ id, label: checkLabels[id], checked: checks[id] })),
  };
  const fieldError = oxygenFieldError(draft);
  const built = buildOxygenOrder(draft);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  function changeDevice(phrase: string) {
    setDevice(phrase);
    setFlow('');
    setFio2('');
    setVenturi('');
    setPeep('');
  }

  return (
    <form
      className="drug-order"
      role="dialog"
      aria-modal="true"
      data-testid="oxygen-order"
      aria-labelledby="oxygen-order-title"
      onSubmit={(event) => {
        event.preventDefault();
        if (!built.ok) return;
        onSubmit({ catalogId: built.catalogId, text: built.text, params: built.params });
      }}
    >
      <h3 id="oxygen-order-title">{t.title}</h3>
      <div className="drug-order-pack">
        <label className="drug-order-field">
          {t.target}
          <ChoiceSelect
            testId="oxygen-target"
            value={target}
            blankLabel={t.choose}
            options={OXYGEN_TARGETS.map((item) => item.phrase)}
            onValue={setTarget}
          />
        </label>
        <label className="drug-order-field">
          {t.device}
          <ChoiceSelect
            testId="oxygen-device"
            value={device}
            blankLabel={t.choose}
            options={OXYGEN_DEVICE_OPTIONS.map((item) => item.phrase)}
            onValue={changeDevice}
          />
        </label>
        {kind === 'flow' || kind === 'hfnc' ? (
          <label className="drug-order-field">
            {t.flow}
            <input
              type="text"
              inputMode="numeric"
              value={flow}
              data-testid="oxygen-flow"
              onChange={(event) => {
                setFlow(event.target.value.replace(/\D/g, ''));
              }}
            />
          </label>
        ) : null}
        {kind === 'venturi' ? (
          <label className="drug-order-field">
            {t.fio2}
            <ChoiceSelect
              testId="oxygen-venturi"
              value={venturi}
              blankLabel={t.choose}
              options={VENTURI_OPTIONS.map((item) => item.phrase)}
              onValue={setVenturi}
            />
          </label>
        ) : null}
        {kind === 'hfnc' || kind === 'peep' ? (
          <label className="drug-order-field">
            {t.fio2}
            <input
              type="text"
              inputMode="decimal"
              value={fio2}
              data-testid="oxygen-fio2"
              onChange={(event) => {
                setFio2(event.target.value);
              }}
            />
          </label>
        ) : null}
        {kind === 'peep' ? (
          <label className="drug-order-field">
            {t.peep}
            <input
              type="text"
              inputMode="decimal"
              value={peep}
              data-testid="oxygen-peep"
              onChange={(event) => {
                setPeep(event.target.value);
              }}
            />
          </label>
        ) : null}
        <label className="drug-order-field">
          {t.humidification}
          <ChoiceSelect
            testId="oxygen-humidification"
            value={humidification}
            options={OXYGEN_HUMIDIFICATION.map((item) => item.phrase)}
            onValue={setHumidification}
          />
        </label>
      </div>
      <div className="drug-order-checks">
        {OXYGEN_CHECKS.map((id) => (
          <label key={id}>
            <input
              type="checkbox"
              checked={checks[id]}
              data-testid={`oxygen-check-${id}`}
              onChange={(event) => {
                setChecks((current) => ({ ...current, [id]: event.target.checked }));
              }}
            />
            {checkLabels[id]}
          </label>
        ))}
      </div>
      {fieldError ? (
        <p className="drug-order-error" role="alert" data-testid="oxygen-error">
          {t.range(fieldError.min, fieldError.max, fieldError.unit)}
        </p>
      ) : null}
      <div className="drug-order-actions">
        <button type="button" className="btn" onClick={onClose}>
          {t.cancel}
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          data-testid="oxygen-confirm"
          disabled={!built.ok}
        >
          {t.confirm}
        </button>
      </div>
    </form>
  );
}
