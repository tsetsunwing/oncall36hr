import { useMemo, useState } from 'react';
import { ui } from '@/i18n';
import {
  composeDrugOrderPhrase,
  placedDrugParams,
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
  type PlacedOrderParams,
} from '@/view';

export interface DrugOrderFormProps {
  drugId: string;
  medications: readonly MedicationOption[];
  onSubmit: (order: { catalogId: string; text: string; params: PlacedOrderParams }) => void;
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
    const next = phrase.length > 0 ? phrase : null;
    setRoute(next);
    if (next?.startsWith('IV Infusion')) {
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
    if (!selected || selected.catalogId.length === 0) return;
    const params = placedDrugParams(selected.id, draft);
    const phrase = composeDrugOrderPhrase(draft);
    if (!params || !phrase) return;
    onSubmit({ catalogId: selected.catalogId, text: phrase, params });
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

      <label className="drug-order-field">
        {t.route}
        <select
          value={route ?? ''}
          data-testid="drug-order-route"
          onChange={(event) => {
            chooseRoute(event.target.value);
          }}
        >
          <option value="" />
          {DRUG_ROUTES.map((item) => (
            <option key={item.id} value={item.phrase}>
              {item.phrase}
            </option>
          ))}
        </select>
      </label>

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
          <label className="drug-order-field">
            {t.diluent}
            <select
              value={diluent ?? ''}
              data-testid="drug-order-diluent"
              onChange={(event) => {
                setDiluent(event.target.value.length > 0 ? event.target.value : null);
              }}
            >
              <option value="" />
              {DILUENTS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="drug-order-field">
            {t.volume}
            <select
              value={volume ?? ''}
              data-testid="drug-order-volume"
              onChange={(event) => {
                setVolume(event.target.value.length > 0 ? event.target.value : null);
              }}
            >
              <option value="" />
              {INFUSION_VOLUMES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
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
          <label className="drug-order-field">
            {t.titration}
            <select
              value={titration ?? ''}
              data-testid="drug-order-titration"
              onChange={(event) => {
                setTitration(event.target.value.length > 0 ? event.target.value : null);
              }}
            >
              <option value="" />
              {TITRATION_TARGETS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <>
          <label className="drug-order-field">
            {t.frequency}
            <select
              value={frequency ?? ''}
              data-testid="drug-order-frequency"
              onChange={(event) => {
                setFrequency(event.target.value.length > 0 ? event.target.value : null);
              }}
            >
              <option value="" />
              {FREQUENCIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="drug-order-field">
            {t.prn}
            <select
              value={prn ?? ''}
              data-testid="drug-order-prn"
              onChange={(event) => {
                setPrn(event.target.value.length > 0 ? event.target.value : null);
              }}
            >
              <option value="" />
              {PRN_REASONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
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
