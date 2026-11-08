/**
 * 更次 ViewModel（M6）：模式／階段、巡房、精力同自我照顧、超時、交更同結局畫面。
 * 全部由 engine 狀態映射；巡房文字係經 engine 守衛檢查過嘅 AI 輸出，結局分項係 ledger 原始加總（唔設總分）。
 */
import {
  buildReview,
  energyLevel,
  energyModel,
  mealWindowFor,
  overtimeEndOf,
  roundTimes,
  segmentAt,
  selfCareAvailable,
  selfCareCooldownLeft,
  summariseRun,
  type GameState,
  type Patient,
  type RoundCurrent,
} from '@/engine';
import type { ViewEnv } from './viewEnv';
import type {
  AlarmLevel,
  ResultPatientView,
  ResultView,
  ReviewView,
  RoundView,
  ShiftView,
  SubscoreResultView,
} from './types';

type ClockLabel = (t: number) => string;

function levelOf(patient: Patient, env: ViewEnv): AlarmLevel {
  const alert = env.tables.mews[0]?.bands.find((b) => b.id === patient.visible.mews.band)?.alert;
  return alert === 'ALARM' ? 'ALARM' : alert === 'CAUTION' ? 'CAUTION' : 'NORMAL';
}

function selectRound(state: GameState, env: ViewEnv, total: number): RoundView | null {
  const active = state.shift.rounds.active;
  const current: RoundCurrent | null = active?.current ?? null;
  if (!active || !current) return null;
  const patient = state.patients[current.patientId];
  if (!patient) return null;
  const topic = env.tables['rounds-topics'].find((t) => t.id === current.topicId);
  const matched = new Set(current.matchedKeyFacts);
  const asking = current.phase === 'ASKING';
  return {
    number: active.number,
    totalRounds: total,
    position: active.cursor + 1,
    patientCount: active.queue.length,
    patient: {
      bed: patient.bed,
      name: patient.demographics.name,
      age: patient.demographics.age,
      sex: patient.demographics.sex,
      complaint: patient.presentingComplaint,
    },
    category: topic?.category ?? 'HISTORY',
    phase: current.phase,
    question: current.question,
    hints: [...current.hints],
    answer: current.answer,
    viaHint: current.viaHint,
    verdict: current.verdict,
    seniorLine: current.seniorLine,
    keyFacts:
      current.phase === 'REVEAL' && topic
        ? topic.keyFacts.map((f) => ({ id: f.id, text: f.text, matched: matched.has(f.id) }))
        : null,
    secondsLeft:
      asking && current.askedAt !== null
        ? Math.max(0, current.askedAt + env.config.rounds.questionSeconds - state.clock.t)
        : null,
    canAnswer: asking,
    maxChars: env.config.chat.playerTextMaxChars,
    canNext: current.phase === 'REVEAL',
    isLast: active.cursor + 1 >= active.queue.length,
  };
}

function selectReview(state: GameState, env: ViewEnv, clockLabel: ClockLabel): ReviewView {
  const data = buildReview(state, env.tables);
  const label = (ref: { bed: number | null; name: string | null }) => ({
    bed: ref.bed,
    name: ref.name,
  });
  return {
    table: data.summary.subscores.map((s) => ({
      id: s.id,
      grade: s.grade,
      rows: data.table[s.id].map((e) => ({
        id: e.id,
        timeLabel: clockLabel(e.t),
        rule: e.rule,
        delta: e.delta,
        evidence: e.evidenceRef,
        ...label(e),
      })),
    })),
    timeline: data.timeline.map((item) => ({
      key: item.key,
      timeLabel: clockLabel(item.t),
      kind: item.kind,
      code: item.code,
      label: item.label,
      detail: item.detail,
      delta: item.delta,
      subscore: item.subscore,
      ...label(item),
    })),
    whatIf: data.whatIf.map((w) => ({
      id: w.id,
      label: w.label,
      timeLabel: clockLabel(w.t),
      rule: w.rule,
      facts: { ...w.facts },
      ...label(w),
    })),
    guidelines: data.guidelines.map((g) => ({
      id: g.id,
      label: g.label,
      status: g.status,
      windowMin: Math.round(g.windowSec / 60),
      delayMin: Math.round(g.delaySec / 60),
      title: g.guideline.title,
      text: g.guideline.text,
      source: g.guideline.source,
      pendingReview: g.reviewStatus !== 'REVIEWED',
      ...label(g),
    })),
    safety: data.safety.map((x) => ({
      orderId: x.orderId,
      timeLabel: clockLabel(x.t),
      orderLabel: x.orderLabel,
      outcome: x.outcome,
      concerns: x.concerns,
      insistCount: x.insistCount,
      aiScore: x.aiScore,
      aiReason: x.aiReason,
      danger: x.danger
        ? {
            level: x.danger.level,
            category: x.danger.category,
            reason: x.danger.reason,
            hit: x.danger.hit,
          }
        : null,
      rules: x.rules,
      ...label(x),
    })),
    deaths: data.deaths.map((d) => ({
      timeLabel: clockLabel(d.t),
      doneBest: d.doneBest,
      processComplete: d.processComplete,
      ...label(d),
    })),
  };
}

