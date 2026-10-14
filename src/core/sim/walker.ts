import { compileMechanism, type CompiledMechanism } from '@/core/kinematics/compile';
import { solvePose } from '@/core/kinematics/solve';
import { legInstances, mirrorDesignX } from '@/core/kinematics/legs';
import { CM, MAX_RPM, type DesignDoc } from '@/core/model/types';
import {
  DEFAULT_SIM_PARAMS,
  type FootState,
  type LegInstance,
  type PoseSample,
  type SimInput,
  type SimParams,
  type SimSnapshot,
  type TerrainCollider,
  type Vec3,
  type WalkerSim,
} from './types';
import { computeMassModel, type MassModel } from './mass';
import { poseRate } from './poseRate';
import { quatToMat, rotateTensor, solveSpd } from './math3';
import { DEFAULT_FRICTION, SIM_TUNING } from './constants';

/**
 * 歩行の動力学(S-03〜S-05)。
 *
 * 機体は 1 つの剛体(重心の位置・速度、姿勢の四元数、ワールド角速度)。脚の姿勢は運動学で解き
 * (組ごとに θ + phase、前フレームの姿勢を prev にして組立モードを保つ)、接触点の速度は
 *   v_i = v + ω × r_i + R (dp_i/dθ) θ̇
 * とする。接触は点ごとのペナルティ(法線:ばね・ダンパー、引っ張らない。接線:粘性で近似した
 * クーロン摩擦 min(μFn, c_t|v_t|))。
 *
 * 安定性のため、接触力は**線形化した陰的オイラー**で機体の 6 自由度と同時に解く:
 *   (M + h Σ Jᵢᵀ Dᵢ Jᵢ) u⁺ = M u + h (F_g + Σ Jᵢᵀ gᵢ)
 * Dᵢ はばね・ダンパーの接線剛性(法線は k h + c、接線は c_t)。陽的に解くと、軽い機体や
 * 転倒して多数の点が接地したときに c h / m が大きくなって発散するが、陰的ならどの機構でも安定。
 * 各点の「固着・滑り・離れ」は数回の反復で決める(順序固定なので決定論的)。
 *
 * モーター(S-04):負荷トルクは仮想仕事 τ = −Σ Fᵢ·dpᵢ/dθ(機体ローカル、脚の重さも含む)。
 * 回転数は直流モーターの直線特性 ω = ω₀ (1 − τ/τ_stall)(0..1 に制限)で、平滑化して追従する。
 * 機構が組み立てられなくなったら jammed としてモーターを止める。
 */

const STICK = 0;
const SLIDE = 1;
const OFF = 2;

/** 胴体の箱の角の数 */
const CORNERS = 8;

export class Walker implements WalkerSim {
  readonly params: SimParams;
  readonly design: DesignDoc;
  readonly terrain: TerrainCollider;
  readonly instances: LegInstance[];
  readonly mass: MassModel;
  private readonly start: { x: number; z: number };
  private readonly mechs: CompiledMechanism[];
  private readonly nJ: number;
  private readonly mu: number;
  /** 接触点:組 index(胴体の角は -1)とジョイント(角)番号 */
  private readonly cInst: Int32Array;
  private readonly cJoint: Int32Array;
  private readonly nC: number;
  /** 胴体の角(機体ローカル、m) */
  private readonly corners: Float64Array;

  // --- 状態 ---
  time = 0;
  theta = 0;
  thetaDot = 0;
  /** 平滑化した負荷トルク(N·m、θ の正の向きを妨げる向きが正) */
  private tauF = 0;
  energy = 0;
  fallen = false;
  jammed = false;
  stalled = false;
  /** 重心のワールド位置・速度、姿勢、ワールド角速度 */
  readonly com = new Float64Array(3);
  readonly vel = new Float64Array(3);
  readonly omega = new Float64Array(3);
  readonly quat = new Float64Array([0, 0, 0, 1]);
  /** 組ごとの姿勢(cm)と dp/dθ(cm/rad) */
  private poses: Float64Array[];
  private next: Float64Array[];
  private rates: Float64Array[];
  private readonly scratchA: Float64Array;
  private readonly scratchB: Float64Array;
  /** 脚の点の |dp/dθ| の最大(cm/rad) */
  private maxRate = 0;

