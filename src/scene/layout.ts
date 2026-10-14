/**
 * 工房の配置(ワールド座標、m)。カメラの定位置と物体の置き場所はここから決める。
 *
 * 部屋:x ∈ [−4, 4]、z ∈ [−3, 4.8]、床 y = 0、天井 y = 3.3。手前(+z)は壁がなく、
 * ホームのカメラは手前から奥(−z)を見る。奥の壁に窓があり、窓の外は夕暮れの荒野と試走コース。
 * 太陽は窓の外の低い位置(西日)にあり、窓から作業台と床へ光が差し込む。
 */

export type P3 = readonly [number, number, number];

export const ROOM = {
  xMin: -4,
  xMax: 4,
  zBack: -3,
  zFront: 4.8,
  height: 3.3,
  wallThickness: 0.2,
} as const;

/** 奥の壁の窓(開き窓。カメラが通り抜けられるよう中央に桟はない) */
export const WINDOW = {
  xMin: -2.9,
  xMax: -0.7,
  yMin: 0.9,
  yMax: 2.5,
  z: ROOM.zBack,
} as const;
export const WINDOW_CENTER: P3 = [
  (WINDOW.xMin + WINDOW.xMax) / 2,
  (WINDOW.yMin + WINDOW.yMax) / 2,
  WINDOW.z,
];

/** 作業台(天板の上面が y = top) */
export const BENCH = {
  center: [0, 0, -0.9] as P3,
  width: 2.3,
  depth: 1.0,
  top: 0.92,
} as const;

/**
 * 製図用紙(A1 横、841 × 594 mm)。設計画面ではこの紙を真上から平行投影で見る。
 * 紙の +x が設計の +x、紙の奥(−z)が設計の +y。
 */
export const PAPER_WORLD = {
  center: [-0.45, BENCH.top + 0.0015, -0.9] as P3,
  width: 0.841,
  height: 0.594,
} as const;

/**
 * 紙に対応する設計座標の範囲(cm)。紙の縦横比と一致させる。
 * 編集ビュー(ED-1)は独自にパン・ズームしてよいが、「紙 = この範囲」が初期の対応になる。
 */
export const PAPER_DESIGN = (() => {
  const width = 240;
  const height = (width * PAPER_WORLD.height) / PAPER_WORLD.width;
  const cx = -30;
  const cy = -30;
  return {
    xMin: cx - width / 2,
    xMax: cx + width / 2,
    yMin: cy - height / 2,
    yMax: cy + height / 2,
  };
})();

/** 作業台の上で見本機が行き来する範囲(紙の右側) */
export const BENCH_WALK = {
  xMin: 0.3,
  xMax: 0.8,
  z: -0.92,
  /** 見本機の縮尺(m / 設計 cm)。実寸の 1/5(机の上のおもちゃ) */
  scale: 0.01 / 5,
} as const;

/** 卓上ライト(作業台の右奥。腕もリンク機構) */
export const DESK_LAMP = {
  base: [1.0, BENCH.top, -1.3] as P3,
  head: [0.55, 1.48, -1.08] as P3,
} as const;

/** 製図機械(ドラフター)の付け根:紙の左奥の角の外 */
export const DRAFTER_BASE: P3 = [-1.0, BENCH.top, -1.3];

/** 壁のコース模型(ステージ選択)。奥の壁に棚受けで取り付けた板 */
export const COURSE_MODEL = {
  center: [1.95, 1.18, -2.55] as P3,
  width: 2.1,
  depth: 0.66,
} as const;

/** 右の壁際の棚(機構図鑑) */
export const SHELF = {
  center: [3.62, 0, -0.75] as P3,
  width: 1.5,
  depth: 0.42,
  height: 2.05,
} as const;

/** 工具箱(設定)。床の上、作業台の左手前 */
export const TOOLBOX = {
  center: [-1.75, 0, 0.35] as P3,
  rotationY: 0.35,
} as const;

/** タイトルの看板(奥の壁、窓の右上) */
export const LOGO_SIGN = {
  center: [0.95, 2.62, ROOM.zBack + ROOM.wallThickness / 2 + 0.03] as P3,
  width: 1.9,
  height: 0.5,
} as const;

/** 窓の外の試走コース(実寸)。機械は +x へ歩く */
export const TEST_TRACK = {
  z: -14,
  xStart: -8,
  xGoal: 8,
  width: 3.2,
  /** 機械の縮尺(m / 設計 cm) */
  scale: 0.01,
} as const;

/** 窓の外の風車(サンドボックスのホバーで回る) */
export const WINDMILL = {
  position: [-6.5, 0, -8.5] as P3,
} as const;

/** 太陽の方向(太陽へ向かう単位ベクトル)。窓の外の左寄り、低い西日 */
export const SUN_DIRECTION: P3 = (() => {
  const v = [-0.35, 0.35, -1] as const;
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l] as const;
})();
