/**
 * 快捷按鈕彈窗組出嚟嘅句子：詞幹後面跟劑量、途徑、頻次、次數、容量、速率、能量、流量、輸血單位。
 * 欄位可缺，但句子要食得晒，而且至少要有一欄。
 */
import type { EngineTables, QuickWordRow } from '../case/tables';
import type { Order } from './orderTypes';

const FIELD_ORDER = [
  'dose',
  'route',
  'frequency',
  'times',
  'volume',
  'rate',
  'energy',
  'flow',
  'transfusion',
] as const;

type PromptField = (typeof FIELD_ORDER)[number];

export interface PromptMatch {
  catalogId: string;
  executor: Order['executorKind'];
  params: Order['params'];
}

function formularyFor(word: QuickWordRow, tables: EngineTables) {
  return (
    tables.formulary.find((row) => row.id === word.params?.drugFormularyId) ??
    tables.formulary.find((row) => row.catalogId === word.catalogId) ??
    null
  );
}

function take(tail: string, pattern: RegExp): { groups: string[]; rest: string } | null {
  const match = pattern.exec(tail);
  if (!match) return null;
  return { groups: match.slice(1), rest: tail.slice(match[0].length).trim() };
}

function canonicalFrequency(token: string): string {
  const lower = token.toLowerCase();
  if (lower === 'tds') return 'TDS';
  if (lower === 'stat') return 'stat';
  if (lower === 'prn') return 'prn';
  const hours = /^q(\d+)h$/i.exec(lower);
  if (hours) return `Q${hours[1]}H`;
  const minutes = /^q(\d+)min$/i.exec(lower);
  return minutes ? `Q${minutes[1]}min` : token;
}

function parseTail(tail: string, word: QuickWordRow, tables: EngineTables): Order['params'] | null {
  const asked = new Set(word.prompt ?? []);
  const drug = formularyFor(word, tables);
  const doseUnits = drug?.units ?? [];
  const routes = drug?.routes ?? ['IV', 'PO', 'IM', 'SC', 'IO'];
  let rest = tail.trim();
  let dose: Order['params']['dose'] = null;
  let route: string | null = null;
  let frequency: string | undefined;
  let times: number | undefined;
  let rate: Order['params']['rate'];
  let used = 0;

  const setAmount = (value: number, unit: string) => {
    dose = { value, unit };
    used += 1;
  };

  for (const field of FIELD_ORDER) {
    if (!asked.has(field) || rest.length === 0) continue;
    const parsed = parseField(field, rest, doseUnits, routes);
    if (!parsed) continue;
    rest = parsed.rest;
    used +=
      field === 'dose' ||
      field === 'volume' ||
      field === 'energy' ||
      field === 'flow' ||
      field === 'transfusion'
        ? 0
        : 1;
    if (field === 'dose' && parsed.dose) setAmount(parsed.dose.value, parsed.dose.unit);
    if (field === 'volume' && parsed.amount !== undefined) setAmount(parsed.amount, 'ml');
    if (field === 'energy' && parsed.amount !== undefined) setAmount(parsed.amount, 'J');
    if (field === 'flow' && parsed.amount !== undefined) {
      if (!flowAllowed(word.catalogId, parsed.amount)) return null;
      setAmount(parsed.amount, 'L/min');
    }
    if (field === 'transfusion' && parsed.amount !== undefined) setAmount(parsed.amount, 'unit');
    if (field === 'route' && parsed.route) route = parsed.route;
    if (field === 'frequency' && parsed.frequency) frequency = parsed.frequency;
    if (field === 'times' && parsed.times) times = parsed.times;
    if (field === 'rate' && parsed.amount !== undefined)
      rate = { value: parsed.amount, unit: 'ml/hr' };
  }

  if (rest.length > 0 || used === 0) return null;
  return {
    drugFormularyId: word.params?.drugFormularyId ?? drug?.id ?? null,
    dose,
    route,
    ...(frequency ? { frequency } : {}),
    ...(times ? { times } : {}),
    ...(rate ? { rate } : {}),
  };
}

