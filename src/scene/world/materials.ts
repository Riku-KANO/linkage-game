import { BackSide, Color, MeshBasicMaterial, MeshStandardMaterial } from 'three';

/**
 * world の共有マテリアル。目印はインスタンスごとの色(setColorAt)で塗り分けるので、
 * 基本色は白にしておく。光る部分(遊べる目印・ホバーの輪郭)は MeshBasicMaterial の明るい色で、
 * 通常モードではブルームで滲み、低性能モードでもそのまま明るく見える(光源は足さない)。
 */

/** 目印の台座・メダルの粒(インスタンスの色) */
export const markerMat = new MeshStandardMaterial({
  color: '#ffffff',
  roughness: 0.45,
  metalness: 0.35,
  flatShading: true,
});

/** 旗・竿・南京錠(インスタンスの色) */
export const propMat = new MeshStandardMaterial({
  color: '#ffffff',
  roughness: 0.6,
  metalness: 0.15,
  flatShading: true,
});

/** 遊べる目印の光(輪と浮かぶ菱形) */
export const glowMat = new MeshBasicMaterial({ color: new Color('#ff9a3a').multiplyScalar(1.5) });

/** ホバーの輪郭(裏面だけを描いた一回り大きい形) */
export const hullMat = new MeshBasicMaterial({
  color: new Color('#ffb35c').multiplyScalar(1.6),
  side: BackSide,
});

/** 選んだステージの輪 */
export const ringMat = new MeshBasicMaterial({ color: new Color('#e8f4ff').multiplyScalar(1.2) });

/** 棚のまだクリアしていない章の影絵 */
export const silhouetteMat = new MeshBasicMaterial({ color: '#211913' });

/** 図鑑の額の札・中身(テクスチャは描画側で入れる) */
export const MEDAL_COLORS = {
  gold: '#f0c24a',
  silver: '#cfd5dc',
  bronze: '#c07a43',
  none: '#3a312a',
} as const;

export const MARKER_COLORS = {
  locked: '#5b544c',
  playable: '#f2c374',
  cleared: '#c9a24a',
} as const;