  // --- 接触点の出力 ---
  private readonly cPos: Float64Array;
  private readonly cForce: Float64Array;
  private readonly cActive: Uint8Array;

  // --- 作業領域 ---
  private readonly R = new Float64Array(9);
  private readonly Iw = new Float64Array(9);
  private readonly A = new Float64Array(36);
  private readonly b = new Float64Array(6);
  private readonly u = new Float64Array(6);
  private readonly aIdx: Int32Array;
  private readonly aR: Float64Array;
  private readonly aN: Float64Array;
  private readonly aDepth: Float64Array;
  private readonly aW: Float64Array;
  private readonly aMode: Uint8Array;
  private readonly aS: Float64Array;
  private readonly aF: Float64Array;
  /** evalForces の結果:接線の滑り速度と法線力(モード判定用) */
  private readonly aVt: Float64Array;
  private readonly aFn: Float64Array;
  private nA = 0;
  private readonly qp: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(input: SimInput) {
    const ip = input.params ?? {};
    this.params = {
      ...DEFAULT_SIM_PARAMS,
      ...ip,
      motor: { ...DEFAULT_SIM_PARAMS.motor, ...ip.motor },
    };
    this.design = input.design;
    this.terrain = input.terrain;
    this.start = { ...input.start };
    this.mu = input.terrain.friction ?? DEFAULT_FRICTION;
    this.instances = legInstances(this.design);
    const normal = compileMechanism(this.design);
    const mirrored = this.instances.some((i) => i.mirrored)
      ? compileMechanism(mirrorDesignX(this.design))
      : normal;
    this.mechs = this.instances.map((i) => (i.mirrored ? mirrored : normal));
    this.nJ = this.design.joints.length;
    this.mass = computeMassModel(this.design, this.instances, this.mechs, this.params.chassisMass);

    // 接触点:各組の固定点以外の全ジョイント + 胴体の箱の 8 隅
    const inst: number[] = [];
    const joint: number[] = [];
    this.instances.forEach((_, k) => {
      const mech = this.mechs[k]!;
      for (let j = 0; j < this.nJ; j++) {
        if (mech.fixed[j]) continue;
        inst.push(k);
        joint.push(j);
      }
    });
    for (let c = 0; c < CORNERS; c++) {
      inst.push(-1);
      joint.push(c);
    }
    this.cInst = Int32Array.from(inst);
    this.cJoint = Int32Array.from(joint);
    this.nC = inst.length;
    const lo = this.mass.chassisMin;
    const hi = this.mass.chassisMax;
    this.corners = new Float64Array(CORNERS * 3);
    for (let c = 0; c < CORNERS; c++) {
      this.corners[c * 3] = c & 1 ? hi[0] : lo[0];
      this.corners[c * 3 + 1] = c & 2 ? hi[1] : lo[1];
      this.corners[c * 3 + 2] = c & 4 ? hi[2] : lo[2];
    }

    const n2 = this.nJ * 2;
    this.poses = this.instances.map(() => new Float64Array(n2));
    this.next = this.instances.map(() => new Float64Array(n2));
    this.rates = this.instances.map(() => new Float64Array(n2));
    this.scratchA = new Float64Array(n2);
    this.scratchB = new Float64Array(n2);

    const nC = this.nC;
    this.cPos = new Float64Array(nC * 3);
    this.cForce = new Float64Array(nC * 3);
    this.cActive = new Uint8Array(nC);
    this.aIdx = new Int32Array(nC);
    this.aR = new Float64Array(nC * 3);
    this.aN = new Float64Array(nC * 3);
    this.aDepth = new Float64Array(nC);
    this.aW = new Float64Array(nC * 3);
    this.aMode = new Uint8Array(nC);
    this.aS = new Float64Array(nC * 3);
    this.aF = new Float64Array(nC * 3);
    this.aVt = new Float64Array(nC * 3);
    this.aFn = new Float64Array(nC);

    this.reset();
  }

  /** 指令回転数(rad/s)。|rpm| は MAX_RPM まで */
  get commandSpeed(): number {
    const rpm = Math.max(-MAX_RPM, Math.min(MAX_RPM, this.design.motor.rpm || 0));
    return (rpm * 2 * Math.PI) / 60;
  }

