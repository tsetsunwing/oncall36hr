export interface AiEndpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface DevProxy {
  /** 例如 '/ai-proxy'：請求改發到同源，由 Vite dev server 轉發。 */
  prefix: string;
}

export interface TransportOptions {
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  proxy?: DevProxy;
}
