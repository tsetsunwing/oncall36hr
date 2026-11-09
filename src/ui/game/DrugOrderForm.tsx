import { useMemo, useState } from 'react';
import { ui } from '@/i18n';
import {
  composeDrugOrderPhrase,
  DILUENTS,
  DOSE_UNITS,
  DRUG_ROUTES,
  drugOrderReady,
  FREQUENCIES,
  INFUSION_VOLUMES,
  isInfusionRoute,
  PRN_REASONS,
  RATE_UNITS,
  TITRATION_TARGETS,
  type DrugOrderDraft,
  type MedicationOption,
} from '@/view';

export interface DrugOrderFormProps {
  drugId: string;
  medications: readonly MedicationOption[];
  onSubmit: (text: string) => void;
  onClose: () => void;
}

export function DrugOrderForm({ drugId, medications, onSubmit, onClose }: DrugOrderFormProps) {
  const t = ui.game.chat.drugOrder;
  const choices = medications;
  const initial = choices.find((item) => item.id === drugId) ?? null;
  const [query, setQuery] = useState(initial?.label ?? '');
  const [selectedId, setSelectedId] = useState<string | null>(initial?.id ?? null);
  const [listOpen, setListOpen] = useState(false);
  const [route, setRoute] = useState<string | null>(null);
  const [doseValue, setDoseValue] = useState('');
  const [doseUnit, setDoseUnit] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<string | null>(null);
  const [diluent, setDiluent] = useState<string | null>(null);
  const [volume, setVolume] = useState<string | null>(null);
  const [rateValue, setRateValue] = useState('');
  const [rateUnit, setRateUnit] = useState<string | null>(null);
  const [prn, setPrn] = useState<string | null>(null);
  const [titration, setTitration] = useState<string | null>(null);
  const [infuseOverMins, setInfuseOverMins] = useState('');
  const [afterFood, setAfterFood] = useState(false);
  const [rapidFlush, setRapidFlush] = useState(false);

  const selected = choices.find((item) => item.id === selectedId) ?? null;
  const infusion = isInfusionRoute(route);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return choices.filter(
      (item) => needle.length === 0 || item.label.toLowerCase().includes(needle),
    );
  }, [choices, query]);

  const draft: DrugOrderDraft = {
    stem: selected?.stem ?? '',
    route,
    doseValue,
    doseUnit,
    frequency,
    diluent,
    volume,
    rateValue,
    rateUnit,
    prn,
    titration,
    infuseOverMins,
    afterFood,
    rapidFlush,
  };
  const ready = drugOrderReady(draft);

  function chooseRoute(phrase: string) {
    setRoute(phrase);
    if (phrase.startsWith('IV Infusion')) {
      setFrequency(null);
      setPrn(null);
    } else {
      setDiluent(null);
      setVolume(null);
      setRateValue('');
      setRateUnit(null);
      setTitration(null);
    }
  }

  function submit() {
    const phrase = composeDrugOrderPhrase(draft);
    if (!phrase) return;
    onSubmit(phrase);
  }

  return (
    <form
      className="drug-order"
      data-testid="drug-order"
      data-infusion={infusion ? 'yes' : 'no'}
      aria-labelledby="drug-order-title"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h3 id="drug-order-title">{t.title}</h3>
      <label className="drug-order-drug">
        {t.drug}
        <input
          role="combobox"
          aria-expanded={listOpen}
          aria-controls="drug-order-matches"
          aria-autocomplete="list"
          value={query}
          placeholder={t.search}
          data-testid="drug-order-name"
          onFocus={() => {
            setListOpen(true);
          }}
          onBlur={() => {
            setListOpen(false);
          }}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            const exact = choices.find(
              (item) => item.label.toLowerCase() === next.trim().toLowerCase(),
            );
            setSelectedId(exact?.id ?? null);
            setListOpen(true);
          }}
        />
      </label>
      {listOpen ? (
        <ul
          id="drug-order-matches"
          className="drug-order-matches"
          role="listbox"
          aria-label={t.matches}
        >
          {matches.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={item.id === selectedId}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setSelectedId(item.id);
                  setQuery(item.label);
                  setListOpen(false);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <fieldset>
        <legend>{t.route}</legend>
        <div className="drug-order-options">
          {DRUG_ROUTES.map((item) => (
            <label key={item.id}>
              <input
                type="radio"
                name="drug-route"
                checked={route === item.phrase}
                data-testid={`drug-route-${item.id}`}
                onChange={() => {
                  chooseRoute(item.phrase);
                }}
              />
              {item.phrase}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="drug-order-dose">
        <label>
          {t.dose}
          <input
            type="text"
            inputMode="decimal"
            value={doseValue}
            data-testid="drug-order-dose"
            onChange={(event) => {
              setDoseValue(event.target.value);
            }}
          />
        </label>
        <label>
          {t.unit}
          <select
            value={doseUnit ?? ''}
            data-testid="drug-order-unit"
            onChange={(event) => {
              setDoseUnit(event.target.value.length > 0 ? event.target.value : null);
            }}
          >
            <option value="">{t.emptyUnit}</option>
            {DOSE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>
      </div>

      {infusion ? (
        <>
          <fieldset>
            <legend>{t.diluent}</legend>
            <div className="drug-order-options">
              {DILUENTS.map((item) => (
                <label key={item}>
                  <input
                    type="radio"
                    name="drug-diluent"
                    checked={diluent === item}
                    onChange={() => {
                      setDiluent(item);
                    }}
                  />
                  {item}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>{t.volume}</legend>
            <div className="drug-order-options">
              {INFUSION_VOLUMES.map((item) => (
                <label key={item}>
                  <input
                    type="radio"
                    name="drug-volume"
                    checked={volume === item}
                    onChange={() => {
                      setVolume(item);
                    }}
                  />
                  {item}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="drug-order-dose">
            <label>
              {t.rate}
              <input
                type="text"
                inputMode="decimal"
                value={rateValue}
                data-testid="drug-order-rate"
                onChange={(event) => {
                  setRateValue(event.target.value);
                }}
              />
            </label>
            <label>
              {t.rateUnit}
              <select
                value={rateUnit ?? ''}
                data-testid="drug-order-rate-unit"
                onChange={(event) => {
                  setRateUnit(event.target.value.length > 0 ? event.target.value : null);
                }}
              >
                <option value="">{t.emptyUnit}</option>
                {RATE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset>
            <legend>{t.titration}</legend>
            <div className="drug-order-options">
              {TITRATION_TARGETS.map((item) => (
                <label key={item}>
                  <input
                    type="radio"
                    name="drug-titration"
                    checked={titration === item}
                    onChange={() => {
                      setTitration(item);
                    }}
                  />
                  {item}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ) : (
        <>
          <fieldset>
            <legend>{t.frequency}</legend>
            <div className="drug-order-options">
              {FREQUENCIES.map((item) => (
                <label key={item}>
                  <input
                    type="radio"
                    name="drug-frequency"
                    checked={frequency === item}
                    onChange={() => {
                      setFrequency(item);
                    }}
                  />
                  {item}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>{t.prn}</legend>
            <div className="drug-order-options">
              {PRN_REASONS.map((item) => (
                <label key={item}>
                  <input
                    type="radio"
                    name="drug-prn"
                    checked={prn === item}
                    onChange={() => {
                      setPrn(item);
                    }}
                  />
                  {item}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      <fieldset>
        <legend>{t.notes}</legend>
        <div className="drug-order-options drug-order-notes">
          <label>
            Infuse over
            <input
              type="text"
              inputMode="decimal"
              value={infuseOverMins}
              aria-label="Infuse over mins"
              data-testid="drug-order-over"
              onChange={(event) => {
                setInfuseOverMins(event.target.value);
              }}
            />
            mins
          </label>
          <label>
            <input
              type="checkbox"
              checked={afterFood}
              onChange={(event) => {
                setAfterFood(event.target.checked);
              }}
            />
            Take after food
          </label>
          <label>
            <input
              type="checkbox"
              checked={rapidFlush}
              onChange={(event) => {
                setRapidFlush(event.target.checked);
              }}
            />
            Rapid IV push + 20 mL flush
          </label>
        </div>
      </fieldset>

      <div className="drug-order-actions">
        <button type="button" className="btn" onClick={onClose}>
          {t.cancel}
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          data-testid="drug-order-confirm"
          disabled={!ready}
        >
          {t.confirm}
        </button>
      </div>
    </form>
  );
}