  /** 負荷トルク(N·m)。指令の回転方向を妨げる向きが正(rpm 0 のときは θ の正の向き基準) */
  get motorTorque(): number {
    return this.commandSpeed < 0 ? -this.tauF : this.tauF;
  }

  /** 機体の傾き(rad) */
  get tilt(): number {
    const q = this.quat;
    const upY = 1 - 2 * (q[0]! * q[0]! + q[2]! * q[2]!);
    return Math.acos(Math.max(-1, Math.min(1, upY)));
  }

  reset(): void {
    this.time = 0;
    this.theta = 0;
    this.thetaDot = 0;
    this.tauF = 0;
    this.energy = 0;
    this.fallen = false;
    this.jammed = false;
    this.stalled = false;
    this.vel.fill(0);
    this.omega.fill(0);
    this.quat.set([0, 0, 0, 1]);
    this.cForce.fill(0);
    this.cActive.fill(0);
    this.nA = 0;

    // 各組を θ = 0 から位相まで少しずつ回して、組立モードを連続に保ったまま初期姿勢にする
    this.instances.forEach((inst, k) => {
      const mech = this.mechs[k]!;
      const pose = this.poses[k]!;
      let res = solvePose(mech, 0, { out: pose });
      if (!res.ok) this.jammed = true;
      const steps = Math.ceil(Math.abs(inst.phase) / 0.05);
      for (let s = 1; s <= steps && res.ok; s++) {
        const th = (inst.phase * s) / steps;
        res = solvePose(mech, th, { prev: pose, out: this.next[k]! });
        if (!res.ok) {
          this.jammed = true;
          break;
        }
        pose.set(res.positions);
      }
    });
    this.updateRates();

    // 初期配置:直立、x・z はスタート位置、最も低い接触点が地形にちょうど触れる高さ(+1mm)
    const r = this.params.footRadius;
    let oy = -Infinity;
    for (let ci = 0; ci < this.nC; ci++) {
      this.localPoint(ci, 0, 0, 0, this.qp);
      const h = this.terrain.heightAt(this.start.x + this.qp.x, this.start.z + this.qp.z);
      if (!Number.isFinite(h)) continue;
      oy = Math.max(oy, h + r + SIM_TUNING.dropClearance - this.qp.y);
    }
    if (!Number.isFinite(oy)) oy = 0;
    const c = this.mass.com;
    this.com[0] = this.start.x + c[0];
    this.com[1] = oy + c[1];
    this.com[2] = this.start.z + c[2];
    quatToMat(0, 0, 0, 1, this.R);
    for (let ci = 0; ci < this.nC; ci++) {
      this.worldPoint(ci, this.qp);
      this.cPos[ci * 3] = this.qp.x;
      this.cPos[ci * 3 + 1] = this.qp.y;
      this.cPos[ci * 3 + 2] = this.qp.z;
    }
  }

  /** 接触点 ci の機体ローカル位置(原点基準、m)から (ox, oy, oz) を引いたもの */
  private localPoint(ci: number, ox: number, oy: number, oz: number, out: Vec3): void {
    const k = this.cInst[ci]!;
    const j = this.cJoint[ci]!;
    if (k >= 0) {
      const pose = this.poses[k]!;
      out.x = pose[j * 2]! * CM - ox;
      out.y = pose[j * 2 + 1]! * CM - oy;
      out.z = this.instances[k]!.z - oz;
    } else {
      out.x = this.corners[j * 3]! - ox;
      out.y = this.corners[j * 3 + 1]! - oy;
      out.z = this.corners[j * 3 + 2]! - oz;
    }
  }

  /** 接触点 ci のワールド位置(this.R を使う) */
  private worldPoint(ci: number, out: Vec3): void {
    const c = this.mass.com;
    this.localPoint(ci, c[0], c[1], c[2], out);
    const R = this.R;
    const x = out.x;
    const y = out.y;
    const z = out.z;
    out.x = this.com[0]! + R[0]! * x + R[1]! * y + R[2]! * z;
    out.y = this.com[1]! + R[3]! * x + R[4]! * y + R[5]! * z;
    out.z = this.com[2]! + R[6]! * x + R[7]! * y + R[8]! * z;
  }

