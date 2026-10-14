import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  type BufferGeometry,
  type Material,
} from 'three';
import type { DesignDoc } from '@/core/model/types';
import { CM } from '@/core/model/types';
import { mirrorDesignX } from '@/core/kinematics/legs';
import {
  buildMachineLayout,
  plateOutline,
  type MachineLayout,
  type PlatePart,
} from '@/testrun/layout';
import { extrude } from '@/testrun/MachineModel';
import { getMachineMaterials, MACHINE_PALETTE } from '@/testrun/materials';
import type { V3 } from '../rig/pose';
import {
  bodyPoseAt,
  createBodyPose,
  createCraneScratch,
  defaultPaperMapping,
  machineFrame,
  type BodyPose,
  type CraneInput,
  type MachineFrame,
  type PaperMapping,
  type Q4,
} from './crane';
import { buildLegSweeps, sampleSweep, type LegSweeps } from './poses';
import {
  ASSEMBLY_PHASES,
  easeInOut,
  easeOutCubic,
  partRise,
  PIN_POP,
  planAssembly,
  smoothstep,
  spanProgress,
  type AssemblyPlan,
  type PartRise,
} from './timeline';

/**
 * 組み上げ演出の機械(three のオブジェクトを直接持つ。React の外)。
 *
 * 試走の描画(testrun の MachineModel)と同じ部品配置(buildMachineLayout)・同じ形・同じマテリアル・
 * 同じ色で描くので、組み上がってコースに降りた瞬間の姿は MachineModel と一致する(引き継いでも跳ばない)。
 * 違いは、部品ごと・組ごとに演出の変換をはさむこと:
 *
 *   部品の行列 = 組の変換 X_k(奥行きへ滑り出す・反転した組は軸の回りに回り込む)
 *              × 立ち上がりの変換 H_i(図面の最も低い線を蝶番に 90° 起き上がる・厚みが付く)
 *              × 部品の行列(MachineModel と同じ。組の z は 0)
 *
 * 機体全体の姿勢(紙の上 → 吊られて窓の外 → コース)は外側の group に入れる。
 * 毎フレームの更新は割り当てなし(行列・作業用の配列は作るときに用意する)。
 */

/** 着地点の試走の機体(ワールド)。統合側のスナップショットから毎フレーム写す */
export interface TrackPose {
  position: V3;
  quaternion: Q4;
  /** 組ごとの脚の姿勢(設計座標 cm)。形が合わなければ null */
  legs: Float64Array[] | null;
  motorAngle: number;
}

export function createTrackPose(): TrackPose {
  return { position: [0, 0, 0], quaternion: [0, 0, 0, 1], legs: null, motorAngle: 0 };
}

interface PlateGroup {
  plate: PlatePart;
  instances: number[];
  mesh: InstancedMesh;
  ax: number;
  ay: number;
  angle: number;
}

/** 設計ごとに作るもの(形・メッシュ・時間割・脚の姿勢の表) */
export interface FxModel {
  design: DesignDoc;
  layout: MachineLayout;
  sweeps: LegSweeps;
  plan: AssemblyPlan;
  frame: MachineFrame;
  K: number;
  group: Group;
  bars: InstancedMesh | null;
  bosses: InstancedMesh | null;
  pins: InstancedMesh | null;
  feet: InstancedMesh | null;
  plates: PlateGroup[];
  frames: InstancedMesh | null;
  shafts: InstancedMesh | null;
  motor: { housing: Mesh; cap: Mesh; hub: Group } | null;
  foot: number;
  footPin: { zMin: number; zMax: number } | null;
  /** フレーム板の輪郭の中心(拡大の中心) */
  frameCenter: [number, number];
  /** フレーム板の輪郭の一番上(吊り具を掛ける高さ) */
  frameTop: number;
  /** 組ごとの今の脚の姿勢(cm) */
  legs: Float64Array[];
  /** 演出に部品がない(空の設計) */
  empty: boolean;
  disposables: BufferGeometry[];
}

