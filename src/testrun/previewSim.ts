import type { DesignDoc } from '@/core/model/types';
import { CM } from '@/core/model/types';
import {
  DEFAULT_SIM_PARAMS,
  type FootState,
  type SimParams,
  type SimSnapshot,
  type TerrainSpec,
  type WalkerSim,
} from '@/core/sim/types';
import { compileMechanism, sampleCycle, type CompiledMechanism } from '@/core/kinematics';
import { createLegSolver } from './legs';
import { terrainHeightAt } from './terrain';

/**
 * 運動学だけで歩く簡易シミュレーション(試走ビューの開発・デモ用。本物の動力学は sim ストリーム)。
 * WalkerSim を満たすので、統合時は createWalkerSim に差し替えるだけでよい。
 *
 *  - 脚はモーター角から運動学で解く(脚列の全組)
 *  - 機体は「接地区間の脚先が後ろへ動く速さ」で前へ滑る(歩幅 × 回転数)
 *  - 高さ:どの点も地形にめり込まないよう持ち上げ、浮いたら重力で落とす。前後の支えの差で縦に傾く
 *  - 接地:地形から 6mm 以内の点。重さを接地点で等分した力を上向きに返す
 *  - トルク:摩擦分+波打ち+登る仕事(m g v_y / ω)を平滑化した値。上限を超えると停動
 *  - tipOverAt を指定すると、その時刻から横倒しになる(転倒スローの確認用)
 *
 * snapshot() は同じオブジェクトを書き換えて返す(次の step / reset まで有効)。
 */

export interface PreviewSimOptions {
  /** スタート位置(m)。機体の原点(設計座標の原点)を置く */
  start?: { x: number; z: number };
  params?: Partial<SimParams>;
  /** 転倒の演出の確認用:この時刻(s)から横に倒れる。null・省略で無効 */
  tipOverAt?: number | null;
  /** 歩く速さの倍率(比較用のゴーストを作るときなど)。既定 1 */
  speedScale?: number;
}

export interface StrideEstimate {
  /** 1 回転で接地中の脚先が後ろへ動く距離(m) */
  stride: number;
  /** 機体の前進速度(m/s、+x が前)。回転方向から符号が決まる */
  speed: number;
  /** 速度の見積もりに使った脚先(ジョイント index) */
  foot: number;
}

const CONTACT_TOL = 0.006;
const STANCE_BAND_CM = 0.6;
const MIN_DUTY = 0.25;
/** 登る速さの上限(m/s)。姿勢の修正で持ち上げた分をトルクに数えすぎないため */
const MAX_CLIMB = 0.3;

/** 脚先の軌道の接地区間(最下点付近)から歩幅と速さを見積もる */
export function estimateStride(design: DesignDoc, mech?: CompiledMechanism): StrideEstimate {
  const m = mech ?? compileMechanism(design);
  const n = m.jointIds.length;
  const rpm = design.motor.rpm;
  if (n === 0 || rpm === 0) return { stride: 0, speed: 0, foot: -1 };
  const N = 144;
  const cycle = sampleCycle(m, N, { direction: rpm < 0 ? -1 : 1 });
  let foot = m.footIndex;
  if (foot < 0) {
    // 脚先が未指定なら、1 回転で最も低くなる点
    let low = Infinity;
    for (const p of cycle.positions) {
      for (let j = 0; j < n; j++) {
        if (p[j * 2 + 1]! < low) {
          low = p[j * 2 + 1]!;
          foot = j;
        }
      }
    }
  }
  let yMin = Infinity;
  let yMax = -Infinity;
  cycle.positions.forEach((p, s) => {
    if (!cycle.ok[s]) return;
    yMin = Math.min(yMin, p[foot * 2 + 1]!);
    yMax = Math.max(yMax, p[foot * 2 + 1]!);
  });
  if (!Number.isFinite(yMin)) return { stride: 0, speed: 0, foot };
  const band = Math.max(STANCE_BAND_CM, 0.06 * (yMax - yMin));
  let sum = 0;
  let pairs = 0;
  for (let s = 0; s < N; s++) {
    const a = cycle.positions[s]!;
    const b = cycle.positions[(s + 1) % N]!;
    if (!cycle.ok[s] || !cycle.ok[(s + 1) % N]) continue;
    if (a[foot * 2 + 1]! > yMin + band || b[foot * 2 + 1]! > yMin + band) continue;
    sum += b[foot * 2]! - a[foot * 2]!;
    pairs++;
  }
  if (pairs === 0) return { stride: 0, speed: 0, foot };
  const revPerSec = Math.abs(rpm) / 60;
  // 接地中の脚先の平均の速さ(機体に対して)。機体はその逆向きに進む
  const footVel = (sum / pairs) * N * revPerSec * CM;
  const stride = Math.abs(sum) * CM;
  // 接地が 1 回転の 1/4 より短い(最下点が尖っている)機構は滑るとみなし、速さを頭打ちにする
  const vmax = (stride * revPerSec) / MIN_DUTY;
  return { stride, speed: -clamp(footVel, -vmax, vmax), foot };
}

