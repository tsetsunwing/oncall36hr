import { useState, type FormEvent } from 'react';
import type { PlacedOrderParams } from '@/view';

/** Volumes, timing and additives are prescribed by the player; names are not interpreted. */
export function ContinuousFluidForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (order: { catalogId: string; text: string; params: PlacedOrderParams }) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState('2D1S');
  const [custom, setCustom] = useState('');
  const [volume, setVolume] = useState('');
  const [hours, setHours] = useState('');
  const [additive, setAdditive] = useState('');
  const [maxBags, setMaxBags] = useState('');
  const [days, setDays] = useState('');
  const solutions =
    choice === '2D1S'
      ? ['D5', 'D5', 'NS']
      : choice === 'half'
        ? ['0.45% Sodium Chloride + 2.5% Dextrose']
        : custom
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
  const secs = Number(hours) * 3600;
  const limit = Number(days) * 86400;
  const valid =
    solutions.length > 0 &&
    solutions.length <= 20 &&
    solutions.every((x) => x.length <= 120) &&
    Number.isFinite(Number(volume)) &&
    Number(volume) > 0 &&
    Number.isSafeInteger(secs) &&
    secs > 0 &&
    (!maxBags ||
      (/^\d+$/.test(maxBags) && Number.isSafeInteger(Number(maxBags)) && Number(maxBags) > 0)) &&
    (!days || (Number.isSafeInteger(limit) && limit > 0)) &&
    additive.trim().length <= 120;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    const fluidRegimen = {
      solutions,
      volumeMl: Number(volume),
      durationSeconds: secs,
      ...(maxBags ? { maxBags: Number(maxBags) } : {}),
      ...(days ? { maxDurationSeconds: limit } : {}),
      ...(additive.trim() ? { additive: additive.trim() } : {}),
    };
    const text = `${solutions.join(' → ')}${additive.trim() ? ` + ${additive.trim()}` : ''} ${volume} mL over ${hours} h per bag${maxBags ? ` for ${maxBags} bags` : ''}${days ? ` for ${days} days` : ''}`;
    onSubmit({
      catalogId: 'fluid.maintenance',
      text,
      params: { drugFormularyId: null, dose: null, route: 'IV Infusion', fluidRegimen },
    });
  }
  return (
    <form
      className="drug-order continuous-fluid-form"
      role="dialog"
      aria-modal="true"
      aria-labelledby="continuous-fluid-title"
      data-testid="continuous-fluid-form"
      onSubmit={submit}
    >
      <h3 id="continuous-fluid-title">持續輸液</h3>
      <label>
        輸液
        <select aria-label="輸液" value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="2D1S">2D1S（D5 → D5 → NS）</option>
          <option value="half">1/2:1/2（0.45% Sodium Chloride + 2.5% Dextrose）</option>
          <option value="custom">自訂單一輸液或循環</option>
        </select>
      </label>
      {choice === 'custom' ? (
        <label>
          瓶次順序（以逗號分隔）
          <input aria-label="瓶次順序" value={custom} onChange={(e) => setCustom(e.target.value)} />
        </label>
      ) : null}
      <label>
        每瓶容量 mL
        <input
          aria-label="每瓶容量 mL"
          inputMode="decimal"
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
        />
      </label>
      <label>
        每瓶輸注時間（小時）
        <input
          aria-label="每瓶輸注時間（小時）"
          inputMode="decimal"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
      </label>
      <label>
        每瓶添加物（可留空）
        <input
          aria-label="每瓶添加物"
          value={additive}
          onChange={(e) => setAdditive(e.target.value)}
        />
      </label>
      <label>
        最多瓶數（可留空）
        <input
          aria-label="最多瓶數"
          inputMode="numeric"
          value={maxBags}
          onChange={(e) => setMaxBags(e.target.value)}
        />
      </label>
      <label>
        持續日數（可留空）
        <input
          aria-label="持續日數"
          inputMode="decimal"
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
      </label>
      <p>未設定瓶數或日數時，持續換瓶直到停囑。瓶數和日數同時設定時，先到者為準。</p>
      <button type="button" onClick={onClose}>
        取消
      </button>{' '}
      <button type="submit" disabled={!valid}>
        確認
      </button>
    </form>
  );
}