function instanced(
  geometry: BufferGeometry,
  material: Material,
  count: number,
): InstancedMesh | null {
  if (count <= 0) return null;
  const m = new InstancedMesh(geometry, material, count);
  m.instanceMatrix.setUsage(DynamicDrawUsage);
  m.frustumCulled = false;
  return m;
}

/** 設計から演出の機械を作る(演出の開始時・設計が変わったときだけ) */
export function buildFxModel(design: DesignDoc): FxModel {
  const layout = buildMachineLayout(design);
  const sweeps = buildLegSweeps(design);
  const K = layout.instances.length;
  const n = layout.jointCount;
  const nb = layout.bars.length;
  const np = layout.pins.length;
  const mats = getMachineMaterials();
  const disposables: BufferGeometry[] = [];
  const group = new Group();
  group.name = 'fx-machine';

  const normalPos = design.joints.flatMap((j) => [j.x, j.y]);
  const mirroredPos = layout.instances.some((i) => i.mirrored)
    ? mirrorDesignX(design).joints.flatMap((j) => [j.x, j.y])
    : null;

  const box = new BoxGeometry(1, 1, 1);
  const cyl = new CylinderGeometry(1, 1, 1, 18, 1).rotateX(Math.PI / 2);
  disposables.push(box, cyl);

  const bars = instanced(box, mats.wood, nb * K);
  const bosses = instanced(cyl, mats.wood, nb * K * 2);
  const pins = instanced(cyl, mats.steel, np * K);
  const foot = design.foot ? design.joints.findIndex((j) => j.id === design.foot) : -1;
  const footPin = layout.pins.find((p) => p.joint === foot) ?? null;
  const feet = foot >= 0 ? instanced(cyl, mats.rubber, K) : null;

  // 色(MachineModel と同じ:棒は木、クランクは赤茶、プレートは濃い木)
  const wood = new Color(MACHINE_PALETTE.wood);
  const plate = new Color(MACHINE_PALETTE.plate);
  const crank = new Color(MACHINE_PALETTE.crank);
  for (let k = 0; k < K; k++) {
    for (let bi = 0; bi < nb; bi++) {
      const c = layout.bars[bi]!.crank ? crank : wood;
      bars?.setColorAt(k * nb + bi, c);
      bosses?.setColorAt((k * nb + bi) * 2, c);
      bosses?.setColorAt((k * nb + bi) * 2 + 1, c);
    }
  }

  const plates: PlateGroup[] = [];
  for (const p of layout.plates) {
    for (const mirrored of [false, true]) {
      const instances = layout.instances.flatMap((inst, k) =>
        inst.mirrored === mirrored ? [k] : [],
      );
      if (instances.length === 0) continue;
      const pos = mirrored && mirroredPos ? mirroredPos : normalPos;
      const geometry = extrude(
        plateOutline(pos, p.joints, layout.barWidth / 2),
        layout.barThickness,
      );
      disposables.push(geometry);
      const mesh = instanced(geometry, mats.wood, instances.length)!;
      const c = p.crank ? crank : plate;
      for (let s = 0; s < instances.length; s++) mesh.setColorAt(s, c);
      const ax = pos[p.a * 2]! * CM;
      const ay = pos[p.a * 2 + 1]! * CM;
      const bx = pos[p.b * 2]! * CM;
      const by = pos[p.b * 2 + 1]! * CM;
      plates.push({ plate: p, instances, mesh, ax, ay, angle: Math.atan2(by - ay, bx - ax) });
    }
  }

  // 胴体
  const frameGeo =
    layout.frameOutline.length >= 3 ? extrude(layout.frameOutline, layout.barThickness) : null;
  if (frameGeo) disposables.push(frameGeo);
  const frames = frameGeo ? instanced(frameGeo, mats.frame, layout.frameZ.length) : null;
  const shafts = instanced(cyl, mats.steel, layout.fixedJoints.length);
  let fcx = 0;
  let fcy = 0;
  let frameTop = -Infinity;
  for (const p of layout.frameOutline) {
    fcx += p.x;
    fcy += p.y;
    frameTop = Math.max(frameTop, p.y);
  }
  if (layout.frameOutline.length > 0) {
    fcx /= layout.frameOutline.length;
    fcy /= layout.frameOutline.length;
  }
  let motor: FxModel['motor'] = null;
  const w = layout.barWidth;
  if (layout.motorJoint >= 0) {
    const housingDepth = Math.max(0.05, layout.slot * 0.4);
    const housingGeo = new BoxGeometry(w * 2.8, w * 2.8, housingDepth);
    disposables.push(housingGeo);
    const mx = normalPos[layout.motorJoint * 2]! * CM;
    const my = normalPos[layout.motorJoint * 2 + 1]! * CM;
    const housing = new Mesh(housingGeo, mats.frame);
    housing.position.set(mx, my, layout.shaftZ[0] - housingDepth / 2);
    const cap = new Mesh(cyl, mats.brass);
    cap.position.set(mx, my, layout.shaftZ[0] - housingDepth - w * 0.15);
    cap.scale.set(w * 1.05, w * 1.05, w * 0.3);
    const hub = new Group();
    hub.position.set(mx, my, layout.shaftZ[1] + w * 0.2);
    const hubCyl = new Mesh(cyl, mats.brass);
    hubCyl.scale.set(w * 1.3, w * 1.3, w * 0.4);
    const hubArm = new Mesh(box, mats.frame);
    hubArm.position.set(w * 0.7, 0, w * 0.22);
    hubArm.scale.set(w * 1.2, w * 0.35, w * 0.12);
    hub.add(hubCyl, hubArm);
    motor = { housing, cap, hub };
    group.add(housing, cap, hub);
  }
  for (const m of [bars, bosses, pins, feet, frames, shafts, ...plates.map((p) => p.mesh)]) {
    if (m) group.add(m);
  }
  for (const m of [bars, bosses, ...plates.map((p) => p.mesh)]) {
    if (m?.instanceColor) m.instanceColor.needsUpdate = true;
  }

  const frame = machineFrame(layout, normalPos);
  const plan = planAssembly(
    {
      links: layout.linkIds.map((_, li) => {
        const bar = layout.bars.find((b) => b.link === li);
        if (bar) return [bar.a, bar.b];
        return layout.plates.find((p) => p.link === li)?.joints ?? [];
      }),
      crankLinks: [...layout.bars, ...layout.plates].filter((p) => p.crank).map((p) => p.link),
      fixedJoints: layout.fixedJoints,
      jointCount: n,
      instances: layout.instances,
    },
    layout.frameZ.length,
  );
  return {
    design,
    layout,
    sweeps,
    plan,
    frame,
    K,
    group,
    bars,
    bosses,
    pins,
    feet,
    plates,
    frames,
    shafts,
    motor,
    foot,
    footPin,
    frameCenter: [fcx, fcy],
    frameTop: Number.isFinite(frameTop) ? frameTop : frame.attach[1],
    legs: layout.instances.map(() => new Float64Array(n * 2)),
    empty: nb + layout.plates.length === 0,
    disposables,
  };
}

