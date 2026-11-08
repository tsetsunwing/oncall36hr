import { useEffect, useId, useRef, useState } from 'react';
import { ui } from '@/i18n';
import { composePromptPhrase, type QuickChipView } from '@/view';
import type { PromptPhraseValues } from '@/view/quickPrompt';

export interface ChipPromptProps {
  chip: QuickChipView;
  onSubmit: (text: string) => void;
  onClose: () => void;
}

type Draft = Record<string, { value: string; unit: string; every: string }>;

function draftFrom(chip: QuickChipView): Draft {
  const draft: Draft = {};
  for (const field of chip.prompt?.fields ?? []) {
    if (field.kind === 'amount') {
      draft[field.id] = {
        value: field.value === null ? '' : String(field.value),
        unit: field.unit,
        every: '',
      };
    } else if (field.kind === 'select') {
      draft[field.id] = { value: field.value ?? '', unit: '', every: '' };
    } else {
      draft[field.id] = {
        value: field.value ?? '',
        unit: '',
        every: field.every === null ? '' : String(field.every),
      };
    }
  }
  return draft;
}

function frequencyToken(kind: string, every: string): string | null {
  if (kind === 'stat' || kind === 'TDS' || kind === 'prn') return kind;
  const count = Number(every);
  if (!Number.isFinite(count) || count <= 0) return null;
  if (kind === 'Q_H') return `Q${String(count)}H`;
  if (kind === 'Q_min') return `Q${String(count)}min`;
  return null;
}

export function ChipPrompt({ chip, onSubmit, onClose }: ChipPromptProps) {
  const prompt = chip.prompt;
  const c = ui.game.chat.prompt;
  const titleId = useId();
  const ref = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(chip));

  useEffect(() => {
    const field = ref.current?.querySelector('input, select');
    if (field instanceof HTMLElement) field.focus();
  }, [chip.id]);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!prompt) return null;

  function update(id: string, patch: Partial<Draft[string]>) {
    setDraft((current) => ({
      ...current,
      [id]: { value: '', unit: '', every: '', ...current[id], ...patch },
    }));
  }

  const values: PromptPhraseValues = {};
  let ready = true;
  for (const field of prompt.fields) {
    const row = draft[field.id];
    if (field.kind === 'amount') {
      const value = Number(row?.value);
      const inRange =
        (field.min === undefined || value >= field.min) &&
        (field.max === undefined || value <= field.max);
      const filled = row?.value.trim() !== '' && Number.isFinite(value) && value > 0 && inRange;
      if (field.required && !filled) ready = false;
      if (!filled) continue;
      if (field.id === 'dose') values.dose = { value, unit: row?.unit ?? field.unit };
      if (field.id === 'volume') values.volume = value;
      if (field.id === 'rate') values.rate = value;
      if (field.id === 'energy') values.energy = value;
      if (field.id === 'flow') values.flow = value;
      if (field.id === 'transfusion') values.transfusion = value;
    } else if (field.kind === 'select') {
      if (field.required && !row?.value) ready = false;
      if (!row?.value) continue;
      if (field.id === 'route') values.route = row.value;
      if (field.id === 'times') values.times = Number(row.value.slice(1));
    } else {
      const token = frequencyToken(row?.value ?? '', row?.every ?? '');
      const needsEvery = row?.value === 'Q_H' || row?.value === 'Q_min';
      if (field.required && !token) ready = false;
      if (needsEvery && !token) ready = false;
      if (token) values.frequency = token;
    }
  }

  return (
    <form
      ref={ref}
      className="chip-prompt"
      role="dialog"
      aria-labelledby={titleId}
      data-testid="chip-prompt"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onSubmit(composePromptPhrase(prompt.stem, values));
        onClose();
      }}
    >
      <p id={titleId} className="chip-prompt-title">
        {c.label(chip.label)}
      </p>
      {prompt.fields.map((field) => {
        const row = draft[field.id];
        const name = c[field.id];
        if (field.kind === 'amount') {
          return (
            <label key={field.id}>
              {name}
              <input
                type="number"
                min={field.min ?? 0}
                max={field.max}
                step="any"
                inputMode="decimal"
                aria-label={name}
                value={row?.value ?? ''}
                onChange={(event) => {
                  update(field.id, { value: event.target.value });
                }}
              />
              {field.min !== undefined && field.max !== undefined ? (
                <span className="hint">{c.outOfRange(field.min, field.max)}</span>
              ) : null}
              {field.units.length > 1 ? (
                <select
                  aria-label={`${name} unit`}
                  value={row?.unit ?? field.unit}
                  onChange={(event) => {
                    update(field.id, { unit: event.target.value });
                  }}
                >
                  {field.units.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              ) : (
                <span>{field.unit}</span>
              )}
            </label>
          );
        }
        if (field.kind === 'select') {
          return (
            <label key={field.id}>
              {name}
              <select
                aria-label={name}
                value={row?.value ?? ''}
                onChange={(event) => {
                  update(field.id, { value: event.target.value });
                }}
              >
                <option value="">—</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        const kind = row?.value ?? '';
        return (
          <label key={field.id}>
            {name}
            <select
              aria-label={name}
              value={kind}
              onChange={(event) => {
                update(field.id, { value: event.target.value });
              }}
            >
              <option value="">—</option>
              <option value="stat">stat</option>
              <option value="TDS">TDS</option>
              <option value="prn">prn</option>
              <option value="Q_H">Q_H</option>
              <option value="Q_min">Q_min</option>
            </select>
            {kind === 'Q_H' || kind === 'Q_min' ? (
              <>
                <span>{c.every}</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  aria-label={kind === 'Q_H' ? c.hours : c.minutes}
                  value={row?.every ?? ''}
                  onChange={(event) => {
                    update(field.id, { every: event.target.value });
                  }}
                />
                <span>{kind === 'Q_H' ? c.hours : c.minutes}</span>
              </>
            ) : null}
          </label>
        );
      })}
      <div className="chip-prompt-actions">
        <button type="button" className="chip-btn" onClick={onClose}>
          {c.cancel}
        </button>
        <button
          type="submit"
          className="chip-btn"
          data-testid="chip-prompt-confirm"
          disabled={!ready}
        >
          {c.confirm}
        </button>
      </div>
    </form>
  );
}
