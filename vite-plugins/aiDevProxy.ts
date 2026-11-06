import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const PREFIX = '/ai-proxy/';
const TARGET_HEADER = 'x-ai-target-base-url';

async function forward(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  const target = req.headers[TARGET_HEADER];
  if (typeof target !== 'string' || !/^https?:\/\//.test(target)) {
    res.statusCode = 400;
    res.end(`missing or invalid ${TARGET_HEADER}`);
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);
  const method = req.method ?? 'GET';
  const url = `${target.replace(/\/+$/, '')}/${path}`;
  try {
    const upstream = await fetch(url, {
      method,
      headers: {
        'content-type': req.headers['content-type'] ?? 'application/json',
        ...(typeof req.headers.authorization === 'string'
          ? { authorization: req.headers.authorization }
          : {}),
      },
      ...(method !== 'GET' && body.length > 0 ? { body } : {}),
    });
    res.statusCode = upstream.status;
    res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.statusCode = 502;
    res.end('upstream unreachable');
  }
}

/**
 * 只喺 `vite dev` 生效：同源 `/ai-proxy/*` → 由 header 指定嘅 base URL。
 * 目的：避開 CORS，同時令 key 唔入 env／repo（由前端 header 帶）。production build 不含此邏輯。
 */
export function aiDevProxy(): Plugin {
  return {
    name: 'dandu-ai-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(PREFIX)) {
          next();
          return;
        }
        void forward(req, res, req.url.slice(PREFIX.length));
      });
    },
  };
}
