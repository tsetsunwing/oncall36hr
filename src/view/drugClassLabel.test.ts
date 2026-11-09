import { describe, expect, it } from 'vitest';
import { getContent } from '@/content';
import { DRUG_CLASS_LABELS, shortClassLabel } from './drugClassLabel';

describe('治療藥類別短字', () => {
  it('每個出現的醫管局類別都有一個不重複的小寫英文單字', () => {
    const classes = new Set<string>();
    for (const row of getContent().tables['treatment-drugs']) {
      for (const name of row.classes) classes.add(name);
    }
    const labels = [...classes].map((name) => shortClassLabel(name));
    expect(labels.every((label) => /^[a-z]+$/.test(label))).toBe(true);
    expect(new Set(labels).size).toBe(classes.size);
    expect(Object.keys(DRUG_CLASS_LABELS).sort()).toEqual([...classes].sort());
    expect(shortClassLabel('ANTIPLATELET DRUGS')).toBe('antiplatelets');
    expect(shortClassLabel('DRUGS USED IN DIABETES')).toBe('antidiabetics');
    expect(shortClassLabel('ANALGESICS')).toBe('analgesics');
  });
});
