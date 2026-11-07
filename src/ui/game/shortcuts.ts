/** 快速鍵（implementation-plan §14）。輸入框內除 Esc 外不觸發。 */

export type ShortcutCommand =
  | 'tab-chat'
  | 'tab-phone'
  | 'tab-family'
  | 'pause'
  | 'speed-down'
  | 'speed-up'
  | 'beds'
  | 'log'
  | 'focus-input'
  | 'close';

export interface ShortcutKeyEvent {
  key: string;
  repeat?: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function isButtonLike(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest('button, a, [role="button"]') !== null;
}

export function commandForKeyboardEvent(event: ShortcutKeyEvent): ShortcutCommand | null {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return null;
  if (event.key === 'Escape') return 'close';
  if (isTyping(event.target)) return null;
  if (event.key === ' ' && isButtonLike(event.target)) return null;
  switch (event.key) {
    case '1':
      return 'tab-chat';
    case '2':
      return 'tab-phone';
    case '3':
      return 'tab-family';
    case ' ':
      return 'pause';
    case '[':
      return 'speed-down';
    case ']':
      return 'speed-up';
    case 'b':
    case 'B':
      return 'beds';
    case 'l':
    case 'L':
      return 'log';
    case '/':
      return 'focus-input';
    default:
      return null;
  }
}
