import { ui } from '@/i18n';
import type { GameActions, WardView } from '@/view';

export interface BedTableProps {
  ward: WardView;
  actions: GameActions;
}

/** 床位狀態一覽：只用 engine 已算出的床號、姓名、MEWS、等級。 */
export function BedTable({ ward, actions }: BedTableProps) {
  const w = ui.game.ward;
  const rows = ward.beds.filter((bed) => bed.patientId !== null);
  return (
    <section
      className="panel bed-table"
      aria-labelledby="bed-table-heading"
      data-testid="bed-table"
    >
      <h2 id="bed-table-heading">
        {w.table.heading}
        <span className="sp" />
        <small>{w.occupancy(ward.occupied, ward.total)}</small>
      </h2>
      <div className="bed-table-scroll">
        <table className="lab">
          <thead>
            <tr>
              <th scope="col">{w.table.bed}</th>
              <th scope="col">{w.table.patient}</th>
              <th scope="col">{w.table.mews}</th>
              <th scope="col">{w.table.status}</th>
              <th scope="col">{w.table.nurse}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((bed) => (
              <tr key={bed.bed}>
                <td>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => {
                      actions.goToBed(bed.bed);
                    }}
                  >
                    {w.table.bedNo(bed.bed)}
                  </button>
                </td>
                <td>
                  {bed.name} {bed.age}
                  {w.sex[bed.sex ?? 'M']}
                </td>
                <td>
                  <span className="mews-badge" data-band={bed.mewsBandId ?? 'LOW'}>
                    {bed.mewsScore ?? 0}
                  </span>
                </td>
                <td>{w.level[bed.level]}</td>
                <td>{bed.nurseName ?? w.table.noNurse}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
