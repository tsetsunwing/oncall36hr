import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

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
 *   mock-bad-json      回 200 但 body 唔係合法 JSON
 */
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

  const server: Server = createServer((req, res) => {
    void (async () => {
      const path = (req.url ?? '/').split('?')[0] ?? '/';
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
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
