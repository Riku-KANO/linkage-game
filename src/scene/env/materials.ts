import { Color, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, type Material } from 'three';

/**
 * 工房の共有マテリアルと色。ローポリの面がはっきり見えるよう flatShading にする。
 * 環境マップを使わない(外部の HDR を読まない)ので、金属感は控えめな metalness で出す。
 * 手続き生成の部品は頂点色で塗り分け、マテリアルの数(=シェーダーの数)を絞る。
 */

export const PALETTE = {
  woodLight: '#b07d52',
  wood: '#8a5a3b',
  woodDark: '#5b3a26',
  woodDeep: '#3e271a',
  plaster: '#b59a7e',
  plasterDark: '#9c8068',
  floor: '#6e4a33',
  metal: '#8a939c',
  metalDark: '#3d4248',
  red: '#b8432f',
  brass: '#c9a24a',
  paper: '#efe6d2',
  sand: '#c98f5a',
  ochre: '#b7773f',
  rust: '#9b5a3c',
  mesa: '#a8613f',
  ink: '#2b2118',
  glass: '#a9c8d8',
  green: '#6f8f5a',
  blue: '#4f6f9a',
} as const;

/** 木・漆喰など(頂点色、つや消し) */
export const vcMatte = new MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.85,
  metalness: 0.02,
  flatShading: true,
});

/** 金属部品(頂点色) */
export const vcMetal = new MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.5,
  metalness: 0.3,
  flatShading: true,
});

/** 真鍮(見本機のリンク・ロゴ) */
export const brass = new MeshStandardMaterial({
  color: PALETTE.brass,
  roughness: 0.45,
  metalness: 0.35,
  flatShading: true,
});

/** 木のリンク */
export const woodBar = new MeshStandardMaterial({
  color: PALETTE.woodLight,
  roughness: 0.7,
  metalness: 0.02,
  flatShading: true,
});

/** ピン・軸 */
export const steel = new MeshStandardMaterial({
  color: '#c7ccd1',
  roughness: 0.4,
  metalness: 0.4,
  flatShading: true,
});

/** 黒っぽい鉄(コード・笠・軸受け) */
export const darkMetal = new MeshStandardMaterial({
  color: PALETTE.metalDark,
  roughness: 0.55,
  metalness: 0.3,
  flatShading: true,
});

/** 窓ガラス */
export const glass = new MeshStandardMaterial({
  color: PALETTE.glass,
  roughness: 0.05,
  metalness: 0.1,
  transparent: true,
  opacity: 0.18,
  depthWrite: false,
  side: DoubleSide,
});

/** 光る電球(ブルームで滲む) */
export const bulb = new MeshBasicMaterial({ color: new Color('#ffd9a0').multiplyScalar(6) });

/** レイキャスト専用の見えない面 */
export const invisible = new MeshBasicMaterial({ visible: false });

const highlighted = new WeakMap<Material, Material>();

/**
 * ホバー中の物体に使う、ほんのり発光したマテリアル(元ごとに 1 つだけ作る)。
 * 低性能モードでは輪郭線の代わりにこれだけで「光る」を表す。
 */
export function highlightOf(m: Material): Material {
  const cached = highlighted.get(m);
  if (cached) return cached;
  let h: Material = m;
  if (m instanceof MeshStandardMaterial) {
    const c = m.clone();
    c.emissive = new Color('#ff9a40');
    c.emissiveIntensity = 0.28;
    h = c;
  }
  highlighted.set(m, h);
  return h;
}
