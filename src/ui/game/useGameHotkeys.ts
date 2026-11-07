import { useEffect, useRef } from 'react';
import { commandForKeyboardEvent, type ShortcutCommand } from './shortcuts';

export function useGameHotkeys(onCommand: (command: ShortcutCommand) => void): void {
  const ref = useRef(onCommand);
  useEffect(() => {
    ref.current = onCommand;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const command = commandForKeyboardEvent(event);
      if (!command) return;
      event.preventDefault();
      ref.current(command);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