export function disposeFxModel(m: FxModel): void {
  m.disposables.forEach((g) => g.dispose());
  m.group.removeFromParent();
}

// ---------------------------------------------------------------------------
// 行列(列優先の要素を直接書く)
// ---------------------------------------------------------------------------

/** z 軸回りの回転 (c, s)・拡大 (sx, sy, sz)・平行移動 */
function setTRS(
  m: Matrix4,
  c: number,
  s: number,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
) {
  const e = m.elements;
  e[0] = c * sx;
  e[1] = s * sx;
  e[2] = 0;
  e[3] = 0;
  e[4] = -s * sy;
  e[5] = c * sy;
  e[6] = 0;
  e[7] = 0;
  e[8] = 0;
  e[9] = 0;
  e[10] = sz;
  e[11] = 0;
  e[12] = x;
  e[13] = y;
  e[14] = z;
  e[15] = 1;
}

/**
 * 立ち上がり:y = hingeY, z = 0 を通る x 軸の回りに angle 回し、厚み(z)を th 倍、上へ hop 浮かす。
 * angle = −π/2 で機構の平面が紙(水平)に寝る。
 */
function setHinge(m: Matrix4, hingeY: number, angle: number, th: number, hop: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const e = m.elements;
  e[0] = 1;
  e[1] = 0;
  e[2] = 0;
  e[3] = 0;
  e[4] = 0;
  e[5] = c;
  e[6] = s;
  e[7] = 0;
  e[8] = 0;
  e[9] = -s * th;
  e[10] = c * th;
  e[11] = 0;
  e[12] = 0;
  e[13] = hingeY - c * hingeY + hop;
  e[14] = -s * hingeY;
  e[15] = 1;
}

