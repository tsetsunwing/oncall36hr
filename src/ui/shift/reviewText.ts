import { ui } from '@/i18n';
import type { ReviewSafetyView, ReviewWhatIfView, SubscoreResultView } from '@/view';

const r = ui.shift.review;
const toMin = (sec: unknown): number => Math.max(1, Math.round(Number(sec) / 60));
const toSec = (sec: unknown): number => Math.round(Number(sec));

export function patientLabel(item: { bed: number | null; name: string | null }): string {
  return r.patient(item.bed, item.name);
}

export function whatIfLine(item: ReviewWhatIfView): string {
  const w = r.whatIf;
  const time = item.timeLabel;
  const patient = patientLabel(item);
  const label = item.label ?? ui.shift.result.rule[item.rule] ?? item.rule;
  switch (item.rule) {
    case 'REQUIRED_ORDER_LATE':
      return w.REQUIRED_ORDER_LATE(
        time,
        patient,
        label,
        toMin(item.facts.delaySec),
        toMin(item.facts.windowSec),
      );
    case 'REQUIRED_ORDER_MISSED':
      return w.REQUIRED_ORDER_MISSED(time, patient, label, toMin(item.facts.windowSec));
    case 'TIME_TO_CPR':
      return w.TIME_TO_CPR(time, patient, toSec(item.facts.delaySec));
    case 'TIME_TO_FIRST_SHOCK':
      return w.TIME_TO_FIRST_SHOCK(time, patient, toSec(item.facts.delaySec));
    case 'CYCLE_GAP':
      return w.CYCLE_GAP(time, patient, toSec(item.facts.delaySec));
    case 'PRIORITY_LOWER_FIRST':
      return w.PRIORITY_LOWER_FIRST(time, patient, toMin(item.facts.waitedSec));
    case 'ESCALATION_SKIPPED_LEVEL':
      return w.ESCALATION_SKIPPED_LEVEL(time, patient);
    case 'CALL_MISSED':
      return w.CALL_MISSED(time, patient);
    case 'CALL_MISSED_JUNIOR':
      return w.CALL_MISSED_JUNIOR(time, patient);
    case 'GATE_INSISTED_CONFIRM':
      return w.GATE_INSISTED_CONFIRM(time, patient, label);
    case 'GATE_INSISTED_OBJECT':
      return w.GATE_INSISTED_OBJECT(time, patient, label);
    case 'HANDOVER_OMIT_NEEDED':
      return w.HANDOVER_OMIT_NEEDED(time, patient);
    case 'SELF_CARE_MEAL_MISSED':
      return w.SELF_CARE_MEAL_MISSED(time);
    default:
      return w.generic(patient, label, time);
  }
}

/** 一個分項嘅簡短原因：只由該分項嘅記錄組成，不含分數 */
export function subscoreReason(sub: SubscoreResultView): string | null {
  const label = (rule: string) => ui.shift.result.rule[rule] ?? rule;
  const strongest = (sign: 1 | -1) =>
    sub.items
      .filter((item) => Math.sign(item.delta) === sign)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 2)
      .map((item) => label(item.rule));
  const parts: string[] = [];
  const good = strongest(1);
  const bad = strongest(-1);
  if (good.length > 0)
    parts.push(ui.shift.result.reasonGood(good.join(ui.shift.result.reasonJoin)));
  if (bad.length > 0)
    parts.push(ui.shift.result.reasonImprove(bad.join(ui.shift.result.reasonJoin)));
  return parts.length > 0 ? parts.join('；') : null;
}

export function safetyEngineLine(item: ReviewSafetyView): string {
  const first = item.concerns[0];
  const category = first ? (ui.game.gate.category[first.category] ?? first.category) : '';
  return ui.shift.result.safetyEngineLine(
    item.orderLabel,
    category,
    ui.shift.review.safety.outcome[item.outcome] ?? item.outcome,
  );
}
