import { dyadPoint, fourBar, jansenLeg } from '@/core/model/presets';
import type { DesignDoc, Joint, Link } from '@/core/model/types';
import { DESIGN_VERSION, DEFAULT_LEGS } from '@/core/model/types';
import { basicLeg } from '@/game/designs';

/**
 * 遊び方・用語解説の図に使う小さな機構(GUIDE-1, GUIDE-2)。どれも本物のソルバー
 * (compileMechanism・solvePose・sampleCycle)で動かす。寸法は設計と同じ cm。
 */

const round = (v: number) => Math.round(v * 1e6) / 1e6;

function doc(
  name: string,
  joints: Record<string, { x: number; y: number }>,
  fixed: string[],
  links: Link[],
  crank: { link: string; pivot: string } | null,
  foot: string | null = null,
  rpm = 30,
): DesignDoc {
  const js: Joint[] = Object.entries(joints).map(([id, p]) => ({
    id,
    x: round(p.x),
    y: round(p.y),
    fixed: fixed.includes(id),
  }));
  return {
    version: DESIGN_VERSION,
    name,
    joints: js,
    links,
    cranks: crank ? [{ id: 'motor', link: crank.link, pivot: crank.pivot, phase: 0 }] : [],
    foot,
    motor: { rpm },
    legs: { ...DEFAULT_LEGS },
  };
}

/**
 * 歩く脚の見本:第 1 章の基本の脚(てこクランクの連結棒を下へ伸ばした先が脚先)。
 * 軌道の底が平らで、時計回り(rpm < 0)で +x へ歩く。チュートリアルで組む脚と同じ形。
 */
export function goodLeg(): DesignDoc {
  return { ...basicLeg({ ...DEFAULT_LEGS }), name: 'guide-good-leg' };
}

/** 自由度 1:地面+棒 3 本の輪(四節リンク)。O1 がクランク軸 */
export function loopFourBar(): DesignDoc {
  const O1 = { x: 0, y: 0 };
  const O2 = { x: 40, y: 0 };
  const A = { x: 0, y: 12 };
  const B = dyadPoint(A, 40, O2, 30, 'up');
  return doc(
    'guide-four-bar',
    { O1, O2, A, B },
    ['O1', 'O2'],
    [
      { id: 'crank', joints: ['O1', 'A'] },
      { id: 'coupler', joints: ['A', 'B'] },
      { id: 'rocker', joints: ['O2', 'B'] },
    ],
    { link: 'crank', pivot: 'O1' },
  );
}

/** 自由度 0:地面+棒 2 本の三角形。クランクは回れない */
export function loopTriangle(): DesignDoc {
  return doc(
    'guide-triangle',
    { O1: { x: 0, y: 0 }, O2: { x: 40, y: 0 }, A: { x: 14, y: 26 } },
    ['O1', 'O2'],
    [
      { id: 'crank', joints: ['O1', 'A'] },
      { id: 'bar', joints: ['A', 'O2'] },
    ],
    { link: 'crank', pivot: 'O1' },
  );
}

const FIVE = {
  O1: { x: 0, y: 0 },
  O2: { x: 40, y: 0 },
  A: { x: 0, y: 12 },
  B: { x: 18, y: 40 },
  C: { x: 40, y: 30 },
};

/** 自由度 2:地面+棒 4 本の輪(五節リンク)。クランクを止めても B・C が動ける */
export function loopFiveBar(): DesignDoc {
  return doc(
    'guide-five-bar',
    FIVE,
    ['O1', 'O2'],
    [
      { id: 'crank', joints: ['O1', 'A'] },
      { id: 'ab', joints: ['A', 'B'] },
      { id: 'bc', joints: ['B', 'C'] },
      { id: 'co', joints: ['C', 'O2'] },
    ],
    { link: 'crank', pivot: 'O1' },
  );
}

