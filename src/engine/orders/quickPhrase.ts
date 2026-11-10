/**
 * 本地快捷詞 parser（implementation-plan §2.4、spec §9.3）：有明確結構嘅輸入直接變 action，不經 AI，
 * 所以搶救唔受 AI 延遲影響。字典來自 T26 quick-words，藥物句式來自 T5 formulary。
 */
import type { EngineTables, ExecutorKind } from '../case/tables';
import { stripMentions } from '../chat/mentions';
import { DRAIN_CATALOG_ID, normalizeDrainSite } from './drains';
import type { Order } from './orderTypes';
import { matchPromptPhrase } from './quickPrompt';

export interface LocalOrderMatch {
  catalogId: string;
  params: Order['params'];
  /** 快捷詞指定嘅執行者（例如「自己插 NG tube」）；null＝由系統揀 */
  executor: ExecutorKind | null;
}

export function normalizePhrase(text: string): string {
  return stripMentions(text.normalize('NFKC'))
    .toLowerCase()
    .replace(/[.。!！,，]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

const NO_PARAMS: Order['params'] = { drugFormularyId: null, dose: null, route: null };

/** 「surgical drain」後面的文字就是位置。沒有位置就不落單，也不假設左右。 */
export function matchDrainPhrase(text: string): LocalOrderMatch | null {
  const phrase = normalizePhrase(text);
  const prefix = 'surgical drain ';
  if (!phrase.startsWith(prefix)) return null;
  const site = normalizeDrainSite(phrase.slice(prefix.length));
  if (!site) return null;
  return {
    catalogId: DRAIN_CATALOG_ID,
    executor: null,
    params: {
      drugFormularyId: null,
      dose: null,
      route: null,
      site,
      summary: `Surgical drain ${site}`,
    },
  };
}

export function matchQuickPhrase(text: string, tables: EngineTables): LocalOrderMatch | null {
  const phrase = normalizePhrase(text);
  if (phrase.length === 0) return null;
  const drain = matchDrainPhrase(phrase);
  if (drain) return drain;

  for (const word of tables['quick-words']) {
    if (word.prompt && word.prompt.length > 0) continue;
    if (!word.aliases.some((alias) => normalizePhrase(alias) === phrase)) continue;
    const params = word.params;
    return {
      catalogId: word.catalogId,
      executor: params?.executor ?? null,
      params: params
        ? {
            drugFormularyId: params.drugFormularyId ?? null,
            dose: params.dose ? { ...params.dose } : null,
            route: params.route ?? null,
          }
        : NO_PARAMS,
    };
  }

  const prompted = matchPromptPhrase(phrase, tables);
  if (prompted) return prompted;

  for (const drug of tables.formulary) {
    const aliases = drug.aliases.map((a) => escapeRegExp(a.toLowerCase())).join('|');
    const units = drug.units.map((u) => escapeRegExp(u.toLowerCase())).join('|');
    const routes = drug.routes.map((r) => escapeRegExp(r.toLowerCase())).join('|');
    const pattern = new RegExp(
      String.raw`^(?:${aliases})\s+(\d+(?:\.\d+)?)\s*(${units})(?:\s+(${routes}))?$`,
    );
    const match = pattern.exec(phrase);
    if (!match) continue;
    const value = Number(match[1]);
    const unit = drug.units.find((u) => u.toLowerCase() === match[2]);
    if (!Number.isFinite(value) || value <= 0 || !unit) continue;
    const route = drug.routes.find((r) => r.toLowerCase() === match[3]) ?? null;
    return {
      catalogId: drug.catalogId,
      executor: null,
      params: { drugFormularyId: drug.id, dose: { value, unit }, route },
    };
  }

  const entry = tables['order-catalog'].find(
    (row) =>
      row.id !== DRAIN_CATALOG_ID && row.aliases.some((alias) => normalizePhrase(alias) === phrase),
  );
  return entry ? { catalogId: entry.id, params: NO_PARAMS, executor: null } : null;
}