  private updateRates(): void {
    let max = 0;
    this.instances.forEach((inst, k) => {
      const m = poseRate(
        this.mechs[k]!,
        this.theta + inst.phase,
        this.poses[k]!,
        this.rates[k]!,
        this.scratchA,
        this.scratchB,
      );
      if (m > max) max = m;
    });
    this.maxRate = max;
  }

  step(): void {
    const p = this.params;
    const h = p.dt;
    const R = this.R;
    const q = this.quat;
    quatToMat(q[0]!, q[1]!, q[2]!, q[3]!, R);
    rotateTensor(R, this.mass.inertia, this.Iw);

    this.updateMotor(h);
    this.detectContacts();
    this.solveContacts(h);

    // 位置・姿勢を進める(半陰的オイラー:新しい速度で)
    const u = this.u;
    for (let a = 0; a < 3; a++) {
      this.vel[a] = u[a]!;
      this.omega[a] = u[a + 3]!;
      this.com[a]! += h * u[a]!;
    }
    const wx = u[3]!;
    const wy = u[4]!;
    const wz = u[5]!;
    const qx = q[0]!;
    const qy = q[1]!;
    const qz = q[2]!;
    const qw = q[3]!;
    const nx = qx + 0.5 * h * (wx * qw + wy * qz - wz * qy);
    const ny = qy + 0.5 * h * (wy * qw + wz * qx - wx * qz);
    const nz = qz + 0.5 * h * (wz * qw + wx * qy - wy * qx);
    const nw = qw + 0.5 * h * (-wx * qx - wy * qy - wz * qz);
    const nl = Math.hypot(nx, ny, nz, nw) || 1;
    q[0] = nx / nl;
    q[1] = ny / nl;
    q[2] = nz / nl;
    q[3] = nw / nl;

    this.updateLoad(h);
    this.advanceCrank(h);

    this.time += h;
    if (!this.fallen && this.tilt > p.fallTilt) this.fallen = true;
  }

  /** モーターの回転数を決める(前のステップの負荷トルクから) */
  private updateMotor(h: number): void {
    if (this.jammed) {
      this.thetaDot = 0;
      this.stalled = false;
      return;
    }
    const w0 = this.commandSpeed;
    const dir = w0 > 0 ? 1 : w0 < 0 ? -1 : 0;
    const stall = this.params.motor.stallTorque;
    const resist = this.tauF * dir;
    const factor = stall > 0 ? Math.max(0, Math.min(1, 1 - resist / stall)) : 0;
    const cmd = w0 * factor;
    let td = this.thetaDot + (cmd - this.thetaDot) * Math.min(1, h / SIM_TUNING.motorResponseTime);
    const limit = this.maxRate > 0 ? SIM_TUNING.maxPointSpeed / (this.maxRate * CM) : Infinity;
    if (Math.abs(td) > limit) td = Math.sign(td) * limit;
    this.thetaDot = td;
    this.stalled = dir !== 0 && factor <= SIM_TUNING.stallFactor;
  }

  /** 全接触点の位置と、地形との接触を調べる */
  private detectContacts(): void {
    const R = this.R;
    const rad = this.params.footRadius;
    const td = this.thetaDot;
    const qp = this.qp;
    let nA = 0;
    for (let ci = 0; ci < this.nC; ci++) {
      this.worldPoint(ci, qp);
      const px = qp.x;
      const py = qp.y;
      const pz = qp.z;
      this.cPos[ci * 3] = px;
      this.cPos[ci * 3 + 1] = py;
      this.cPos[ci * 3 + 2] = pz;
      this.cActive[ci] = 0;
      this.cForce[ci * 3] = 0;
      this.cForce[ci * 3 + 1] = 0;
      this.cForce[ci * 3 + 2] = 0;
      const hit = this.terrain.query(qp, rad);
      if (!hit || !(hit.depth > 0)) continue;
      const a = nA++;
      this.aIdx[a] = ci;
      this.aR[a * 3] = px - this.com[0]!;
      this.aR[a * 3 + 1] = py - this.com[1]!;
      this.aR[a * 3 + 2] = pz - this.com[2]!;
      this.aN[a * 3] = hit.normal.x;
      this.aN[a * 3 + 1] = hit.normal.y;
      this.aN[a * 3 + 2] = hit.normal.z;
      this.aDepth[a] = hit.depth;
      // 脚の運動による点の速度 R (dp/dθ) θ̇(m/s)
      const k = this.cInst[ci]!;
      let wx = 0;
      let wy = 0;
      let wz = 0;
      if (k >= 0 && td !== 0) {
        const j = this.cJoint[ci]!;
        const rate = this.rates[k]!;
        const lx = rate[j * 2]! * CM * td;
        const ly = rate[j * 2 + 1]! * CM * td;
        wx = R[0]! * lx + R[1]! * ly;
        wy = R[3]! * lx + R[4]! * ly;
        wz = R[6]! * lx + R[7]! * ly;
      }
      this.aW[a * 3] = wx;
      this.aW[a * 3 + 1] = wy;
      this.aW[a * 3 + 2] = wz;
      this.aMode[a] = STICK;
      this.aS[a * 3] = 0;
      this.aS[a * 3 + 1] = 0;
      this.aS[a * 3 + 2] = 0;
    }
    this.nA = nA;
  }

