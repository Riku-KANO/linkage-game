import { describe, expect, it } from 'vitest';
import { gridMove, listMove } from './nav';

describe('listMove(縦の一覧)', () => {
  it('上下で 1 つずつ、端で回り込む', () => {
    expect(listMove(0, 'ArrowDown', 4)).toBe(1);
    expect(listMove(3, 'ArrowDown', 4)).toBe(0);
    expect(listMove(0, 'ArrowUp', 4)).toBe(3);
    expect(listMove(2, 'Home', 4)).toBe(0);
    expect(listMove(1, 'End', 4)).toBe(3);
  });

  it('回り込まない設定では端で止まる', () => {
    expect(listMove(3, 'ArrowDown', 4, { wrap: false })).toBe(3);
    expect(listMove(0, 'ArrowUp', 4, { wrap: false })).toBe(0);
  });

  it('使えない項目は飛ばす(Home・End も)', () => {
    const off = (i: number) => i === 1 || i === 3;
    expect(listMove(0, 'ArrowDown', 5, { isDisabled: off })).toBe(2);
    expect(listMove(2, 'ArrowDown', 5, { isDisabled: off })).toBe(4);
    expect(listMove(4, 'ArrowDown', 5, { isDisabled: off })).toBe(0);
    expect(listMove(2, 'End', 5, { isDisabled: (i) => i === 4 })).toBe(3);
    expect(listMove(2, 'Home', 5, { isDisabled: (i) => i === 0 })).toBe(1);
  });

  it('縦の一覧は左右を扱わない。扱わないキーは null', () => {
    expect(listMove(0, 'ArrowRight', 4)).toBeNull();
    expect(listMove(0, 'Enter', 4)).toBeNull();
    expect(listMove(0, 'ArrowRight', 4, { orientation: 'horizontal' })).toBe(1);
    expect(listMove(0, 'ArrowDown', 4, { orientation: 'horizontal' })).toBeNull();
    expect(listMove(0, 'ArrowRight', 4, { orientation: 'both' })).toBe(1);
  });

  it('項目がない・全部使えないときは null', () => {
    expect(listMove(0, 'ArrowDown', 0)).toBeNull();
    expect(listMove(0, 'ArrowDown', 3, { isDisabled: () => true })).toBeNull();
  });
});

describe('gridMove(章 × ステージ)', () => {
  // 章 1:5、章 2:3、章 3:0(ステージなし)、章 4:2
  const rows = [5, 3, 0, 2];

  it('左右は章の中で、端では前後の章へ続く', () => {
    expect(gridMove({ row: 0, col: 1 }, 'ArrowRight', rows)).toEqual({ row: 0, col: 2 });
    expect(gridMove({ row: 0, col: 4 }, 'ArrowRight', rows)).toEqual({ row: 1, col: 0 });
    expect(gridMove({ row: 1, col: 0 }, 'ArrowLeft', rows)).toEqual({ row: 0, col: 4 });
    expect(gridMove({ row: 0, col: 0 }, 'ArrowLeft', rows)).toEqual({ row: 0, col: 0 });
    expect(gridMove({ row: 3, col: 1 }, 'ArrowRight', rows)).toEqual({ row: 3, col: 1 });
  });

  it('上下は列を保ち(短い章では右端に寄せ)、空の章を飛ばす', () => {
    expect(gridMove({ row: 0, col: 4 }, 'ArrowDown', rows)).toEqual({ row: 1, col: 2 });
    expect(gridMove({ row: 1, col: 1 }, 'ArrowDown', rows)).toEqual({ row: 3, col: 1 });
    expect(gridMove({ row: 3, col: 0 }, 'ArrowUp', rows)).toEqual({ row: 1, col: 0 });
    expect(gridMove({ row: 0, col: 2 }, 'ArrowUp', rows)).toEqual({ row: 0, col: 2 });
    expect(gridMove({ row: 3, col: 0 }, 'ArrowDown', rows)).toEqual({ row: 3, col: 0 });
  });

  it('Home・End は章の最初と最後', () => {
    expect(gridMove({ row: 0, col: 2 }, 'Home', rows)).toEqual({ row: 0, col: 0 });
    expect(gridMove({ row: 0, col: 2 }, 'End', rows)).toEqual({ row: 0, col: 4 });
  });

  it('扱わないキーは null', () => {
    expect(gridMove({ row: 0, col: 0 }, 'Enter', rows)).toBeNull();
  });
});
