import { describe, expect, it } from 'vitest';
import { give, start, wait } from '../acls/kit';
import { params, realEngine, realTables } from '../test/realEngine';
import { evaluateFsm } from './fsm';
import { pickByDiagnosisAndState } from './labs';

describe('ACS 劇本（遊戲倒數佔位，非臨床風險）', () => {
  it('未介入於 120 秒後 VF；完成 aspirin 後延遲但不保證避免', () => {
    const plain = wait(start('acs-plain', 'acs-vf-01'), 180);
    expect(plain.state.resus?.rhythm).toBe('VENTRICULAR_FIBRILLATION');
    let treated = give(start('acs-treatment', 'acs-vf-01'), 'aspirin 300 mg po', 60);
    expect(treated.state.patients.p1?.hidden.fsm.flags).toContain('acs.antiplatelet');
    treated = wait(treated, 180);
    expect(treated.state.resus).toBeNull();
    treated = wait(treated, 600);
    expect(treated.state.resus?.rhythm).toBe('VENTRICULAR_FIBRILLATION');
  });

  it('一般內科病房可抽到 VF 劇本及 DNR 病例', () => {
    const engine = realEngine();
    const seen = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const state = engine.init({ ...params(`ward-cases-${String(i)}`), ward: true });
      for (const p of Object.values(state.patients)) seen.add(p.hidden.caseTemplateId);
    }
    expect(seen.has('acs-vf-ward-01')).toBe(true);
    expect(seen.has('hf-dnr-01')).toBe(true);
  });

  it('一般病房版的抽樣只擲一次，未 VF 仍有胸痛', () => {
    const session = start('acs-ward-mechanics', 'acs-vf-ward-01');
    const patient = session.state.patients.p1;
    const fsm = realTables()['case-fsm'].find((f) => f.id === 'acs-vf-ward-01');
    if (!patient || !fsm) throw new Error('missing ward ACS');
    const treated = {
      ...patient,
      hidden: {
        ...patient.hidden,
        fsm: { ...patient.hidden.fsm, flags: [...patient.hidden.fsm.flags, 'acs.antiplatelet'] },
      },
    };
    expect(evaluateFsm(treated, fsm, 1800, session.state.rng).patient.hidden.fsm.state).toBe(
      'CHEST_PAIN',
    );
    const result = evaluateFsm(treated, fsm, 3600, session.state.rng);
    expect(['ARREST_VF', 'CHEST_PAIN_NO_VF']).toContain(result.patient.hidden.fsm.state);
    const held = evaluateFsm(result.patient, fsm, 7200, result.rng);
    expect(held.patient.hidden.fsm.state).toBe(result.patient.hidden.fsm.state);
  });

  it('胸痛階段此個案有異常 ECG 與 troponin 基線', () => {
    const ecg = realTables().results.find((r) => r.id === 'res.ecg');
    if (!ecg) throw new Error('missing ECG');
    const result = pickByDiagnosisAndState(
      ecg.textByDiagnosis,
      ['acs'],
      ecg.textByState,
      'CHEST_PAIN',
    );
    expect(result?.abnormal).toBe(true);
    expect(result?.text).toContain('ST-segment elevation');
    const patient = start('acs-results', 'acs-vf-01').state.patients.p1;
    expect(patient?.visible.labs.tni?.value).toBeGreaterThan(14);
  });
});
