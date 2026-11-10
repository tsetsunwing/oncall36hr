/**
 * 外科引流存在病人身上，是一列玩家填寫的位置，不是單一 flag。
 * 沒有位置就不記錄。效果表不寫生命表徵數字。
 */
import type { Patient } from '../case/patient';
import type { Order } from './orderTypes';

export const DRAIN_CATALOG_ID = 'proc.drain';
export const DRAIN_SITE_MAX = 48;

export function normalizeDrainSite(raw: string): string | null {
  const site = raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (site.length === 0 || site.length > DRAIN_SITE_MAX) return null;
  return site;
}

/** 完成引流醫囑後把位置加進病人。同一張醫囑只加一次。 */
export function attachDrain(patient: Patient, order: Order): Patient {
  if (order.catalogId !== DRAIN_CATALOG_ID) return patient;
  const site = order.params.site ? normalizeDrainSite(order.params.site) : null;
  if (!site) return patient;
  if (patient.visible.drains.some((item) => item.id === order.id)) return patient;
  return {
    ...patient,
    visible: {
      ...patient.visible,
      drains: [...patient.visible.drains, { id: order.id, site }],
    },
  };
}
