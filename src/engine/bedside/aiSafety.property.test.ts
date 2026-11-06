import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalStringify, deserializeSnapshot, serializeSnapshot } from '../save/snapshot';
import type { JsonValue } from '../core/eventQueue';
import { advance, aiRequests, feed, params, realEngine, say } from '../test/realEngine';

const engine = realEngine();

const jsonArb: fc.Arbitrary<JsonValue> = fc.letrec<{ value: JsonValue }>((tie) => ({
  value: fc.oneof(
    { depthSize: 'small' },
    fc.constant(null),
    fc.boolean(),
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.string({ maxLength: 40 }),
    fc.array(tie('value'), { maxLength: 4 }),
    fc.dictionary(fc.string({ maxLength: 12 }), tie('value'), { maxKeys: 4 }),
  ),
})).value;

/** 針對性 payload：有真正欄位名，但內容係垃圾／惡意 */
const structuredOrderParse = fc.record({
  intent: fc.constantFrom('ORDER', 'CANCEL', 'QUESTION', 'CHAT', 'DELEGATE', 'UNCLEAR', 'HACK'),
  actions: fc.array(
    fc.record({
      catalogId: fc.oneof(
        fc.constantFrom('obs.vitals', 'oxygen.nrb', 'drug.ceftriaxone', 'drug.paracetamol'),
        fc.string({ maxLength: 12 }),
      ),
      drug: fc.option(
        fc.record({
          formularyId: fc.option(fc.constantFrom('ceftriaxone', 'paracetamol', 'x'), { nil: null }),
          dose: fc.option(
            fc.record({
              value: fc.double({ noNaN: true, noDefaultInfinity: true }),
              unit: fc.constantFrom('g', 'mg', 'kg'),
            }),
            { nil: null },
          ),
          route: fc.option(fc.constantFrom('IV', 'PO', 'SC'), { nil: null }),
        }),
        { nil: null },
      ),
    }),
    { maxLength: 6 },
  ),
  cancelTargets: fc.array(fc.string({ maxLength: 6 }), { maxLength: 4 }),
  vitals: fc.record({ spo2: fc.integer(), hr: fc.integer() }),
  mews: fc.integer(),
});

const structuredDialogue = fc.record({
  lines: fc.array(
    fc.record({
      speaker: fc.constantFrom('nurse:N1', 'patient:p1', 'player', 'x'),
      text: fc.oneof(
        fc.string({ maxLength: 60 }),
        fc.constantFrom('心率 {{vital.hr}}', '血氧 99%', '{{vital.nope}}', '係肺炎', '好的'),
      ),
    }),
    { maxLength: 6 },
  ),
});

describe('AI 輸出 fuzz（B1：AI 永遠改唔到 patient）', () => {
  it('order.parse：任意 payload 唔 throw，patients 完全不變，只可能新增 order／對白', () => {
    const asked = feed(engine, engine.init(params('fuzz-1')), [say('some free text')]);
    const request = aiRequests(asked.effects)[0];
    if (!request) throw new Error('預期有請求');
    const before = JSON.stringify(asked.state.patients);
    fc.assert(
      fc.property(fc.oneof(jsonArb, structuredOrderParse as fc.Arbitrary<JsonValue>), (payload) => {
        const done = feed(engine, asked.state, [
          { type: 'AI_RESULT', reqId: request.reqId, payload },
        ]);
        expect(JSON.stringify(done.state.patients)).toBe(before);
        for (const order of Object.values(done.state.orders)) {
          expect([
            'obs.vitals',
            'obs.pulse',
            'oxygen.nrb',
            'oxygen.nasal',
            'fluid.ns500',
            'drug.ceftriaxone',
            'drug.paracetamol',
          ]).toContain(order.catalogId);
          if (order.params.dose) expect(order.params.dose.value).toBeGreaterThan(0);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('dialogue.turn：任意 payload 唔 throw，patients 不變，只有通過 guard 嘅行先會入 chat', () => {
    const run = advance(engine, engine.init(params('fuzz-2')), 1800);
    const request = aiRequests(run.effects)[0];
    if (!request) throw new Error('預期有請求');
    const before = JSON.stringify(run.state.patients);
    fc.assert(
      fc.property(fc.oneof(jsonArb, structuredDialogue as fc.Arbitrary<JsonValue>), (payload) => {
        const done = feed(engine, run.state, [
          { type: 'AI_RESULT', reqId: request.reqId, payload },
        ]);
        expect(JSON.stringify(done.state.patients)).toBe(before);
        const added =
          (done.state.chats.p1?.lines.length ?? 0) - (run.state.chats.p1?.lines.length ?? 0);
        if (added > 0) {
          for (const line of done.state.chats.p1?.lines.slice(-added) ?? []) {
            expect(line.template.replace(/\{\{[^}]*\}\}/g, '')).not.toMatch(/\d/);
            expect(line.template).not.toMatch(/肺炎|sepsis|pneumonia/i);
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('存檔往返（schema v2：病人、對話、Action Log）', () => {
  it('serialize → deserialize 後 state 相同，且可以繼續跑出同樣結果', () => {
    let state = advance(engine, engine.init(params('save-1')), 1800).state;
    state = feed(engine, state, [say('oxygen nrb')]).state;
    const result = deserializeSnapshot(serializeSnapshot(state, '0.2.0-test'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(canonicalStringify(result.state)).toBe(canonicalStringify(state));
    const a = advance(engine, state, 3600).state;
    const b = advance(engine, result.state, 3600).state;
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
  });
});
