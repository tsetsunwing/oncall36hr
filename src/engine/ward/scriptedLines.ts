/**
 * 家屬預設選項、會診態度：由狀態機已經計好嘅反應揀固定句。
 * 句中唔寫診斷、劑量或化驗結果；時間只經 {{consult.eta}}。
 */
import { extractTokens } from '../chat/tokens';
import type { CallLine } from './wardTypes';

export type RankAttitude = 'WARM' | 'NEUTRAL' | 'COLD';

const FAMILY_OPEN: Record<string, string> = {
  'CONFUSED:WHAT_IS_WRONG': '{{patient.name}}點呀？你可唔可以講清楚啲？',
  'ANGER:WHAT_HAPPENED': '你講得咁急……{{patient.name}}究竟發生咗咩事？',
  'SHOCK:WHAT_HAPPENED': '吓……{{patient.name}}走咗？點會咁嘅？',
  'GRIEF:WHEN_CAN_VISIT': '我而家過嚟。我可唔可以見{{patient.name}}？',
};

const FAMILY_CLOSE: Record<string, string> = {
  ANGER: '好，我知道喇。我自己嚟醫院。',
  GRIEF: '我而家過嚟。多謝你同我講。',
  SHOCK: '我……我而家過嚟醫院。',
  CONFUSED: '好，我稍後再同你講。',
};

/** 預設選項的家屬句。reaction／asks／closing 來自狀態機，唔係模型。 */
export function familyPresetTemplate(reaction: string, asks: string, closing: boolean): string {
  if (closing) return FAMILY_CLOSE[reaction] ?? '好，我稍後再同你講。';
  return FAMILY_OPEN[`${reaction}:${asks}`] ?? '我聽到喇。';
}

const ASK_LINES: Record<string, string> = {
  'S.PATIENT': '你講緊邊個病人？',
  'S.PROBLEM': '而家主要係咩問題？',
  'B.HISTORY': '病史同主訴可唔可以講多啲？',
  'B.ALLERGY': '有冇藥物過敏？',
  'B.TREATMENT': '你而家做咗啲咩？',
  'A.VITALS': '生命體徵點樣？',
  'A.IMPRESSION': '你自己覺得點？',
  'R.REQUEST': '你想我做咩？',
};

const OUTCOME_LINES: Record<string, Record<RankAttitude, string>> = {
  BEDSIDE: {
    WARM: '收到，我 {{consult.eta}}內過嚟睇。',
    NEUTRAL: '好，我 {{consult.eta}}內到。',
    COLD: '知道，{{consult.eta}}內到。',
  },
  ADVICE: {
    WARM: '我喺電話講下建議，今次唔過嚟。你照住處理，有變再打嚟。',
    NEUTRAL: '我電話建議就得，唔過嚟。有變再打嚟。',
    COLD: '電話講兩句就得，我唔過嚟。',
  },
  REFUSE: {
    WARM: '你講得未夠，我暫時未可以跟進。',
    NEUTRAL: '資料未夠，我暫時未跟進。',
    COLD: '咁少資料，我跟唔到。',
  },
  ICU_ASSESS: {
    WARM: '我哋 ICU 會派人過嚟評估。',
    NEUTRAL: 'ICU 會派人過嚟評估。',
    COLD: 'ICU 先派人評估。',
  },
  DEATH_ACK: {
    WARM: '收到，辛苦晒。',
    NEUTRAL: '收到。',
    COLD: '知道。',
  },
};

const BEDSIDE_NO_ETA: Record<RankAttitude, string> = {
  WARM: '收到，我過嚟睇。',
  NEUTRAL: '好，我過嚟睇。',
  COLD: '知道，我過嚟。',
};

function outcomeTemplate(outcome: string, attitude: RankAttitude, hasEta: boolean): string {
  if (outcome === 'BEDSIDE' && !hasEta) return BEDSIDE_NO_ETA[attitude];
  return OUTCOME_LINES[outcome]?.[attitude] ?? '我聽到。';
}

function lineFrom(
  t: number,
  name: string,
  template: string,
  tokens: Record<string, string>,
): CallLine {
  const tokenValues: Record<string, string> = {};
  for (const token of extractTokens(template)) {
    const value = tokens[token];
    if (value !== undefined) tokenValues[token] = value;
  }
  return { t, speaker: 'CALLEE', name, template, tokenValues };
}

export function consultReplyLines(input: {
  t: number;
  name: string;
  outcome: string;
  /** 職級隱藏印象帶；其他專科冇印象，傳 null，用中性句。 */
  attitude: RankAttitude | null;
  hasEta: boolean;
  changed: boolean;
  asks: readonly string[];
  tokens: Record<string, string>;
}): CallLine[] {
  const attitude = input.attitude ?? 'NEUTRAL';
  const lines: CallLine[] = [];
  if (input.changed) {
    lines.push(lineFrom(input.t, input.name, '你補充完，我改口。', input.tokens));
  }
  lines.push(
    lineFrom(
      input.t,
      input.name,
      outcomeTemplate(input.outcome, attitude, input.hasEta),
      input.tokens,
    ),
  );
  const questions = input.asks.map((id) => ASK_LINES[id]).filter((text) => text !== undefined);
  if (questions.length > 0) {
    lines.push(lineFrom(input.t, input.name, `我想再問：${questions.join('')}`, input.tokens));
  }
  return lines;
}
