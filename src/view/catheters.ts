/** 導管按鈕只打開這四張現有醫囑。外科引流另要玩家填寫位置。 */
export const CATHETER_ORDERS = [
  { id: 'qw.ngtube', catalogId: 'proc.ngtube', label: 'NG tube' },
  { id: 'qw.foley', catalogId: 'proc.foley', label: 'Foley' },
  { id: 'qw.cvc', catalogId: 'proc.cvc', label: 'CVC' },
  { id: 'qw.aline', catalogId: 'proc.aline', label: 'Arterial line' },
] as const;

export const SURGICAL_DRAIN = {
  id: 'qw.drain',
  catalogId: 'proc.drain',
  label: 'Surgical drain',
} as const;
