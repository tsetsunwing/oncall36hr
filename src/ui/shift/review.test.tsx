import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ui } from '@/i18n';
import { collectStrings } from '../testStrings';
import { ResultPage } from './ResultPage';
import { ReviewPage } from './ReviewPage';
import { resultFixture } from './resultFixtures';
import { whatIfLine } from './reviewText';
import { reviewFixture } from './resultFixtures';
import type { ShiftView } from '@/view';

const shiftStub = { shiftMode: 'NIGHT', playerRank: 'MO', difficulty: 'MEDIUM' } as ShiftView;

describe('ResultPage 結果頁（mockup）', () => {
  it('顯示 AI 評語、回顧預覽、免責聲明同三個按鈕', async () => {
    const onReview = vi.fn();
    render(
      <ResultPage
        shift={shiftStub}
        result={resultFixture()}
        onBack={vi.fn()}
        onReview={onReview}
      />,
    );
    expect(screen.getByTestId('result-safety')).toHaveTextContent('病人有青黴素過敏紀錄');
    const preview = screen.getByTestId('result-preview');
    expect(within(preview).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByTestId('result-disclaimer')).toHaveTextContent(ui.shift.result.disclaimer);
    expect(screen.getByTestId('result-save')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('result-review'));
    expect(onReview).toHaveBeenCalledOnce();
  });

  it('AI 理由未通過檢查時改用引擎事實句', () => {
    const base = resultFixture();
    const review = reviewFixture({
      safety: [{ ...reviewFixture().safety[0]!, aiReason: null }],
    });
    render(
      <ResultPage
        shift={shiftStub}
        result={{ ...base, review }}
        onBack={vi.fn()}
        onReview={vi.fn()}
      />,
    );
    expect(screen.getByTestId('result-safety')).toHaveTextContent('Amoxicillin 500 mg PO');
    expect(screen.getByTestId('result-safety')).toHaveTextContent(
      ui.game.gate.category.ALLERGY ?? '',
    );
  });

  it('沒有延誤項目時，預覽顯示說明', () => {
    const base = resultFixture();
    render(
      <ResultPage
        shift={shiftStub}
        result={{ ...base, review: reviewFixture({ whatIf: [], safety: [] }) }}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByTestId('result-preview')).toHaveTextContent(ui.shift.result.noWhatIf);
    expect(screen.getByTestId('result-safety')).toHaveTextContent(ui.shift.result.noSafetyComment);
  });
});

describe('ReviewPage 回顧頁', () => {
  it('列出表格、時間線、如果早做 X、指引對照、安全理由、死亡', () => {
    render(<ReviewPage result={resultFixture()} onBack={vi.fn()} onHome={vi.fn()} />);
    expect(screen.getByTestId('review-table-CLINICAL_OUTCOME')).toHaveTextContent('-10');
    expect(screen.getAllByTestId('review-entry')).toHaveLength(3);
    expect(screen.getAllByTestId('review-timeline-row')).toHaveLength(3);
    expect(screen.getByTestId('review-whatif').children).toHaveLength(3);
    expect(screen.getByTestId('review-guideline')).toHaveTextContent('待臨床審核');
    expect(screen.getByTestId('review-ai-reason')).toHaveTextContent('青黴素過敏');
    expect(screen.getByTestId('review-deaths')).toHaveTextContent(ui.shift.result.doneBestTag);
    expect(screen.getByTestId('review-disclaimer')).toHaveTextContent(ui.shift.review.disclaimer);
  });

  it('表格只列出各分項評級，沒有總分', () => {
    render(<ReviewPage result={resultFixture()} onBack={vi.fn()} onHome={vi.fn()} />);
    expect(screen.queryByText(/總分|倍數/u)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /總分/u })).toBeNull();
  });

  it('時間線可按類型篩選', async () => {
    render(<ReviewPage result={resultFixture()} onBack={vi.fn()} onHome={vi.fn()} />);
    expect(screen.getAllByTestId('review-timeline-row')).toHaveLength(3);
    await userEvent.click(screen.getByTestId('timeline-filter-SCORE'));
    expect(screen.getAllByTestId('review-timeline-row')).toHaveLength(1);
    expect(screen.getByTestId('timeline-filter-SCORE')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByTestId('timeline-filter-CALL'));
    expect(screen.getAllByTestId('review-timeline-row')).toHaveLength(1);
    await userEvent.click(screen.getByTestId('timeline-filter-ALL'));
    expect(screen.getAllByTestId('review-timeline-row')).toHaveLength(3);
  });

  it('返回按鈕', async () => {
    const onBack = vi.fn();
    const onHome = vi.fn();
    render(<ReviewPage result={resultFixture()} onBack={onBack} onHome={onHome} />);
    await userEvent.click(screen.getByTestId('review-back'));
    await userEvent.click(screen.getByTestId('review-home'));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onHome).toHaveBeenCalledOnce();
  });
});

describe('what-if 句子', () => {
  it('每條都帶時間同病人，並只用事實數字（分鐘／秒）', () => {
    const lines = reviewFixture().whatIf.map(whatIfLine);
    expect(lines[0]).toContain('02:31');
    expect(lines[0]).toContain('15 分鐘');
    expect(lines[0]).toContain('10 分鐘');
    expect(lines[1]).toContain('95 秒');
    expect(lines[2]).toContain('10 分鐘');
  });
});

describe('語氣審查（回顧同結果文字不羞辱玩家）', () => {
  const SHAMING =
    /愚蠢|蠢|笨|無能|失敗者|廢物|差勁|垃圾|不合格|不及格|活該|責任全在你|你害死|殺死|謀殺|疏忽致死|草菅/u;
  it('結果與回顧字串不含羞辱、責備字眼', () => {
    for (const text of [...collectStrings(ui.shift.result), ...collectStrings(ui.shift.review)]) {
      expect(text, text).not.toMatch(SHAMING);
    }
  });

  it('回顧文字以「可考慮／可再」等建議語氣表達，而不是命令或定罪', () => {
    const text = collectStrings(ui.shift.review.whatIf).join('\n');
    expect(text).toMatch(/可考慮|可先|可減少|有助|通常更穩妥|可讓/u);
    expect(text).not.toMatch(/你必須|你應該|你錯了|你失職/u);
  });

  it('死亡提示：不可挽回的個案有「已盡力」，並說明結局仍降級', () => {
    expect(ui.shift.review.deaths.doneBest).toMatch(/已盡力/u);
    expect(ui.shift.result.doneBestNote(7, '李大文')).toMatch(/已盡力/u);
    expect(ui.shift.result.doneBestNote(7, '李大文')).toMatch(/降級/u);
  });
});
