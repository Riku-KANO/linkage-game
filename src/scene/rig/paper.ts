import { Matrix4, Vector4 } from 'three';
import { PAPER_DESIGN, PAPER_WORLD } from '../layout';
import { createPose, type CameraPose } from './pose';

/**
 * 製図用紙と画面の対応(設計画面に DOM / SVG の編集ビューを重ねるための計算)。
 */

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** 設計画面で紙の周りに空ける余白(CSS px)。道具パネルの置き場所 */
export const DEFAULT_PAPER_INSETS: Insets = { top: 80, right: 40, bottom: 40, left: 40 };

/** 設計画面のカメラの紙からの高さ(m)。平行投影なので見え方には影響せず、near/far だけに効く */
export const DESIGN_CAMERA_HEIGHT = 1.1;

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DesignRect {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

/**
 * 設計画面の定位置:紙の真上から真下を見る平行投影。画面の上 = ワールドの −z = 設計の +y。
 * 紙が余白(insets)を除いた領域にちょうど収まり、その中央に来るよう、画角と注視点を決める。
 */
export function designStationPose(
  viewWidth: number,
  viewHeight: number,
  insets: Insets = DEFAULT_PAPER_INSETS,
  out: CameraPose = createPose(),
): CameraPose {
  const w = Math.max(1, viewWidth);
  const h = Math.max(1, viewHeight);
  const availW = Math.max(1, w - insets.left - insets.right);
  const availH = Math.max(1, h - insets.top - insets.bottom);
  // 1 CSS px あたりのワールド長(m)
  const wpp =
    availW / availH > PAPER_WORLD.width / PAPER_WORLD.height
      ? PAPER_WORLD.height / availH
      : PAPER_WORLD.width / availW;
  const halfViewH = (h / 2) * wpp;
  const fov = (Math.atan(halfViewH / DESIGN_CAMERA_HEIGHT) * 360) / Math.PI;
  const [px, py, pz] = PAPER_WORLD.center;
  const cx = px - ((insets.left - insets.right) / 2) * wpp;
  const cz = pz - ((insets.top - insets.bottom) / 2) * wpp;
  out.position[0] = cx;
  out.position[1] = py + DESIGN_CAMERA_HEIGHT;
  out.position[2] = cz;
  out.target[0] = cx;
  out.target[1] = py;
  out.target[2] = cz;
  out.up[0] = 0;
  out.up[1] = 0;
  out.up[2] = -1;
  out.fov = fov;
  out.ortho = 1;
  return out;
}

const V = new Vector4();

/** ワールドの点を画面の CSS px(左上原点、y 下向き)へ写す */
export function projectToScreen(
  viewProj: Matrix4,
  x: number,
  y: number,
  z: number,
  viewWidth: number,
  viewHeight: number,
): [number, number] {
  V.set(x, y, z, 1).applyMatrix4(viewProj);
  const nx = V.x / V.w;
  const ny = V.y / V.w;
  return [((nx + 1) / 2) * viewWidth, ((1 - ny) / 2) * viewHeight];
}

/** 紙の 4 隅を写した画面上の外接矩形(CSS px) */
export function paperScreenRect(
  viewProj: Matrix4,
  viewWidth: number,
  viewHeight: number,
): ScreenRect {
  const [cx, cy, cz] = PAPER_WORLD.center;
  const hw = PAPER_WORLD.width / 2;
  const hh = PAPER_WORLD.height / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [dx, dz] of [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ] as const) {
    const [sx, sy] = projectToScreen(viewProj, cx + dx, cy, cz + dz, viewWidth, viewHeight);
    minX = Math.min(minX, sx);
    maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy);
    maxY = Math.max(maxY, sy);
  }
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

/** 設計座標(cm)→ 紙の上のワールド座標(m) */
export function designToWorld(x: number, y: number): [number, number, number] {
  const [cx, cy, cz] = PAPER_WORLD.center;
  const u = (x - PAPER_DESIGN.xMin) / (PAPER_DESIGN.xMax - PAPER_DESIGN.xMin);
  const v = (y - PAPER_DESIGN.yMin) / (PAPER_DESIGN.yMax - PAPER_DESIGN.yMin);
  return [cx + (u - 0.5) * PAPER_WORLD.width, cy, cz - (v - 0.5) * PAPER_WORLD.height];
}

/** 用紙の画面矩形と設計範囲から、設計座標(cm)→ 画面(CSS px) */
export function designToScreen(
  screen: ScreenRect,
  design: DesignRect,
  x: number,
  y: number,
): [number, number] {
  const u = (x - design.xMin) / (design.xMax - design.xMin);
  const v = (y - design.yMin) / (design.yMax - design.yMin);
  return [screen.left + u * screen.width, screen.top + (1 - v) * screen.height];
}

/** 画面(CSS px)→ 設計座標(cm) */
export function screenToDesign(
  screen: ScreenRect,
  design: DesignRect,
  sx: number,
  sy: number,
): [number, number] {
  const u = (sx - screen.left) / screen.width;
  const v = 1 - (sy - screen.top) / screen.height;
  return [
    design.xMin + u * (design.xMax - design.xMin),
    design.yMin + v * (design.yMax - design.yMin),
  ];
}
