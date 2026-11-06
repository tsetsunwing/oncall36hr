/**
 * Numeric guard（implementation-plan §7.4、B3）：AI 對白入面嘅數值只可以係 `{{token}}`。
 * 呢度係 gateway 層；engine 寫入 ChatLine 前會用自己一份規則再驗一次（defense in depth，
 * 兩份規則由 src/app 嘅 cross-contract test 對齊）。
 */
const TOKEN_SOURCE = String.raw`\{\{([a-z][a-zA-Z0-9_.]*)\}\}`;
const CJK_NUMBER = /[零〇一二三四五六七八九十百兩两]{2,}|[二三四五六七八九十]\s*(?:度|%|％|百分)/u;

export type TextIssue =
  'EMPTY' | 'TOO_LONG' | 'BARE_NUMBER' | 'MALFORMED_TOKEN' | 'UNKNOWN_TOKEN' | 'DIAGNOSIS_LEAK';

export function tokensIn(text: string): string[] {
  return [...text.matchAll(new RegExp(TOKEN_SOURCE, 'g'))].map((m) => m[1] ?? '');
}

export function withoutTokens(text: string): string {
  return text.replace(new RegExp(TOKEN_SOURCE, 'g'), '');
}

export function hasBareNumber(text: string): boolean {
  const normalised = text.normalize('NFKC');
  return /\p{N}/u.test(normalised) || CJK_NUMBER.test(normalised);
}

export function leaksDiagnosis(text: string, denyTerms: readonly string[]): boolean {
  const haystack = withoutTokens(text).normalize('NFKC').toLowerCase();
  return denyTerms.some((term) => {
    const needle = term.normalize('NFKC').toLowerCase().trim();
    return needle.length > 0 && haystack.includes(needle);
  });
}

export interface TextRules {
  allowedTokens: ReadonlySet<string>;
  denyTerms: readonly string[];
  maxChars: number;
}

export function checkDialogueText(text: string, rules: TextRules): TextIssue[] {
  const issues: TextIssue[] = [];
  if (text.trim().length === 0) issues.push('EMPTY');
  if (text.length > rules.maxChars) issues.push('TOO_LONG');
  const rest = withoutTokens(text);
  if (rest.includes('{{') || rest.includes('}}')) issues.push('MALFORMED_TOKEN');
  if (hasBareNumber(rest)) issues.push('BARE_NUMBER');
  if (tokensIn(text).some((token) => !rules.allowedTokens.has(token))) issues.push('UNKNOWN_TOKEN');
  if (leaksDiagnosis(text, rules.denyTerms)) issues.push('DIAGNOSIS_LEAK');
  return issues;
}
