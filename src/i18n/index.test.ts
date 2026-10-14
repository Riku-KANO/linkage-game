import { describe, expect, it } from 'vitest';
import { hasKey, t } from './index';

describe('i18n lookups use own keys only', () => {
  it('does not resolve Object.prototype members', () => {
    for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(hasKey(k)).toBe(false);
      expect(t(k)).toBe(k);
    }
  });
  it('fills params and leaves unknown placeholders', () => {
    expect(t('editor.notice.copied', { n: 3 })).toBe('3 点をコピーしました');
    expect(t('editor.notice.limit', { constructor: 1 } as never)).toContain('{joints}');
  });
});
