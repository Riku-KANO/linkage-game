import { describe, expect, it } from 'vitest';
import { Matrix4, OrthographicCamera, PerspectiveCamera, Vector3, Vector4 } from 'three';
import { blendedProjection, effectiveFov, rayFromNdc } from './projection';

const FOV = 40;
const ASPECT = 16 / 9;
const NEAR = 0.05;
const FAR = 60;
const FOCUS = 1.5;

function ndc(m: Matrix4, p: Vector3): Vector3 {
  const v = new Vector4(p.x, p.y, p.z, 1).applyMatrix4(m);
  return new Vector3(v.x / v.w, v.y / v.w, v.z / v.w);
}

const SAMPLES = [
  new Vector3(0.3, -0.2, -FOCUS),
  new Vector3(-0.5, 0.4, -0.7),
  new Vector3(0.9, 0.1, -3.2),
  new Vector3(-0.1, -0.6, -10),
];

describe('blendedProjection', () => {
  it('s = 0 は PerspectiveCamera と同じ行列', () => {
    const cam = new PerspectiveCamera(FOV, ASPECT, NEAR, FAR);
    const m = blendedProjection(new Matrix4(), FOV, ASPECT, NEAR, FAR, FOCUS, 0);
    m.elements.forEach((v, i) => expect(v).toBeCloseTo(cam.projectionMatrix.elements[i]!, 9));
  });

  it('s = 1 は注視距離の平面で同じ範囲が見える平行投影と同じ写り方', () => {
    const h = FOCUS * Math.tan((FOV * Math.PI) / 360);
    const ortho = new OrthographicCamera(-h * ASPECT, h * ASPECT, h, -h, NEAR, FAR);
    const m = blendedProjection(new Matrix4(), FOV, ASPECT, NEAR, FAR, FOCUS, 1);
    for (const p of SAMPLES) {
      const a = ndc(m, p);
      const b = ndc(ortho.projectionMatrix, p);
      expect(a.x).toBeCloseTo(b.x, 9);
      expect(a.y).toBeCloseTo(b.y, 9);
      expect(a.z).toBeCloseTo(b.z, 9);
    }
  });

  it('注視距離の平面上の点はどの s でも同じ画面位置', () => {
    const p = new Vector3(0.37, -0.21, -FOCUS);
    const ref = ndc(blendedProjection(new Matrix4(), FOV, ASPECT, NEAR, FAR, FOCUS, 0), p);
    for (const s of [0.1, 0.5, 0.9, 1]) {
      const q = ndc(blendedProjection(new Matrix4(), FOV, ASPECT, NEAR, FAR, FOCUS, s), p);
      expect(q.x).toBeCloseTo(ref.x, 9);
      expect(q.y).toBeCloseTo(ref.y, 9);
    }
  });

  it('near / far 平面はどの s でも −1 / +1 に写り、奥行きは単調', () => {
    for (const s of [0, 0.3, 0.7, 1]) {
      const m = blendedProjection(new Matrix4(), FOV, ASPECT, NEAR, FAR, FOCUS, s);
      expect(ndc(m, new Vector3(0, 0, -NEAR)).z).toBeCloseTo(-1, 6);
      expect(ndc(m, new Vector3(0, 0, -FAR)).z).toBeCloseTo(1, 6);
      let last = -Infinity;
      for (let d = NEAR; d <= FAR; d *= 1.5) {
        const z = ndc(m, new Vector3(0, 0, -d)).z;
        expect(z).toBeGreaterThan(last);
        last = z;
      }
    }
  });

  it('実効画角は s とともに 0 へ狭まる', () => {
    expect(effectiveFov(FOV, 0)).toBeCloseTo(FOV, 9);
    expect(effectiveFov(FOV, 0.5)).toBeLessThan(FOV);
    expect(effectiveFov(FOV, 1)).toBeCloseTo(0, 9);
  });
});

describe('rayFromNdc', () => {
  it('どの s でも、点を画面へ写して戻したレイがその点を通る', () => {
    const cam = new PerspectiveCamera();
    cam.position.set(0.4, 2.1, 1.3);
    cam.lookAt(0, 0.9, -0.5);
    cam.updateMatrixWorld(true);
    const world = [
      new Vector3(0, 0.9, -0.5),
      new Vector3(0.3, 0.92, -0.8),
      new Vector3(-0.6, 0.2, -1.4),
    ];
    const origin = new Vector3();
    const dir = new Vector3();
    for (const s of [0, 0.25, 0.6, 0.95, 1]) {
      const proj = blendedProjection(new Matrix4(), FOV, ASPECT, NEAR, FAR, 2.0, s);
      const inv = proj.clone().invert();
      const viewProj = proj.clone().multiply(cam.matrixWorldInverse);
      for (const p of world) {
        const n = ndc(viewProj, p);
        rayFromNdc(n.x, n.y, inv, cam.matrixWorld, origin, dir);
        const toP = p.clone().sub(origin);
        const along = toP.dot(dir);
        const miss = toP.sub(dir.clone().multiplyScalar(along)).length();
        expect(miss).toBeLessThan(1e-6);
        expect(along).toBeGreaterThan(0);
      }
    }
  });
});
