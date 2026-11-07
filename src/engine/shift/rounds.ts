/**
 * 巡房（spec §8、T25）：AC 主持，每個活躍病人問一次、約一條題（病史／病理／藥理）。
 * 題目由 AI 按 T25 topic 生成、答案要點一律取自 T25；評分只准引用 T25 key fact id，
 * 加扣分由 engine 查 T22 決定。巡房期間 engine 抑制突發事件（見 suppress.ts）。
 */
import { z } from 'zod';
import type { Patient } from '../case/patient';
import type { RoundTopicRow } from '../case/tables';
import { requestAi, rejectAiResult } from '../core/ai';
import { enqueue, type JsonValue } from '../core/eventQueue';
import type { Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import { rngInt } from '../core/rng';
import type { GameState, PendingAiRequest } from '../core/state';
import { hasBareNumber } from '../chat/tokens';
import { applyRule } from '../score/scoring';
import { none, noticeEffect, reject, withShift } from './common';
import { stopSelfCare } from './selfCare';
import type { RoundActive, RoundCurrent, RoundVerdict } from './shiftState';

export const ROUND_START_EVENT = 'ROUND_START';
export const ROUND_TIMER_EVENT = 'ROUND_TIMER';
export const ROUND_EVENT_PRIORITY = 1;
export const ROUNDS_QUESTION_KIND = 'rounds.question';
export const ROUNDS_GRADE_KIND = 'rounds.grade';
export const HINT_COUNT = 3;

const questionPayload = z.object({
  question: z.string(),
  hints: z.array(z.string()).length(HINT_COUNT),
});

const gradePayload = z.object({
  verdict: z.enum(['CORRECT', 'PARTIAL', 'WRONG']),
  matchedKeyFacts: z.array(z.string()),
  seniorLine: z.string().nullish(),
});

export function topicsFor(ctx: EngineContext, patient: Patient): RoundTopicRow[] {
  return ctx.tables['rounds-topics'].filter((t) =>
    patient.hidden.diagnosisIds.includes(t.diagnosisId),
  );
}

export function topicById(ctx: EngineContext, id: string): RoundTopicRow | undefined {
  return ctx.tables['rounds-topics'].find((t) => t.id === id);
}

export function roundTextOk(text: string, maxChars: number): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length > 0 && text.length <= maxChars && !text.includes('{{') && !hasBareNumber(text)
  );
}

function roundQueue(state: GameState, ctx: EngineContext): string[] {
  const deadId = state.death?.patientId ?? null;
  return Object.values(state.patients)
    .filter((p) => p.id !== deadId && topicsFor(ctx, p).length > 0)
    .sort((a, b) => a.bed - b.bed)
    .map((p) => p.id);
}

function usedTopics(state: GameState, patientId: string): Set<string> {
  const used = new Set<string>();
  const results = [
    ...state.shift.rounds.history.flatMap((r) => r.results),
    ...(state.shift.rounds.active?.results ?? []),
  ];
  for (const r of results) if (r.patientId === patientId) used.add(r.topicId);
  return used;
}

function setActive(state: GameState, active: RoundActive | null): GameState {
  return withShift(state, { rounds: { ...state.shift.rounds, active } });
}

function setCurrent(state: GameState, current: RoundCurrent | null): GameState {
  const active = state.shift.rounds.active;
  return active ? setActive(state, { ...active, current }) : state;
}

function schedule(
  state: GameState,
  time: number,
  payload: { number: number; cursor: number; phase: 'ASKING' | 'REVEAL' },
): GameState {
  return {
    ...state,
    scheduler: enqueue(state.scheduler, {
      time,
      priority: ROUND_EVENT_PRIORITY,
      kind: ROUND_TIMER_EVENT,
      payload,
    }),
  };
}

function endRound(state: GameState): Reduction {
  const active = state.shift.rounds.active;
  if (!active) return none(state);
  const next = withShift(state, {
    rounds: {
      ...state.shift.rounds,
      completed: state.shift.rounds.completed + 1,
      active: null,
      history: [
        ...state.shift.rounds.history,
        {
          number: active.number,
          startedAt: active.startedAt,
          endedAt: state.clock.t,
          results: active.results,
        },
      ],
    },
  });
  return { state: next, effects: [noticeEffect('ROUND_ENDED', 'info')] };
}

