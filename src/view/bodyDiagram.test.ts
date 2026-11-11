import { NORMAL_PUPILS } from '@/engine/case/patient';
import { describe, expect, it } from 'vitest';
import { getConfig, getContent } from '@/content';
import type { GameState, Patient } from '@/engine';
import { drainAnchor, selectBodyDiagram } from './bodyDiagram';
import { selectMonitor } from './gameView';
import type { ViewEnv } from './viewEnv';

const tables = getContent().tables;
const env: ViewEnv = { tables, config: getConfig() };

function patientWith(flags: string[], drains: Patient['visible']['drains'] = []): Patient {
  return {
    id: 'p1',
    bed: 7,
    demographics: { name: '陳大文', age: 68, sex: 'M', code: 'FULL' },
    presentingComplaint: '氣促',
    allergies: [],
    hidden: {
      caseTemplateId: 'x',
      diagnosisIds: ['x'],
      fsm: { state: 'DETERIORATING', enteredAt: 0, rolled: [], flags },
      base: { hr: 80, sbp: 120, dbp: 70, spo2: 98, rr: 16, temp: 37 },
      lastSampleAt: 0,
      alertedBand: null,
      lastAlertAt: null,
      activeEffects: [],
      labModifiers: [],
    },
    visible: {
      vitals: { t: 0, hr: 80, sbp: 120, dbp: 70, spo2: 98, rr: 16, temp: 37 },
      cuff: { sbp: 120, dbp: 70 },
      vitalsHistory: [],
      reports: [],
      labs: {},
      rhythm: 'SINUS',
      consciousness: 'A',
      pain: null,
      neuro: { gcs: { e: 4, v: 5, m: 6 }, pupils: NORMAL_PUPILS },
      mews: { score: 0, band: 'LOW', components: {} },
      drains,
    },
  };
}

const order = (
  id: string,
  catalogId: string,
  status: 'RUNNING' | 'DONE',
  extra: Partial<GameState['orders'][string]['params']> = {},
): GameState['orders'][string] => ({
  id,
  patientId: 'p1',
  catalogId,
  createdAt: Number(id.replace(/\D/g, '')) || 0,
  startsAt: 0,
  completesAt: Number(id.replace(/\D/g, '')) || 0,
  status,
  source: 'QUICKWORD',
  params: { drugFormularyId: null, dose: null, route: null, ...extra },
  executor: null,
  executorKind: 'NURSE',
  cancelledAt: null,
  resultStatus: null,
  sampledState: null,
  gate: null,
});

describe('身體圖只顯示在位裝置', () => {
  it('引流位置按玩家所寫放在示意位置，沒有左右就留在中線', () => {
    expect(drainAnchor('left chest').x).toBeGreaterThan(50);
    expect(drainAnchor('left chest').y).toBe(drainAnchor('chest').y);
    expect(drainAnchor('right abdomen').x).toBeLessThan(50);
    expect(drainAnchor('chest')).toEqual({ x: 50, y: 36 });
    expect(drainAnchor('abdomen').x).toBe(50);
    expect(drainAnchor('somewhere')).toEqual({ x: 50, y: 46 });
  });

  it('沒有裝置就沒有標記；插管、動脈導管、CVC 沿用監察儀規則', () => {
    const bare = selectBodyDiagram(patientWith([]), {}, tables);
    expect(bare.markers).toEqual([]);
    expect(bare.ioOrder).toBeNull();
    const lined = patientWith(['airway.secured', 'aline.in', 'cvc.in', 'foley.in']);
    const body = selectBodyDiagram(lined, {}, tables);
    expect(body.markers.map((item) => item.label)).toEqual(['CVC', 'Arterial line', 'Foley']);
    expect(body.markers.some((item) => item.kind === 'oxygen' || item.kind === 'iv')).toBe(false);
    expect(body.ioOrder?.catalogId).toBe('monitor.io');
    const monitor = selectMonitor(lined, env, () => '21:00');
    expect(monitor.lines).toEqual({ abp: true, cvp: true, etco2: true });
    expect(selectMonitor(patientWith([]), env, () => '21:00').lines).toEqual({
      abp: false,
      cvp: false,
      etco2: false,
    });
  });

  it('氧氣用短名，點滴要有靜脈途徑，多條引流各自保留位置', () => {
    const orders = {
      o1: order('o1', 'oxygen.nasal', 'DONE'),
      o2: order('o2', 'oxygen.hfnc', 'DONE'),
      o3: order('o3', 'drug.paracetamol', 'DONE', { route: 'PO' }),
      o4: order('o4', 'fluid.ns500', 'RUNNING'),
    };
    const body = selectBodyDiagram(
      patientWith(
        ['oxygen.on'],
        [
          { id: 'd1', site: 'left chest' },
          { id: 'd2', site: 'right abdomen' },
        ],
      ),
      orders,
      tables,
    );
    expect(body.markers.find((item) => item.kind === 'oxygen')?.label).toBe('HFNC');
    expect(body.markers.find((item) => item.kind === 'iv')?.label).toBe('IV');
    expect(body.markers.filter((item) => item.kind === 'drain').map((item) => item.label)).toEqual([
      'left chest',
      'right abdomen',
    ]);
    const sameSide = selectBodyDiagram(
      patientWith(
        [],
        [
          { id: 'd1', site: 'left chest' },
          { id: 'd2', site: 'left chest' },
        ],
      ),
      {},
      tables,
    );
    const drains = sameSide.markers.filter((item) => item.kind === 'drain');
    expect(drains[0]?.x).not.toBe(drains[1]?.x);
  });
});