  /**
   * 接触力と新しい速度 u⁺ を陰的に解く。固着・滑り・離れのモードを数回反復して決める。
   * 適用した力(=機体の運動量変化に使った力)を aF に残す。
   */
  private solveContacts(h: number): void {
    const iters = SIM_TUNING.contactIterations;
    for (let it = 0; ; it++) {
      this.assembleAndSolve(h);
      this.evalForces(h);
      if (it >= iters) break;
      if (!this.updateModes()) break;
    }
    for (let a = 0; a < this.nA; a++) {
      const ci = this.aIdx[a]!;
      const on = this.aMode[a] !== OFF;
      this.cActive[ci] = on ? 1 : 0;
      this.cForce[ci * 3] = this.aF[a * 3]!;
      this.cForce[ci * 3 + 1] = this.aF[a * 3 + 1]!;
      this.cForce[ci * 3 + 2] = this.aF[a * 3 + 2]!;
    }
  }

  private assembleAndSolve(h: number): void {
    const p = this.params;
    const A = this.A;
    const b = this.b;
    const m = this.mass.total;
    const Iw = this.Iw;
    A.fill(0);
    A[0] = m;
    A[7] = m;
    A[14] = m;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[(i + 3) * 6 + j + 3] = Iw[i * 3 + j]!;
    b[0] = m * this.vel[0]!;
    b[1] = m * this.vel[1]! - h * m * p.gravity;
    b[2] = m * this.vel[2]!;
    for (let i = 0; i < 3; i++) {
      b[i + 3] =
        Iw[i * 3]! * this.omega[0]! +
        Iw[i * 3 + 1]! * this.omega[1]! +
        Iw[i * 3 + 2]! * this.omega[2]!;
    }

    const k = p.contactStiffness;
    const an = k * h + p.contactDamping;
    const ct = SIM_TUNING.frictionDamping;
    const D = this.D;
    const X = this.X;
    const DX = this.DX;
    for (let a = 0; a < this.nA; a++) {
      const mode = this.aMode[a]!;
      if (mode === OFF) continue;
      const nx = this.aN[a * 3]!;
      const ny = this.aN[a * 3 + 1]!;
      const nz = this.aN[a * 3 + 2]!;
      // D = c_t I + (a_n − c_t) n nᵀ(固着)/ a_n n nᵀ(滑り)
      const iso = mode === STICK ? ct : 0;
      const nn = an - iso;
      D[0] = iso + nn * nx * nx;
      D[1] = nn * nx * ny;
      D[2] = nn * nx * nz;
      D[3] = D[1];
      D[4] = iso + nn * ny * ny;
      D[5] = nn * ny * nz;
      D[6] = D[2];
      D[7] = D[5];
      D[8] = iso + nn * nz * nz;
      // g = k d n + s − D w
      const wx = this.aW[a * 3]!;
      const wy = this.aW[a * 3 + 1]!;
      const wz = this.aW[a * 3 + 2]!;
      const kd = k * this.aDepth[a]!;
      let gx = kd * nx - (D[0] * wx + D[1] * wy + D[2] * wz);
      let gy = kd * ny - (D[3] * wx + D[4] * wy + D[5] * wz);
      let gz = kd * nz - (D[6] * wx + D[7] * wy + D[8] * wz);
      if (mode === SLIDE) {
        gx += this.aS[a * 3]!;
        gy += this.aS[a * 3 + 1]!;
        gz += this.aS[a * 3 + 2]!;
      }
      // X = −[r]×(J = [I | X])
      const rx = this.aR[a * 3]!;
      const ry = this.aR[a * 3 + 1]!;
      const rz = this.aR[a * 3 + 2]!;
      X[0] = 0;
      X[1] = rz;
      X[2] = -ry;
      X[3] = -rz;
      X[4] = 0;
      X[5] = rx;
      X[6] = ry;
      X[7] = -rx;
      X[8] = 0;
      // DX = D·X
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          DX[i * 3 + j] = D[i * 3]! * X[j]! + D[i * 3 + 1]! * X[3 + j]! + D[i * 3 + 2]! * X[6 + j]!;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          A[i * 6 + j]! += h * D[i * 3 + j]!;
          A[i * 6 + j + 3]! += h * DX[i * 3 + j]!;
          A[(j + 3) * 6 + i]! += h * DX[i * 3 + j]!;
          // Xᵀ D X
          A[(i + 3) * 6 + j + 3]! +=
            h * (X[i]! * DX[j]! + X[3 + i]! * DX[3 + j]! + X[6 + i]! * DX[6 + j]!);
        }
      }
      b[0]! += h * gx;
      b[1]! += h * gy;
      b[2]! += h * gz;
      // Xᵀ g = r × g
      b[3]! += h * (ry * gz - rz * gy);
      b[4]! += h * (rz * gx - rx * gz);
      b[5]! += h * (rx * gy - ry * gx);
    }
    if (!solveSpd(A, b, 6, this.u)) {
      // 起こらないはずだが、念のため重力だけで進める
      this.u[0] = this.vel[0]!;
      this.u[1] = this.vel[1]! - h * p.gravity;
      this.u[2] = this.vel[2]!;
      this.u[3] = this.omega[0]!;
      this.u[4] = this.omega[1]!;
      this.u[5] = this.omega[2]!;
      for (let a = 0; a < this.nA; a++) this.aMode[a] = OFF;
    }
  }

  private readonly D = new Float64Array(9);
  private readonly X = new Float64Array(9);
  private readonly DX = new Float64Array(9);

  /** 解いた u⁺ で各接触点の力(線形化したもの=実際に適用した力)を求める */
  private evalForces(h: number): void {
    const p = this.params;
    const k = p.contactStiffness;
    const an = k * h + p.contactDamping;
    const ct = SIM_TUNING.frictionDamping;
    const u = this.u;
    for (let a = 0; a < this.nA; a++) {
      const mode = this.aMode[a]!;
      if (mode === OFF) {
        this.aF[a * 3] = 0;
        this.aF[a * 3 + 1] = 0;
        this.aF[a * 3 + 2] = 0;
        continue;
      }
      const rx = this.aR[a * 3]!;
      const ry = this.aR[a * 3 + 1]!;
      const rz = this.aR[a * 3 + 2]!;
      const vx = u[0]! + u[4]! * rz - u[5]! * ry + this.aW[a * 3]!;
      const vy = u[1]! + u[5]! * rx - u[3]! * rz + this.aW[a * 3 + 1]!;
      const vz = u[2]! + u[3]! * ry - u[4]! * rx + this.aW[a * 3 + 2]!;
      const nx = this.aN[a * 3]!;
      const ny = this.aN[a * 3 + 1]!;
      const nz = this.aN[a * 3 + 2]!;
      const vn = vx * nx + vy * ny + vz * nz;
      const fn = k * this.aDepth[a]! - an * vn;
      let fx = fn * nx;
      let fy = fn * ny;
      let fz = fn * nz;
      if (mode === STICK) {
        fx -= ct * (vx - vn * nx);
        fy -= ct * (vy - vn * ny);
        fz -= ct * (vz - vn * nz);
      } else {
        fx += this.aS[a * 3]!;
        fy += this.aS[a * 3 + 1]!;
        fz += this.aS[a * 3 + 2]!;
      }
      this.aF[a * 3] = fx;
      this.aF[a * 3 + 1] = fy;
      this.aF[a * 3 + 2] = fz;
      // 次の反復の判定用に、接線の滑り速度を aVt に、法線力を aFn に残す
      this.aVt[a * 3] = vx - vn * nx;
      this.aVt[a * 3 + 1] = vy - vn * ny;
      this.aVt[a * 3 + 2] = vz - vn * nz;
      this.aFn[a] = fn;
    }
  }

  /** 固着・滑り・離れのモードを更新する。変わったら true */
  private updateModes(): boolean {
    const mu = this.mu;
    let changed = false;
    for (let a = 0; a < this.nA; a++) {
      const mode = this.aMode[a]!;
      if (mode === OFF) continue;
      const fn = this.aFn[a]!;
      if (!(fn > 0)) {
        this.aMode[a] = OFF;
        changed = true;
        continue;
      }
      const limit = mu * fn;
      const vtx = this.aVt[a * 3]!;
      const vty = this.aVt[a * 3 + 1]!;
      const vtz = this.aVt[a * 3 + 2]!;
      if (mode === STICK) {
        // 固着の接線力 = −c_t v_t
        const ct = SIM_TUNING.frictionDamping;
        const ft = ct * Math.hypot(vtx, vty, vtz);
        if (ft > limit) {
          const s = -limit / (ft / ct);
          this.aS[a * 3] = s * vtx;
          this.aS[a * 3 + 1] = s * vty;
          this.aS[a * 3 + 2] = s * vtz;
          this.aMode[a] = SLIDE;
          changed = true;
        }
      } else {
        const sx = this.aS[a * 3]!;
        const sy = this.aS[a * 3 + 1]!;
        const sz = this.aS[a * 3 + 2]!;
        const vt = Math.hypot(vtx, vty, vtz);
        if (vtx * sx + vty * sy + vtz * sz > 0) {
          // 摩擦の向きに滑っている = 摩擦が強すぎた → 固着に戻す
          this.aMode[a] = STICK;
          changed = true;
        } else if (vt > 1e-9) {
          const s = -limit / vt;
          this.aS[a * 3] = s * vtx;
          this.aS[a * 3 + 1] = s * vty;
          this.aS[a * 3 + 2] = s * vtz;
        } else {
          const sl = Math.hypot(sx, sy, sz) || 1;
          this.aS[a * 3] = (sx / sl) * limit;
          this.aS[a * 3 + 1] = (sy / sl) * limit;
          this.aS[a * 3 + 2] = (sz / sl) * limit;
        }
      }
    }
    return changed;
  }

  /** 負荷トルク(仮想仕事)を求めて平滑化し、エネルギーを積算する */
  private updateLoad(h: number): void {
    const R = this.R;
    let tau = 0;
    // 接触力:τ −= (Rᵀ F)·(dp/dθ)
    for (let a = 0; a < this.nA; a++) {
      const ci = this.aIdx[a]!;
      const k = this.cInst[ci]!;
      if (k < 0 || this.aMode[a] === OFF) continue;
      const j = this.cJoint[ci]!;
      const fx = this.aF[a * 3]!;
      const fy = this.aF[a * 3 + 1]!;
      const fz = this.aF[a * 3 + 2]!;
      const lx = R[0]! * fx + R[3]! * fy + R[6]! * fz;
      const ly = R[1]! * fx + R[4]! * fy + R[7]! * fz;
      const rate = this.rates[k]!;
      tau -= (lx * rate[j * 2]! + ly * rate[j * 2 + 1]!) * CM;
    }
    // 脚の重さ:g_local = Rᵀ (0, −g, 0)
    const g = this.params.gravity;
    const glx = -g * R[3]!;
    const gly = -g * R[4]!;
    const jm = this.mass.jointMass;
    for (let k = 0; k < this.instances.length; k++) {
      const rate = this.rates[k]!;
      for (let j = 0; j < this.nJ; j++) {
        const m = jm[j]!;
        if (m === 0) continue;
        tau -= m * (glx * rate[j * 2]! + gly * rate[j * 2 + 1]!) * CM;
      }
    }
    if (!Number.isFinite(tau)) tau = 0;
    this.tauF += (tau - this.tauF) * Math.min(1, h / SIM_TUNING.loadFilterTime);
    this.energy += Math.abs(this.tauF * this.thetaDot * h);
  }

  /** クランクを回し、脚の姿勢を解き直す。組み立てられなければ jammed */
  private advanceCrank(h: number): void {
    if (this.jammed || this.thetaDot === 0) return;
    const th = this.theta + this.thetaDot * h;
    for (let k = 0; k < this.instances.length; k++) {
      const res = solvePose(this.mechs[k]!, th + this.instances[k]!.phase, {
        prev: this.poses[k]!,
        out: this.next[k]!,
      });
      if (!res.ok) {
        this.jammed = true;
        this.thetaDot = 0;
        return;
      }
    }
    const tmp = this.poses;
    this.poses = this.next;
    this.next = tmp;
    this.theta = th;
    this.updateRates();
  }

  /** 機体原点のワールド位置(snapshot の body.position と同じ) */
  private origin(out: Vec3): Vec3 {
    const R = this.R;
    const q = this.quat;
    quatToMat(q[0]!, q[1]!, q[2]!, q[3]!, R);
    const c = this.mass.com;
    out.x = this.com[0]! - (R[0]! * c[0] + R[1]! * c[1] + R[2]! * c[2]);
    out.y = this.com[1]! - (R[3]! * c[0] + R[4]! * c[1] + R[5]! * c[2]);
    out.z = this.com[2]! - (R[6]! * c[0] + R[7]! * c[1] + R[8]! * c[2]);
    return out;
  }

  /** ゴースト用の軽い姿勢サンプル */
  poseSample(): PoseSample {
    const q = this.quat;
    return {
      time: this.time,
      position: this.origin({ x: 0, y: 0, z: 0 }),
      quaternion: { x: q[0]!, y: q[1]!, z: q[2]!, w: q[3]! },
      motorAngle: this.theta,
    };
  }

  snapshot(): SimSnapshot {
    const R = this.R;
    const q = this.quat;
    quatToMat(q[0]!, q[1]!, q[2]!, q[3]!, R);
    const c = this.mass.com;
    // 原点(設計座標の原点)= 重心 − R c
    const ox = -(R[0]! * c[0] + R[1]! * c[1] + R[2]! * c[2]);
    const oy = -(R[3]! * c[0] + R[4]! * c[1] + R[5]! * c[2]);
    const oz = -(R[6]! * c[0] + R[7]! * c[1] + R[8]! * c[2]);
    const w = this.omega;
    const contacts: FootState[] = [];
    for (let ci = 0; ci < this.nC; ci++) {
      contacts.push({
        instance: this.cInst[ci]!,
        joint: this.cJoint[ci]!,
        position: { x: this.cPos[ci * 3]!, y: this.cPos[ci * 3 + 1]!, z: this.cPos[ci * 3 + 2]! },
        contact: this.cActive[ci] === 1,
        force: {
          x: this.cForce[ci * 3]!,
          y: this.cForce[ci * 3 + 1]!,
          z: this.cForce[ci * 3 + 2]!,
        },
      });
    }
    const gy = this.terrain.heightAt(this.com[0]!, this.com[2]!);
    return {
      time: this.time,
      body: {
        position: { x: this.com[0]! + ox, y: this.com[1]! + oy, z: this.com[2]! + oz },
        quaternion: { x: q[0]!, y: q[1]!, z: q[2]!, w: q[3]! },
        // 原点の速度 = v + ω × (原点 − 重心)
        velocity: {
          x: this.vel[0]! + w[1]! * oz - w[2]! * oy,
          y: this.vel[1]! + w[2]! * ox - w[0]! * oz,
          z: this.vel[2]! + w[0]! * oy - w[1]! * ox,
        },
        angularVelocity: { x: w[0]!, y: w[1]!, z: w[2]! },
      },
      com: { x: this.com[0]!, y: this.com[1]!, z: this.com[2]! },
      motorAngle: this.theta,
      motorSpeed: this.thetaDot,
      motorTorque: this.motorTorque,
      stalled: this.stalled,
      energy: this.energy,
      instances: this.instances.map((i) => ({ ...i })),
      legPositions: this.poses.map((pz) => new Float64Array(pz)),
      contacts,
      fallen: this.fallen,
      jammed: this.jammed,
      comGround: Number.isFinite(gy) ? { x: this.com[0]!, y: gy, z: this.com[2]! } : null,
      tilt: this.tilt,
    };
  }
}

export function createWalkerSim(input: SimInput): WalkerSim {
  return new Walker(input);
}
