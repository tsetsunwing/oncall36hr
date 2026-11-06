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
  if (/\p{N}/u.test(rest)) return 'BARE_NUMBER';
  for (const token of extractTokens(template)) {
    if (!allowedTokens.has(token)) return 'UNKNOWN_TOKEN';
  }
  return null;
}

export const UNRESOLVED_TOKEN_TEXT = '—';

export function renderTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(new RegExp(TOKEN_SOURCE, 'g'), (_whole, key: string) =>
    Object.hasOwn(values, key) ? (values[key] ?? UNRESOLVED_TOKEN_TEXT) : UNRESOLVED_TOKEN_TEXT,
  );
}
