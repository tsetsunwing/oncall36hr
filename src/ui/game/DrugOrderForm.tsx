import { useMemo, useState } from 'react';
import { ui } from '@/i18n';
import {
  composeDrugOrderPhrase,
  placedDrugParams,
  DILUENTS,
  DOSE_UNITS,
  DRUG_ROUTES,
  drugOrderReady,
  suggestTreatmentDrugs,
  FREQUENCIES,
  INFUSION_VOLUMES,
  isInfusionRoute,
  PRN_REASONS,
  RATE_UNITS,
  shortOptionLabel,
  TITRATION_TARGETS,
  type DrugOrderDraft,
  type MedicationOption,
  type PlacedOrderParams,
} from '@/view';

function ChoiceSelect({
  testId,
  value,
  blankLabel = '',
  options,
  onValue,
}: {
  testId: string;
  value: string;
  blankLabel?: string;
  options: readonly string[];
  onValue: (value: string) => void;
}) {
  const face = value.length > 0 ? shortOptionLabel(value) : blankLabel;
  return (
    <span className="drug-order-select">
      <select
        value={value}
        data-testid={testId}
        onChange={(event) => {
          onValue(event.target.value);
        }}
      >
        <option value="">{blankLabel}</option>
        {options.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <span className="drug-order-select-face" data-testid={`${testId}-face`} aria-hidden="true">
        {face}
      </span>
    </span>
  );
}

export interface DrugOrderFormProps {
  drugId: string;
  medications: readonly MedicationOption[];
  /** 治療自由輸入：滿三個英文字母才從治療藥表顯示建議。搶救按鈕不開啟。 */
  treatmentSearch?: boolean;
  onSubmit: (order: { catalogId: string; text: string; params: PlacedOrderParams }) => void;
  onClose: () => void;
}

export function DrugOrderForm({
  drugId,
  medications,
  treatmentSearch = false,
  onSubmit,
  onClose,
}: DrugOrderFormProps) {
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
    if (treatmentSearch) return suggestTreatmentDrugs(query, choices);
    const needle = query.trim().toLowerCase();
    return choices.filter(
      (item) => needle.length === 0 || item.label.toLowerCase().includes(needle),
    );
  }, [choices, query, treatmentSearch]);
  const suggestionsOpen = treatmentSearch ? listOpen && matches.length > 0 : listOpen;

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
          aria-expanded={suggestionsOpen}
          aria-controls="drug-order-matches"
          aria-autocomplete="list"
          value={query}
          placeholder={t.search}
          data-testid="drug-order-name"
          onFocus={() => {
            setListOpen(true);
          }}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Element && next.closest('.chips')) return;
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
      {suggestionsOpen ? (
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
        <ChoiceSelect
          testId="drug-order-route"
          value={route ?? ''}
          options={DRUG_ROUTES.map((item) => item.phrase)}
          onValue={chooseRoute}
        />
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
          <ChoiceSelect
            testId="drug-order-unit"
            value={doseUnit ?? ''}
            blankLabel={t.emptyUnit}
            options={DOSE_UNITS}
            onValue={(next) => {
              setDoseUnit(next.length > 0 ? next : null);
            }}
          />
        </label>
      </div>

      {infusion ? (
        <>
          <label className="drug-order-field">
            {t.diluent}
            <ChoiceSelect
              testId="drug-order-diluent"
              value={diluent ?? ''}
              options={DILUENTS}
              onValue={(next) => {
                setDiluent(next.length > 0 ? next : null);
              }}
            />
          </label>
          <label className="drug-order-field">
            {t.volume}
            <ChoiceSelect
              testId="drug-order-volume"
              value={volume ?? ''}
              options={INFUSION_VOLUMES}
              onValue={(next) => {
                setVolume(next.length > 0 ? next : null);
              }}
            />
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
              <ChoiceSelect
                testId="drug-order-rate-unit"
                value={rateUnit ?? ''}
                blankLabel={t.emptyUnit}
                options={RATE_UNITS}
                onValue={(next) => {
                  setRateUnit(next.length > 0 ? next : null);
                }}
              />
            </label>
          </div>
          <label className="drug-order-field">
            {t.titration}
            <ChoiceSelect
              testId="drug-order-titration"
              value={titration ?? ''}
              options={TITRATION_TARGETS}
              onValue={(next) => {
                setTitration(next.length > 0 ? next : null);
              }}
            />
          </label>
        </>
      ) : (
        <>
          <label className="drug-order-field">
            {t.frequency}
            <ChoiceSelect
              testId="drug-order-frequency"
              value={frequency ?? ''}
              options={FREQUENCIES}
              onValue={(next) => {
                setFrequency(next.length > 0 ? next : null);
              }}
            />
          </label>
          <label className="drug-order-field">
            {t.prn}
            <ChoiceSelect
              testId="drug-order-prn"
              value={prn ?? ''}
              options={PRN_REASONS}
              onValue={(next) => {
                setPrn(next.length > 0 ? next : null);
              }}
            />
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
