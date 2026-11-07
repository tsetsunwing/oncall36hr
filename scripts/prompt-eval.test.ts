import { describe, expect, it } from 'vitest';
import { runPromptEval } from './prompt-eval';

describe('prompt 評估（T-J）', () => {
  it('固定 case：粵語對白、無裸數字、無診斷洩露；order.parse 全部命中', () => {
    const report = runPromptEval();
    const failed = report.cases
      .filter((item) => !item.ok)
      .map((item) => `${item.id}: ${item.detail}`);
    expect(failed).toEqual([]);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.orderParse).toBe('10/10');
    expect(report.model).toBe('local-contract-fixture');
  });

  it('回顧理由入面嘅診斷詞仍然只會被丟棄、唔會令契約 guard 拒絕', () => {
    const report = runPromptEval();
    expect(report.gaps.map((gap) => gap.id)).toEqual(['gate-rationale-diagnosis']);
  });
});
