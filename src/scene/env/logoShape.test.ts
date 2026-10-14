import { describe, expect, it } from 'vitest';
import { BOOT } from '@/ui/tokens';
import { LOGO_GLYPHS, barSchedule, logoBars, logoPins } from './logoShape';

describe('タイトルロゴの形', () => {
  it('4 文字(アシクミ)の棒とピン', () => {
    const bars = logoBars();
    expect(LOGO_GLYPHS).toHaveLength(4);
    expect(bars).toHaveLength(LOGO_GLYPHS.flat().length);
    const pins = logoPins(bars);
    // 端点を共有する画はピンを 1 つにまとめる
    expect(pins.length).toBeLessThan(bars.length * 2);
    expect(pins.length).toBeGreaterThan(bars.length);
  });

  it('全ての棒が組み上がりの時間内にはまる', () => {
    const n = logoBars().length;
    for (let i = 0; i < n; i++) {
      const { start, dur } = barSchedule(i, n, BOOT.logoAssemble);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start + dur).toBeLessThanOrEqual(BOOT.logoAssemble + 1e-9);
    }
  });
});