function parseField(
  field: PromptField,
  tail: string,
  doseUnits: readonly string[],
  routes: readonly string[],
): {
  rest: string;
  dose?: { value: number; unit: string };
  amount?: number;
  route?: string;
  frequency?: string;
  times?: number;
} | null {
  if (field === 'dose') {
    const taken = take(tail, /^(\d+(?:\.\d+)?)[\s]*([a-zμµ]+)\b/i);
    if (!taken) return null;
    const value = Number(taken.groups[0]);
    const unit = doseUnits.find((item) => item.toLowerCase() === taken.groups[1]?.toLowerCase());
    if (!Number.isFinite(value) || value <= 0 || !unit) return null;
    return { rest: taken.rest, dose: { value, unit } };
  }
  if (field === 'route') {
    const taken = take(
      tail,
      new RegExp(String.raw`^(${routes.map(escapeRoute).join('|')})\b`, 'i'),
    );
    if (!taken) return null;
    const route = routes.find((item) => item.toLowerCase() === taken.groups[0]?.toLowerCase());
    if (!route) return null;
    return { rest: taken.rest, route };
  }
  if (field === 'frequency') {
    const taken = take(tail, /^(stat|tds|prn|q\d+h|q\d+min)\b/i);
    if (!taken?.groups[0]) return null;
    return { rest: taken.rest, frequency: canonicalFrequency(taken.groups[0]) };
  }
  if (field === 'times') {
    const taken = take(tail, /^x([1-3])\b/i);
    if (!taken) return null;
    return { rest: taken.rest, times: Number(taken.groups[0]) };
  }
  if (field === 'volume') {
    const taken =
      take(tail, /^(\d+(?:\.\d+)?)\s*ml\b(?!\/)/i) ??
      take(tail, /^(\d+(?:\.\d+)?)(?!\s*ml\/)(?=\s|$)/i);
    return amount(taken);
  }
  if (field === 'rate') {
    const taken = take(tail, /^(\d+(?:\.\d+)?)\s*ml\/hr\b/i);
    return amount(taken);
  }
  if (field === 'energy') {
    const taken = take(tail, /^(\d+(?:\.\d+)?)\s*(?:j|joules?)\b/i);
    return amount(taken);
  }
  if (field === 'flow') {
    const taken = take(tail, /^(\d+(?:\.\d+)?)\s*l\/min\b/i);
    return amount(taken);
  }
  const taken = take(tail, /^(\d+(?:\.\d+)?)\s*unit\b/i);
  return amount(taken);
}

/** 鼻導管 1–6 L/min；非循環面罩 10–15 L/min。超出唔落單。 */
function flowAllowed(catalogId: string, value: number): boolean {
  if (catalogId === 'oxygen.nasal') return value >= 1 && value <= 6;
  if (catalogId === 'oxygen.nrb') return value >= 10 && value <= 15;
  return true;
}

function escapeRoute(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function amount(
  taken: { groups: string[]; rest: string } | null,
): { rest: string; amount: number } | null {
  if (!taken) return null;
  const value = Number(taken.groups[0]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { rest: taken.rest, amount: value };
}

/** `phrase` 要已經過 normalizePhrase。 */
export function matchPromptPhrase(phrase: string, tables: EngineTables): PromptMatch | null {
  const words = tables['quick-words']
    .filter((word) => word.prompt && word.prompt.length > 0 && word.promptStem)
    .sort((a, b) => (b.promptStem?.length ?? 0) - (a.promptStem?.length ?? 0));
  for (const word of words) {
    const stem = word.promptStem?.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim() ?? '';
    if (stem.length === 0) continue;
    if (phrase !== stem && !phrase.startsWith(`${stem} `)) continue;
    const tail = phrase === stem ? '' : phrase.slice(stem.length).trim();
    const params = parseTail(tail, word, tables);
    if (!params) continue;
    return {
      catalogId: word.catalogId,
      executor: word.params?.executor ?? null,
      params,
    };
  }
  return null;
}
