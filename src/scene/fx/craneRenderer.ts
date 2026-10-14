import {
  BoxGeometry,
  BufferAttribute,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import type { V3 } from '../rig/pose';
import { brass, darkMetal, steel } from '../env/materials';
import { rotate, type BodyPose } from './crane';
import type { FxModel } from './machineRenderer';
import { ASSEMBLY_PHASES, easeOutCubic, spanProgress } from './timeline';

/**
 * クレーンのフック(手続き生成):滑車の箱・真鍮の滑車・鉤・上へ消えていくワイヤーと、
 * 機体のフレームの前後に掛ける 2 本の吊り具。大きさは吊っている機械の縮尺に合わせる。
 * 毎フレームの更新は割り当てなし。
 */

/** 部品の寸法(実寸の機械に対する m。紙の上では機械と同じ縮尺で小さくなる) */
const HOOK = {
  blockSize: [0.16, 0.2, 0.12] as V3,
  blockY: 0.3,
  sheaveR: 0.075,
  shank: [0.12, 0.2] as [number, number],
  ringR: 0.06,
  tube: 0.016,
  cableR: 0.008,
  cableLength: 4.5,
  slingR: 0.0055,
  /** 降りてくる・上がっていく距離(機械の縮尺に対する m) */
  dropIn: 3.2,
  riseOut: 4,
} as const;

/** 下から上へ透明になっていくワイヤー(頂点の不透明度) */
function fadingCable(): BufferGeometry {
  const g = new CylinderGeometry(HOOK.cableR, HOOK.cableR, HOOK.cableLength, 5, 12, true);
  g.translate(0, HOOK.cableLength / 2, 0);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / HOOK.cableLength;
    colors[i * 4] = 0.16;
    colors[i * 4 + 1] = 0.13;
    colors[i * 4 + 2] = 0.11;
    colors[i * 4 + 3] = Math.max(0, 1 - t) ** 1.6;
  }
  g.setAttribute('color', new BufferAttribute(colors, 4));
  return g;
}

const UP = new Vector3(0, 1, 0);

export class CraneRenderer {
  readonly root = new Group();
  private readonly hook = new Group();
  private readonly slings: Mesh[];
  private readonly geometries: BufferGeometry[];
  private readonly cableMat: MeshBasicMaterial;
  private readonly a: V3 = [0, 0, 0];
  private readonly tmp: V3 = [0, 0, 0];
  private readonly va = new Vector3();
  private readonly vb = new Vector3();
  private readonly q = new Quaternion();

  constructor() {
    this.root.name = 'fx-crane';
    this.root.visible = false;
    const block = new BoxGeometry(...HOOK.blockSize);
    const sheave = new CylinderGeometry(HOOK.sheaveR, HOOK.sheaveR, HOOK.blockSize[2] * 1.15, 14);
    sheave.rotateX(Math.PI / 2);
    const shank = new CylinderGeometry(0.018, 0.018, HOOK.shank[1] - HOOK.shank[0], 8);
    // 開いた鉤:下 3/4 周の輪
    const ring = new TorusGeometry(HOOK.ringR, HOOK.tube, 6, 18, Math.PI * 1.5);
    ring.rotateZ(Math.PI * 0.75);
    const cable = fadingCable();
    const slingGeo = new CylinderGeometry(HOOK.slingR, HOOK.slingR, 1, 5, 1);
    this.geometries = [block, sheave, shank, ring, cable, slingGeo];
    this.cableMat = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    const blockMesh = new Mesh(block, darkMetal);
    blockMesh.position.y = HOOK.blockY;
    const sheaveMesh = new Mesh(sheave, brass);
    sheaveMesh.position.y = HOOK.blockY + HOOK.blockSize[1] * 0.25;
    const shankMesh = new Mesh(shank, steel);
    shankMesh.position.y = (HOOK.shank[0] + HOOK.shank[1]) / 2;
    const ringMesh = new Mesh(ring, steel);
    ringMesh.position.y = HOOK.ringR;
    const cableMesh = new Mesh(cable, this.cableMat);
    cableMesh.position.y = HOOK.blockY + HOOK.blockSize[1] / 2;
    cableMesh.renderOrder = 2;
    for (const m of [blockMesh, sheaveMesh, shankMesh, ringMesh]) m.castShadow = true;
    this.hook.add(blockMesh, sheaveMesh, shankMesh, ringMesh, cableMesh);
    this.slings = [0, 1].map(() => {
      const m = new Mesh(slingGeo, darkMetal);
      m.visible = false;
      return m;
    });
    this.root.add(this.hook, ...this.slings);
    this.root.traverse((o) => (o.raycast = () => {}));
  }

  /**
   * level の姿:フックは組み上げの終わりに降りてきて掛かり、運び、着地のあとで外れて上がる。
   * hook は吊り点(ワールド)、pose は機体の姿勢。
   */
  update(level: number, hook: V3, pose: BodyPose, model: FxModel | null, visible: boolean) {
    const P = ASSEMBLY_PHASES;
    const on =
      visible && !!model && !model.empty && level > P.hookIn.start && level < P.hookOut.end;
    this.root.visible = on;
    if (!on || !model) return;
    // フックの大きさは機械の大きさに合わせる(小さな機械に大きなフックを掛けない)
    const s = pose.scale * Math.min(1.2, Math.max(0.3, model.frame.radius / 1.2));
    let dy = 0;
    if (level < P.hookIn.end) {
      dy = HOOK.dropIn * s * (1 - easeOutCubic(spanProgress(level, P.hookIn)));
    } else if (level > P.hookOut.start) {
      const p = spanProgress(level, P.hookOut);
      dy = HOOK.riseOut * s * p * p * p;
    }
    this.hook.position.set(hook[0], hook[1] + dy, hook[2]);
    this.hook.scale.setScalar(s);
    // 吊り具:フックの先からフレームの前後の端へ
    const attached = level >= P.hookIn.end && level <= P.hookOut.start;
    const fz = model.layout.frameZ;
    for (let i = 0; i < 2; i++) {
      const sling = this.slings[i]!;
      sling.visible = attached && fz.length > 0;
      if (!sling.visible) continue;
      const lz = i === 0 ? fz[0]! : fz[fz.length - 1]!;
      this.tmp[0] = model.frame.attach[0];
      this.tmp[1] = model.frameTop;
      this.tmp[2] = lz;
      rotate(pose.quaternion, this.tmp, this.a);
      this.va.set(
        pose.position[0] + s * this.a[0],
        pose.position[1] + s * this.a[1],
        pose.position[2] + s * this.a[2],
      );
      this.vb.set(hook[0], hook[1] + dy, hook[2]);
      const len = this.va.distanceTo(this.vb);
      sling.position.copy(this.va).add(this.vb).multiplyScalar(0.5);
      this.vb.sub(this.va).normalize();
      sling.quaternion.copy(this.q.setFromUnitVectors(UP, this.vb));
      sling.scale.set(s, Math.max(1e-4, len), s);
    }
  }

  dispose() {
    this.geometries.forEach((g) => g.dispose());
    this.cableMat.dispose();
    this.root.removeFromParent();
  }
}
