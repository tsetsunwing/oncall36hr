/**
 * 床邊模組：床邊對話（設計 B）、玩家落字入口、AI 結果分派。
 * 玩家文字先試本地快捷詞 parser（唔經 AI）；唔中先發 order.parse。
 */
import type { Patient } from '../case/patient';
import type { Present } from '../chat/chatTypes';
import { appendLine, DIALOGUE_KIND, handleDialogueResult } from '../chat/dialogue';
import { parseMentions } from '../chat/mentions';
import { requestAi } from '../core/ai';
import type { Reduction } from '../core/events';
import type { EngineContext, EngineModule } from '../core/module';
import type { GameState } from '../core/state';
import { handleOrderParseResult, ORDER_PARSE_KIND, ackBeatsFor } from '../orders/orderParse';
import { createCatalogOrder } from '../orders/orders';
import { queueBeatsForOrders } from './queue';
import { matchQuickPhrase } from '../orders/quickPhrase';

const reject = (
  state: GameState,
  kind: 'CHAT_EMPTY' | 'CHAT_TOO_LONG' | 'PATIENT_UNKNOWN' | 'ORDER_BLOCKED_PAUSED',
): Reduction => ({
  state,
  effects: [{ type: 'NOTICE', kind, tone: 'warn' }],
});

export const MENTION_KEYS = { NURSE: ['RN', '護士'], PATIENT: ['病人'] } as const;

function rosterNurse(state: GameState, ctx: EngineContext) {
  const shift = state.mode === 'NIGHT' ? 'NIGHT' : 'DAY';
  const roster = ctx.tables['nurse-roster'];
  return roster.find((n) => n.shift === shift) ?? roster[0];
}

function buildPresent(state: GameState, patient: Patient, ctx: EngineContext): Present[] {
  const present: Present[] = [];
  const nurse = rosterNurse(state, ctx);
  if (nurse) {
    present.push({
      id: `nurse:${nurse.id}`,
      kind: 'NURSE',
      name: nurse.name,
      tone: nurse.tone,
      mentionKeys: [nurse.name, ...MENTION_KEYS.NURSE],
    });
  }
  present.push({
    id: `patient:${patient.id}`,
    kind: 'PATIENT',
    name: patient.demographics.name,
    tone: null,
    mentionKeys: [patient.demographics.name, ...MENTION_KEYS.PATIENT],
  });
  return present;
}

export const bedsideModule: EngineModule = {
  name: 'bedside',

  init(state, _params, ctx) {
    let next = state;
    for (const patient of Object.values(state.patients)) {
      const present = buildPresent(next, patient, ctx);
      next = {
        ...next,
        chats: {
          ...next.chats,
          [patient.id]: {
            patientId: patient.id,
            present,
            lines: [],
            visits: [
              {
                enteredAt: next.clock.t,
                leftAt: null,
                lineCountAtEnter: 0,
                lineCountAtLeave: null,
              },
            ],
          },
        },
      };
      for (const who of present) {
        next = appendLine(next, {
          t: next.clock.t,
          patientId: patient.id,
          speaker: { kind: 'SYSTEM', id: who.id },
          template: 'ARRIVE',
          tokenValues: {},
          orderId: null,
        });
      }
    }
    return next;
  },

  handleIntent(state, intent, ctx) {
    switch (intent.type) {
      case 'ENTER_BED':
      case 'LEAVE_BED': {
        const thread = state.chats[intent.patientId];
        if (!thread) return reject(state, 'PATIENT_UNKNOWN');
        const last = thread.visits.at(-1);
        const inBed = last?.leftAt === null;
        if (intent.type === 'ENTER_BED') {
          if (inBed) return { state, effects: [] };
          const visits = [
            ...thread.visits,
            {
              enteredAt: state.clock.t,
              leftAt: null,
              lineCountAtEnter: thread.lines.length,
              lineCountAtLeave: null,
            },
          ];
          return {
            state: {
              ...state,
              chats: { ...state.chats, [thread.patientId]: { ...thread, visits } },
            },
            effects: [],
          };
        }
        if (!inBed) return { state, effects: [] };
        const visits = [
          ...thread.visits.slice(0, -1),
          { ...last, leftAt: state.clock.t, lineCountAtLeave: thread.lines.length },
        ];
        return {
          state: { ...state, chats: { ...state.chats, [thread.patientId]: { ...thread, visits } } },
          effects: [],
        };
      }

      case 'SUBMIT_CHAT': {
        if (state.paused) return reject(state, 'ORDER_BLOCKED_PAUSED');
        const text = intent.text.trim();
        if (text.length === 0) return reject(state, 'CHAT_EMPTY');
        if (text.length > ctx.config.chat.playerTextMaxChars) return reject(state, 'CHAT_TOO_LONG');
        const patient = state.patients[intent.patientId];
        const thread = state.chats[intent.patientId];
        if (!patient || !thread) return reject(state, 'PATIENT_UNKNOWN');

        const submittedAt = state.clock.t;
        const withPlayerLine = appendLine(state, {
          t: submittedAt,
          patientId: patient.id,
          speaker: { kind: 'PLAYER', id: 'player' },
          template: text,
          tokenValues: {},
          orderId: null,
        });
        const addressed = parseMentions(text, thread.present);

        const local = matchQuickPhrase(text, ctx.tables);
        const row = local && ctx.tables['order-catalog'].find((r) => r.id === local.catalogId);
        if (local && row) {
          const nurse = thread.present.find((p) => p.kind === 'NURSE');
          const made = createCatalogOrder(withPlayerLine, {
            patientId: patient.id,
            row,
            params: local.params,
            source: 'QUICKWORD',
            executor: nurse?.id ?? null,
            submittedAt,
          });
          const { beats, tokens } = ackBeatsFor([made.order], ctx);
          return queueBeatsForOrders(made.state, patient, beats, tokens, addressed, ctx);
        }

        const context = {
          prompt: {
            text,
            patientId: patient.id,
            speakers: thread.present.map((p) => ({ id: p.id, kind: p.kind, name: p.name })),
            catalog: ctx.tables['order-catalog'].map((r) => ({
              id: r.id,
              type: r.type,
              label: r.label,
              aliases: [...r.aliases],
              formularyId: r.formularyId ?? null,
            })),
            formulary: ctx.tables.formulary.map((f) => ({
              id: f.id,
              label: f.label,
              aliases: [...f.aliases],
              units: [...f.units],
              routes: [...f.routes],
            })),
            openOrders: Object.values(withPlayerLine.orders)
              .filter((o) => o.patientId === patient.id && o.status === 'RUNNING')
              .map((o) => ({ id: o.id, catalogId: o.catalogId })),
          },
          local: { patientId: patient.id, playerText: text, submittedAt },
        };
        const queued = requestAi(withPlayerLine, ORDER_PARSE_KIND, context);
        return { state: queued.state, effects: [queued.effect] };
      }

      default:
        return undefined;
    }
  },

  handleAiResult(state, _reqId, payload, ctx, pending) {
    if (!pending) return undefined;
    if (pending.kind === ORDER_PARSE_KIND)
      return handleOrderParseResult(state, pending, payload, ctx);
    if (pending.kind === DIALOGUE_KIND) return handleDialogueResult(state, pending, payload, ctx);
    return undefined;
  },
};