/**
 * 五節リンクの「ぐらつき」を作るための補助の機構。クランク(O1-A)を止めた状態として A を固定し、
 * 右の棒(O2-C)を回して、同じクランク角で取りうる別の姿勢を本物のソルバーで解く。
 * ジョイントの並びは loopFiveBar と同じなので、解いた位置をそのまま五節リンクの姿勢として描ける。
 */
export function fiveBarSwayDriver(): DesignDoc {
  return doc(
    'guide-five-bar-sway',
    FIVE,
    ['O1', 'O2', 'A'],
    [
      { id: 'ab', joints: ['A', 'B'] },
      { id: 'bc', joints: ['B', 'C'] },
      { id: 'co', joints: ['C', 'O2'] },
    ],
    { link: 'co', pivot: 'O2' },
  );
}

/** 組立不能:クランクが長すぎて(非グラスホフ)、ある角度で棒が届かない */
export function tooLongCrank(): DesignDoc {
  return { ...fourBar(28, 35, 30, 40), name: 'guide-long-crank', foot: null };
}

/** 死点:s + l = p + q(変位点)の四節。中間の棒と揺れる棒が一直線に並ぶ瞬間がある */
export function deadPointBar(): DesignDoc {
  return { ...fourBar(20, 30, 30, 40), name: 'guide-dead-point', foot: null };
}

/**
 * カップラーカーブ:同じ四節リンクのカップラー(中間の板)上の 3 点。点の場所で軌道の形が変わる。
 * 脚先は P2。
 */
export function couplerPoints(): DesignDoc {
  const base = loopFourBar();
  const A = { x: 0, y: 12 };
  const B = dyadPoint(A, 40, { x: 40, y: 0 }, 30, 'up');
  // A→B を基準にした局所座標で 3 点を置く
  const ex = { x: (B.x - A.x) / 40, y: (B.y - A.y) / 40 };
  const ny = { x: -ex.y, y: ex.x };
  const at = (u: number, v: number) => ({
    x: A.x + ex.x * u + ny.x * v,
    y: A.y + ex.y * u + ny.y * v,
  });
  const pts = { P1: at(20, 14), P2: at(32, -22), P3: at(-8, -12) };
  return {
    ...base,
    name: 'guide-coupler-points',
    joints: [
      ...base.joints,
      ...Object.entries(pts).map(([id, p]) => ({ id, x: round(p.x), y: round(p.y), fixed: false })),
    ],
    links: base.links.map((l) =>
      l.id === 'coupler' ? { ...l, joints: ['A', 'B', 'P1', 'P2', 'P3'] } : l,
    ),
    foot: 'P2',
  };
}

/**
 * 特殊な寸法:平行な棒 3 本の二重平行四辺形。グリューブラーの式では自由度 0 だが、
 * 長さがそろっているので一回転できる(KIN-7)。
 */
export function doubleParallelogram(): DesignDoc {
  return doc(
    'guide-parallelogram',
    {
      O1: { x: 0, y: 0 },
      O2: { x: 25, y: 0 },
      O3: { x: 50, y: 0 },
      A: { x: 0, y: 12 },
      B: { x: 25, y: 12 },
      C: { x: 50, y: 12 },
    },
    ['O1', 'O2', 'O3'],
    [
      { id: 'crank', joints: ['O1', 'A'] },
      { id: 'r2', joints: ['O2', 'B'] },
      { id: 'r3', joints: ['O3', 'C'] },
      { id: 'top', joints: ['A', 'B', 'C'] },
    ],
    { link: 'crank', pivot: 'O1' },
  );
}

/** ヤンセンリンク(見本機の脚) */
export function jansen(): DesignDoc {
  return jansenLeg();
}

export const FIGURE_DESIGNS = {
  goodLeg,
  loopFourBar,
  loopTriangle,
  loopFiveBar,
  fiveBarSwayDriver,
  tooLongCrank,
  deadPointBar,
  couplerPoints,
  doubleParallelogram,
  jansen,
} as const;
export type FigureDesignId = keyof typeof FIGURE_DESIGNS;
