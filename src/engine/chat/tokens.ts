/**
 * 對白 token（B3）：AI 文字入面嘅數值／order／狀態只可以係 {{token}}，
 * 由 engine 於發言當刻解析並凍結。呢度係最後防線：engine 寫入 ChatLine 前再驗一次。
 */
const TOKEN_SOURCE = String.raw`\{\{([a-z][a-zA-Z0-9_.]*)\}\}`;

export function extractTokens(template: string): string[] {
  return [...template.matchAll(new RegExp(TOKEN_SOURCE, 'g'))].map((m) => m[1] ?? '');
}

export function stripTokens(template: string): string {
  return template.replace(new RegExp(TOKEN_SOURCE, 'g'), '');
}

/** 中文數字：連續兩個或以上（九十三、十二），或「數字＋度／%」。單個「一／兩」（一下、兩個）屬正常口語，唔攔。 */
const CJK_NUMBER = /[零〇一二三四五六七八九十百兩两]{2,}|[二三四五六七八九十]\s*(?:度|%|％|百分)/u;

export function hasBareNumber(text: string): boolean {
  const normalised = text.normalize('NFKC');
  return /\p{N}/u.test(normalised) || CJK_NUMBER.test(normalised);
}

export type TemplateIssue =
  'EMPTY' | 'TOO_LONG' | 'BARE_NUMBER' | 'MALFORMED_TOKEN' | 'UNKNOWN_TOKEN';

export function validateTemplate(
  template: string,
  allowedTokens: ReadonlySet<string>,
  maxChars: number,
): TemplateIssue | null {
  if (template.trim().length === 0) return 'EMPTY';
  if (template.length > maxChars) return 'TOO_LONG';
  const rest = stripTokens(template);
  if (rest.includes('{{') || rest.includes('}}')) return 'MALFORMED_TOKEN';
  if (hasBareNumber(rest)) return 'BARE_NUMBER';
  for (const token of extractTokens(template)) {
    if (!allowedTokens.has(token)) return 'UNKNOWN_TOKEN';
  }
  return null;
}

/** 診斷洩漏：對白文字（連 token 值一併唔計）包含任何 deny 詞即視為違規。 */
export function leaksDiagnosis(template: string, denyTerms: readonly string[]): boolean {
  const text = stripTokens(template).normalize('NFKC').toLowerCase();
  return denyTerms.some((term) => {
    const needle = term.normalize('NFKC').toLowerCase().trim();
    return needle.length > 0 && text.includes(needle);
  });
}

export const UNRESOLVED_TOKEN_TEXT = '—';

export function renderTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(new RegExp(TOKEN_SOURCE, 'g'), (_whole, key: string) =>
    Object.hasOwn(values, key) ? (values[key] ?? UNRESOLVED_TOKEN_TEXT) : UNRESOLVED_TOKEN_TEXT,
  );
}
