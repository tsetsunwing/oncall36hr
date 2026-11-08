import { describe, expect, it } from 'vitest';
import { reportCategory } from './reportGroup';

describe('reportCategory', () => {
  it('現有結果落入化驗、影像或即場', () => {
    expect(reportCategory('res.cbc')).toEqual({ bucket: 'laboratory', section: 'haem' });
    expect(reportCategory('res.rft').section).toBe('biochem');
    expect(reportCategory('res.bloodculture').section).toBe('micro');
    expect(reportCategory('res.cxr')).toEqual({ bucket: 'radiology', section: 'xr' });
    expect(reportCategory('res.ct.thorax').section).toBe('ct');
    expect(reportCategory('res.mri').section).toBe('mri');
    expect(reportCategory('res.abg')).toEqual({ bucket: 'poct', section: 'istat' });
    expect(reportCategory('res.ecg').section).toBe('ecg');
    expect(reportCategory('res.glucose').section).toBe('glucose');
    expect(reportCategory('res.troponinT').section).toBe('tropT');
  });
});
