import { dialogue, dialogueTemplate, type DialogueId } from './dialogue.zh-Hant';
import { ui, type UiStrings } from './zh-Hant';

export { ui, type UiStrings };
export { dialogue, dialogueTemplate, type DialogueId };

/** 床邊提示：失禁用粵語對白，其餘用書面語 notice。 */
export function noticeCopy(kind: string): string {
  if (kind === 'BLADDER_ACCIDENT') return dialogue['shift.bladderAccident'];
  return ui.game.notice[kind] ?? ui.game.notice.fallback ?? kind;
}
