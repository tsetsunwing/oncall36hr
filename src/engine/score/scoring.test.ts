/**
 * M7：單一計分帳（scoreLedger）餵六個分項。
 * 驗證：每類 M3–M6 事件落啱分項、冇總分／倍數、優先次序（C5 A）同必要處置時間窗、評級與結局標籤。
 */
import { describe, expect, it } from 'vitest';
import { getContent } from '@/content';
import * as engineApi from '../index';
import type { EngineTables } from '../case/tables';
import type { GameState } from '../core/state';
import { feed, intentEvent, params, realConfig, realEngine, realTables } from '../test/realEngine';
import { gradeOf, summariseRun } from './grading';
import { SUBSCORE_IDS, type LedgerEntry, type SubscoreCode } from './ledgerTypes';
import { scoreMissedAtEnd } from './requiredOrders';
import { subscoreSum } from './scoring';

const tables = realTables();
const engine = realEngine(tables);
const fresh = (seed = 'm7-score') => engine.init({ ...params(seed), ward: true });

const EXPECTED_SUBSCORE: Readonly<Record<string, SubscoreCode>> = {
  // M3 把關
  GATE_OBJECTION_HEEDED: 'SAFETY',
  GATE_INSISTED_CONFIRM: 'SAFETY',
  GATE_INSISTED_OBJECT: 'SAFETY',
  GATE_CONSEQUENCE_LOW: 'SAFETY',
  GATE_CONSEQUENCE_MID: 'SAFETY',
  GATE_CONSEQUENCE_HIGH: 'SAFETY',
  PHARMACY_SAFETY_GOOD: 'SAFETY',
  PHARMACY_SAFETY_FAIR: 'SAFETY',
  PHARMACY_SAFETY_POOR: 'SAFETY',
  // M4 ACLS／死亡
  TIME_TO_CPR: 'TIMELINESS',
  TIME_TO_FIRST_SHOCK: 'TIMELINESS',
  CYCLE_GAP: 'TIMELINESS',
  ROSC: 'CLINICAL_OUTCOME',
  CAUSE_TREATED: 'CLINICAL_OUTCOME',
  PATIENT_DEATH: 'CLINICAL_OUTCOME',
  DEATH_PROCESS_DELAY: 'CLINICAL_OUTCOME',
  SHOCK_INAPPROPRIATE: 'SAFETY',
  SHOCK_WRONG_ENERGY: 'SAFETY',
  ACLS_DRUG_WRONG_DOSE: 'SAFETY',
  // M5 來電／上報／SBAR／家屬／委派
  CALL_GO_NOW: 'TIMELINESS',
  CALL_LATER: 'TIMELINESS',
  CALL_CONTINUE: 'TIMELINESS',
  CALL_MISSED: 'TIMELINESS',
  CALL_MISSED_JUNIOR: 'COMMUNICATION',
  ESCALATION_STEP_OK: 'COMMUNICATION',
  ESCALATION_SKIPPED_LEVEL: 'COMMUNICATION',
  SBAR_GOOD: 'COMMUNICATION',
  SBAR_POOR: 'COMMUNICATION',
  SBAR_INACCURATE: 'COMMUNICATION',
  SBAR_RUDE: 'COMMUNICATION',
  CONSULT_GOOD: 'COMMUNICATION',
  CONSULT_POOR: 'COMMUNICATION',
  FAMILY_EMPATHIC: 'COMMUNICATION',
  FAMILY_COLD: 'COMMUNICATION',
  FAMILY_CLEAR: 'COMMUNICATION',
  FAMILY_VAGUE: 'COMMUNICATION',
  DELEGATION_FAILED: 'TIMELINESS',
  // M6 巡房／交班／自我照顧／超時／暈倒
  ROUND_CORRECT: 'CLINICAL_OUTCOME',
  ROUND_WRONG: 'CLINICAL_OUTCOME',
  ROUND_UNANSWERED: 'CLINICAL_OUTCOME',
  HANDOVER_MENTION_NEEDED: 'COMMUNICATION',
  HANDOVER_OMIT_NEEDED: 'COMMUNICATION',
  HANDOVER_FORCED: 'COMMUNICATION',
  OVERTIME_ENTERED: 'TIMELINESS',
  OVERTIME_MINUTES: 'TIMELINESS',
  SELF_CARE_MEAL: 'SELF_CARE',
  SELF_CARE_MEAL_MISSED: 'SELF_CARE',
  SELF_CARE_ENERGY_LOW_AT_END: 'SELF_CARE',
  SELF_CARE_ENERGY_VERY_LOW_AT_END: 'SELF_CARE',
  FAINT: 'SELF_CARE',
  // M7 新增
  REQUIRED_ORDER_ON_TIME: 'TIMELINESS',
  REQUIRED_ORDER_LATE: 'TIMELINESS',
  REQUIRED_ORDER_MISSED: 'TIMELINESS',
  PRIORITY_MOST_URGENT_FIRST: 'PRIORITISATION',
  PRIORITY_LOWER_FIRST: 'PRIORITISATION',
};

