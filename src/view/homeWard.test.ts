import { describe, expect, it } from 'vitest';
import { isWardSpecialty, wardSpecialties } from './homeWard';

describe('可選病房專科', () => {
  it('跟電話名單上的臨床專科，不包括服務部門同普通外科', () => {
    const ids = wardSpecialties().map((dept) => dept.id);
    expect(ids).toContain('CARDIOLOGY');
    expect(ids).toContain('COLORECTAL_SURGERY');
    expect(ids).toContain('ORTHOPAEDICS');
    expect(ids).toContain('OBSTETRICS_GYNAECOLOGY');
    expect(ids).not.toContain('SURGERY');
    expect(ids).not.toContain('AED');
    expect(ids).not.toContain('ANAESTHESIOLOGY');
    expect(ids).not.toContain('ICU');
    expect(ids).not.toContain('PHARMACY');
    expect(ids).not.toContain('RADIOLOGY');
    expect(ids).not.toContain('LAB');
    expect(isWardSpecialty('NEPHROLOGY')).toBe(true);
    expect(isWardSpecialty('MEDICINE')).toBe(false);
    expect(isWardSpecialty('PHARMACY')).toBe(false);
  });
});
