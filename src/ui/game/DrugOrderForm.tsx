import { useEffect, useMemo, useState } from 'react';
import { ui } from '@/i18n';
import {
  composeDrugOrderPhrase,
  placedDrugParams,
  UNLISTED_DRUG_CATALOG_ID,
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
  shortClassLabel,
  TITRATION_TARGETS,
  type DrugOrderDraft,
  type MedicationOption,
  type PlacedOrderParams,
} from '@/view';
import { ChoiceSelect } from './ChoiceSelect';

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
  const [drugClass, setDrugClass] = useState<string | null>(null);
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
  const treatmentClasses = useMemo(() => {
    if (!treatmentSearch) return [];
    const seen = new Set<string>();
    const names: string[] = [];
    for (const item of choices) {
      for (const name of item.classes ?? []) {
        if (seen.has(name)) continue;
        seen.add(name);
        names.push(name);
      }
    }
    return names;
  }, [choices, treatmentSearch]);
  const matches = useMemo(() => {
    if (treatmentSearch) return suggestTreatmentDrugs(query, choices, drugClass);
    const needle = query.trim().toLowerCase();
    return choices.filter(
      (item) => needle.length === 0 || item.label.toLowerCase().includes(needle),
    );
  }, [choices, drugClass, query, treatmentSearch]);
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
    if (!selected) return;
    const params = placedDrugParams(selected.id, draft);
    const phrase = composeDrugOrderPhrase(draft);
    if (!params || !phrase) return;
    if (treatmentSearch) {
      onSubmit({
        catalogId: UNLISTED_DRUG_CATALOG_ID,
        text: phrase,
        params: { ...params, drugFormularyId: null, treatmentDrugId: selected.id },
      });
      return;
    }
    if (selected.catalogId.length === 0) return;
    onSubmit({ catalogId: selected.catalogId, text: phrase, params });
  }

  return (
    <form
      className="drug-order"
      role="dialog"
      aria-modal="true"
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
          type="text"
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
            if (next instanceof Element && next.closest('.drug-order-class-filter')) return;
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
      {treatmentSearch ? (
        <label className="drug-order-field drug-order-class-filter">
          {t.drugClass}
          <ChoiceSelect
            testId="drug-order-class"
            value={drugClass ?? ''}
            blankLabel={t.everyClass}
            options={treatmentClasses}
            optionLabel={shortClassLabel}
            onValue={(next) => {
              setDrugClass(next.length > 0 ? next : null);
              setListOpen(true);
            }}
          />
        </label>
      ) : null}
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
                aria-label={
                  treatmentSearch && (item.classes ?? []).length > 0
                    ? [item.label, ...(item.classes ?? []).map(shortClassLabel)].join(', ')
                    : item.label
                }
                onMouseDown={(event) => {
                  event.preventDefault();
                  setSelectedId(item.id);
                  setQuery(item.label);
                  setListOpen(false);
                }}
              >
                <span className="drug-order-match-name">{item.label}</span>
                {treatmentSearch
                  ? (item.classes ?? []).map((name) => (
                      <span key={name} className="drug-order-class">
                        {shortClassLabel(name)}
                      </span>
                    ))
                  : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={infusion ? 'drug-order-pack drug-order-pack-infusion' : 'drug-order-pack'}>
        <label className="drug-order-field">
          {t.route}
          <ChoiceSelect
            testId="drug-order-route"
            value={route ?? ''}
            options={DRUG_ROUTES.map((item) => item.phrase)}
            onValue={chooseRoute}
          />
        </label>
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
            <label className="drug-order-field">
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
            <label className="drug-order-field">
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
      </div>

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
