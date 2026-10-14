import { describe, expect, it } from 'vitest';
import { parseRich, plainRich } from './rich';

describe('用語リンクつきの文言', () => {
  it('[[id|表示]] と [[id]] を取り出す', () => {
    expect(parseRich('まず[[dof|自由度]]を見る。[[grashof]]も。')).toEqual([
      { kind: 'text', text: 'まず' },
      { kind: 'term', id: 'dof', label: '自由度' },
      { kind: 'text', text: 'を見る。' },
      { kind: 'term', id: 'grashof' },
      { kind: 'text', text: 'も。' },
    ]);
  });
  it('リンクがなければ文のまま', () => {
    expect(parseRich('ふつうの文')).toEqual([{ kind: 'text', text: 'ふつうの文' }]);
    expect(parseRich('')).toEqual([]);
  });
  it('素の文にする', () => {
    expect(plainRich('[[dof|自由度]]が 1 と [[grashof]]', (id) => `<${id}>`)).toBe(
      '自由度が 1 と <grashof>',
    );
  });
});
