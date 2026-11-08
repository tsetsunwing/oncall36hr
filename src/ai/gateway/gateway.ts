/**
 * AI gateway：engine 嘅 AI_REQUEST → 傳輸 → 解析 → zod 驗證 → guard → AI_RESULT／AI_FAILURE。
 * 失敗處理跟 C7 A：逾時／HTTP 錯誤／格式錯誤／guard 違規自動重試最多 autoRepairRetries 次
 * （格式同 guard 違規會附上問題叫模型修正）；認證錯誤唔重試；仍失敗先回報失敗（由 engine 暫停＋存檔）。
 * 只有 prompt 會送出；local（deny-list、凍結 token）永遠唔離開本機。
 */
import { z } from 'zod';
import { getConfig } from '@/content';
import type { AiFailureReason, JsonValue } from '@/engine';
import { contractFor } from '../contracts';
import { CONTRACT_VERSION } from '../contracts/types';
import { buildMessages, repairMessages, type ChatMessage } from '../prompts/messages';
import { isApiKeyRejection, postCompletion, providerErrorDetail } from './transport';
import type { AiEndpoint, TransportOptions } from './types';

export interface AiRequest {
  reqId: string;
  kind: string;
  context: unknown;
}

export type AiOutcome =
  { ok: true; payload: JsonValue } | { ok: false; reason: AiFailureReason; detail: string };

export interface AiGateway {
  run(request: AiRequest): Promise<AiOutcome>;
}

const contextSchema = z.object({ prompt: z.unknown(), local: z.unknown() });

const completionSchema = z
  .object({
    choices: z
      .array(z.object({ message: z.object({ content: z.string().nullable() }).loose() }).loose())
      .min(1),
  })
  .loose();

const envelopeSchema = z.object({
  contract: z.literal(CONTRACT_VERSION),
  kind: z.string(),
  data: z.unknown(),
});

type Attempt =
  | { kind: 'ok'; payload: JsonValue }
  | {
      kind: 'fail';
      reason: AiFailureReason;
      retry: boolean;
      detail: string;
      reply?: string;
      issues?: string[];
    };

function httpDetail(status: number, body: unknown, url: string): string {
  const message = providerErrorDetail(body);
  const statusText = message ? `HTTP ${String(status)}：${message}` : `HTTP ${String(status)}`;
  return `${statusText}（${url}）`;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const match = /\{[\s\S]*\}/.exec(text);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]) as unknown;
    } catch {
      return undefined;
    }
  }
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues
    .slice(0, 6)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

export function createAiGateway(
  endpoint: AiEndpoint,
  options: Partial<TransportOptions> = {},
): AiGateway {
  return {
    async run(request) {
      const { ai } = getConfig();
      const contract = contractFor(request.kind);
      const context = contextSchema.safeParse(request.context);
      if (!contract || !context.success) {
        return { ok: false, reason: 'FORMAT', detail: '回覆格式不符契約' };
      }
      const prompt = contract.promptSchema.safeParse(context.data.prompt);
      const local = contract.localSchema.safeParse(context.data.local);
      if (!prompt.success || !local.success) {
        return { ok: false, reason: 'FORMAT', detail: '回覆格式不符契約' };
      }

      const base = buildMessages(contract, prompt.data);
      let messages: ChatMessage[] = base;
      let last: AiFailureReason = 'FORMAT';
      let lastDetail = '回覆格式不符契約';

      const attempt = async (): Promise<Attempt> => {
        const response = await postCompletion(
          endpoint,
          {
            messages,
            temperature: ai[contract.temperatureKey],
            jsonMode: true,
          },
          { timeoutMs: ai.requestTimeoutMs, ...options },
        );
        if (response.kind === 'timeout') {
          return {
            kind: 'fail',
            reason: 'TIMEOUT',
            retry: true,
            detail: `逾時（${response.url}）`,
          };
        }
        if (response.kind === 'network') {
          const raw = response.message ? ` ${response.message}` : '';
          const extra = endpoint.apiKey ? raw.split(endpoint.apiKey).join('…') : raw;
          return {
            kind: 'fail',
            reason: 'NETWORK',
            retry: true,
            detail: `沒有收到 HTTP 回應（${response.url}）${extra}`.trim(),
          };
        }
        if (isApiKeyRejection(response.status, response.body)) {
          return {
            kind: 'fail',
            reason: 'AUTH',
            retry: false,
            detail: httpDetail(response.status, response.body, response.url),
          };
        }
        if (response.status === 404) {
          return {
            kind: 'fail',
            reason: 'NETWORK',
            retry: false,
            detail: httpDetail(response.status, response.body, response.url),
          };
        }
        if (response.status < 200 || response.status >= 300) {
          return {
            kind: 'fail',
            reason: 'NETWORK',
            retry: true,
            detail: httpDetail(response.status, response.body, response.url),
          };
        }
        const completion = completionSchema.safeParse(response.body);
        const reply = completion.success ? (completion.data.choices[0]?.message.content ?? '') : '';
        if (!completion.success) {
          return { kind: 'fail', reason: 'FORMAT', retry: true, detail: '回覆不是聊天補全' };
        }

        const json = parseJson(reply);
        const envelope = envelopeSchema.safeParse(json);
        if (!envelope.success || envelope.data.kind !== request.kind) {
          return {
            kind: 'fail',
            reason: 'FORMAT',
            retry: true,
            detail: '回覆格式不符契約',
            reply,
            issues: [
              `Top level must be {"contract":"${CONTRACT_VERSION}","kind":"${request.kind}","data":{...}}.`,
            ],
          };
        }
        const data = contract.dataSchema.safeParse(envelope.data.data);
        if (!data.success) {
          return {
            kind: 'fail',
            reason: 'FORMAT',
            retry: true,
            detail: '回覆格式不符契約',
            reply,
            issues: formatIssues(data.error),
          };
        }
        const guard = contract.guard(data.data, prompt.data, local.data);
        if (guard.issues.length > 0) {
          return {
            kind: 'fail',
            reason: 'GUARD',
            retry: true,
            detail: '回覆內容未通過檢查',
            reply,
            issues: guard.issues,
          };
        }
        return { kind: 'ok', payload: data.data as JsonValue };
      };

      for (let tries = 0; tries <= ai.autoRepairRetries; tries += 1) {
        const result = await attempt();
        if (result.kind === 'ok') return { ok: true, payload: result.payload };
        last = result.reason;
        lastDetail = result.detail;
        if (!result.retry) break;
        messages =
          result.issues && result.reply !== undefined
            ? repairMessages(base, result.reply, result.issues)
            : base;
      }
      return { ok: false, reason: last, detail: lastDetail };
    },
  };
}