/** 組:z だけ滑らせ、反転した組は x = axis の縦軸回りに yaw 回す */
function setInstance(m: Matrix4, z: number, yaw: number, axis: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const e = m.elements;
  e[0] = c;
  e[1] = 0;
  e[2] = -s;
  e[3] = 0;
  e[4] = 0;
  e[5] = 1;
  e[6] = 0;
  e[7] = 0;
  e[8] = s;
  e[9] = 0;
  e[10] = c;
  e[11] = 0;
  e[12] = axis - c * axis;
  e[13] = 0;
  e[14] = z + s * axis;
  e[15] = 1;
}

const ZERO16 = new Float32Array(16);

/** 紙に寝た部品と紙の隙間(機体ローカルの m。紙の上の縮尺で 1mm 弱) */
const FLAT_GAP = 0.002;

function hide(arr: Float32Array, i: number) {
  arr.set(ZERO16, i * 16);
}

// ---------------------------------------------------------------------------

/** 演出の機械を毎フレーム動かす(1 つだけ作って使い回す) */
export class FxMachineRenderer {
  readonly root = new Group();
  /** 機体の姿勢(ワールド)を入れる group */
  private readonly body = new Group();
  model: FxModel | null = null;
  readonly crane: CraneInput = {
    paper: defaultPaperMapping(),
    frame: { hingeY: 0, attach: [0, 0, 0], center: [0, 0, 0], radius: 0.5, height: 0.5 },
    paperLift: 0,
    trackPosition: [0, 0, 0],
    trackQuaternion: [0, 0, 0, 1],
  };
  readonly pose: BodyPose = createBodyPose();
  /** フックの位置(ワールド) */
  readonly hook: V3 = [0, 0, 0];
  private readonly sc = createCraneScratch();
  private readonly rise: PartRise = { angle: 0, hop: 0, thickness: 1 };
  private hinges: Matrix4[] = [];
  private readonly mX = new Matrix4();
  private readonly mL = new Matrix4();
  private readonly mA = new Matrix4();
  private readonly mB = new Matrix4();
  /** 組ごとの今の z・回り込み・見えるか */
  private instZ = new Float64Array(0);
  private instYaw = new Float64Array(0);
  private instVisible = new Uint8Array(0);

  constructor() {
    this.root.name = 'fx-machine-root';
    this.root.add(this.body);
    this.root.visible = false;
  }

  /** 設計の機械に作り替える(同じ設計なら何もしない) */
  setDesign(design: DesignDoc): FxModel {
    if (this.model?.design === design) return this.model;
    if (this.model) disposeFxModel(this.model);
    const m = buildFxModel(design);
    this.model = m;
    this.body.add(m.group);
    const nLinks = m.layout.linkIds.length;
    this.hinges = Array.from({ length: nLinks }, () => new Matrix4());
    this.instZ = new Float64Array(m.K);
    this.instYaw = new Float64Array(m.K);
    this.instVisible = new Uint8Array(m.K);
    this.crane.frame = m.frame;
    return m;
  }

  setPaperMapping(p: PaperMapping) {
    this.crane.paper = p;
  }

