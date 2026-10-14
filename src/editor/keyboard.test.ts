import { describe, expect, it } from 'vitest';
import { resolveShortcut, type KeyLike } from './keyboard';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('keyboard shortcuts', () => {
  it('undo / redo on mac and windows', () => {
    expect(resolveShortcut(key('z', { metaKey: true }))).toEqual({ kind: 'undo' });
    expect(resolveShortcut(key('z', { ctrlKey: true }))).toEqual({ kind: 'undo' });
    expect(resolveShortcut(key('Z', { metaKey: true, shiftKey: true }))).toEqual({
      kind: 'redo',
    });
    expect(resolveShortcut(key('y', { ctrlKey: true }))).toEqual({ kind: 'redo' });
  });
  it('clipboard and delete', () => {
    expect(resolveShortcut(key('c', { metaKey: true }))).toEqual({ kind: 'copy' });
    expect(resolveShortcut(key('v', { ctrlKey: true }))).toEqual({ kind: 'paste' });
    expect(resolveShortcut(key('Delete'))).toEqual({ kind: 'delete' });
    expect(resolveShortcut(key('Backspace'))).toEqual({ kind: 'delete' });
    expect(resolveShortcut(key('Escape'))).toEqual({ kind: 'escape' });
  });
  it('tool hotkeys', () => {
    expect(resolveShortcut(key('l'))).toEqual({ kind: 'tool', tool: 'link' });
    expect(resolveShortcut(key('V'))).toEqual({ kind: 'tool', tool: 'select' });
    expect(resolveShortcut(key('f'))).toEqual({ kind: 'tool', tool: 'fixed' });
    expect(resolveShortcut(key('c'))).toEqual({ kind: 'tool', tool: 'crank' });
    expect(resolveShortcut(key('a'))).toEqual({ kind: 'tool', tool: 'foot' });
    expect(resolveShortcut(key('x'))).toEqual({ kind: 'tool', tool: 'delete' });
  });
  it('nudges with arrows (shift = 10 cm, up = +y)', () => {
    expect(resolveShortcut(key('ArrowUp'))).toEqual({ kind: 'nudge', dx: 0, dy: 1 });
    expect(resolveShortcut(key('ArrowLeft', { shiftKey: true }))).toEqual({
      kind: 'nudge',
      dx: -10,
      dy: 0,
    });
  });
  it('ignores unknown keys and alt combos', () => {
    expect(resolveShortcut(key('q'))).toBeNull();
    expect(resolveShortcut(key('l', { altKey: true }))).toBeNull();
  });
});

describe('crank stepping keys', () => {
  it('steps 5° with , and . and 15° with < and > (what Shift+, / Shift+. actually send)', () => {
    const k = (key: string, shiftKey = false) =>
      resolveShortcut({ key, shiftKey, metaKey: false, ctrlKey: false, altKey: false });
    expect(k(',')).toEqual({ kind: 'stepAngle', deg: -5 });
    expect(k('.')).toEqual({ kind: 'stepAngle', deg: 5 });
    expect(k('<', true)).toEqual({ kind: 'stepAngle', deg: -15 });
    expect(k('>', true)).toEqual({ kind: 'stepAngle', deg: 15 });
  });
});