function selectResult(state: GameState, env: ViewEnv, clockLabel: ClockLabel): ResultView | null {
  const ending = state.shift.ending;
  if (!ending) return null;
  const summary = summariseRun(state, env.tables);
  const subscores: SubscoreResultView[] = summary.subscores.map((s) => ({
    id: s.id,
    grade: s.grade,
    entries: s.entries,
    cappedByDeath: s.cappedByDeath,
    items: s.items,
  }));
  const deadIds = new Map(summary.deaths.map((d) => [d.patientId, d]));
  const selected = new Set(ending.selected);
  const patients: ResultPatientView[] = Object.values(state.patients)
    .sort((a, b) => a.bed - b.bed)
    .map((p) => {
      const level = levelOf(p, env);
      const death = deadIds.get(p.id);
      return {
        bed: p.bed,
        name: p.demographics.name,
        outcome: death
          ? 'DECEASED'
          : level === 'ALARM'
            ? 'ALARM'
            : level === 'CAUTION'
              ? 'CAUTION'
              : 'STABLE',
        mentioned: selected.has(p.id),
        doneBest: death ? !death.salvageable : false,
      };
    });
  const results = [
    ...state.shift.rounds.history.flatMap((r) => r.results),
    ...(state.shift.rounds.active?.results ?? []),
  ];
  return {
    reason: ending.reason,
    tags: [...ending.tags],
    forced: ending.forced,
    atLabel: clockLabel(ending.at),
    overtimeSec: ending.overtimeSeconds,
    subscores,
    patients,
    rounds: {
      total: results.length,
      answered: results.filter((r) => r.verdict !== 'UNANSWERED').length,
      correct: results.filter((r) => r.verdict === 'CORRECT').length,
    },
    doneBest: summary.doneBest,
    review: selectReview(state, env, clockLabel),
  };
}

export function selectShift(state: GameState, env: ViewEnv, clockLabel: ClockLabel): ShiftView {
  const { config, tables } = env;
  const model = energyModel({ tables });
  const percent = state.shift.energy.percent;
  const roundsAt = roundTimes(config, state.mode);
  const nextRound = roundsAt.find((t) => t >= state.clock.t && t > 0) ?? null;
  const selfCareActive = state.shift.selfCare.active;
  const phase = state.clock.phase;
  const regular = overtimeEndOf(config, state.mode) - config.shifts.overtimeSeconds;
  return {
    shiftMode: state.mode,
    playerRank: state.playerRank,
    difficulty: state.difficulty,
    phase,
    segment: segmentAt(config, state.mode, Math.min(state.clock.t, regular - 1))?.kind ?? null,
    waitingForAi:
      config.clock.pauseWhileAiPending &&
      state.pendingAi.length > 0 &&
      phase !== 'HANDOVER' &&
      phase !== 'ENDED',
    energy: { percent, level: energyLevel(percent, model) },
    rounds: {
      total: roundsAt.length,
      completed: state.shift.rounds.completed,
      nextAtLabel:
        nextRound !== null && !state.shift.rounds.active && phase === 'REGULAR'
          ? clockLabel(nextRound)
          : null,
      offered: state.shift.rounds.offeredAt !== null && state.shift.rounds.active === null,
      active: selectRound(state, env, roundsAt.length),
    },
    selfCare: {
      active: selfCareActive
        ? {
            id: selfCareActive.actionId,
            endsLabel: clockLabel(selfCareActive.endsAt),
            remainingSec: Math.max(0, selfCareActive.endsAt - state.clock.t),
          }
        : null,
      actions: tables['self-care-actions'].map((row) => ({
        id: row.id,
        durationSec: row.durationSeconds,
        gainPercent: row.gainPercent,
        available: selfCareAvailable(state, row, { config }),
        cooldownSec: selfCareCooldownLeft(state, row),
        needsMealWindow: row.requires === 'MEAL_WINDOW',
      })),
      mealWindowOpen: mealWindowFor(state, { config }) !== null,
    },
    overtime:
      phase === 'OVERTIME'
        ? {
            remainingSec: Math.max(0, overtimeEndOf(config, state.mode) - state.clock.t),
            deadlineLabel: clockLabel(overtimeEndOf(config, state.mode)),
            canHandover: true,
          }
        : null,
    handover:
      phase === 'HANDOVER'
        ? {
            candidates: Object.values(state.patients)
              .sort((a, b) => a.bed - b.bed)
              .map((p) => ({
                patientId: p.id,
                bed: p.bed,
                name: p.demographics.name,
                level: levelOf(p, env),
                selected: state.shift.handover.selected.includes(p.id),
              })),
          }
        : null,
    result: selectResult(state, env, clockLabel),
  };
}
