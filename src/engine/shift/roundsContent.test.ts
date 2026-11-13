import { describe, expect, it } from 'vitest';
import { drive, kitEngine, kitParams, shiftAct } from './shiftKit';
import { feed, type Run } from '../test/realEngine';
import type { Effect } from '../core/events';

function aiKinds(effects: readonly Effect[]): string[] {
  return effects.flatMap((e) => (e.type === 'AI_REQUEST' ? [e.kind] : []));
}

const topic = {
  id: 'pna-hist-test',
  diagnosisId: 'pneumonia',
  category: 'HISTORY',
  focus: '病史重點',
  keyFacts: [
    { id: 'f1', text: '典型症狀', keywords: ['發燒', '咳嗽'] },
    { id: 'f2', text: '長者表現', keywords: ['神志混亂'] },
    { id: 'f3', text: '風險因素', keywords: ['吸煙'] },
  ],
  question: '預寫題目：你會問啲咩？',
  hints: ['提示一', '提示二', '提示三'],
  reviewStatus: 'PENDING_CLINICAL_REVIEW',
  note: '',
} as const;

const engine = kitEngine({ 'rounds-topics': [topic] });

const H = 3600;

/** 開局推進一個鐘令巡房通知出現，再撳開始巡房。 */
function begin(): Run {
  const init = engine.init(kitParams('rounds-content'));
  const offered = drive(engine, init, 1 * H + 5).state;
  return feed(engine, offered, [shiftAct('ROUND_BEGIN')]);
}

function roundsAiKinds(run: Run): string[] {
  return aiKinds(run.effects).filter((kind) => kind.startsWith('rounds.'));
}

describe('巡房題由內容驅動（唔使 AI）', () => {
  it('有預寫題目：出題唔使 AI，直接入 ASKING', () => {
    const run = begin();
    const current = run.state.shift.rounds.active?.current;
    expect(current?.phase).toBe('ASKING');
    expect(current?.question).toBe('預寫題目：你會問啲咩？');
    expect(current?.hints).toEqual(['提示一', '提示二', '提示三']);
    expect(roundsAiKinds(run)).toEqual([]);
  });

  it('評分本地做：三個要點全中＝CORRECT，冇 AI 請求', () => {
    const run = feed(engine, begin().state, [
      shiftAct('ROUND_ANSWER', { text: '病人發燒咳嗽，長者會神志混亂，要問吸煙史' }),
    ]);
    const current = run.state.shift.rounds.active?.current;
    expect(current?.phase).toBe('REVEAL');
    expect(current?.verdict).toBe('CORRECT');
    expect(current?.matchedKeyFacts).toEqual(['f1', 'f2', 'f3']);
    expect(roundsAiKinds(run)).toEqual([]);
  });

  it('只中一個要點＝PARTIAL', () => {
    const run = feed(engine, begin().state, [shiftAct('ROUND_ANSWER', { text: '只記得發燒' })]);
    const current = run.state.shift.rounds.active?.current;
    expect(current?.verdict).toBe('PARTIAL');
    expect(current?.matchedKeyFacts).toEqual(['f1']);
  });

  it('全部唔中＝WRONG', () => {
    const run = feed(engine, begin().state, [shiftAct('ROUND_ANSWER', { text: '唔記得喇' })]);
    expect(run.state.shift.rounds.active?.current?.verdict).toBe('WRONG');
  });

  it('冇預寫題目嘅內容：照舊用 AI 出題', () => {
    const aiOnly = {
      id: topic.id,
      diagnosisId: topic.diagnosisId,
      category: topic.category,
      focus: topic.focus,
      keyFacts: topic.keyFacts.map((f) => ({ id: f.id, text: f.text })),
      reviewStatus: topic.reviewStatus,
      note: topic.note,
    };
    const aiEngine = kitEngine({ 'rounds-topics': [aiOnly] });
    const run = feed(
      aiEngine,
      drive(aiEngine, aiEngine.init(kitParams('rounds-content')), 1 * H + 5).state,
      [shiftAct('ROUND_BEGIN')],
    );
    expect(run.state.shift.rounds.active?.current?.phase).toBe('LOADING');
    expect(roundsAiKinds(run)).toEqual(['rounds.question']);
  });
});
