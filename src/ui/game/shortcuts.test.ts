import { describe, expect, it } from 'vitest';
import { commandForKeyboardEvent, type ShortcutKeyEvent } from './shortcuts';

function event(over: Partial<ShortcutKeyEvent> & { key: string }): ShortcutKeyEvent {
  return { metaKey: false, ctrlKey: false, altKey: false, target: document.body, ...over };
}

describe('keyboard shortcuts', () => {
  it('maps the default keys', () => {
    expect(commandForKeyboardEvent(event({ key: '1' }))).toBe('tab-chat');
    expect(commandForKeyboardEvent(event({ key: '2' }))).toBe('tab-phone');
    expect(commandForKeyboardEvent(event({ key: '3' }))).toBe('tab-family');
    expect(commandForKeyboardEvent(event({ key: ' ' }))).toBe('pause');
    expect(commandForKeyboardEvent(event({ key: '[' }))).toBe('speed-down');
    expect(commandForKeyboardEvent(event({ key: ']' }))).toBe('speed-up');
    expect(commandForKeyboardEvent(event({ key: 'b' }))).toBe('beds');
    expect(commandForKeyboardEvent(event({ key: 'L' }))).toBe('log');
    expect(commandForKeyboardEvent(event({ key: '/' }))).toBe('focus-input');
    expect(commandForKeyboardEvent(event({ key: 'Escape' }))).toBe('close');
  });

  it('ignores shortcuts while typing, except Escape', () => {
    const input = document.createElement('input');
    expect(commandForKeyboardEvent(event({ key: ' ', target: input }))).toBeNull();
    expect(commandForKeyboardEvent(event({ key: '/', target: input }))).toBeNull();
    expect(commandForKeyboardEvent(event({ key: 'Escape', target: input }))).toBe('close');
  });

  it('lets Space activate the focused button instead of pausing', () => {
    const button = document.createElement('button');
    expect(commandForKeyboardEvent(event({ key: ' ', target: button }))).toBeNull();
  });

  it('ignores modified and repeated keys', () => {
    expect(commandForKeyboardEvent(event({ key: 'l', ctrlKey: true }))).toBeNull();
    expect(commandForKeyboardEvent(event({ key: ' ', repeat: true }))).toBeNull();
  });
});
