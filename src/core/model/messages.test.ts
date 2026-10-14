import { describe, expect, it } from 'vitest';
import { hasKey } from '@/i18n';
import { LOAD_FAIL_KEYS, SAVE_FAIL_KEYS } from './messages';
import { parseDesignFile } from './file';

describe('load/save failure messages', () => {
  it('has a Japanese message for every failure reason', () => {
    for (const key of [...Object.values(LOAD_FAIL_KEYS), ...Object.values(SAVE_FAIL_KEYS)]) {
      expect(hasKey(key), key).toBe(true);
    }
  });
  it('maps a real failure to its message key', () => {
    const r = parseDesignFile('{ not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(LOAD_FAIL_KEYS[r.reason]).toBe('model.load.corrupt');
  });
});
