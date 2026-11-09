import { describe, expect, it } from 'vitest';
import {
  buildObserveOrder,
  LOCAL_OBSERVATION_CATALOG_ID,
  OBSERVE_PARAMETERS,
} from './observeOrder';

describe('觀察面板對應現有醫囑', () => {
  it('全套生命表徵檢查一次仍是 obs.vitals，每 15 分鐘仍是現有監察', () => {
    expect(OBSERVE_PARAMETERS.map((item) => item.id)).toEqual([
      'vitals',
      'bp',
      'pulse',
      'rr',
      'temp',
      'spo2',
      'io',
      'gcs',
      'pupils',
      'pain',
    ]);
    const once = buildObserveOrder('vitals', 'once', 'q15min');
    expect(once).toMatchObject({ catalogId: 'obs.vitals', text: '檢查全套生命表徵', local: false });
    const watched = buildObserveOrder('vitals', 'monitor', 'q15min');
    expect(watched.catalogId).toBe('monitor.vitals.q15');
    expect(watched.text).toBe('全套生命表徵 每 15 分鐘');
    expect(watched.text).not.toContain('q15min');
    expect(buildObserveOrder('pulse', 'once', 'q15min').catalogId).toBe('obs.pulse');
    expect(buildObserveOrder('spo2', 'monitor', 'continuous')).toMatchObject({
      catalogId: 'monitor.spo2',
      text: 'SpO2 持續',
    });
    expect(buildObserveOrder('io', 'monitor', 'continuous').catalogId).toBe('monitor.io');
  });

  it('引擎沒有的間距寫在標籤，並用本地醫囑，不產生結果數字欄位', () => {
    const order = buildObserveOrder('bp', 'monitor', 'q15min');
    expect(order.local).toBe(true);
    expect(order.catalogId).toBe(LOCAL_OBSERVATION_CATALOG_ID);
    expect(order.text).toBe('血壓 每 15 分鐘');
    expect(order.params).toEqual({
      drugFormularyId: null,
      dose: null,
      route: null,
      summary: '血壓 每 15 分鐘',
    });
    expect(buildObserveOrder('gcs', 'once', 'continuous')).toMatchObject({
      catalogId: LOCAL_OBSERVATION_CATALOG_ID,
      text: '檢查GCS',
      local: true,
    });
    expect(buildObserveOrder('io', 'monitor', 'q15min').catalogId).toBe(
      LOCAL_OBSERVATION_CATALOG_ID,
    );
    expect(buildObserveOrder('spo2', 'once', 'continuous').text).toBe('檢查SpO2');
  });
});