describe('scoring-rules：事件落啱分項（config 驅動）', () => {
  const rules = getContent().tables['scoring-rules'];

  it('每條規則落喺預期分項，六個分項都有規則', () => {
    for (const [id, subscore] of Object.entries(EXPECTED_SUBSCORE)) {
      const row = rules.find((r) => r.id === id);
      expect(row, id).toBeDefined();
      expect(row?.subscore, id).toBe(subscore);
    }
    for (const sub of SUBSCORE_IDS) {
      expect(
        rules.some((r) => r.subscore === sub),
        sub,
      ).toBe(true);
    }
  });

  it('所有規則都標明待臨床審核，且分項必為六個之一', () => {
    for (const row of rules) {
      expect(row.reviewStatus, row.id).toBe('PENDING_CLINICAL_REVIEW');
      expect(SUBSCORE_IDS).toContain(row.subscore);
    }
  });

  it('冇總分、冇倍數：engine 公開 API 同規則表都冇相關欄位', () => {
    expect(Object.keys(engineApi).filter((k) => /total|multiplier/iu.test(k))).toEqual([]);
    for (const row of rules) {
      expect(Object.keys(row).filter((k) => /total|multiplier|weight/iu.test(k))).toEqual([]);
    }
    const summary = summariseRun(fresh(), tables);
    expect(Object.keys(summary)).not.toContain('total');
    expect(summary.subscores.map((s) => s.id)).toEqual([...SUBSCORE_IDS]);
  });

  it('M4 ACLS 時間扣分嘅幅度只存喺 scoring-rules（acls／death 表只留 graceSec）', () => {
    const { tables: all } = getContent();
    expect(JSON.stringify(all['acls-transitions'])).not.toMatch(/"delta"/u);
    expect(JSON.stringify(all['death-process'])).not.toMatch(/"delta"/u);
  });
});

const withLedger = (state: GameState, entries: Partial<LedgerEntry>[]): GameState => ({
  ...state,
  scoreLedger: entries.map((e, i) => ({
    id: `sc${String(i + 1)}`,
    t: 100 + i,
    subscore: 'SAFETY',
    rule: 'X',
    delta: 0,
    patientId: null,
    callId: null,
    evidenceRef: null,
    facts: {},
    ...e,
  })),
});

