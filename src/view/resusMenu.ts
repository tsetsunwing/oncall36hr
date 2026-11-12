/** 搶救選單：左欄分類，右欄按鈕。標籤保留原有英文並加中文，順序唔好改。 */
export const RESUS_MENU = [
  {
    id: 'diagnostics',
    label: '檢查 Diagnostics',
    items: [
      { id: 'qw.rhythm', label: '節律檢查 Rhythm Check' },
      { id: 'qw.resus.pulse', label: '脈搏檢查 Pulse Check' },
      { id: 'qw.resus.etco2', label: '呼氣末二氧化碳 Capnography (EtCO2)' },
      { id: 'qw.resus.ecg', label: '十二導聯心電圖 12-Lead ECG' },
      { id: 'qw.resus.glucose', label: '血糖 Blood Glucose' },
      { id: 'qw.resus.pocus', label: '床邊超聲波 Point-of-Care Ultrasound (POCUS)' },
      { id: 'qw.resus.ct', label: '無對比劑電腦掃描 Non-Contrast CT Scan' },
    ],
  },
  {
    id: 'actions',
    label: '處置 Actions',
    items: [
      { id: 'qw.cpr', label: '高質素心肺復甦 High-Quality CPR' },
      { id: 'qw.resus.bvm', label: '球囊面罩通氣 Bag-Valve-Mask (BVM) Ventilation' },
      { id: 'qw.intubation', label: '建立進階氣道 Advanced Airway Insertion' },
      { id: 'qw.resus.ventilation', label: '持續通氣 Continuous Ventilation' },
      { id: 'qw.resus.ivio', label: '建立靜脈／骨內通道 Establish IV / IO Access' },
      { id: 'qw.resus.ttm', label: '目標體溫管理 Targeted Temperature Management' },
      { id: 'qw.decompression', label: '針刺減壓 Needle Decompression' },
      { id: 'qw.pericardial', label: '心包穿刺 Pericardiocentesis' },
      { id: 'qw.resus.cath', label: '啟動導管室 Activate Cath Lab' },
    ],
  },
  {
    id: 'drugs',
    label: '藥物 Drugs',
    items: [
      { id: 'qw.adrenaline', label: 'Adrenaline' },
      { id: 'qw.amiodarone', label: 'Amiodarone' },
      { id: 'qw.resus.lidocaine', label: 'Lignocaine' },
      { id: 'qw.resus.magnesium', label: 'Magnesium sulphate' },
      { id: 'qw.resus.atropine', label: 'Atropine' },
      { id: 'qw.resus.adenosine', label: 'Adenosine' },
      { id: 'qw.resus.dopamine', label: 'Dopamine' },
      { id: 'qw.resus.norepinephrine', label: 'Noradrenaline' },
      { id: 'qw.resus.procainamide', label: 'Procainamide' },
      { id: 'qw.resus.sotalol', label: 'Sotalol' },
      { id: 'qw.resus.aspirin', label: 'Aspirin' },
      { id: 'qw.resus.nitroglycerin', label: 'Glyceryl trinitrate' },
      { id: 'qw.resus.morphine', label: 'Morphine' },
      { id: 'qw.resus.alteplase', label: 'Alteplase (tPA)' },
      { id: 'qw.resus.bicarbonate', label: 'Sodium Bicarbonate' },
      { id: 'qw.resus.calciumchloride', label: 'Calcium Chloride' },
      { id: 'qw.resus.naloxone', label: 'Naloxone' },
    ],
  },
  {
    id: 'defibrillator',
    label: '雙相除顫器 Biphasic Defibrillator',
    items: [
      { id: 'qw.defib200', label: '電擊 Defibrillation (Shock)' },
      { id: 'qw.resus.cardioversion', label: '同步電復律 Synchronized Cardioversion' },
      { id: 'qw.resus.pacing', label: '經皮起搏 Transcutaneous Pacing' },
    ],
  },
] as const;

export type ResusColumnId = (typeof RESUS_MENU)[number]['id'];

/** 搶救面板按 ACLS 分類現有快捷，不新增途徑。 */
export const RESUS_ACLS_GROUPS = [
  { id: 'airway', chipIds: ['qw.intubation'] },
  { id: 'breathing', chipIds: ['qw.resus.bvm', 'qw.resus.ventilation'] },
  {
    id: 'circulation',
    chipIds: ['qw.cpr', 'qw.rhythm', 'qw.stopcpr', 'qw.resus.ivio', 'qw.pocus'],
  },
  { id: 'drugs', chipIds: ['qw.adrenaline', 'qw.amiodarone'] },
  { id: 'defibrillation', chipIds: ['qw.defib200'] },
] as const;

export type ResusAclsGroupId = (typeof RESUS_ACLS_GROUPS)[number]['id'];
