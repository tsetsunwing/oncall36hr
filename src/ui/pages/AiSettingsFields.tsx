import { useState } from 'react';
import { ui } from '@/i18n';
import {
  PROVIDER_SPECS,
  modelOption,
  providerSpec,
  settingsForProvider,
  type ProviderId,
  type Settings,
  type SettingsField,
} from '@/storage';

export interface AiSettingsFieldsProps {
  draft: Settings;
  idPrefix?: string;
  invalid?: readonly SettingsField[];
  includeNurseConfirm?: boolean;
  onChange: (next: Settings) => void;
}

function fieldId(prefix: string | undefined, name: string): string {
  return prefix ? `${prefix}-${name}` : name;
}

export function AiSettingsFields({
  draft,
  idPrefix,
  invalid = [],
  includeNurseConfirm = false,
  onChange,
}: AiSettingsFieldsProps) {
  const [showKey, setShowKey] = useState(false);
  const spec = providerSpec(draft.provider);
  const known = spec.models.some((item) => item.id === draft.model);
  const option = modelOption(draft.provider, draft.model.trim());
  const id = (name: string) => fieldId(idPrefix, name);
  const describedBy = (field: SettingsField, hintId: string) =>
    invalid.includes(field) ? `${hintId} ${id(`${field}-error`)}` : hintId;

  const setModel = (model: string, resetThinking: boolean) => {
    const nextOption = modelOption(draft.provider, model.trim());
    const same = nextOption?.id === option?.id;
    onChange({
      ...draft,
      model,
      thinkingLevel: nextOption
        ? resetThinking || !same
          ? nextOption.defaultThinking
          : draft.thinkingLevel
        : '',
    });
  };

  return (
    <>
      <div className="field">
        <label htmlFor={id('provider')}>{ui.settings.providerLabel}</label>
        <select
          id={id('provider')}
          value={draft.provider}
          onChange={(event) => {
            onChange(settingsForProvider(draft, event.target.value as ProviderId));
          }}
        >
          {PROVIDER_SPECS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor={id('baseUrl')}>{ui.settings.baseUrlLabel}</label>
        <input
          id={id('baseUrl')}
          name="baseUrl"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={draft.baseUrl}
          aria-invalid={invalid.includes('baseUrl')}
          aria-describedby={describedBy('baseUrl', id('baseUrl-hint'))}
          onChange={(event) => {
            onChange({ ...draft, baseUrl: event.target.value });
          }}
        />
        <p id={id('baseUrl-hint')} className="hint">
          {ui.settings.baseUrlHint}
        </p>
        {invalid.includes('baseUrl') ? (
          <p id={id('baseUrl-error')} className="field-error">
            {ui.settings.validation.baseUrl}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor={id('apiKey')}>{ui.settings.apiKeyLabel}</label>
        <input
          id={id('apiKey')}
          name="apiKey"
          type={showKey ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          value={draft.apiKey}
          aria-invalid={invalid.includes('apiKey')}
          aria-describedby={describedBy('apiKey', id('apiKey-hint'))}
          onChange={(event) => {
            onChange({ ...draft, apiKey: event.target.value });
          }}
        />
        <p id={id('apiKey-hint')} className="hint">
          {ui.settings.apiKeyHint}
        </p>
        {invalid.includes('apiKey') ? (
          <p id={id('apiKey-error')} className="field-error">
            {ui.settings.validation.apiKey}
          </p>
        ) : null}
        <label className="checkbox" htmlFor={id('showKey')}>
          <input
            id={id('showKey')}
            type="checkbox"
            checked={showKey}
            onChange={(event) => {
              setShowKey(event.target.checked);
            }}
          />
          {ui.settings.showKey}
        </label>
      </div>

      <div className="field">
        <label htmlFor={id('modelList')}>{ui.settings.modelListLabel}</label>
        <select
          id={id('modelList')}
          value={known ? draft.model : '__custom'}
          onChange={(event) => {
            const value = event.target.value;
            if (value === '__custom') return;
            setModel(value, true);
          }}
        >
          {spec.models.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))}
          <option value="__custom">{ui.settings.customModel}</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor={id('model')}>{ui.settings.modelLabel}</label>
        <input
          id={id('model')}
          name="model"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={draft.model}
          aria-invalid={invalid.includes('model')}
          aria-describedby={describedBy('model', id('model-hint'))}
          onChange={(event) => {
            setModel(event.target.value, false);
          }}
        />
        <p id={id('model-hint')} className="hint">
          {ui.settings.modelHint}
        </p>
        {invalid.includes('model') ? (
          <p id={id('model-error')} className="field-error">
            {ui.settings.validation.model}
          </p>
        ) : null}
      </div>

      {option && option.thinking.length > 0 ? (
        <div className="field">
          <label htmlFor={id('thinking')}>{ui.settings.thinkingLabel}</label>
          <select
            id={id('thinking')}
            value={option.thinking.includes(draft.thinkingLevel) ? draft.thinkingLevel : ''}
            onChange={(event) => {
              onChange({ ...draft, thinkingLevel: event.target.value });
            }}
          >
            <option value="">{ui.settings.thinkingDefault}</option>
            {option.thinking.map((level) => (
              <option key={level} value={level}>
                {level === option.defaultThinking
                  ? `${level} · ${ui.settings.thinkingDefault}`
                  : level}
              </option>
            ))}
          </select>
          <p className="hint">{ui.settings.thinkingHint}</p>
        </div>
      ) : null}

      {includeNurseConfirm ? (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.nurseConfirmHighRisk}
            onChange={(event) => {
              onChange({ ...draft, nurseConfirmHighRisk: event.target.checked });
            }}
          />
          {ui.settings.nurseConfirmLabel}
        </label>
      ) : null}
    </>
  );
}