/** 去到隊列第 cursor 個病人並向 AI 要題目；冇病人可問就結束巡房 */
function beginQuestion(state: GameState, ctx: EngineContext, cursor: number): Reduction {
  const active = state.shift.rounds.active;
  if (!active) return none(state);
  let index = cursor;
  while (index < active.queue.length) {
    const patientId = active.queue[index] ?? '';
    const patient = state.patients[patientId];
    const topics = patient ? topicsFor(ctx, patient) : [];
    if (patient && topics.length > 0) {
      const used = usedTopics(state, patientId);
      const fresh = topics.filter((t) => !used.has(t.id));
      const pool = fresh.length > 0 ? fresh : topics;
      const draw = rngInt(state.rng, 'rounds', 0, pool.length);
      const topic = pool[draw.value] ?? pool[0];
      if (!topic) break;
      const withRng: GameState = { ...state, rng: draw.rng };
      const request = requestAi(withRng, ROUNDS_QUESTION_KIND, {
        prompt: {
          hostRank: ctx.config.rounds.hostRank,
          playerRank: state.playerRank,
          category: topic.category,
          focus: topic.focus,
          keyFacts: topic.keyFacts.map((f) => ({ id: f.id, text: f.text })),
          patient: {
            age: patient.demographics.age,
            sex: patient.demographics.sex,
            presentingComplaint: patient.presentingComplaint,
          },
          hintCount: HINT_COUNT,
          maxQuestionChars: ctx.config.rounds.questionMaxChars,
          maxHintChars: ctx.config.rounds.hintMaxChars,
        },
        local: { number: active.number, patientId, topicId: topic.id },
      });
      const current: RoundCurrent = {
        patientId,
        topicId: topic.id,
        phase: 'LOADING',
        requestId: request.effect.type === 'AI_REQUEST' ? request.effect.reqId : null,
        question: null,
        hints: [],
        askedAt: null,
        answer: null,
        viaHint: false,
        verdict: null,
        matchedKeyFacts: [],
        seniorLine: null,
      };
      return {
        state: setActive(request.state, { ...active, cursor: index, current }),
        effects: [request.effect],
      };
    }
    index++;
  }
  return endRound(setCurrent(state, null));
}

export function handleRoundStart(
  state: GameState,
  payload: JsonValue,
  ctx: EngineContext,
): Reduction {
  if (state.clock.phase !== 'REGULAR' || state.shift.rounds.active) return none(state);
  const from =
    typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? payload.from
      : undefined;
  const deferredSince = typeof from === 'number' ? from : state.clock.t;
  if (
    state.resus?.status === 'ARREST' &&
    state.clock.t - deferredSince < ctx.config.rounds.arrestDeferMaxSeconds
  ) {
    return none({
      ...state,
      scheduler: enqueue(state.scheduler, {
        time: state.clock.t + ctx.config.rounds.deferStepSeconds,
        priority: ROUND_EVENT_PRIORITY,
        kind: ROUND_START_EVENT,
        payload: { from: deferredSince },
      }),
    });
  }
  const stopped = stopSelfCare(state, ctx).state;
  const number = stopped.shift.rounds.started + 1;
  const started = withShift(stopped, {
    rounds: {
      ...stopped.shift.rounds,
      started: number,
      active: {
        number,
        startedAt: stopped.clock.t,
        queue: roundQueue(stopped, ctx),
        cursor: 0,
        results: [],
        current: null,
      },
    },
  });
  const begun = beginQuestion(started, ctx, 0);
  return {
    state: begun.state,
    effects: [noticeEffect('ROUND_STARTED', 'info'), ...begun.effects],
  };
}

const RULE_BY_VERDICT = (verdict: RoundVerdict, viaHint: boolean): string => {
  switch (verdict) {
    case 'CORRECT':
      return viaHint ? 'ROUND_CORRECT_HINTED' : 'ROUND_CORRECT';
    case 'PARTIAL':
      return 'ROUND_PARTIAL';
    case 'WRONG':
      return 'ROUND_WRONG';
    case 'UNANSWERED':
      return 'ROUND_UNANSWERED';
  }
};

/** 記錄結果、入分，進入揭曉階段（上級講出 T25 key facts） */
function reveal(
  state: GameState,
  ctx: EngineContext,
  verdict: RoundVerdict,
  patch: Partial<RoundCurrent>,
): Reduction {
  const active = state.shift.rounds.active;
  const current = active?.current;
  if (!active || !current) return none(state);
  const viaHint = patch.viaHint ?? current.viaHint;
  const revealed: RoundCurrent = {
    ...current,
    ...patch,
    phase: 'REVEAL',
    requestId: null,
    verdict,
    viaHint,
  };
  let next = setActive(state, {
    ...active,
    current: revealed,
    results: [
      ...active.results,
      { patientId: current.patientId, topicId: current.topicId, verdict, viaHint },
    ],
  });
  next = applyRule(next, RULE_BY_VERDICT(verdict, viaHint), ctx, {
    patientId: current.patientId,
    evidence: `round:${String(active.number)}`,
    facts: { topicId: current.topicId, round: active.number },
  });
  next = schedule(next, next.clock.t + ctx.config.rounds.revealSeconds, {
    number: active.number,
    cursor: active.cursor,
    phase: 'REVEAL',
  });
  return none(next);
}

function advance(state: GameState, ctx: EngineContext): Reduction {
  const active = state.shift.rounds.active;
  if (!active) return none(state);
  return beginQuestion(setCurrent(state, null), ctx, active.cursor + 1);
}

