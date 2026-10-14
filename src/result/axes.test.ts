import { describe, expect, it } from 'vitest';
import { hasKey } from '@/i18n';
import { AXES, dialMaxFor, formatValue, reasonKeyFor } from './axes';

describe('AXES', () => {
  it('4 軸(到達時間・部品数・コスト・消費エネルギー)の順で、文言がそろっている', () => {
    expect(AXES.map((a) => a.key)).toEqual(['time', 'parts', 'cost', 'energy']);
    for (const a of AXES) {
      expect(hasKey(a.labelKey)).toBe(true);
      expect(hasKey(a.unitKey)).toBe(true);
    }
  });
});

describe('dialMaxFor', () => {
  it('銅の基準が目盛りの 7〜9 割に来るきりのよい値', () => {
    for (const bronze of [10, 20, 60, 200, 7.5]) {
      const max = dialMaxFor(0, [bronze / 3, bronze / 2, bronze]);
      expect(bronze / max).toBeGreaterThanOrEqual(0.7);
      expect(bronze / max).toBeLessThanOrEqual(0.9);
    }
  });
  it('基準がなければ値(と相手の値)から決める', () => {
    expect(dialMaxFor(42)).toBeGreaterThanOrEqual(42);
    expect(dialMaxFor(10, undefined, 30)).toBeGreaterThanOrEqual(30);
    expect(dialMaxFor(0)).toBe(1);
  });
});

describe('formatValue', () => {
  it('小数の桁をそろえ、壊れた値は —', () => {
    expect(formatValue(12.345, 1)).toBe('12.3');
    expect(formatValue(9, 0)).toBe('9');
    expect(formatValue(Number.NaN, 1)).toBe('—');
  });
});

describe('reasonKeyFor', () => {
  it('明示されたキーを優先し、なければ失敗理由から、どちらもなければ汎用の文言', () => {
    expect(reasonKeyFor('game.fail.torque', 'stalled')).toBe('game.fail.torque');
    expect(reasonKeyFor(undefined, 'fallen')).toBe('result.reason.fallen');
    expect(hasKey(reasonKeyFor(undefined, 'jammed'))).toBe(true);
    expect(hasKey(reasonKeyFor(undefined, null))).toBe(true);
  });
});
