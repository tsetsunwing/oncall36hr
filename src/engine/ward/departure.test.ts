import { describe, expect, it } from 'vitest';
import { gameStateSchema } from '../core/state';
import { onlyDeath } from '../acls/kit';
import { completeDeathStep } from '../death/death';
import { feed, intentEvent, realEngine } from '../test/realEngine';
import { patientAtBed } from './movement';
import { isWardPatientActive } from './departure';

const engine = realEngine();
const wardEvent = (name: string, patientId: string) =>
  intentEvent({ type: 'EXTENSION', module: 'ward', name, payload: { patientId } });

function initial() {
  const state = engine.init({
    seed: 'depart',
    mode: 'NIGHT',
    difficulty: 'MEDIUM',
    playerRank: 'MO',
    ward: true,
  });
  const patient = Object.values(state.patients)[0];
  if (!patient) throw new Error('no patient');
  const atBed = feed(engine, state, [
    intentEvent({
      type: 'EXTENSION',
      module: 'ward',
      name: 'GO_TO_BED',
      payload: { bed: patient.bed },
    }),
  ]).state;
  return { state: atBed, patient };
}

describe('病人離開病房', () => {
  it('ICU 同意接收不會自動清床；按完成轉出才清床並保留歷史', () => {
    const { state, patient } = initial();
    const rejected = feed(engine, state, [wardEvent('TRANSFER_OUT', patient.id)]).state;
    expect(patientAtBed(rejected, patient.bed)).toBe(patient.id);
    const accepted = {
      ...state,
      patients: {
        ...state.patients,
        [patient.id]: {
          ...patient,
          hidden: {
            ...patient.hidden,
            fsm: { ...patient.hidden.fsm, flags: [...patient.hidden.fsm.flags, 'icu.accepted'] },
          },
        },
      },
    };
    expect(patientAtBed(accepted, patient.bed)).toBe(patient.id);
    const done = feed(engine, accepted, [wardEvent('TRANSFER_OUT', patient.id)]).state;
    expect(patientAtBed(done, patient.bed)).toBeNull();
    expect(done.patients[patient.id]).toBeDefined();
    expect(isWardPatientActive(done.patients[patient.id]!)).toBe(false);
    expect(done.ward.location.bed).toBeNull();
    expect(gameStateSchema.safeParse(done).success).toBe(true);
  });
  it('出院後保留歷史、床位釋放，不能再次進入舊病人床邊', () => {
    const { state, patient } = initial();
    const done = feed(engine, state, [wardEvent('DISCHARGE', patient.id)]).state;
    expect(patientAtBed(done, patient.bed)).toBeNull();
    expect(done.patients[patient.id]).toBeDefined();
    const reenter = feed(engine, done, [intentEvent({ type: 'ENTER_BED', patientId: patient.id })]);
    expect(reenter.state.ward.location.bed).toBeNull();
  });
  it('死亡四步未完成前保留床位，第四步完成後才清床', () => {
    const { state, patient } = initial();
    const withDeath = {
      ...state,
      death: {
        [patient.id]: {
          patientId: patient.id,
          diedAt: 0,
          status: 'PENDING_PROCESS' as const,
          steps: { CERTIFICATE: 0, NOTIFY_SENIOR: 0, PHONE_FAMILY: 0, RECORD: null },
          seniorRank: 'RES',
          delayCharges: 0,
          completedAt: null,
          summary: { cycles: 0, shocks: 0, drugs: 0 },
        },
      },
    };
    expect(patientAtBed(withDeath, patient.bed)).toBe(patient.id);
    const done = completeDeathStep(withDeath, patient.id, 'RECORD').state;
    expect(onlyDeath(done)?.status).toBe('COMPLETE');
    expect(patientAtBed(done, patient.bed)).toBeNull();
    expect(done.patients[patient.id]).toBeDefined();
  });
});
