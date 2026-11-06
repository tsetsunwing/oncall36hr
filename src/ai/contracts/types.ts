import type { z } from 'zod';

export const CONTRACT_VERSION = 'v1';

/** Gateway 驗證輸出嘅結果：issues 會作為修復重試嘅提示送返畀模型。 */
export interface GuardResult {
  issues: string[];
}

export interface Contract<Prompt, Local, Data> {
  kind: string;
  promptSchema: z.ZodType<Prompt>;
  localSchema: z.ZodType<Local>;
  dataSchema: z.ZodType<Data>;
  temperatureKey: 'parseTemperature' | 'dialogueTemperature';
  system: string;
  guard(data: Data, prompt: Prompt, local: Local): GuardResult;
}