  /** 着地点(試走の最初の姿勢)。null なら既定の置き場所(sweeps から求めた高さ) */
  setTrack(track: TrackPose) {
    const c = this.crane;
    c.trackPosition[0] = track.position[0];
    c.trackPosition[1] = track.position[1];
    c.trackPosition[2] = track.position[2];
    c.trackQuaternion[0] = track.quaternion[0];
    c.trackQuaternion[1] = track.quaternion[1];
    c.trackQuaternion[2] = track.quaternion[2];
    c.trackQuaternion[3] = track.quaternion[3];
  }

  setShadows(on: boolean) {
    const m = this.model;
    if (!m) return;
    m.group.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = on;
        o.receiveShadow = on;
      }
    });
  }

  /**
   * 組み上がり具合 level(0..1)の姿を描く。track は着地点の試走の機体(脚の姿勢を最後に合わせる)。
   */
  update(level: number, track: TrackPose, visible: boolean): void {
    const m = this.model;
    this.root.visible = visible && !!m && !m.empty;
    if (!m) return;
    const P = ASSEMBLY_PHASES;
    const { layout, plan, sweeps, K } = m;
    const n2 = sweeps.n2;

    // 脚の姿勢と組の変換
    const live = smoothstep(0, 1, spanProgress(level, P.live));
    const liveLegs =
      track.legs && track.legs.length === K && track.legs[0]?.length === n2 ? track.legs : null;
    let minY = Infinity;
    for (let k = 0; k < K; k++) {
      const span = plan.instances[k]!;
      const s = easeInOut(spanProgress(level, span));
      const legs = m.legs[k]!;
      sampleSweep(sweeps, k, s, legs);
      if (liveLegs && live > 0) {
        const src = liveLegs[k]!;
        for (let j = 0; j < n2; j++) legs[j] = legs[j]! + (src[j]! - legs[j]!) * live;
      }
      const inst = layout.instances[k]!;
      this.instZ[k] = inst.z * s;
      this.instYaw[k] = inst.mirrored ? Math.PI * (1 - s) : 0;
      const vis = k === plan.primary || level >= span.start ? 1 : 0;
      this.instVisible[k] = vis;
      if (vis && level < P.duplicate.end) {
        for (let j = 1; j < n2; j += 2) minY = Math.min(minY, legs[j]! * CM);
      }
    }
    // 紙の上:脚が紙にめり込まない高さ(複製が終わったら最後の姿勢の値で固定し、経路を動かさない)
    const fixedLift = Math.max(0, m.frame.hingeY - sweeps.restMinY);
    this.crane.paperLift =
      level >= P.duplicate.end || !Number.isFinite(minY)
        ? fixedLift
        : Math.max(0, m.frame.hingeY - minY);

    // 機体の姿勢
    bodyPoseAt(level, this.crane, this.sc, this.pose, this.hook);
    const b = this.body;
    b.position.set(this.pose.position[0], this.pose.position[1], this.pose.position[2]);
    b.quaternion.set(
      this.pose.quaternion[0],
      this.pose.quaternion[1],
      this.pose.quaternion[2],
      this.pose.quaternion[3],
    );
    b.scale.setScalar(this.pose.scale);

    // 立ち上がり(リンクごと)
    const yH = m.frame.hingeY;
    const hopH = layout.barWidth * 2.5;
    // 寝ているとき、どの層の部品も紙の上に載るよう持ち上げる量(厚みの倍率をかける前)
    const flatLift = -(layout.layerZ[0] ?? 0) + layout.barThickness / 2;
    for (let li = 0; li < this.hinges.length; li++) {
      const r = partRise(level, plan.parts[li]!, this.rise);
      const lift = Math.max(0, -Math.sin(r.angle)) * (flatLift * r.thickness + FLAT_GAP);
      setHinge(this.hinges[li]!, yH, r.angle, r.thickness, r.hop * hopH + lift);
    }
    this.poseParts(m, level);
    this.poseChassis(m, level, live * track.motorAngle);
  }

  private poseParts(m: FxModel, level: number) {
    const { layout, K } = m;
    const nb = layout.bars.length;
    const np = layout.pins.length;
    const w = layout.barWidth;
    const t = layout.barThickness;
    const axis = m.sweeps.mirrorAxis * CM;
    const barArr = m.bars?.instanceMatrix.array as Float32Array | undefined;
    const bossArr = m.bosses?.instanceMatrix.array as Float32Array | undefined;
    const pinArr = m.pins?.instanceMatrix.array as Float32Array | undefined;
    const footArr = m.feet?.instanceMatrix.array as Float32Array | undefined;
    const { mX, mL, mA, mB } = this;
    for (let k = 0; k < K; k++) {
      const pos = m.legs[k]!;
      const vis = this.instVisible[k] === 1;
      setInstance(mX, this.instZ[k]!, this.instYaw[k]!, axis);
      for (let bi = 0; bi < nb; bi++) {
        const bar = layout.bars[bi]!;
        const idx = k * nb + bi;
        if (!vis) {
          if (barArr) hide(barArr, idx);
          if (bossArr) {
            hide(bossArr, idx * 2);
            hide(bossArr, idx * 2 + 1);
          }
          continue;
        }
        const ax = pos[bar.a * 2]! * CM;
        const ay = pos[bar.a * 2 + 1]! * CM;
        const bx = pos[bar.b * 2]! * CM;
        const by = pos[bar.b * 2 + 1]! * CM;
        const dx = bx - ax;
        const dy = by - ay;
        const L = Math.hypot(dx, dy);
        const c = L > 1e-9 ? dx / L : 1;
        const s = L > 1e-9 ? dy / L : 0;
        const z = layout.layerZ[bar.layer]!;
        mA.multiplyMatrices(mX, this.hinges[bar.link]!);
        if (barArr) {
          setTRS(mL, c, s, Math.max(L, 1e-4), w, t, (ax + bx) / 2, (ay + by) / 2, z);
          mB.multiplyMatrices(mA, mL).toArray(barArr, idx * 16);
        }
        if (bossArr) {
          setTRS(mL, 1, 0, w / 2, w / 2, t, ax, ay, z);
          mB.multiplyMatrices(mA, mL).toArray(bossArr, idx * 2 * 16);
          setTRS(mL, 1, 0, w / 2, w / 2, t, bx, by, z);
          mB.multiplyMatrices(mA, mL).toArray(bossArr, (idx * 2 + 1) * 16);
        }
      }
      if (pinArr) {
        for (let pi = 0; pi < np; pi++) {
          const pin = layout.pins[pi]!;
          const idx = k * np + pi;
          const lock = m.plan.pinLock[pin.joint] ?? 0;
          const pop = vis
            ? easeOutCubic(spanProgress(level, { start: lock, end: lock + PIN_POP }))
            : 0;
          if (pop <= 0) {
            hide(pinArr, idx);
            continue;
          }
          const r = layout.pinRadius * pop;
          setTRS(
            mL,
            1,
            0,
            r,
            r,
            (pin.zMax - pin.zMin) * pop,
            pos[pin.joint * 2]! * CM,
            pos[pin.joint * 2 + 1]! * CM,
            (pin.zMin + pin.zMax) / 2,
          );
          mB.multiplyMatrices(mX, mL).toArray(pinArr, idx * 16);
        }
      }
      if (footArr && m.foot >= 0) {
        const lock = m.plan.pinLock[m.foot] ?? 0;
        const pop = vis
          ? easeOutCubic(spanProgress(level, { start: lock, end: lock + PIN_POP }))
          : 0;
        if (pop <= 0) hide(footArr, k);
        else {
          const pin = m.footPin;
          const len = pin ? pin.zMax - pin.zMin : t * 2;
          const zc = pin ? (pin.zMin + pin.zMax) / 2 : 0;
          setTRS(
            mL,
            1,
            0,
            w * 0.5 * pop,
            w * 0.5 * pop,
            len * 0.9 * pop,
            pos[m.foot * 2]! * CM,
            pos[m.foot * 2 + 1]! * CM,
            zc,
          );
          mB.multiplyMatrices(mX, mL).toArray(footArr, k * 16);
        }
      }
    }
    for (const g of m.plates) {
      const arr = g.mesh.instanceMatrix.array as Float32Array;
      for (let slot = 0; slot < g.instances.length; slot++) {
        const k = g.instances[slot]!;
        if (this.instVisible[k] !== 1) {
          hide(arr, slot);
          continue;
        }
        const pos = m.legs[k]!;
        const ax = pos[g.plate.a * 2]! * CM;
        const ay = pos[g.plate.a * 2 + 1]! * CM;
        const bx = pos[g.plate.b * 2]! * CM;
        const by = pos[g.plate.b * 2 + 1]! * CM;
        const phi = Math.atan2(by - ay, bx - ax) - g.angle;
        const c = Math.cos(phi);
        const s = Math.sin(phi);
        const px = ax - (c * g.ax - s * g.ay);
        const py = ay - (s * g.ax + c * g.ay);
        setInstance(mX, this.instZ[k]!, this.instYaw[k]!, axis);
        mA.multiplyMatrices(mX, this.hinges[g.plate.link]!);
        setTRS(mL, c, s, 1, 1, 1, px, py, layout.layerZ[g.plate.layer]!);
        mB.multiplyMatrices(mA, mL).toArray(arr, slot * 16);
      }
      g.mesh.instanceMatrix.needsUpdate = true;
    }
    for (const mesh of [m.bars, m.bosses, m.pins, m.feet]) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private poseChassis(m: FxModel, level: number, hubAngle: number) {
    const { layout } = m;
    const P = ASSEMBLY_PHASES;
    const fa = m.frames?.instanceMatrix.array as Float32Array | undefined;
    const [cx, cy] = m.frameCenter;
    const drop = layout.barWidth * 6;
    if (fa && m.frames) {
      layout.frameZ.forEach((fz, i) => {
        const e = easeOutCubic(spanProgress(level, m.plan.frames[i] ?? P.chassis));
        if (e <= 0) {
          hide(fa, i);
          return;
        }
        const el = this.mL.elements;
        el.fill(0);
        el[0] = e;
        el[5] = e;
        el[10] = e;
        el[12] = cx - e * cx;
        el[13] = cy - e * cy + drop * (1 - e);
        el[14] = fz;
        el[15] = 1;
        this.mL.toArray(fa, i * 16);
      });
      m.frames.instanceMatrix.needsUpdate = true;
    }
    const chassis = easeOutCubic(spanProgress(level, P.chassis));
    const sa = m.shafts?.instanceMatrix.array as Float32Array | undefined;
    if (sa && m.shafts) {
      const [z0, z1] = layout.shaftZ;
      const r = layout.pinRadius * 1.35;
      const p = m.sweeps.start[0];
      layout.fixedJoints.forEach((j, i) => {
        if (chassis <= 0 || !p) {
          hide(sa, i);
          return;
        }
        setTRS(
          this.mL,
          1,
          0,
          r,
          r,
          (z1 - z0) * chassis,
          p[j * 2]! * CM,
          p[j * 2 + 1]! * CM,
          (z0 + z1) / 2,
        );
        this.mL.toArray(sa, i * 16);
      });
      m.shafts.instanceMatrix.needsUpdate = true;
    }
    if (m.motor) {
      const e = smoothstep(0.5, 1, spanProgress(level, P.chassis));
      const vis = e > 0.001;
      m.motor.housing.visible = vis;
      m.motor.cap.visible = vis;
      m.motor.hub.visible = vis;
      m.motor.housing.scale.setScalar(Math.max(1e-3, e));
      m.motor.hub.scale.setScalar(Math.max(1e-3, e));
      m.motor.hub.rotation.z = hubAngle;
    }
  }

  dispose() {
    if (this.model) disposeFxModel(this.model);
    this.model = null;
    this.root.removeFromParent();
  }
}
