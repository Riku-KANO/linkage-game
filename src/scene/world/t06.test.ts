import { describe, expect, it } from 'vitest';
import { T06_WALK, t06WalkEnd, t06WalkProgress } from './t06';

describe('T-06 の時間割', () => {
  const D = 2;
  it('カメラが模型に近づくまでは止まっていて、着いた後に次の目印に着く', () => {
    expect(t06WalkProgress(0, D)).toBe(0);
    expect(t06WalkProgress(T06_WALK.start * D, D)).toBe(0);
    // カメラが着いた瞬間(遷移の終わり)はまだ歩いている
    const atArrival = t06WalkProgress(D, D);
    expect(atArrival).toBeGreaterThan(0);
    expect(atArrival).toBeLessThan(1);
    expect(t06WalkProgress(t06WalkEnd(D), D)).toBe(1);
    expect(t06WalkProgress(t06WalkEnd(D) + 5, D)).toBe(1);
    expect(t06WalkProgress(-1, D)).toBe(0);
  });

  it('2 回目以降の短縮版(1.0 秒)は同じ割合で短い', () => {
    expect(t06WalkEnd(1)).toBeCloseTo(t06WalkEnd(2) / 2, 12);
    expect(t06WalkProgress(0.9, 1)).toBeCloseTo(t06WalkProgress(1.8, 2), 12);
  });

  it('遷移の長さが 0 なら歩かずに着いている', () => {
    expect(t06WalkProgress(0, 0)).toBe(1);
    expect(t06WalkEnd(0)).toBe(0);
  });

  it('単調に進み、歩き出しと着く前はゆっくり', () => {
    let prev = 0;
    for (let k = 0; k <= 100; k++) {
      const v = t06WalkProgress((k / 100) * t06WalkEnd(D), D);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    const a = T06_WALK.start * D;
    const b = t06WalkEnd(D);
    const slope = (t: number) => (t06WalkProgress(t + 0.01, D) - t06WalkProgress(t, D)) / 0.01;
    const mid = (a + b) / 2;
    expect(slope(a + 0.001)).toBeLessThan(slope(mid));
    expect(slope(b - 0.011)).toBeLessThan(slope(mid));
  });
});
