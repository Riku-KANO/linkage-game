import { describe, expect, it } from 'vitest';
import { SPRINGS } from '@/ui/tokens';
import {
  PRESS_IMPACT,
  buttonGap,
  dialAngle,
  digitCount,
  gearPath,
  meshedAngle,
  meterValueAt,
  niceCeil,
  odometerDrums,
  panelProgress,
  pressPose,
  scissorGeometry,
  sliderCrankStroke,
  springAtRest,
  stepCrossings,
  stepSpring,
} from './math';

const TAU = Math.PI * 2;
/** a を周期 p で [0, p) に畳む */
const wrap = (a: number, p: number) => ((a % p) + p) % p;

describe('niceCeil', () => {
  it('きりのよい値(1, 2, 2.5, 5 × 10^k)に切り上げる', () => {
    expect(niceCeil(20)).toBe(20);
    expect(niceCeil(21)).toBe(25);
    expect(niceCeil(26)).toBe(50);
    expect(niceCeil(51)).toBe(100);
    expect(niceCeil(0.3)).toBeCloseTo(0.5);
    expect(niceCeil(7)).toBe(10);
  });
  it('0・負・NaN は 1', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-3)).toBe(1);
    expect(niceCeil(Number.NaN)).toBe(1);
  });
});

describe('dialAngle', () => {
  const sweep = (200 * Math.PI) / 180;
  it('0 で左端、max で右端、中央で真上', () => {
    expect(dialAngle(0, 10, sweep)).toBeCloseTo(-sweep / 2);
    expect(dialAngle(10, 10, sweep)).toBeCloseTo(sweep / 2);
    expect(dialAngle(5, 10, sweep)).toBeCloseTo(0);
  });
  it('範囲外はストッパーで止まる', () => {
    expect(dialAngle(25, 10, sweep)).toBeCloseTo(sweep / 2);
    expect(dialAngle(-3, 10, sweep)).toBeCloseTo(-sweep / 2);
    expect(dialAngle(Number.NaN, 10, sweep)).toBeCloseTo(-sweep / 2);
  });
});

describe('meshedAngle(歯車列)', () => {
  it('回転比は歯数の逆比で、向きは逆', () => {
    const a0 = 0.3;
    const d = 0.25;
    const b0 = meshedAngle(a0, 36, 12, -0.7);
    const b1 = meshedAngle(a0 + d, 36, 12, -0.7);
    expect(b1 - b0).toBeCloseTo((-d * 36) / 12);
  });
  it('driver の歯が driven を向いたとき、driven は歯溝を driver に向ける', () => {
    const tA = 36;
    const tB = 12;
    const dir = -0.7;
    for (const k of [0, 1, 5]) {
      const a = dir + (k * TAU) / tA;
      const b = meshedAngle(a, tA, tB, dir);
      // driven の歯の中心は b + m·2π/tB。driver の方向(dir + π)からは半ピッチずれている
      const off = wrap(dir + Math.PI - b, TAU / tB);
      expect(off).toBeCloseTo(Math.PI / tB, 9);
    }
  });
});

describe('gearPath', () => {
  it('歯数 × 4 点の閉じた輪郭で、半径は歯底と歯先の間', () => {
    const d = gearPath(12, 20, 3);
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(nums.length).toBe(12 * 4 * 2);
    expect(d.trim().endsWith('Z')).toBe(true);
    for (let i = 0; i < nums.length; i += 2) {
      const r = Math.hypot(nums[i]!, nums[i + 1]!);
      expect(r).toBeGreaterThan(20 - 3 / 2 - 0.02);
      expect(r).toBeLessThan(20 + 3 / 2 + 0.02);
    }
  });
});

