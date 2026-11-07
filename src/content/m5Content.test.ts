/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- 測試用嘅欄位變異（刻意製造壞資料） */
import { describe, expect, it } from 'vitest';
import { getContent, rawContent, validateContent } from '.';

type Rows = Record<string, any>[];

function mutate(table: string, change: (rows: Rows) => void) {
  const raw = structuredClone(rawContent);
  change(raw.tables[table] as Rows);
  return validateContent(raw);
}
const messages = (r: ReturnType<typeof validateContent>) =>
  r.ok ? '' : r.issues.map((i) => `${i.table}:${i.message}`).join('\n');

const { tables } = getContent();
const SHOCKABLE = ['VENTRICULAR_FIBRILLATION', 'PULSELESS_VT', 'TORSADES_DE_POINTES'];

describe('M5 content：節律、ACLS、死亡流程', () => {
  it('shipped content 有效', () => {
    expect(validateContent(structuredClone(rawContent)).ok).toBe(true);
  });

  it('節律：可電擊 ⇒ 無脈搏；無脈搏節律一定有 ALARM；只有 VF／pVT／Torsades 可電擊', () => {
    for (const r of tables.rhythms) {
      if (r.shockable) expect(r.pulse, r.id).toBe(false);
      if (!r.pulse) expect(r.alarm, r.id).toBe('ALARM');
      expect(r.shockable, r.id).toBe(SHOCKABLE.includes(r.id));
    }
    expect(tables.rhythms.length).toBeGreaterThanOrEqual(15);
  });

  it('每個停頓節律都有 acls RHYTHM 列；轉移節律都存在', () => {
    const ids = new Set(tables.rhythms.map((r) => r.id));
    const aclsRhythms = tables['acls-transitions'].flatMap((r) => (r.kind === 'RHYTHM' ? [r] : []));
    expect(aclsRhythms.length).toBe(5);
    for (const row of aclsRhythms) {
      for (const w of [...row.ifNoShock, ...row.ifShocked]) expect(ids.has(w.rhythm)).toBe(true);
    }
    for (const fsm of tables['case-fsm']) {
      for (const state of Object.values(fsm.states)) {
        if (state.arrest) {
          expect(aclsRhythms.some((r) => r.rhythm === state.arrest?.rhythm)).toBe(true);
          expect(fsm.postRoscState).toBeDefined();
        }
      }
    }
  });

  it('H 同 T：8 個 H／T 病因以上，處理／檢查 order 都係 catalog 內存在嘅 id', () => {
    const causes = tables['acls-transitions'].flatMap((r) => (r.kind === 'CAUSE' ? [r] : []));
    expect(causes.filter((c) => c.group === 'H').length).toBeGreaterThanOrEqual(4);
    expect(causes.filter((c) => c.group === 'T').length).toBeGreaterThanOrEqual(4);
    const catalog = new Set(tables['order-catalog'].map((o) => o.id));
    for (const cause of causes) {
      for (const id of [...cause.checkCatalogIds, ...cause.treatCatalogIds]) {
        expect(catalog.has(id), `${cause.id}:${id}`).toBe(true);
      }
    }
  });

  it('所有臨床數值列都標住待臨床審核，唔假扮正式數據', () => {
    for (const name of ['acls-transitions', 'death-process'] as const) {
      for (const row of tables[name]) {
        expect((row as any).reviewStatus, `${name}:${row.id}`).toBe('PENDING_CLINICAL_REVIEW');
      }
    }
  });

  it('死亡流程：四步齊全；每個職級都有上一級', () => {
    const steps = tables['death-process'].flatMap((r) => (r.kind === 'STEP' ? [r.step] : []));
    expect([...steps].sort()).toEqual(['CERTIFICATE', 'NOTIFY_SENIOR', 'PHONE_FAMILY', 'RECORD']);
    const model = tables['death-process'].find((r) => r.kind === 'MODEL');
    expect(model && 'seniorByRank' in model ? model.seniorByRank : null).toEqual({
      HO: 'MO',
      MO: 'RES',
      RES: 'CONSULTANT',
    });
  });

  it('壞資料被擋：可電擊節律標成有脈搏、缺 acls MODEL、死亡流程缺一步', () => {
    expect(
      messages(
        mutate('rhythms', (rows) => {
          rows.find((r) => r.id === 'VENTRICULAR_FIBRILLATION')!.pulse = true;
        }),
      ),
    ).not.toBe('');
    expect(
      messages(
        mutate('acls-transitions', (rows) => {
          rows.splice(
            rows.findIndex((r) => r.kind === 'MODEL'),
            1,
          );
        }),
      ),
    ).not.toBe('');
    expect(
      messages(
        mutate('death-process', (rows) => {
          rows.splice(
            rows.findIndex((r) => r.kind === 'STEP'),
            1,
          );
        }),
      ),
    ).not.toBe('');
    expect(
      messages(
        mutate('acls-transitions', (rows) => {
          rows.find((r) => r.kind === 'CAUSE')!.treatCatalogIds = ['no.such.order'];
        }),
      ),
    ).not.toBe('');
  });

  it('搶救 order 全部標明 acls 動作，且唔經藥房／護士審視（緊急例外）', () => {
    const acls = tables['order-catalog'].filter((o) => o.acls);
    expect(acls.map((o) => o.acls?.action).sort()).toEqual(
      expect.arrayContaining(['CPR_START', 'RHYTHM_CHECK', 'DEFIB', 'DRUG', 'TERMINATE']),
    );
    for (const o of acls) {
      expect(o.pharmacyGate).toBe(false);
      expect(o.nurseGate).toBe('NEVER');
    }
  });
});
