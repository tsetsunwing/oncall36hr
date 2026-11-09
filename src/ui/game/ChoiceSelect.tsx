import { shortOptionLabel } from '@/view';

export function ChoiceSelect({
  testId,
  value,
  blankLabel = '',
  options,
  optionLabel,
  onValue,
}: {
  testId: string;
  value: string;
  blankLabel?: string;
  options: readonly string[];
  /** 清單和收合面都用這個字。不傳則括號只留在打開的清單。 */
  optionLabel?: (value: string) => string;
  onValue: (value: string) => void;
}) {
  const face = value.length > 0 ? (optionLabel ?? shortOptionLabel)(value) : blankLabel;
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
            {optionLabel ? optionLabel(item) : item}
          </option>
        ))}
      </select>
      <span className="drug-order-select-face" data-testid={`${testId}-face`} aria-hidden="true">
        {face}
      </span>
    </span>
  );
}
