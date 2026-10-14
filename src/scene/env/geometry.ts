import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
  type ColorRepresentation,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 手続き生成のローポリ形状。小さな部品をまとめて 1 つの BufferGeometry(頂点色つき)にし、
 * 描画呼び出しを減らす。乱数はシード付き(決定論的)。
 */

/** シード付き乱数(mulberry32)。0..1 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Part {
  geometry: BufferGeometry;
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: readonly [number, number, number];
  color: ColorRepresentation;
}

const M = new Matrix4();
const Q = new Quaternion();
const E = new Euler();
const P = new Vector3();
const S = new Vector3();
const C = new Color();

/** 部品を変換・着色して 1 つのジオメトリにまとめる(元のジオメトリは破棄する) */
export function mergeParts(parts: Part[]): BufferGeometry {
  const geos = parts.map((p) => {
    const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone();
    p.geometry.dispose();
    E.set(...(p.rotation ?? [0, 0, 0]));
    Q.setFromEuler(E);
    P.set(...(p.position ?? [0, 0, 0]));
    S.set(...(p.scale ?? [1, 1, 1]));
    g.applyMatrix4(M.compose(P, Q, S));
    C.set(p.color);
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = C.r;
      colors[i * 3 + 1] = C.g;
      colors[i * 3 + 2] = C.b;
    }
    g.setAttribute('color', new BufferAttribute(colors, 3));
    // uv は使わない(属性を揃えるため消す)
    g.deleteAttribute('uv');
    return g;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  merged.computeBoundingSphere();
  return merged;
}

/** 直方体の部品(中心・寸法で指定) */
export function box(
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  color: ColorRepresentation,
  rotation?: readonly [number, number, number],
): Part {
  return {
    geometry: new BoxGeometry(size[0], size[1], size[2]),
    position,
    color,
    ...(rotation ? { rotation } : {}),
  };
}

/** 円柱の部品(軸は y) */
export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  position: readonly [number, number, number],
  color: ColorRepresentation,
  segments = 8,
  rotation?: readonly [number, number, number],
): Part {
  return {
    geometry: new CylinderGeometry(radiusTop, radiusBottom, height, segments),
    position,
    color,
    ...(rotation ? { rotation } : {}),
  };
}

/** 2 点を結ぶ角棒(太さ w、厚み t)。棒の長手方向は a→b */
export function barBetween(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  w: number,
  t: number,
  color: ColorRepresentation,
): Part {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const g = new BoxGeometry(len, w, t);
  // +x を a→b に向ける
  const dir = new Vector3(dx, dy, dz).normalize();
  const q = new Quaternion().setFromUnitVectors(new Vector3(1, 0, 0), dir);
  const e = new Euler().setFromQuaternion(q);
  return {
    geometry: g,
    position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    rotation: [e.x, e.y, e.z],
    color,
  };
}

/** 色を少しばらつかせる(木目・板の違い) */
export function jitterColor(base: ColorRepresentation, rnd: () => number, amount = 0.06): Color {
  const c = new Color(base);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h + (rnd() - 0.5) * amount * 0.3, hsl.s, hsl.l * (1 + (rnd() - 0.5) * amount * 2));
  return c;
}
