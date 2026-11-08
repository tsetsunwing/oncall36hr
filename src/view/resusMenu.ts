/** 搶救選單：左欄分類，右欄按鈕。標籤係玩家指定嘅英文，順序唔好改。 */
export const RESUS_MENU = [
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    items: [
      { id: 'qw.rhythm', label: 'Rhythm Check' },
      { id: 'qw.resus.pulse', label: 'Pulse Check' },
      { id: 'qw.resus.etco2', label: 'Capnography (EtCO2)' },
      { id: 'qw.resus.ecg', label: '12-Lead ECG' },
      { id: 'qw.resus.glucose', label: 'Blood Glucose' },
      { id: 'qw.resus.pocus', label: 'Point-of-Care Ultrasound (POCUS)' },
      { id: 'qw.resus.ct', label: 'Non-Contrast CT Scan' },
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    items: [
      { id: 'qw.cpr', label: 'High-Quality CPR' },
      { id: 'qw.resus.bvm', label: 'Bag-Valve-Mask (BVM) Ventilation' },
      { id: 'qw.intubation', label: 'Advanced Airway Insertion' },
      { id: 'qw.resus.ventilation', label: 'Continuous Ventilation' },
      { id: 'qw.resus.ivio', label: 'Establish IV / IO Access' },
      { id: 'qw.resus.ttm', label: 'Targeted Temperature Management' },
      { id: 'qw.decompression', label: 'Needle Decompression' },
      { id: 'qw.pericardial', label: 'Pericardiocentesis' },
      { id: 'qw.resus.cath', label: 'Activate Cath Lab' },
    ],
  },
  {
    id: 'drugs',
    label: 'Drugs',
    items: [
      { id: 'qw.adrenaline', label: 'Epinephrine' },
      { id: 'qw.amiodarone', label: 'Amiodarone' },
      { id: 'qw.resus.lidocaine', label: 'Lidocaine' },
      { id: 'qw.resus.magnesium', label: 'Magnesium Sulfate' },
      { id: 'qw.resus.atropine', label: 'Atropine' },
      { id: 'qw.resus.adenosine', label: 'Adenosine' },
      { id: 'qw.resus.dopamine', label: 'Dopamine' },
      { id: 'qw.resus.norepinephrine', label: 'Norepinephrine' },
      { id: 'qw.resus.procainamide', label: 'Procainamide' },
      { id: 'qw.resus.sotalol', label: 'Sotalol' },
      { id: 'qw.resus.aspirin', label: 'Aspirin' },
      { id: 'qw.resus.nitroglycerin', label: 'Nitroglycerin' },
      { id: 'qw.resus.morphine', label: 'Morphine' },
      { id: 'qw.resus.alteplase', label: 'Alteplase (tPA)' },
      { id: 'qw.resus.fluid', label: 'IV Fluid Bolus' },
      { id: 'qw.resus.bicarbonate', label: 'Sodium Bicarbonate' },
      { id: 'qw.resus.calciumchloride', label: 'Calcium Chloride' },
      { id: 'qw.resus.naloxone', label: 'Naloxone' },
    ],
  },
  {
    id: 'defibrillator',
    label: 'Biphasic Defibrillator',
    items: [
      { id: 'qw.defib200', label: 'Defibrillation (Shock)' },
      { id: 'qw.resus.cardioversion', label: 'Synchronized Cardioversion' },
      { id: 'qw.resus.pacing', label: 'Transcutaneous Pacing' },
    ],
  },
] as const;

export type ResusColumnId = (typeof RESUS_MENU)[number]['id'];
