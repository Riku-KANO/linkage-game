import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from './store';
import { MAX_JOINTS, exceedsDesignLimits } from '@/core/model/validate';
import { fourBar, jansenWalker } from '@/core/model/presets';
import type { DesignDoc } from '@/core/model/types';

/** sec の指摘:エディタが上限を超える設計を作れると、自動保存はされても読み込めず作品を失う */
describe('editor respects the loadable design limits', () => {
  beforeEach(() => useEditor.getState().replaceDesign(fourBar()));

  it('presets are within the limits', () => {
    expect(exceedsDesignLimits(fourBar())).toBe(false);
    expect(exceedsDesignLimits(jansenWalker())).toBe(false);
  });

  it('refuses an edit that would exceed the joint limit and counts it', () => {
    const base = useEditor.getState().design;
    const big: DesignDoc = {
      ...base,
      joints: Array.from({ length: MAX_JOINTS + 1 }, (_, i) => ({
        id: `j${i}`,
        x: i,
        y: 0,
        fixed: false,
      })),
    };
    const before = useEditor.getState().limitHits;
    useEditor.getState().commit(big);
    expect(useEditor.getState().design).toBe(base);
    expect(useEditor.getState().limitHits).toBe(before + 1);
  });

  it('still accepts normal edits', () => {
    const base = useEditor.getState().design;
    const next = { ...base, name: '名前を変えた' };
    useEditor.getState().commit(next);
    expect(useEditor.getState().design).toBe(next);
  });
});
