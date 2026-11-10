/**
 * 開局可選嘅病房。專科跟電話外撥名單（consult-departments，kind 為 SPECIALTY）。
 * 急症室、麻醉科唔係住院病房；外科普通病房同專科外科分開。
 * 服務部門（放射、病理、微生物、藥房、化驗）同 ICU 亦唔係呢度嘅病房。
 */
import { getContent } from '@/content';

const NOT_A_WARD = new Set(['AED', 'ANAESTHESIOLOGY', 'SURGERY']);

export interface WardSpecialty {
  id: string;
  label: string;
}

export function wardSpecialties(): readonly WardSpecialty[] {
  return getContent()
    .tables['consult-departments'].filter(
      (dept) => dept.kind === 'SPECIALTY' && !NOT_A_WARD.has(dept.id),
    )
    .map((dept) => ({ id: dept.id, label: dept.label }));
}

export function isWardSpecialty(id: string): boolean {
  return wardSpecialties().some((dept) => dept.id === id);
}
