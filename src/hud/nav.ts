/**
 * キーボード操作の移動(純粋な関数)。一覧(テキストメニュー)と、章 × ステージの格子に使う。
 * 扱わないキーには null を返すので、呼び出し側はそのときだけ既定の動作を残せばよい。
 */

export interface ListMoveOptions {
  /** 端で反対側へ回り込む(既定 true) */
  wrap?: boolean;
  /** 扱う矢印キー:縦(上下)・横(左右)・両方(既定 vertical) */
  orientation?: 'vertical' | 'horizontal' | 'both';
  /** 使えない項目(飛ばす) */
  isDisabled?: (index: number) => boolean;
}

/** 一覧の中の移動。次の位置か、扱わないキーなら null */
export function listMove(
  index: number,
  key: string,
  count: number,
  { wrap = true, orientation = 'vertical', isDisabled = () => false }: ListMoveOptions = {},
): number | null {
  if (count <= 0) return null;
  const vertical = orientation !== 'horizontal';
  const horizontal = orientation !== 'vertical';
  let dir: 1 | -1;
  let from = index;
  switch (key) {
    case 'ArrowDown':
      if (!vertical) return null;
      dir = 1;
      break;
    case 'ArrowUp':
      if (!vertical) return null;
      dir = -1;
      break;
    case 'ArrowRight':
      if (!horizontal) return null;
      dir = 1;
      break;
    case 'ArrowLeft':
      if (!horizontal) return null;
      dir = -1;
      break;
    case 'Home':
      dir = 1;
      from = -1;
      break;
    case 'End':
      dir = -1;
      from = count;
      break;
    default:
      return null;
  }
  const jumping = key === 'Home' || key === 'End';
  let i = from;
  for (let n = 0; n < count; n++) {
    i += dir;
    if (i < 0 || i >= count) {
      if (!wrap || jumping) return clampToEnabled(index, count, isDisabled);
      i = (i + count) % count;
    }
    if (!isDisabled(i)) return i;
  }
  return null;
}

/** 回り込まずに端で止まったときは、今の位置(使えなければ最初の使える項目) */
function clampToEnabled(index: number, count: number, isDisabled: (i: number) => boolean) {
  if (index >= 0 && index < count && !isDisabled(index)) return index;
  for (let i = 0; i < count; i++) if (!isDisabled(i)) return i;
  return null;
}

export interface GridPos {
  row: number;
  col: number;
}

/**
 * 行ごとに長さの違う格子(章ごとのステージ)の移動。
 * 左右は行の中で、端では前後の行(空の行は飛ばす)へ続く。上下は列を保ち、短い行では右端に寄せる。
 * Home・End は行の最初と最後。
 */
export function gridMove(pos: GridPos, key: string, rowLengths: readonly number[]): GridPos | null {
  const len = (r: number) => rowLengths[r] ?? 0;
  const findRow = (from: number, dir: 1 | -1): number | null => {
    for (let r = from + dir; r >= 0 && r < rowLengths.length; r += dir) if (len(r) > 0) return r;
    return null;
  };
  const { row, col } = pos;
  switch (key) {
    case 'ArrowRight': {
      if (col + 1 < len(row)) return { row, col: col + 1 };
      const r = findRow(row, 1);
      return r === null ? pos : { row: r, col: 0 };
    }
    case 'ArrowLeft': {
      if (col > 0) return { row, col: col - 1 };
      const r = findRow(row, -1);
      return r === null ? pos : { row: r, col: len(r) - 1 };
    }
    case 'ArrowDown':
    case 'ArrowUp': {
      const r = findRow(row, key === 'ArrowDown' ? 1 : -1);
      return r === null ? pos : { row: r, col: Math.min(col, len(r) - 1) };
    }
    case 'Home':
      return { row, col: 0 };
    case 'End':
      return { row, col: Math.max(0, len(row) - 1) };
    default:
      return null;
  }
}
