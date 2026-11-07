export type AiProvider = 'grok' | 'gemini' | 'openai' | 'claude';

export interface AiEndpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 缺省當 OpenAI chat/completions。Claude 改走 Messages API。 */
  provider?: AiProvider;
  /** 空字串或省略：不送思考參數。 */
  thinkingLevel?: string;
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
