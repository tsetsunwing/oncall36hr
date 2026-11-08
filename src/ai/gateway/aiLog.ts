/**
 * 開發者工具（F12 → Console）用嘅 AI 往來記錄。
 * 每次送去供應商嘅請求同收到嘅回覆都記低；API key 永遠唔入記錄。
 * 供應商有回傳 usage 就用佢，否則按字數估算 token（只係估算，不等於帳單）。
 */
import type { ChatMessage } from '../prompts/messages';

export interface TokenCount {
  prompt: number;
  completion: number;
  total: number;
}

export interface AiLogEntry {
  seq: number;
  at: string;
  reqId: string;
  kind: string;
  attempt: number;
  provider: string;
  model: string;
  url: string | null;
  status: number | null;
  ms: number;
  outcome: 'ok' | 'fail';
  failure: string | null;
  request: ChatMessage[];
  reply: string | null;
  tokens: { estimated: TokenCount; reported: TokenCount | null };
}

export interface AiLogSummary {
  requests: number;
  failed: number;
  estimated: TokenCount;
  reported: TokenCount;
  byKind: Record<string, { requests: number; estimatedTotal: number }>;
}

const MAX_ENTRIES = 300;
const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/g;

/** 中日韓字約 1.3 token／字，其餘約 4 個字元 1 token；每則訊息另加 4。 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  const cjk = text.match(CJK)?.length ?? 0;
  return Math.ceil(cjk * 1.3 + (text.length - cjk) / 4);
}

export function estimateMessages(messages: readonly ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);
}

function toCount(prompt: number, completion: number, total?: number): TokenCount {
  return { prompt, completion, total: total ?? prompt + completion };
}

/** OpenAI 相容（prompt_tokens／completion_tokens）同 Claude（input_tokens／output_tokens）都認。 */
export function reportedUsage(body: unknown): TokenCount | null {
  if (!body || typeof body !== 'object') return null;
  const usage = (body as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') return null;
  const u = usage as Record<string, unknown>;
  const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  const prompt = num(u.prompt_tokens) ?? num(u.input_tokens);
  const completion = num(u.completion_tokens) ?? num(u.output_tokens);
  if (prompt === null && completion === null) return null;
  return toCount(prompt ?? 0, completion ?? 0, num(u.total_tokens) ?? undefined);
}

const entries: AiLogEntry[] = [];
let seq = 0;
let consoleOn = !import.meta.env.MODE.startsWith('test');

export function setAiConsoleLogging(enabled: boolean): void {
  consoleOn = enabled;
}

export function aiLogEntries(): readonly AiLogEntry[] {
  return entries;
}

export function clearAiLog(): void {
  entries.length = 0;
  seq = 0;
}

export function summarizeAiLog(): AiLogSummary {
  const summary: AiLogSummary = {
    requests: entries.length,
    failed: 0,
    estimated: toCount(0, 0),
    reported: toCount(0, 0),
    byKind: {},
  };
  for (const entry of entries) {
    if (entry.outcome === 'fail') summary.failed += 1;
    const est = entry.tokens.estimated;
    summary.estimated = toCount(
      summary.estimated.prompt + est.prompt,
      summary.estimated.completion + est.completion,
    );
    const rep = entry.tokens.reported;
    if (rep) {
      summary.reported = toCount(
        summary.reported.prompt + rep.prompt,
        summary.reported.completion + rep.completion,
        summary.reported.total + rep.total,
      );
    }
    const kind = (summary.byKind[entry.kind] ??= { requests: 0, estimatedTotal: 0 });
    kind.requests += 1;
    kind.estimatedTotal += est.total;
  }
  return summary;
}

function scrub(text: string, secret: string): string {
  const key = secret.trim();
  return key.length >= 6 ? text.split(key).join('[key hidden]') : text;
}

export interface AiExchange {
  reqId: string;
  kind: string;
  attempt: number;
  provider: string;
  model: string;
  url: string | null;
  status: number | null;
  ms: number;
  outcome: 'ok' | 'fail';
  failure: string | null;
  request: ChatMessage[];
  reply: string | null;
  reportedUsage: TokenCount | null;
  apiKey: string;
}

const n = (value: number) => value.toLocaleString('en-US');

function print(entry: AiLogEntry): void {
  const est = entry.tokens.estimated;
  const rep = entry.tokens.reported;
  const tokenText = rep
    ? `${n(rep.total)} tokens (API) · est. ${n(est.total)}`
    : `≈ ${n(est.total)} tokens (est.)`;
  const status = entry.status === null ? 'no response' : `HTTP ${String(entry.status)}`;
  const title = `[AI #${String(entry.seq)}] ${entry.kind} · ${entry.outcome} · ${status} · ${String(entry.ms)} ms · ${tokenText}`;
  const open = entry.outcome === 'fail';
  const group = open ? console.group : console.groupCollapsed;
  group.call(console, title);
  console.log(
    `request id ${entry.reqId} · attempt ${String(entry.attempt)} · ${entry.provider} / ${entry.model}`,
  );
  if (entry.url) console.log('url', entry.url);
  for (const message of entry.request) console.log(`request · ${message.role}`, message.content);
  console.log('reply', entry.reply ?? '(none)');
  if (entry.failure) console.warn('failure', entry.failure);
  console.log(
    `tokens · est. prompt ${n(est.prompt)} + completion ${n(est.completion)} = ${n(est.total)}` +
      (rep
        ? ` · API prompt ${n(rep.prompt)} + completion ${n(rep.completion)} = ${n(rep.total)}`
        : ' · provider returned no usage'),
  );
  console.groupEnd();
}

export function recordAiExchange(exchange: AiExchange): AiLogEntry {
  const hide = (text: string) => scrub(text, exchange.apiKey);
  const request = exchange.request.map((m) => ({ role: m.role, content: hide(m.content) }));
  const reply = exchange.reply === null ? null : hide(exchange.reply);
  const promptEstimate = estimateMessages(exchange.request);
  const completionEstimate = reply === null ? 0 : estimateTokens(reply);
  seq += 1;
  const entry: AiLogEntry = {
    seq,
    at: new Date().toISOString(),
    reqId: exchange.reqId,
    kind: exchange.kind,
    attempt: exchange.attempt,
    provider: exchange.provider,
    model: exchange.model,
    url: exchange.url,
    status: exchange.status,
    ms: Math.round(exchange.ms),
    outcome: exchange.outcome,
    failure: exchange.failure === null ? null : hide(exchange.failure),
    request,
    reply,
    tokens: {
      estimated: toCount(promptEstimate, completionEstimate),
      reported: exchange.reportedUsage,
    },
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  if (consoleOn) {
    print(entry);
    const total = summarizeAiLog();
    console.info(
      `[AI] session: ${String(total.requests)} requests, ${String(total.failed)} failed, ≈ ${n(total.estimated.total)} tokens (est.)`,
    );
  }
  return entry;
}

interface DevHandle {
  log: () => readonly AiLogEntry[];
  summary: () => AiLogSummary;
  clear: () => void;
  console: (enabled: boolean) => void;
}

/** F12 輸入 dandu.ai.summary() 睇累計用量；dandu.ai.log() 睇全部往來。 */
export function installAiDevHandle(): void {
  const handle: DevHandle = {
    log: aiLogEntries,
    summary: summarizeAiLog,
    clear: clearAiLog,
    console: setAiConsoleLogging,
  };
  const root = globalThis as unknown as { dandu?: { ai?: DevHandle } };
  root.dandu = { ...root.dandu, ai: handle };
}
