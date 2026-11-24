/** Figma Treat P2 floating menu shell (132:545). Hosts production order forms in L3. */
import type { ReactNode } from 'react';

const L1 = [
  { id: 'oxygen' as const, label: '氧氣 Oxygen' },
  { id: 'ivfluids' as const, label: '靜脈輸液 IV fluids' },
  { id: 'drugs' as const, label: '藥物 Drugs' },
  { id: 'catheters' as const, label: '引流／管道 Drains / lines' },
];

const O2_L2 = [
  { id: 'nc', label: '鼻導管 NC' },
  { id: 'nrbm', label: '氧氣面罩 NRBM' },
  { id: 'hfnc', label: '高流量 HFNC' },
  { id: 'niv', label: '非侵入通氣 NIV' },
  { id: 'intubate', label: '插管 Intubation' },
];

export type TreatP2L1 = (typeof L1)[number]['id'] | null;
export type TreatP2L2 = (typeof O2_L2)[number]['id'] | null;

export function TreatP2Shell({
  l1,
  l2,
  onL1,
  onL2,
  l3,
}: {
  l1: TreatP2L1;
  l2: TreatP2L2;
  onL1: (id: TreatP2L1) => void;
  onL2: (id: TreatP2L2) => void;
  l3: ReactNode;
}) {
  return (
    <div
      className="fal-treat-p2"
      data-node-id="132:545"
      data-name="Floating Menu"
      data-testid="lg-treat-p2"
    >
      <div className="fal-treat-p2-title" data-node-id="132:546">
        <p className="fal-t-treat-title" data-node-id="132:547">
          治療 Treat
        </p>
      </div>
      <div className="fal-treat-p2-cols" data-node-id="132:549" data-name="Columns">
        <div className="fal-treat-col" data-node-id="132:550" data-name="L1 · 類別">
          <p className="fal-t-treat-col-h" data-node-id="132:551">
            L1 · 類別 Category
          </p>
          {L1.map((row) => (
            <button
              key={row.id}
              type="button"
              className="fal-treat-row"
              data-selected={l1 === row.id}
              data-testid={row.id === 'oxygen' ? 'lg-treat-oxygen' : undefined}
              data-name={row.label}
              onClick={() => {
                onL1(row.id);
                onL2(row.id === 'oxygen' ? 'nc' : null);
              }}
            >
              <p className="fal-t-treat-row" data-selected={l1 === row.id}>
                {row.label}
              </p>
            </button>
          ))}
        </div>
        {l1 === 'oxygen' ? (
          <div className="fal-treat-col" data-node-id="132:562" data-name="L2 · 項目">
            <p className="fal-t-treat-col-h" data-node-id="132:563">
              L2 · 氧氣面板 O2 panel
            </p>
            {O2_L2.map((row) => (
              <button
                key={row.id}
                type="button"
                className="fal-treat-row"
                data-selected={l2 === row.id}
                onClick={() => {
                  onL2(row.id);
                }}
              >
                <p className="fal-t-treat-row" data-selected={l2 === row.id}>
                  {row.label}
                </p>
              </button>
            ))}
          </div>
        ) : null}
        {l1 ? (
          <div
            className="fal-treat-col fal-treat-l3"
            data-node-id="132:572"
            data-name="L3 · 劑量／細節"
          >
            <p className="fal-t-treat-col-h" data-node-id="132:573">
              {l1 === 'oxygen'
                ? 'L3 · 氧氣細節 O2 details'
                : l1 === 'drugs'
                  ? 'L3 · 藥物 Drug order'
                  : l1 === 'ivfluids'
                    ? 'L3 · 輸液 IV fluids'
                    : 'L3 · 引流／管道 Drains'}
            </p>
            <div className="fal-treat-l3-slot">{l3}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