describe('評級（summariseRun）', () => {
  const model = getContent().tables['scoring-model'][0];

  it('門檻邊界：剛好達標升級，差一分降級', () => {
    const th = model?.grading.SAFETY;
    expect(th).toBeDefined();
    if (!th) return;
    expect(gradeOf(th.excellentMin, th)).toBe('EXCELLENT');
    expect(gradeOf(th.excellentMin - 1, th)).not.toBe('EXCELLENT');
    expect(gradeOf(th.goodMin, th)).toBe('GOOD');
    expect(gradeOf(th.fairMin, th)).toBe('FAIR');
    expect(gradeOf(th.fairMin - 1, th)).toBe('NEEDS_IMPROVEMENT');
  });

  it('各分項獨立：一個分項負分唔影響另一個分項', () => {
    const state = withLedger(fresh(), [
      { subscore: 'SAFETY', rule: 'GATE_CONSEQUENCE_HIGH', delta: -50 },
      { subscore: 'COMMUNICATION', rule: 'SBAR_GOOD', delta: 20 },
    ]);
    const summary = summariseRun(state, tables);
    const grade = (id: SubscoreCode) => summary.subscores.find((s) => s.id === id)?.grade;
    expect(grade('SAFETY')).toBe('NEEDS_IMPROVEMENT');
    expect(grade('COMMUNICATION')).toBe('EXCELLENT');
    expect(grade('TIMELINESS')).toBe('GOOD');
    expect(subscoreSum(state, 'SAFETY')).toBe(-50);
  });

  it('冇任何記錄＝良好（唔當滿分，亦唔當扣分）', () => {
    const summary = summariseRun(fresh(), tables);
    for (const sub of summary.subscores) expect(sub.grade).toBe('GOOD');
    expect(summary.doneBest).toBe(false);
  });

  it('死亡令臨床結果降級；不可挽回嘅死亡另加「已盡力」', () => {
    const base = fresh('m7-death');
    const ids = Object.keys(base.patients);
    const patientId = ids[0] ?? '';
    const state = withLedger(base, [
      { subscore: 'CLINICAL_OUTCOME', rule: 'ROUND_CORRECT', delta: 40 },
      { subscore: 'CLINICAL_OUTCOME', rule: 'PATIENT_DEATH', delta: -1, patientId },
    ]);
    const summary = summariseRun(state, tables);
    const clinical = summary.subscores.find((s) => s.id === 'CLINICAL_OUTCOME');
    expect(clinical?.cappedByDeath).toBe(true);
    expect(clinical?.grade).not.toBe('EXCELLENT');
    expect(summary.deaths).toHaveLength(1);
    expect(summary.subscores.filter((s) => s.cappedByDeath)).toHaveLength(1);
  });

  it('已盡力旗標：只有 salvageable=false 嘅病例死亡先有', () => {
    const base = fresh('m7-donebest');
    const patientId = Object.keys(base.patients)[0] ?? '';
    const patient = base.patients[patientId];
    expect(patient).toBeDefined();
    const mutateFsm = (salvageable: boolean): EngineTables => {
      const template = tables['case-templates'].find(
        (t) => t.id === patient?.hidden.caseTemplateId,
      );
      return {
        ...tables,
        'case-fsm': tables['case-fsm'].map((f) =>
          f.id === template?.fsmId ? { ...f, salvageable } : f,
        ),
      };
    };
    const state = withLedger(base, [
      { subscore: 'CLINICAL_OUTCOME', rule: 'PATIENT_DEATH', delta: -1, patientId },
    ]);
    expect(summariseRun(state, mutateFsm(false)).doneBest).toBe(true);
    expect(summariseRun(state, mutateFsm(true)).doneBest).toBe(false);
  });

  it('結局標籤獨立：暈倒只有暈倒；超時只有超時；兩者不並存', () => {
    const base = fresh('m7-tags');
    const ended = (tags: ('OVERTIME' | 'FAINT')[]): GameState => ({
      ...base,
      shift: {
        ...base.shift,
        ending: {
          reason: tags[0] ?? 'NORMAL',
          tags,
          forced: tags.length > 0,
          at: 100,
          overtimeSeconds: 0,
          selected: [],
        },
      },
    });
    expect(summariseRun(ended(['FAINT']), tables).tags).toEqual(['FAINT']);
    expect(summariseRun(ended(['OVERTIME']), tables).tags).toEqual(['OVERTIME']);
    expect(summariseRun(ended([]), tables).tags).toEqual([]);
  });
});

