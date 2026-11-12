/**
 * 床邊身體圖：只標出這位病人身上已有的裝置。
 * 座標是正面示意。玩家的「左」放在圖的右側，即面對病人時的病人左側。
 * 引流沒有寫左或右時，留在中線，不代填左右。
 */
import type { EngineTables, GameState, Patient } from '@/engine';
import { buildObserveOrder } from './observeOrder';
import type { BodyDiagramView, BodyMarkerView } from './types';

const OXYGEN_MARK: Record<string, string> = {
  'oxygen.nasal': 'NC',
  'oxygen.simple': 'SFM',
  'oxygen.venturi': 'VM',
  'oxygen.nrb': 'NRBM',
  'oxygen.hfnc': 'HFNC',
  'oxygen.niv': 'NIV',
  'oxygen.bvm': 'BVM',
  'oxygen.invasive': 'IMV',
};

const SPOT = {
  oxygen: { x: 47, y: 5 },
  ng: { x: 68, y: 14 },
  cvc: { x: 47, y: 18 },
  chestTube: { x: 31, y: 30 },
  iv: { x: 17, y: 41 },
  io: { x: 38, y: 72 },
  arterial: { x: 77, y: 44 },
  foley: { x: 47, y: 52 },
} as const;

const REGIONS: { test: RegExp; y: number }[] = [
  { test: /groin|inguinal|腹股溝|pelvis|pelvic/, y: 52 },
  { test: /neck|頸|jugular/, y: 18 },
  { test: /shoulder|肩/, y: 25 },
  { test: /chest|thorax|thoracic|胸/, y: 30 },
  { test: /flank|loin|腰/, y: 37 },
  { test: /forearm|arm|臂/, y: 41 },
  { test: /abdomen|abdominal|belly|腹/, y: 44 },
  { test: /thigh|femoral|大腿|腿/, y: 68 },
];

export function drainAnchor(site: string): { x: number; y: number } {
  const text = site.normalize('NFKC').toLowerCase();
  const left = /\bleft\b/.test(text) || text.includes('左');
  const right = /\bright\b/.test(text) || text.includes('右');
  const x = left === right ? 47 : left ? 62 : 31;
  const region = REGIONS.find((item) => item.test.test(text));
  return { x, y: region?.y ?? 40 };
}

function hasFlag(patient: Patient, flag: string): boolean {
  return patient.hidden.fsm.flags.includes(flag);
}

function routeIsIntravenous(route: string | null): boolean {
  if (!route) return false;
  const text = route.trim().toLowerCase();
  return (
    text === 'iv' ||
    text.startsWith('iv ') ||
    text.startsWith('iv(') ||
    text.startsWith('intravenous')
  );
}

function oxygenLabel(patient: Patient, orders: GameState['orders']): string | null {
  if (!hasFlag(patient, 'oxygen.on')) return null;
  const done = Object.values(orders)
    .filter(
      (order) =>
        order.patientId === patient.id &&
        order.status === 'DONE' &&
        OXYGEN_MARK[order.catalogId] !== undefined,
    )
    .sort((a, b) => b.completesAt - a.completesAt || b.createdAt - a.createdAt);
  const latest = done[0];
  return latest ? (OXYGEN_MARK[latest.catalogId] ?? 'O2') : 'O2';
}

function hasIo(patient: Patient): boolean {
  return hasFlag(patient, 'ivio.in');
}

function hasIv(patient: Patient, orders: GameState['orders'], tables: EngineTables): boolean {
  if (hasFlag(patient, 'piv.in')) return true;
  if (hasIo(patient)) return false;
  if (hasFlag(patient, 'fluid.bolus')) return true;
  return Object.values(orders).some((order) => {
    if (order.patientId !== patient.id) return false;
    if (order.status !== 'RUNNING' && order.status !== 'DONE') return false;
    if (routeIsIntravenous(order.params.route)) return true;
    const row = tables['order-catalog'].find((item) => item.id === order.catalogId);
    return row?.type === 'FLUID';
  });
}

function intakeOrder(tables: EngineTables): BodyDiagramView['ioOrder'] {
  const built = buildObserveOrder('io', 'monitor', 'continuous');
  if (built.local) return null;
  if (!tables['order-catalog'].some((row) => row.id === built.catalogId)) return null;
  return { catalogId: built.catalogId, text: built.text, params: built.params };
}

function marker(
  id: string,
  kind: BodyMarkerView['kind'],
  label: string,
  point: { x: number; y: number },
): BodyMarkerView {
  return { id, kind, label, x: point.x, y: point.y };
}

export function selectBodyDiagram(
  patient: Patient,
  orders: GameState['orders'],
  tables: EngineTables,
): BodyDiagramView {
  const markers: BodyMarkerView[] = [];
  const oxygen = oxygenLabel(patient, orders);
  if (oxygen) markers.push(marker('oxygen', 'oxygen', oxygen, SPOT.oxygen));
  if (hasFlag(patient, 'ngt.in')) markers.push(marker('ng', 'ng', 'NG', SPOT.ng));
  if (hasFlag(patient, 'cvc.in')) markers.push(marker('cvc', 'cvc', 'CVC', SPOT.cvc));
  if (hasFlag(patient, 'chesttube.in')) {
    markers.push(marker('chest-tube', 'chestTube', 'Chest tube', SPOT.chestTube));
  }
  if (hasIv(patient, orders, tables)) markers.push(marker('iv', 'iv', 'IV', SPOT.iv));
  if (hasIo(patient)) markers.push(marker('io', 'io', 'IO', SPOT.io));
  const runningInfusions = Object.values(orders).filter((order) => {
    if (order.patientId !== patient.id || order.status !== 'RUNNING') return false;
    const row = tables['order-catalog'].find((item) => item.id === order.catalogId);
    return (
      row?.type === 'FLUID' ||
      order.catalogId.startsWith('blood.') ||
      (order.params.route ?? '').toLowerCase().startsWith('iv infusion')
    );
  });
  for (const [index, order] of runningInfusions.entries()) {
    const row = tables['order-catalog'].find((item) => item.id === order.catalogId);
    const label = order.params.drugName ?? row?.label ?? order.catalogId;
    markers.push(marker(`infusion-${order.id}`, 'infusion', label, { x: 14, y: 16 + index * 7 }));
  }
  if (hasFlag(patient, 'aline.in')) {
    markers.push(marker('arterial', 'arterial', 'Arterial line', SPOT.arterial));
  }
  const counts = new Map<string, number>();
  for (const drain of patient.visible.drains) {
    const anchor = drainAnchor(drain.site);
    const key = `${String(anchor.x)}:${String(anchor.y)}`;
    const index = counts.get(key) ?? 0;
    counts.set(key, index + 1);
    const point =
      index === 0
        ? anchor
        : {
            x: Math.min(86, anchor.x + (index % 3) * 7),
            y: Math.min(90, anchor.y + Math.floor(index / 3) * 6),
          };
    markers.push(marker(`drain-${drain.id}`, 'drain', drain.site, point));
  }
  const foley = hasFlag(patient, 'foley.in');
  if (foley) markers.push(marker('foley', 'foley', 'Foley', SPOT.foley));
  return { markers, ioOrder: foley ? intakeOrder(tables) : null };
}
