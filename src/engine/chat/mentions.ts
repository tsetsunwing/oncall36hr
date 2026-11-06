import type { Present } from './chatTypes';

const MENTION = /[@＠]([^\s@＠]+)/gu;
const TRAILING_PUNCT = /[,，。.!！?？、:：]+$/u;

export const MENTION_ALL_KEYS = ['全部', 'all'];

/** 玩家 @ 到邊啲在場角色（由 engine 解析，唔信 AI 判斷） */
export function parseMentions(text: string, present: readonly Present[]): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(MENTION)) {
    const key = (match[1] ?? '').replace(TRAILING_PUNCT, '').toLowerCase();
    if (key.length === 0) continue;
    if (MENTION_ALL_KEYS.includes(key)) {
      for (const p of present) if (!ids.includes(p.id)) ids.push(p.id);
      continue;
    }
    for (const p of present) {
      if (!ids.includes(p.id) && p.mentionKeys.some((k) => k.toLowerCase() === key)) ids.push(p.id);
    }
  }
  return ids;
}

export function stripMentions(text: string): string {
  return text.replace(MENTION, ' ').replace(/\s+/g, ' ').trim();
}