/** 令某病人處於某必要處置狀態（入狀態時間 enteredAt），用真 content 表同真 engine */
function patientInRequiredState(seed: string, itemId: string) {
  const item = tables['required-actions'].find((r) => r.id === itemId);
  if (!item) throw new Error(`no item ${itemId}`);
  const base = fresh(seed);
  const template = tables['case-templates'].find((t) => t.fsmId === item.fsmId);
  const patientId = Object.keys(base.patients).find(
    (id) => base.patients[id]?.hidden.caseTemplateId === template?.id,
  );
  const picked = patientId ?? Object.keys(base.patients)[0] ?? '';
  const patient = base.patients[picked];
  if (!patient || !template) throw new Error('no patient');
  const state: GameState = {
    ...base,
    patients: {
      ...base.patients,
      [picked]: {
        ...patient,
        hidden: {
          ...patient.hidden,
          caseTemplateId: template.id,
          fsm: { ...patient.hidden.fsm, state: item.state, enteredAt: base.clock.t, flags: [] },
        },
      },
    },
  };
  return { state, item, patientId: picked };
}

const place = (patientId: string, catalogId: string) => {
  const alias = tables['order-catalog'].find((r) => r.id === catalogId)?.aliases[0] ?? catalogId;
  return intentEvent({ type: 'SUBMIT_CHAT', patientId, text: alias });
};

const bed = (state: GameState, patientId: string): GameState =>
  feed(engine, state, [intentEvent({ type: 'ENTER_BED', patientId })]).state;

const setT = (state: GameState, t: number): GameState => ({
  ...state,
  clock: { ...state.clock, t },
});

describe('必要處置時間窗（時效）', () => {
  const ITEM = 'req.pna-sepsis-01.deteriorating.oxygen.on';

  it('窗內完成＝準時，落「時效」，帶延遲同窗口事實', () => {
    const { state, item, patientId } = patientInRequiredState('req-on-time', ITEM);
    const run = feed(engine, setT(bed(state, patientId), state.clock.t + 60), [
      place(patientId, item.catalogIds[0] ?? ''),
    ]);
    const entry = run.state.scoreLedger.find((e) => e.rule === 'REQUIRED_ORDER_ON_TIME');
    expect(entry?.subscore).toBe('TIMELINESS');
    expect(entry?.patientId).toBe(patientId);
    expect(entry?.facts.windowSec).toBe(item.windowSec);
    expect(entry?.evidenceRef).toMatch(/^req:/u);
  });

  it('逾時才做＝遲；同一必要處置唔會重複記分', () => {
    const { state, item, patientId } = patientInRequiredState('req-late', ITEM);
    const late = setT(bed(state, patientId), state.clock.t + item.windowSec + 120);
    const first = feed(engine, late, [place(patientId, item.catalogIds[0] ?? '')]);
    expect(first.state.scoreLedger.filter((e) => e.rule === 'REQUIRED_ORDER_LATE')).toHaveLength(1);
    const second = feed(engine, first.state, [place(patientId, item.catalogIds[0] ?? '')]);
    expect(
      second.state.scoreLedger.filter((e) => e.rule.startsWith('REQUIRED_ORDER_')),
    ).toHaveLength(1);
  });

  it('完結時仍未做＝漏，只記一次；已完成嘅唔會記漏', () => {
    const ctx = { config: realConfig(), tables };
    const { state, item, patientId } = patientInRequiredState('req-missed', ITEM);
    const overdue = setT(state, state.clock.t + item.windowSec + 600);
    const once = scoreMissedAtEnd(overdue, ctx);
    const missed = once.scoreLedger.filter((e) => e.rule === 'REQUIRED_ORDER_MISSED');
    expect(missed).toHaveLength(1);
    expect(missed[0]?.subscore).toBe('TIMELINESS');
    expect(missed[0]?.patientId).toBe(patientId);
    expect(scoreMissedAtEnd(once, ctx).scoreLedger).toHaveLength(once.scoreLedger.length);

    const done = feed(engine, setT(bed(state, patientId), state.clock.t + 30), [
      place(patientId, item.catalogIds[0] ?? ''),
    ]);
    const after = scoreMissedAtEnd(setT(done.state, overdue.clock.t), ctx);
    expect(after.scoreLedger.some((e) => e.rule === 'REQUIRED_ORDER_MISSED')).toBe(false);
  });

  it('未到窗口結束就完結，唔記漏', () => {
    const ctx = { config: realConfig(), tables };
    const { state } = patientInRequiredState('req-early-end', ITEM);
    const early = scoreMissedAtEnd(setT(state, state.clock.t + 60), ctx);
    expect(early.scoreLedger.some((e) => e.rule === 'REQUIRED_ORDER_MISSED')).toBe(false);
  });
});