describe('stepCrossings', () => {
  it('目盛りをまたいだ回数を数える(向きによらない)', () => {
    expect(stepCrossings(0, 0.9, 1)).toBe(0);
    expect(stepCrossings(0.9, 1.1, 1)).toBe(1);
    expect(stepCrossings(0.5, 3.5, 1)).toBe(3);
    expect(stepCrossings(3.5, 0.5, 1)).toBe(3);
  });
});

describe('digitCount', () => {
  it('整数部の桁数(最低 1)', () => {
    expect(digitCount(0)).toBe(1);
    expect(digitCount(9.99)).toBe(1);
    expect(digitCount(10)).toBe(2);
    expect(digitCount(999)).toBe(3);
    expect(digitCount(1000)).toBe(4);
  });
});

describe('odometerDrums(数字ドラム)', () => {
  it('止まっているときは各桁の数字', () => {
    expect(odometerDrums(12.4, 2, 1)).toEqual([1, 2, 4]);
    expect(odometerDrums(7, 3, 0)).toEqual([0, 0, 7]);
  });
  it('浮動小数の誤差で半端な位置にならない', () => {
    expect(odometerDrums(0.1 + 0.2, 1, 1)).toEqual([0, 3]);
  });
  it('下の桁が 9 から 0 へ回るときだけ上の桁も回る(繰り上がり)', () => {
    const [h, t, u] = odometerDrums(9.95, 2, 1);
    expect(h).toBeCloseTo(0.5);
    expect(t).toBeCloseTo(9.5);
    expect(u).toBeCloseTo(9.5);
    const [h2, t2, u2] = odometerDrums(9.25, 2, 1);
    expect(h2).toBeCloseTo(0);
    expect(t2).toBeCloseTo(9);
    expect(u2).toBeCloseTo(2.5);
  });
  it('表示できる範囲を超えたら 9 で止まり、負と NaN は 0', () => {
    expect(odometerDrums(1234, 2, 0)).toEqual([9, 9]);
    expect(odometerDrums(-5, 2, 0)).toEqual([0, 0]);
    expect(odometerDrums(Number.NaN, 2, 0)).toEqual([0, 0]);
  });
});

describe('meterValueAt(回って止まる)', () => {
  it('0 から始まり、ちょうど値で止まる', () => {
    expect(meterValueAt(0, 1, 12)).toBe(0);
    expect(meterValueAt(1, 1, 12)).toBeCloseTo(12, 9);
    expect(meterValueAt(5, 1, 12)).toBeCloseTo(12, 9);
  });
  it('settle のイージングで少しだけ行き過ぎて戻る', () => {
    let peak = 0;
    for (let i = 0; i <= 100; i++) peak = Math.max(peak, meterValueAt(i / 100, 1, 10));
    expect(peak).toBeGreaterThan(10);
    expect(peak).toBeLessThan(10 * 1.08);
  });
  it('長さ 0 は即座に最終値', () => {
    expect(meterValueAt(0, 0, 3)).toBe(3);
  });
});

describe('sliderCrankStroke(プレスのスライダークランク)', () => {
  it('上死点 0、下死点 1', () => {
    expect(sliderCrankStroke(0, 10, 40)).toBeCloseTo(0);
    expect(sliderCrankStroke(Math.PI, 10, 40)).toBeCloseTo(1);
    expect(sliderCrankStroke(TAU, 10, 40)).toBeCloseTo(0);
  });
  it('クランクが半回転する間は単調に下がる', () => {
    let prev = -1;
    for (let i = 0; i <= 50; i++) {
      const s = sliderCrankStroke((i / 50) * Math.PI, 10, 40);
      expect(s).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = s;
    }
  });
});