export function createKinematicPreviewSim(
  design: DesignDoc,
  terrain?: TerrainSpec,
  options: PreviewSimOptions = {},
): WalkerSim {
  const params: SimParams = { ...DEFAULT_SIM_PARAMS, ...options.params };
  const spec: TerrainSpec = terrain ?? { ground: { y: 0 }, shapes: [] };
  const start = options.start ?? { x: 0, z: 0 };
  const tipOverAt = options.tipOverAt ?? null;
  const legs = createLegSolver(design);
  const K = legs.instances.length;
  const n = design.joints.length;
  const P = K * n;
  const omega = (design.motor.rpm * 2 * Math.PI) / 60;
  const est = estimateStride(design, legs.normal);
  const speed = est.speed * (options.speedScale ?? 1);

  // おおよその質量:胴体+リンクの長さ × 線密度
  let linkLen = 0;
  for (const l of design.links) {
    const js = l.joints.map((id) => design.joints.find((j) => j.id === id)).filter((j) => !!j);
    for (let i = 1; i < js.length; i++) {
      linkLen += Math.hypot(js[i]!.x - js[i - 1]!.x, js[i]!.y - js[i - 1]!.y) * CM;
    }
  }
  const mass = params.chassisMass + params.linkDensity * linkLen * K;

  // 状態
  let time = 0;
  let theta = 0;
  let x = start.x;
  let y = 0;
  let vy = 0;
  let pitch = 0;
  let pitchVel = 0;
  let roll = 0;
  let rollVel = 0;
  let torque = 0;
  let energy = 0;
  let fallen = false;
  let jammed = false;
  let stalled = false;
  // 回転行列(行優先 3×3)
  const R = new Float64Array(9);
  // 全点のワールド位置とめり込み量
  const wx = new Float64Array(P);
  const wy = new Float64Array(P);
  const wz = new Float64Array(P);
  const pen = new Float64Array(P);
  const quat = { x: 0, y: 0, z: 0, w: 1 };

  const updateRotation = () => {
    // q = qz(pitch) ⊗ qx(roll)
    const cp = Math.cos(pitch / 2);
    const sp = Math.sin(pitch / 2);
    const cr = Math.cos(roll / 2);
    const sr = Math.sin(roll / 2);
    quat.x = cp * sr;
    quat.y = sp * sr;
    quat.z = sp * cr;
    quat.w = cp * cr;
    const { x: qx, y: qy, z: qz, w: qw } = quat;
    R[0] = 1 - 2 * (qy * qy + qz * qz);
    R[1] = 2 * (qx * qy - qz * qw);
    R[2] = 2 * (qx * qz + qy * qw);
    R[3] = 2 * (qx * qy + qz * qw);
    R[4] = 1 - 2 * (qx * qx + qz * qz);
    R[5] = 2 * (qy * qz - qx * qw);
    R[6] = 2 * (qx * qz - qy * qw);
    R[7] = 2 * (qy * qz + qx * qw);
    R[8] = 1 - 2 * (qx * qx + qy * qy);
  };

  /** 全点のワールド位置とめり込み量を求め、最大のめり込み量を返す */
  const computeWorld = (): number => {
    let maxPen = -Infinity;
    for (let k = 0; k < K; k++) {
      const pos = legs.positions[k]!;
      const lz = legs.instances[k]!.z;
      for (let j = 0; j < n; j++) {
        const i = k * n + j;
        const lx = pos[j * 2]! * CM;
        const ly = pos[j * 2 + 1]! * CM;
        const px = x + R[0]! * lx + R[1]! * ly + R[2]! * lz;
        const py = y + R[3]! * lx + R[4]! * ly + R[5]! * lz;
        const pz = start.z + R[6]! * lx + R[7]! * ly + R[8]! * lz;
        wx[i] = px;
        wy[i] = py;
        wz[i] = pz;
        const h = terrainHeightAt(spec, px, pz);
        const p = h + params.footRadius - py;
        pen[i] = p;
        if (p > maxPen) maxPen = p;
      }
    }
    return maxPen;
  };

  /** 前後の支えの差から、縦の傾きの修正量(rad)を求める */
  const pitchCorrection = (): number => {
    if (P < 2) return 0;
    let cx = 0;
    for (let i = 0; i < P; i++) cx += wx[i]!;
    cx /= P;
    let penF = -Infinity;
    let penR = -Infinity;
    let xF = cx;
    let xR = cx;
    for (let i = 0; i < P; i++) {
      if (wx[i]! > cx) {
        if (pen[i]! > penF) {
          penF = pen[i]!;
          xF = wx[i]!;
        }
      } else if (pen[i]! > penR) {
        penR = pen[i]!;
        xR = wx[i]!;
      }
    }
    if (!Number.isFinite(penF) && !Number.isFinite(penR)) return 0;
    // 片側に支えがない:そちらへ傾く
    if (!Number.isFinite(penF)) return -0.6;
    if (!Number.isFinite(penR)) return 0.6;
    const lever = Math.max(0.05, xF - xR);
    return clamp(Math.atan2(penF - penR, lever), -0.6, 0.6);
  };

  const place = () => {
    time = 0;
    theta = 0;
    x = start.x;
    y = 0;
    vy = 0;
    pitch = 0;
    pitchVel = 0;
    roll = 0;
    rollVel = 0;
    torque = 0;
    energy = 0;
    fallen = false;
    jammed = false;
    stalled = false;
    legs.reset();
    if (!legs.solve(theta)) jammed = true;
    updateRotation();
    const maxPen = computeWorld();
    // 最も低い点が地形に触れる高さに置く
    if (Number.isFinite(maxPen)) y += maxPen;
    computeWorld();
  };

  const step = () => {
    const dt = params.dt;
    const running = !fallen && !jammed && !stalled;
    let w = 0;
    if (running && omega !== 0) {
      const next = theta + omega * dt;
      if (legs.solve(next)) {
        theta = next;
        w = omega;
      } else {
        // 組み立てられない角度に来た:止まる(元の角度に戻す)
        jammed = true;
        legs.solve(theta);
      }
    }
    if (running && !jammed) x += speed * dt;
    updateRotation();
    let maxPen = computeWorld();

    // 縦の傾き(ばね)
    if (!fallen) {
      const target = clamp(pitch + pitchCorrection(), -0.9, 0.9);
      const k = 50;
      const c = 2 * Math.sqrt(k);
      pitchVel += (k * (target - pitch) - c * pitchVel) * dt;
      pitch += pitchVel * dt;
    }
    // 横倒し(確認用)
    if (tipOverAt !== null && time >= tipOverAt) {
      const limit = Math.PI / 2;
      if (Math.abs(roll) < limit) {
        rollVel += 7 * Math.sin(Math.abs(roll) + 0.06) * dt;
        roll = Math.min(limit, roll + rollVel * dt);
      } else rollVel = 0;
    }

    // 上下:めり込んだら持ち上げ、浮いたら落とす
    const prevY = y;
    if (Number.isFinite(maxPen)) {
      if (maxPen > 0) {
        y += maxPen * Math.min(1, dt * 40);
        if (vy < 0) vy = 0;
      } else {
        vy -= params.gravity * dt;
        const dy = vy * dt;
        if (-dy > -maxPen) {
          y += maxPen;
          vy = 0;
        } else y += dy;
      }
    } else {
      // 真下に地形が何もない(コースの外):その高さで止める
      vy = 0;
    }
    updateRotation();
    maxPen = computeWorld();

    // 転倒判定
    const upY = R[4]!;
    if (!fallen && Math.acos(clamp(upY, -1, 1)) >= params.fallTilt) fallen = true;

    // トルク(負荷):摩擦+波打ち+登る仕事
    const climb = clamp((y - prevY) / dt, 0, MAX_CLIMB);
    const raw = running
      ? 1.5 +
        0.8 * (1 + Math.sin(2 * theta)) +
        (Math.abs(w) > 1e-6 ? (mass * params.gravity * climb) / Math.abs(w) : 0)
      : 0;
    torque += (raw - torque) * Math.min(1, dt * 6);
    if (running && torque > params.motor.stallTorque) stalled = true;
    energy += Math.abs(torque * w * dt);
    time += dt;
  };

  // スナップショット(再利用)
  const legPositions = legs.instances.map(() => new Float64Array(n * 2));
  const contacts: FootState[] = [];
  for (let k = 0; k < K; k++) {
    for (let j = 0; j < n; j++) {
      contacts.push({
        instance: k,
        joint: j,
        position: { x: 0, y: 0, z: 0 },
        contact: false,
        force: { x: 0, y: 0, z: 0 },
      });
    }
  }
  const snap: SimSnapshot = {
    time: 0,
    body: {
      position: { x: 0, y: 0, z: 0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    },
    com: { x: 0, y: 0, z: 0 },
    motorAngle: 0,
    motorSpeed: 0,
    motorTorque: 0,
    stalled: false,
    energy: 0,
    instances: legs.instances.map((i) => ({ ...i })),
    legPositions,
    contacts,
    fallen: false,
    jammed: false,
  };

  place();

  const sim: WalkerSim = {
    params,
    step,
    reset: place,
    snapshot() {
      updateRotation();
      computeWorld();
      const running = !fallen && !jammed && !stalled;
      snap.time = time;
      snap.body.position.x = x;
      snap.body.position.y = y;
      snap.body.position.z = start.z;
      snap.body.quaternion.x = quat.x;
      snap.body.quaternion.y = quat.y;
      snap.body.quaternion.z = quat.z;
      snap.body.quaternion.w = quat.w;
      snap.body.velocity.x = running ? speed : 0;
      snap.body.velocity.y = vy;
      snap.body.velocity.z = 0;
      snap.body.angularVelocity.x = rollVel;
      snap.body.angularVelocity.y = 0;
      snap.body.angularVelocity.z = pitchVel;
      snap.motorAngle = theta;
      snap.motorSpeed = running ? omega : 0;
      snap.motorTorque = torque;
      snap.stalled = stalled;
      snap.energy = energy;
      snap.fallen = fallen;
      snap.jammed = jammed;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      let touching = 0;
      for (let i = 0; i < P; i++) {
        cx += wx[i]!;
        cy += wy[i]!;
        cz += wz[i]!;
        if (pen[i]! > -CONTACT_TOL) touching++;
      }
      if (P > 0) {
        snap.com.x = cx / P;
        snap.com.y = cy / P;
        snap.com.z = cz / P;
      } else {
        snap.com.x = x;
        snap.com.y = y;
        snap.com.z = start.z;
      }
      const share = touching > 0 ? (mass * params.gravity) / touching : 0;
      for (let k = 0; k < K; k++) legPositions[k]!.set(legs.positions[k]!);
      for (let i = 0; i < P; i++) {
        const c = contacts[i]!;
        c.position.x = wx[i]!;
        c.position.y = wy[i]!;
        c.position.z = wz[i]!;
        c.contact = pen[i]! > -CONTACT_TOL;
        c.force.x = 0;
        c.force.y = c.contact ? share : 0;
        c.force.z = 0;
      }
      return snap;
    },
  };
  return sim;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