describe('優先次序與時間管理（C5 A）', () => {
  function twoUrgent(seed: string, levels: [number, number]) {
    const base = fresh(seed);
    const [a, b, c] = Object.keys(base.patients);
    if (!a || !b || !c) throw new Error('need 3 patients');
    const band = (level: number) => (level >= 2 ? 'HIGH' : 'MID');
    const patients = { ...base.patients };
    for (const [id, level] of [
      [a, levels[0]],
      [b, levels[1]],
    ] as const) {
      const p = patients[id];
      if (!p) continue;
      patients[id] = {
        ...p,
        visible: { ...p.visible, mews: { ...p.visible.mews, band: band(level) } },
      };
    }
    const state: GameState = {
      ...base,
      patients,
      priority: {
        lastAttended: {},
        urgency: {
          [a]: { level: levels[0], since: 0 },
          [b]: { level: levels[1], since: 0 },
        },
      },
    };
    return { state, a, b, c };
  }

  const enter = (patientId: string) => intentEvent({ type: 'ENTER_BED', patientId });

  it('先處理較不緊急嘅病人，而更緊急者已等過寬限期：扣「優先次序」分', () => {
    const { state, a, c } = twoUrgent('prio-lower', [2, 1]);
    const model = tables['scoring-model'][0];
    const run = feed(engine, setT(state, (model?.priority.graceSec ?? 300) + 60), [enter(c)]);
    const entry = run.state.scoreLedger.find((e) => e.rule === 'PRIORITY_LOWER_FIRST');
    expect(entry?.subscore).toBe('PRIORITISATION');
    expect(entry?.patientId).toBe(a);
    expect(entry?.facts.neglectedLevel).toBe(2);
    expect(entry?.evidenceRef).toMatch(/^prio:LOWER:/u);
  });

  it('寬限期內先處理其他病人唔扣分', () => {
    const { state, c } = twoUrgent('prio-grace', [2, 1]);
    const run = feed(engine, setT(state, 60), [enter(c)]);
    expect(run.state.scoreLedger.filter((e) => e.subscore === 'PRIORITISATION')).toHaveLength(0);
  });

  it('同時有多宗緊急而先處理最緊急者：加分；同一事件只記一次', () => {
    const { state, a } = twoUrgent('prio-first', [2, 1]);
    const first = feed(engine, setT(state, 120), [enter(a)]);
    const entries = first.state.scoreLedger.filter((e) => e.rule === 'PRIORITY_MOST_URGENT_FIRST');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.subscore).toBe('PRIORITISATION');
    const again = feed(engine, first.state, [enter(a)]);
    expect(
      again.state.scoreLedger.filter((e) => e.rule === 'PRIORITY_MOST_URGENT_FIRST'),
    ).toHaveLength(1);
  });

  it('扣分每個等待事件只記一次（唔會因多次動作重複扣）', () => {
    const { state, c } = twoUrgent('prio-once', [2, 1]);
    const late = setT(state, 900);
    const first = feed(engine, late, [enter(c)]);
    const second = feed(engine, first.state, [enter(c), enter(c)]);
    expect(second.state.scoreLedger.filter((e) => e.rule === 'PRIORITY_LOWER_FIRST')).toHaveLength(
      1,
    );
  });
});
