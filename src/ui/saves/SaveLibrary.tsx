import { useState } from 'react';
import { ui } from '@/i18n';
import type { SaveSlotView } from '@/storage';

export interface SaveLibraryProps {
  slots: SaveSlotView[];
  message: string | null;
  onContinue: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onImport: (slot: number, json: string) => void;
}

function wallClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function summaryText(slot: SaveSlotView): string {
  const s = ui.saves;
  if (slot.status === 'CORRUPT') return s.corrupt;
  if (slot.status !== 'OK' || !slot.meta) return s.empty;
  const summary = slot.meta.summary;
  const mode = ui.shift.mode[summary.mode] ?? summary.mode;
  const rank = ui.shift.setup.rank[summary.rank]?.name ?? summary.rank;
  const difficulty = ui.shift.setup.difficulty[summary.difficulty]?.name ?? summary.difficulty;
  return `${mode} · ${rank} · ${difficulty} · ${wallClock(slot.meta.savedAt)}`;
}

export function SaveLibrary({
  slots,
  message,
  onContinue,
  onDelete,
  onExport,
  onImport,
}: SaveLibraryProps) {
  const s = ui.saves;
  const manualCount = Math.max(1, slots.filter((slot) => slot.kind === 'MANUAL').length);
  const [importSlot, setImportSlot] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  return (
    <section
      className="save-library"
      aria-labelledby="save-library-heading"
      data-testid="save-library"
    >
      <h2 id="save-library-heading">{s.libraryHeading}</h2>
      {message ? (
        <p className="notice notice-blocked" role="status" data-testid="save-message">
          {message}
        </p>
      ) : null}
      <ul className="save-list">
        {slots.map((slot) => (
          <li
            key={slot.id}
            className="save-row"
            data-testid={`save-row-${slot.id}`}
            data-status={slot.status}
          >
            <div>
              <strong>
                {s.kind[slot.kind] ?? slot.kind} · {slot.id}
              </strong>
              <p className="hint">{summaryText(slot)}</p>
            </div>
            <div className="save-row-actions">
              <button
                type="button"
                className="btn"
                disabled={slot.status !== 'OK'}
                data-testid={`continue-${slot.id}`}
                onClick={() => {
                  onContinue(slot.id);
                }}
              >
                {s.continue}
              </button>
              <button
                type="button"
                className="btn"
                disabled={slot.status !== 'OK'}
                data-testid={`export-${slot.id}`}
                onClick={() => {
                  onExport(slot.id);
                }}
              >
                {s.export}
              </button>
              {pendingDelete === slot.id ? (
                <>
                  <button
                    type="button"
                    className="btn btn-danger"
                    data-testid={`confirm-delete-${slot.id}`}
                    onClick={() => {
                      setPendingDelete(null);
                      onDelete(slot.id);
                    }}
                  >
                    {s.confirmDelete}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setPendingDelete(null);
                    }}
                  >
                    {s.cancelDelete}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn"
                  disabled={slot.status === 'EMPTY'}
                  data-testid={`delete-${slot.id}`}
                  onClick={() => {
                    setPendingDelete(slot.id);
                  }}
                >
                  {s.delete}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <form
        className="save-import"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <div className="field">
          <label htmlFor="import-slot">{s.importSlot}</label>
          <select
            id="import-slot"
            data-testid="import-slot"
            value={importSlot}
            onChange={(event) => {
              setImportSlot(Number(event.target.value));
            }}
          >
            {Array.from({ length: manualCount }, (_, index) => index + 1).map((n) => (
              <option key={n} value={n}>
                {s.slot(n)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="import-file">{s.importFile}</label>
          <input
            id="import-file"
            data-testid="import-file"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              void file.text().then((text) => {
                onImport(importSlot, text);
              });
            }}
          />
        </div>
      </form>
    </section>
  );
}
