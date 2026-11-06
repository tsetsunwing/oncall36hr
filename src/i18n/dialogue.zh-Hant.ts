/**
 * 角色對白（粵語）。與介面字串分檔，方便審稿。
 * 數值、order、狀態一律以 {{token}} 表示，由 engine 在發言當刻解析（B3）。
 */
export const dialogue = {
  'nurse.greeting': '陳生，今晚我哋病房有{{ward.activePatients}}位病人，有事隨時搵我。',
  'nurse.reportSpo2': '陳生，{{vital.spo2}}% 呀，要唔要開個 stat ECG？',
} as const;

export type DialogueId = keyof typeof dialogue;

export function dialogueTemplate(id: DialogueId): string {
  return dialogue[id];
}
