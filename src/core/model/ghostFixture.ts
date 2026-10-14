import type { Ghost } from './ghost';
import { GHOST_STRIDE } from './ghost';

/**
 * テスト用:歩く機体らしいゴースト(前進+上下動+揺れ+接地のノイズ)を決定論的に作る。
 * ノイズは実際の試走より大きめにしてあり、共有 URL の長さの見積もりを厳しめにする。
 */
export function syntheticWalkGhost(seconds = 30, hz = 10, seed = 1): Ghost {
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32 - 0.5;
  };
  const frames: number[] = [];
  const n = Math.round(seconds * hz) + 1;
  const TAU = Math.PI * 2;
  for (let k = 0; k < n; k++) {
    const t = k / hz;
    const x = 0.12 * t + 0.01 * Math.sin(TAU * 1.4 * t) + 0.002 * rnd();
    const y = 0.32 + 0.012 * Math.sin(TAU * 2.8 * t) + 0.003 * rnd();
    const z = 0.002 * t + 0.001 * rnd();
    const pitch = 0.04 * Math.sin(TAU * 1.4 * t + 0.3) + 0.01 * rnd();
    const roll = 0.03 * Math.sin(TAU * 2.8 * t) + 0.01 * rnd();
    const yaw = 0.01 * t + 0.005 * rnd();
    // 向き = yaw(y 軸)· pitch(z 軸)· roll(x 軸)
    const q = mul(
      mul(axisAngle(0, 1, 0, yaw), axisAngle(0, 0, 1, pitch)),
      axisAngle(1, 0, 0, roll),
    );
    const theta = -4.19 * t + 0.02 * rnd();
    frames.push(x, y, z, q[0], q[1], q[2], q[3], theta);
  }
  if (frames.length !== n * GHOST_STRIDE) throw new Error('stride mismatch');
  return { hz, frames };
}

type Q = [number, number, number, number];

function axisAngle(ax: number, ay: number, az: number, a: number): Q {
  const s = Math.sin(a / 2);
  return [ax * s, ay * s, az * s, Math.cos(a / 2)];
}

function mul(a: Q, b: Q): Q {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
