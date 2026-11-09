import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CONTRACT_MODES, contractReply, parseRequest, type ContractMode } from './contracts';

/**
 * 本地 mock OpenAI-compatible server（只供 dev／test，唔進 production bundle，亦唔作離線後備）。
 * 行為由 model 名稱決定，方便測試各種失敗情況：
 *   mock-ok（預設）    回 JSON 物件
 *   mock-text          回非 JSON 純文字
 *   mock-bad-shape     回唔符合 chat/completions 嘅 JSON
 *   mock-5xx           HTTP 500
 *   mock-429           HTTP 429
 *   mock-slow          延遲 slowMs 後先回
 *   mock-hang          永不回應（測逾時）
 *   mock-delay-ok      契約請求延遲 slowMs 後回有效 JSON（測等 AI 時時鐘暫停）
 *   mock-slow-twice    頭兩次拖延至客戶端逾時，第三次回有效契約（測玩家重試）
 *   mock-bad-json      回 200 但 body 唔係合法 JSON
 *
 * 契約請求（order.parse／dialogue.turn／gate.pharmacy／gate.nurse／gate.danger／consult.assess／
 * consult.reply／family.assess／family.reply／rounds.question／rounds.grade）：
 *   mock-ok            按請求內容回有效契約回應（關鍵字比對 catalog、對白用 {{token}}）
 *   mock-<mode>        惡意／錯誤輸出：numbers、inject、bad-token、diagnosis、extra-fields、
 *                      wrong-speaker、unknown-catalog、invented-dose、gate-bad-line（把關句子含裸數字）、
 *                      danger-low／danger-high（強制 gate.danger 評級）
 *   mock-flaky         同一個請求內容嘅第 1 次先回壞格式，修復重試（第 2 次）成功
 *   mock-fail-twice    同一個請求內容嘅頭 2 次 HTTP 503，第 3 次成功（測 gateway 重試＋玩家重試）
 *   mock-auth-fail     契約請求一律 401
 */
const CONTRACT_KINDS = [
  'order.parse',
  'order.effect',
  'dialogue.turn',
  'gate.pharmacy',
  'gate.nurse',
  'gate.danger',
  'consult.assess',
  'consult.reply',
  'family.assess',
  'family.reply',
  'rounds.question',
  'rounds.grade',
];

export interface MockServerOptions {
  port?: number;
  host?: string;
  apiKey?: string;
  slowMs?: number;
}

export interface MockServer {
  url: string;
  baseUrl: string;
  apiKey: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
}

export interface RecordedRequest {
  method: string;
  path: string;
  authorized: boolean;
  body: unknown;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-ai-target-base-url',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '600',
};

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS_HEADERS });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function completion(model: string, content: string) {
  return {
    id: 'mock-completion',
    object: 'chat.completion',
    created: 0,
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

export async function startMockServer(options: MockServerOptions = {}): Promise<MockServer> {
  const apiKey = options.apiKey ?? 'test-key';
  const slowMs = options.slowMs ?? 1500;
  const requests: RecordedRequest[] = [];
  const hanging = new Set<ServerResponse>();
  const attempts = new Map<string, number>();

  const server: Server = createServer((req, res) => {
    void (async () => {
      const path = (req.url ?? '/').split('?')[0] ?? '/';
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
      }
      if (path === '/__reset') {
        attempts.clear();
        requests.length = 0;
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === 'GET' && path === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }
      const body = await readBody(req);
      const authorized = req.headers.authorization === `Bearer ${apiKey}`;
      requests.push({ method: req.method ?? 'GET', path, authorized, body });

      if (!authorized) {
        sendJson(res, 401, {
          error: { message: 'Invalid API key', type: 'invalid_request_error' },
        });
        return;
      }
      if (req.method !== 'POST' || !path.endsWith('/chat/completions')) {
        sendJson(res, 404, { error: { message: 'Not found' } });
        return;
      }

      const model =
        typeof body === 'object' && body !== null && 'model' in body
          ? String(body.model)
          : 'mock-ok';

      const contract = parseRequest(body);
      if (contract && CONTRACT_KINDS.includes(contract.kind)) {
        const key = `${model}|${contract.kind}|${JSON.stringify(contract.prompt)}`;
        const attempt = (attempts.get(key) ?? 0) + 1;
        attempts.set(key, attempt);
        const mode = model.replace(/^mock-/, '');
        if (model === 'mock-auth-fail') {
          sendJson(res, 401, { error: { message: 'Invalid API key' } });
          return;
        }
        if (model === 'mock-fail-twice' && attempt <= 2) {
          sendJson(res, 503, { error: { message: 'Unavailable' } });
          return;
        }
        if (model === 'mock-flaky' && attempt === 1) {
          sendJson(res, 200, completion(model, 'sorry, here is some prose and no JSON'));
          return;
        }
        if (model === 'mock-hang') {
          hanging.add(res);
          return;
        }
        if (model === 'mock-delay-ok') {
          await new Promise((resolve) => setTimeout(resolve, slowMs));
          const delayed = contractReply(contract, 'ok');
          if (delayed !== null) sendJson(res, 200, completion(model, delayed));
          return;
        }
        if (model === 'mock-slow-twice' && attempt <= 2) {
          hanging.add(res);
          await new Promise((resolve) => setTimeout(resolve, 8_000));
          hanging.delete(res);
          if (!res.writableEnded) res.destroy();
          return;
        }
        if (model === 'mock-slow-twice') {
          const recovered = contractReply(contract, 'ok');
          if (recovered !== null) sendJson(res, 200, completion(model, recovered));
          return;
        }
        const effective: ContractMode = (CONTRACT_MODES as readonly string[]).includes(mode)
          ? (mode as ContractMode)
          : 'ok';
        const reply = contractReply(contract, effective);
        if (
          reply !== null &&
          ![
            'mock-5xx',
            'mock-429',
            'mock-text',
            'mock-bad-shape',
            'mock-bad-json',
            'mock-slow',
          ].includes(model)
        ) {
          sendJson(res, 200, completion(model, reply));
          return;
        }
      }

      switch (model) {
        case 'mock-5xx':
          sendJson(res, 500, { error: { message: 'Internal error' } });
          return;
        case 'mock-429':
          sendJson(res, 429, { error: { message: 'Rate limited' } });
          return;
        case 'mock-text':
          sendJson(res, 200, completion(model, 'pong'));
          return;
        case 'mock-bad-shape':
          sendJson(res, 200, { hello: 'world' });
          return;
        case 'mock-bad-json':
          res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
          res.end('{not json');
          return;
        case 'mock-hang':
          hanging.add(res);
          return;
        case 'mock-slow':
          await new Promise((resolve) => setTimeout(resolve, slowMs));
          sendJson(res, 200, completion(model, '{"ok":true}'));
          return;
        default:
          sendJson(res, 200, completion(model, '{"ok":true}'));
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  const url = `http://${options.host ?? '127.0.0.1'}:${String(port)}`;

  return {
    url,
    baseUrl: `${url}/v1`,
    apiKey,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        for (const res of hanging) res.destroy();
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}
