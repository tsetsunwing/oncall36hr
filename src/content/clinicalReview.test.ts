import { describe, expect, it } from 'vitest';
import { getContent } from '@/content';
import {
  CLINICAL_TABLES_WITHOUT_FIELD,
  clinicalPlaceholders,
} from '../../scripts/clinical-placeholders';

describe('臨床審核佔位（M9、T-K）', () => {
  it('所有已標 reviewStatus 嘅列仍然係 PENDING_CLINICAL_REVIEW，冇簽核', () => {
    const report = clinicalPlaceholders();
    expect(report.other).toEqual([]);
    expect(report.pending.length).toBeGreaterThan(0);
    expect(report.pending.every((row) => row.reviewStatus === 'PENDING_CLINICAL_REVIEW')).toBe(
      true,
    );
  });

  it('T1、T2、T3、T8 冇簽核欄，亦冇被標成已審', () => {
    const report = clinicalPlaceholders();
    for (const table of CLINICAL_TABLES_WITHOUT_FIELD) {
      expect(report.noField).toContain(table);
      const listed = report.clinicalWithoutField.find((item) => item.table === table);
      expect(listed?.ids.length).toBeGreaterThan(0);
    }
  });

  it('藥物典型劑量仍然係 null（唔臆測劑量）', () => {
    for (const row of getContent().tables.formulary) {
      expect(row.typicalDose, row.id).toBeNull();
      expect(row.reviewStatus, row.id).toBe('PENDING_CLINICAL_REVIEW');
    }
  });
});
