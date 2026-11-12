import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MonitorPanel } from './MonitorPanel';
import { NeuroStrip } from './NeuroStrip';
import { monitor, patient } from './fixtures';

describe('神經與疼痛', () => {
  it('顯示疼痛分數、GCS 總分同分項、左右瞳孔', () => {
    render(<NeuroStrip patient={patient} />);
    expect(screen.getByTestId('neuro-pain').textContent).toContain('6/10');
    expect(screen.getByTestId('neuro-gcs').textContent).toContain('15');
    expect(screen.getByTestId('neuro-gcs').textContent).toContain('E4 V5 M6');
    expect(screen.getByTestId('neuro-pupils').textContent).toContain('3mm');
    expect(screen.getByTestId('pupil-左').textContent).toContain('靈敏');
    expect(screen.getByTestId('pupil-右').textContent).toContain('靈敏');
  });

  it('未問過病人時疼痛顯示「未評估」，不是 0', () => {
    render(<NeuroStrip patient={{ ...patient, pain: null }} />);
    expect(screen.getByTestId('neuro-pain').textContent).toContain('未評估');
  });

  it('煩躁同噁心未評估時顯示未評估，按鈕各自呼叫', async () => {
    const onAssessAgitation = vi.fn();
    const onAssessNausea = vi.fn();
    render(
      <NeuroStrip
        patient={{ ...patient, agitation: null, nausea: null }}
        onAssessAgitation={onAssessAgitation}
        onAssessNausea={onAssessNausea}
      />,
    );
    expect(screen.getByTestId('neuro-agitation').textContent).toContain('未評估');
    expect(screen.getByTestId('neuro-nausea').textContent).toContain('未評估');
    await userEvent.click(screen.getByTestId('assess-agitation'));
    await userEvent.click(screen.getByTestId('assess-nausea'));
    expect(onAssessAgitation).toHaveBeenCalledTimes(1);
    expect(onAssessNausea).toHaveBeenCalledTimes(1);
  });

  it('評估後顯示煩躁同噁心分數', () => {
    render(<NeuroStrip patient={{ ...patient, agitation: 2, nausea: 1 }} />);
    expect(screen.getByTestId('neuro-agitation').textContent).toContain('2');
    expect(screen.getByTestId('neuro-nausea').textContent).toContain('1');
  });

  it('瞳孔反應固定時標紅（定性警示），數字仍然照顯示', () => {
    render(
      <NeuroStrip
        patient={{
          ...patient,
          neuro: {
            ...patient.neuro,
            pupils: {
              left: { sizeMm: 5, reaction: 'FIXED' },
              right: { sizeMm: 2, reaction: 'BRISK' },
            },
          },
        }}
      />,
    );
    const left = screen.getByTestId('pupil-左').querySelector('.neuro-pupil-reaction');
    expect(left?.getAttribute('data-reaction')).toBe('FIXED');
    expect(left?.textContent).toBe('固定');
  });

  it('GCS 同疼痛唔會出現喺心臟監察儀', () => {
    render(<MonitorPanel patient={patient} monitor={monitor()} />);
    expect(screen.queryByTestId('neuro-strip')).toBeNull();
    expect(screen.queryByTestId('neuro-gcs')).toBeNull();
    expect(screen.queryByTestId('neuro-pain')).toBeNull();
  });

  it('按「評估 GCS」會叫 engine 評估，唔會自己改數字', async () => {
    const onAssessGcs = vi.fn();
    render(<NeuroStrip patient={patient} onAssessGcs={onAssessGcs} />);
    await userEvent.click(screen.getByTestId('assess-gcs'));
    expect(onAssessGcs).toHaveBeenCalledTimes(1);
  });

  it('冇提供 handler 時唔顯示「評估 GCS」按鈕', () => {
    render(<NeuroStrip patient={patient} />);
    expect(screen.queryByTestId('assess-gcs')).toBeNull();
  });
});