export function handleRoundTimer(
  state: GameState,
  payload: JsonValue,
  ctx: EngineContext,
): Reduction {
  const parsed = z
    .object({
      number: z.number(),
      cursor: z.number(),
      phase: z.enum(['ASKING', 'REVEAL']),
    })
    .safeParse(payload);
  const active = state.shift.rounds.active;
  const current = active?.current;
  if (!parsed.success || !active || !current) return none(state);
  const { number, cursor, phase } = parsed.data;
  if (active.number !== number || active.cursor !== cursor || current.phase !== phase) {
    return none(state);
  }
  return phase === 'ASKING' ? reveal(state, ctx, 'UNANSWERED', {}) : advance(state, ctx);
}

export function answerRound(
  state: GameState,
  raw: { text: string; viaHint?: boolean | undefined },
  ctx: EngineContext,
): Reduction {
  const active = state.shift.rounds.active;
  const current = active?.current;
  if (!active || current?.phase !== 'ASKING') return reject(state, 'ROUND_ANSWER_INVALID');
  const text = raw.text.trim();
  if (text.length === 0 || text.length > ctx.config.chat.playerTextMaxChars) {
    return reject(state, 'ROUND_ANSWER_INVALID');
  }
  const topic = topicById(ctx, current.topicId);
  if (!topic) return reject(state, 'ROUND_ANSWER_INVALID');
  const viaHint = raw.viaHint === true && current.hints.includes(text);
  const request = requestAi(state, ROUNDS_GRADE_KIND, {
    prompt: {
      hostRank: ctx.config.rounds.hostRank,
      playerRank: state.playerRank,
      category: topic.category,
      focus: topic.focus,
      question: current.question ?? '',
      answer: text,
      viaHint,
      keyFacts: topic.keyFacts.map((f) => ({ id: f.id, text: f.text })),
      maxLineChars: ctx.config.chat.maxLineChars,
    },
    local: { number: active.number, patientId: current.patientId, topicId: current.topicId },
  });
  const reqId = request.effect.type === 'AI_REQUEST' ? request.effect.reqId : null;
  return {
    state: setCurrent(request.state, {
      ...current,
      phase: 'GRADING',
      answer: text,
      viaHint,
      requestId: reqId,
    }),
    effects: [request.effect],
  };
}

/** 「唔識」：視為答錯，直接揭曉答案（唔使 AI） */
export function passRound(state: GameState, ctx: EngineContext): Reduction {
  if (state.shift.rounds.active?.current?.phase !== 'ASKING') {
    return reject(state, 'ROUND_ANSWER_INVALID');
  }
  return reveal(state, ctx, 'WRONG', { answer: null, viaHint: false });
}

export function nextRound(state: GameState, ctx: EngineContext): Reduction {
  if (state.shift.rounds.active?.current?.phase !== 'REVEAL') {
    return reject(state, 'ROUND_ANSWER_INVALID');
  }
  return advance(state, ctx);
}

export function handleRoundAiResult(
  state: GameState,
  reqId: string,
  payload: JsonValue,
  ctx: EngineContext,
  pending: PendingAiRequest | undefined,
): Reduction | undefined {
  if (pending?.kind !== ROUNDS_QUESTION_KIND && pending?.kind !== ROUNDS_GRADE_KIND) {
    return undefined;
  }
  const active = state.shift.rounds.active;
  const current = active?.current;
  if (!active || current?.requestId !== reqId) return none(state);

  if (pending.kind === ROUNDS_QUESTION_KIND) {
    const parsed = questionPayload.safeParse(payload);
    const { questionMaxChars, hintMaxChars } = ctx.config.rounds;
    if (
      current.phase !== 'LOADING' ||
      !parsed.success ||
      !roundTextOk(parsed.data.question, questionMaxChars) ||
      !parsed.data.hints.every((h) => roundTextOk(h, hintMaxChars))
    ) {
      return rejectAiResult(state, pending);
    }
    const asked = setCurrent(state, {
      ...current,
      phase: 'ASKING',
      requestId: null,
      question: parsed.data.question.trim(),
      hints: parsed.data.hints.map((h) => h.trim()),
      askedAt: state.clock.t,
    });
    return none(
      schedule(asked, state.clock.t + ctx.config.rounds.questionSeconds, {
        number: active.number,
        cursor: active.cursor,
        phase: 'ASKING',
      }),
    );
  }

  const parsed = gradePayload.safeParse(payload);
  const topic = topicById(ctx, current.topicId);
  if (current.phase !== 'GRADING' || !parsed.success || !topic)
    return rejectAiResult(state, pending);
  const factIds = new Set(topic.keyFacts.map((f) => f.id));
  const matched = [...new Set(parsed.data.matchedKeyFacts)];
  const line = parsed.data.seniorLine?.trim() ?? '';
  if (
    matched.some((id) => !factIds.has(id)) ||
    (line.length > 0 && !roundTextOk(line, ctx.config.chat.maxLineChars))
  ) {
    return rejectAiResult(state, pending);
  }
  let verdict: RoundVerdict = parsed.data.verdict;
  if (matched.length === 0 && verdict !== 'WRONG') verdict = 'WRONG';
  return reveal(state, ctx, verdict, {
    matchedKeyFacts: matched,
    seniorLine: line.length > 0 ? line : null,
  });
}
