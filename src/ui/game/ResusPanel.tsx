import { useState } from 'react';
import { ui } from '@/i18n';
import {
  EMPTY_PLACED_PARAMS,
  formatDuration,
  RESUS_ACLS_GROUPS,
  type GameActions,
  type MedicationOption,
  type QuickChipView,
  type ResusView,
} from '@/view';
import { ChipPrompt } from './ChipPrompt';
import { DrugOrderForm } from './DrugOrderForm';

export interface ResusPanelProps {
  patientId: string;
  resus: ResusView;
  chips: QuickChipView[];
  medications?: readonly MedicationOption[];
  actions: GameActions;
}

/**
 * 搶救面板：只呈現狀態同提供「落指示」按鈕（等同快捷詞）。玩家唔做壓胸，CPR 由護士進行。
 * 全部靜態文字／顏色，冇動畫、冇閃爍。
 */
export function ResusPanel({
  patientId,
  resus,
  chips,
  medications = [],
  actions,
}: ResusPanelProps) {
  const r = ui.game.resus;
  const arrest = resus.status === 'ARREST';
  const [promptChip, setPromptChip] = useState<QuickChipView | null>(null);
  const [drugChip, setDrugChip] = useState<QuickChipView | null>(null);
  const aclsGroups = RESUS_ACLS_GROUPS.map((group) => ({
    ...group,
    items: group.chipIds.flatMap((id) => chips.filter((chip) => chip.id === id)),
  })).filter((group) => group.items.length > 0);
  const groups = ['H', 'T'] as const;

  return (
    <section
      className="resus"
      data-testid="resus-panel"
      data-status={resus.status}
      aria-labelledby="resus-heading"
    >
      <h2 id="resus-heading" className="panel-title">
        {r.heading}
        <span className="badge" data-level={arrest ? 'ALARM' : 'NORMAL'} data-testid="resus-status">
          {r.status[resus.status]}
        </span>
      </h2>

      <dl className="resus-facts">
        <div>
          <dt>{r.rhythm}</dt>
          <dd data-testid="resus-rhythm">
            {resus.rhythmLabel}
            {arrest ? `（${resus.shockable ? r.shockable : r.notShockable}）` : ''}
          </dd>
        </div>
        <div>
          <dt>{r.cpr.label}</dt>
          <dd data-testid="resus-cpr" data-state={resus.cpr}>
            {r.cpr[resus.cpr]}
            {resus.cycleElapsedSec !== null
              ? ` · ${r.cycle(formatDuration(resus.cycleElapsedSec), formatDuration(resus.cycleSeconds))}`
              : ''}
          </dd>
        </div>
        <div>
          <dt>{r.elapsed}</dt>
          <dd>{formatDuration(resus.elapsedSec)}</dd>
        </div>
        <div>
          <dt>{r.cycles}</dt>
          <dd data-testid="resus-cycles">{resus.cycles}</dd>
        </div>
        <div>
          <dt>{r.shocks}</dt>
          <dd data-testid="resus-shocks">{resus.shocks}</dd>
        </div>
        <div>
          <dt>{r.handsOff}</dt>
          <dd>{formatDuration(resus.handsOffSec)}</dd>
        </div>
      </dl>

      {arrest ? (
        <div className="resus-orders" role="group" aria-label={r.ordersLabel}>
          <p className="resus-hint">{r.ordersHint}</p>
          {aclsGroups.map((group) => (
            <div
              key={group.id}
              className="resus-acls-group"
              data-testid={`resus-group-${group.id}`}
            >
              <p className="resus-acls-label">{r.aclsGroup[group.id] ?? group.id}</p>
              <ul className="chips">
                {group.items.map((chip) => (
                  <li key={chip.id}>
                    <button
                      type="button"
                      className="btn chip"
                      data-testid={`resus-${chip.id}`}
                      onClick={() => {
                        if (chip.medicationId) setDrugChip(chip);
                        else if (chip.prompt) setPromptChip(chip);
                        else if (chip.catalogId) {
                          actions.placeOrder(
                            patientId,
                            chip.catalogId,
                            chip.label,
                            EMPTY_PLACED_PARAMS,
                          );
                        }
                      }}
                    >
                      {chip.label}
                    </button>
                    {promptChip?.id === chip.id && promptChip.prompt ? (
                      <ChipPrompt
                        chip={promptChip}
                        onSubmit={(text, params) => {
                          if (!promptChip.catalogId) return;
                          actions.placeOrder(patientId, promptChip.catalogId, text, params);
                        }}
                        onClose={() => {
                          setPromptChip(null);
                        }}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {resus.canStop ? null : (
            <p className="resus-hint">{r.stopHint(resus.cycles, resus.minCyclesBeforeStop)}</p>
          )}
        </div>
      ) : null}

      <div className="resus-drugs">
        <h3 className="panel-subtitle">{r.drugs}</h3>
        {resus.drugs.length === 0 ? (
          <p>{r.noDrugs}</p>
        ) : (
          <ul>
            {resus.drugs.map((drug, i) => (
              <li key={`${drug.label}-${String(i)}`}>
                {drug.timeLabel} · {drug.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="resus-causes" data-testid="resus-causes">
        <h3 className="panel-subtitle">{r.causes}</h3>
        <div className="cause-groups">
          {groups.map((group) => (
            <ul key={group} className="cause-list" aria-label={r.causeGroup[group]}>
              {resus.causes
                .filter((cause) => cause.group === group)
                .map((cause) => (
                  <li key={cause.id} data-testid={`cause-${cause.id}`}>
                    <span className="cause-label">
                      {r.causeGroup[group]} · {cause.label}
                    </span>
                    {cause.checked ? <span className="tag">{r.causeChecked}</span> : null}
                    {cause.treated ? <span className="tag tag-ok">{r.causeTreated}</span> : null}
                  </li>
                ))}
            </ul>
          ))}
        </div>
      </div>

      {resus.postRosc ? (
        <div className="resus-postrosc" data-testid="postrosc">
          <h3 className="panel-subtitle">{r.postRosc}</h3>
          <p>{r.postRoscRemaining(formatDuration(resus.postRosc.windowRemainingSec))}</p>
          <ul>
            {resus.postRosc.bundle.map((item) => (
              <li key={item.id} data-done={item.done}>
                {item.label}：{item.done ? r.bundleDone : r.bundlePending}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {drugChip?.medicationId ? (
        <DrugOrderForm
          drugId={drugChip.medicationId}
          medications={
            medications.some((item) => item.id === drugChip.medicationId)
              ? medications
              : [
                  {
                    id: drugChip.medicationId,
                    label: drugChip.label,
                    stem: drugChip.prompt?.stem ?? drugChip.label.toLowerCase(),
                    catalogId: drugChip.catalogId ?? '',
                  },
                  ...medications,
                ]
          }
          onSubmit={(order) => {
            actions.placeOrder(patientId, order.catalogId, order.text, order.params);
            setDrugChip(null);
          }}
          onClose={() => {
            setDrugChip(null);
          }}
        />
      ) : null}
    </section>
  );
}