describe('pressPose(刻印のタイムライン)', () => {
  const dur = 0.6;
  it('上から下りて刻印し、上に戻る', () => {
    expect(pressPose(0, dur).ram).toBeCloseTo(0);
    expect(pressPose(PRESS_IMPACT * dur, dur).ram).toBeCloseTo(1);
    expect(pressPose(dur, dur).ram).toBeCloseTo(0);
  });
  it('刻印の瞬間に stamped が立つ', () => {
    expect(pressPose(PRESS_IMPACT * dur - 0.01, dur).stamped).toBe(false);
    expect(pressPose(PRESS_IMPACT * dur, dur).stamped).toBe(true);
    expect(pressPose(dur, dur).stamped).toBe(true);
  });
  it('下りる間は単調、最後は揺れが収まる', () => {
    let prev = -1;
    for (let i = 0; i <= 40; i++) {
      const r = pressPose((i / 40) * PRESS_IMPACT * dur, dur).ram;
      expect(r).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = r;
    }
    expect(Math.abs(pressPose(dur, dur).shake)).toBeLessThan(0.01);
    expect(Math.abs(pressPose(0, dur).shake)).toBe(0);
  });
  it('長さ 0 は刻印済みの最終状態', () => {
    const p = pressPose(0, 0);
    expect(p.stamped).toBe(true);
    expect(p.ram).toBeCloseTo(0);
  });
});

describe('scissorGeometry(伸縮リンク)', () => {
  it('棒の長さは一定で、高さは段数 × 段の高さ', () => {
    const g = scissorGeometry(120, 6, 24, 11);
    expect(g.cellHeight * 6).toBeCloseTo(120);
    for (const [x1, y1, x2, y2] of g.bars) expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(24);
    expect(g.bars.length).toBe(12);
    // 端のピン 2 × 7 段 + 交点 6
    expect(g.pins.length).toBe(2 * 7 + 6);
  });
  it('伸びるほど細くなり、伸びきると幅 0', () => {
    const a = scissorGeometry(40, 6, 24);
    const b = scissorGeometry(100, 6, 24);
    expect(b.width).toBeLessThan(a.width);
    expect(scissorGeometry(6 * 24, 6, 24).width).toBeCloseTo(0);
    expect(scissorGeometry(999, 6, 24).cellHeight).toBeCloseTo(24);
    expect(scissorGeometry(0, 6, 24).width).toBeCloseTo(24);
  });
  it('中心 cx に左右対称', () => {
    const g = scissorGeometry(80, 4, 20, 10);
    const xs = g.pins.map((p) => p[0]);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(20);
  });
});

describe('panelProgress', () => {
  it('開くときは 0 → 1、閉じるときは 1 → 0', () => {
    expect(panelProgress(0, 0.5, true)).toBe(0);
    expect(panelProgress(0.5, 0.5, true)).toBe(1);
    expect(panelProgress(0, 0.5, false)).toBe(1);
    expect(panelProgress(0.5, 0.5, false)).toBe(0);
    expect(panelProgress(0, 0, true)).toBe(1);
  });
});

describe('ばね(ボタンの戻り)', () => {
  it('目標に収束し、行き過ぎは小さい', () => {
    const { stiffness: k, damping: c } = SPRINGS.ui;
    let s = { x: 1, v: 0 };
    let min = 1;
    let t = 0;
    while (t < 0.6) {
      s = stepSpring(s, 0, k, c, 1 / 60);
      min = Math.min(min, s.x);
      t += 1 / 60;
    }
    expect(springAtRest(s, 0)).toBe(true);
    expect(min).toBeLessThan(0); // 少し行き過ぎて戻る(ばねらしさ)
    expect(min).toBeGreaterThan(-0.1);
  });
  it('大きな dt でも発散しない', () => {
    const s = stepSpring({ x: 1, v: 0 }, 0, 400, 30, 0.5);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Math.abs(s.x)).toBeLessThan(1);
  });
});

describe('buttonGap', () => {
  it('押すと隙間が狭まり、範囲外の押し込みは止める', () => {
    expect(buttonGap(1)).toBeLessThan(buttonGap(0));
    expect(buttonGap(5)).toBe(buttonGap(1.2));
    expect(buttonGap(-5)).toBe(buttonGap(-0.3));
  });
});
