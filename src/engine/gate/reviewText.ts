/**
 * 回顧用嘅 AI 評語（藥房安全理由、危險度理由）：同對白一樣，數值／藥名只可以係 engine 凍結嘅 {{token}}，
 * 唔可以有裸數字、未知 token 或診斷詞；唔合格就丟棄（回顧改用 engine 事實句），唔會令整個 AI 回覆作廢。
 */
import { extractTokens, hasBareNumber, leaksDiagnosis, validateTemplate } from '../chat/tokens';

export interface ReviewText {
  rationale: string;
  tokenValues: Record<string, string>;
}

export const EMPTY_REVIEW_TEXT: ReviewText = { rationale: '', tokenValues: {} };

export function guardReviewText(
  raw: string,
  allowed: ReadonlySet<string>,
  frozen: Readonly<Record<string, string>>,
  denyTerms: readonly string[],
  maxChars: number,
): ReviewText {
  const text = raw.trim();
  if (text.length === 0) return EMPTY_REVIEW_TEXT;
  if (validateTemplate(text, allowed, maxChars) !== null) return EMPTY_REVIEW_TEXT;
  if (leaksDiagnosis(text, denyTerms)) return EMPTY_REVIEW_TEXT;
  const tokenValues: Record<string, string> = {};
  for (const token of extractTokens(text)) {
    const value = frozen[token];
    if (value === undefined) return EMPTY_REVIEW_TEXT;
    tokenValues[token] = value;
  }
  return { rationale: text, tokenValues };
}

/** 回顧顯示前再驗一次（舊存檔、被改動嘅存檔）：有裸數字或缺 token 值就唔顯示 */
export function safeReviewText(text: ReviewText): string | null {
  if (text.rationale.length === 0) return null;
  const rest = text.rationale.replace(/\{\{[a-z][a-zA-Z0-9_.]*\}\}/g, '');
  if (hasBareNumber(rest)) return null;
  const missing: string[] = [];
  const rendered = text.rationale.replace(/\{\{([a-z][a-zA-Z0-9_.]*)\}\}/g, (_w, key: string) => {
    const value = text.tokenValues[key];
    if (value === undefined) missing.push(key);
    return value ?? '';
  });
  return missing.length > 0 ? null : rendered;
}
