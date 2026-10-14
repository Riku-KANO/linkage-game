import type { DesignDoc } from '@/core/model/types';

/**
 * 歩行シミュレーションの契約(S-03〜S-07)。
 *
 * ワールド座標:単位 m。+x が前進方向(ゴール方向)、+y が上、z が奥行き。
 * 機体ローカル座標:機構の設計平面(cm)を CM 倍して xy 平面に置き、脚列を z 方向に並べる。
 *
 * 方式(要件定義書「決定事項」より):
 *  - 機体は 1 つの剛体。脚先(と各ジョイント)を接触球として扱う
 *  - 接触は自前のモデル:法線力はばね・ダンパー、接線はクーロン摩擦
 *  - 地形との衝突判定だけを Rapier(WASM)で行う。関節機能は使わない
 *  - 物理は 240Hz 固定(描画 1 フレームあたり 4 サブステップ)。決定論的
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** 地形の形状(ステージデータに書く)。単位 m。 */
export type TerrainShape =
  /** 軸平行な直方体。段差・台・壁 */
  | { kind: 'box'; min: [number, number, number]; max: [number, number, number] }
  /**
   * 坂。x0..x1 の区間で上面が y0 から y1 へ直線的に変わる。z0..z1 の幅を持ち、底は bottom。
   */
  | {
      kind: 'ramp';
      x0: number;
      x1: number;
      y0: number;
      y1: number;
      z0: number;
      z1: number;
      bottom: number;
    };

export interface TerrainSpec {
  /** 無限に広い地面(y = 高さ)。null なら地面なし(溝の底などは box で作る) */
  ground: { y: number } | null;
  shapes: TerrainShape[];
  /** クーロン摩擦係数(既定 0.9) */
  friction?: number;
}

export interface TerrainContact {
  /** めり込み量(m、正ならめり込んでいる) */
  depth: number;
  /** 地形から外向きの単位法線 */
  normal: Vec3;
}

/** 地形の衝突判定。実装は Rapier 版(本番)と平面版(テスト用)。 */
export interface TerrainCollider {
  /** 球(中心 p、半径 r)と地形の接触。接触していなければ null */
  query(p: Vec3, r: number): TerrainContact | null;
  /** (x, z) の真下の地形の高さ(カメラや初期配置用)。なければ -Infinity */
  heightAt(x: number, z: number): number;
  dispose?(): void;
  /**
   * (追加)クーロン摩擦係数。TerrainSpec.friction をここに運ぶ。未指定なら 0.9。
   */
  friction?: number;
}

/** モーターの性能(S-04)。直流モーターの直線的なトルク-回転数特性。 */
export interface MotorSpec {
  /** 停動トルク(N·m)。必要トルクがこれを超えるとクランクが止まる */
  stallTorque: number;
}

export interface SimParams {
  /** 固定タイムステップ(s)。既定 1/240 */
  dt: number;
  gravity: number;
  /** 接触球の半径(m) */
  footRadius: number;
  /** 法線方向のばね定数(N/m)とダンパー係数(N·s/m) */
  contactStiffness: number;
  contactDamping: number;
  /** 機体フレーム(胴体)の質量(kg) */
  chassisMass: number;
  /**
   * リンクの線密度(kg/m)。
   * 注意:質量はコスト・重量表示と一致させるため `PART_SPECS`(src/core/model/parts.ts)から計算する。
   * この値は参考値で、シミュレーションでは使わない(互換のため残している)。
   */
  linkDensity: number;
  motor: MotorSpec;
  /** 転倒とみなす傾き(rad) */
  fallTilt: number;
}

export interface SimInput {
  design: DesignDoc;
  terrain: TerrainCollider;
  /** スタート位置(m)。機体はここに、最も低い脚先が地面に触れるように置かれる */
  start: { x: number; z: number };
  params?: Partial<SimParams>;
}

/** 脚列の 1 組(E-06 の複製結果) */
export interface LegInstance {
  /** 機体ローカルの z(m) */
  z: number;
  /** 前後反転(x 反転)した脚か */
  mirrored: boolean;
  /** この組のクランク位相(rad) */
  phase: number;
}

export interface FootState {
  /**
   * どの脚列の組のどのジョイントか。
   * 胴体(フレーム)の角の接触点は instance = -1、joint = 角の番号(0..7)。
   */
  instance: number;
  joint: number;
  position: Vec3;
  contact: boolean;
  /** 地面から受ける力(N、ワールド) */
  force: Vec3;
}

export interface SimSnapshot {
  time: number;
  /** 機体(フレーム)の姿勢。原点は設計座標の原点 */
  body: { position: Vec3; quaternion: Quat; velocity: Vec3; angularVelocity: Vec3 };
  /** 重心(ワールド) */
  com: Vec3;
  /** モーター角 θ(rad)・角速度(rad/s) */
  motorAngle: number;
  motorSpeed: number;
  /** クランクにかかる負荷トルク(N·m)(S-07 の可視化用) */
  motorTorque: number;
  /** トルク上限で止まっているか */
  stalled: boolean;
  /** 消費エネルギー Σ|τ·Δθ|(J) */
  energy: number;
  instances: LegInstance[];
  /** 組ごとの 2D 位置(設計座標 cm、[x0,y0,x1,y1,...])。描画は body の姿勢と合成する */
  legPositions: Float64Array[];
  /** 接触点の状態(脚先だけでなく接触判定した全点) */
  contacts: FootState[];
  fallen: boolean;
  /** 機構が組立不能になって止まった */
  jammed: boolean;
  /** (追加)重心の真下の地形上の点(S-07 の重心投影)。真下に地形がなければ null */
  comGround: Vec3 | null;
  /** (追加)機体の傾き(rad)。機体の上方向とワールドの +y のなす角。fallTilt を超えると転倒 */
  tilt: number;
}

export interface WalkerSim {
  readonly params: SimParams;
  /** 固定ステップを 1 回進める */
  step(): void;
  snapshot(): SimSnapshot;
  reset(): void;
}

/** (追加)ヘッドレス実行(評価・ゴースト用)の設定 */
export interface HeadlessOptions {
  /** 最大のシミュレーション時間(s) */
  maxTime: number;
  /** ゴール:重心が x >= goalX に達したら終了(StageDef.goal.x と同じ定義) */
  goalX?: number;
  /** 転倒・組立不能で止める(既定 true) */
  stopOnFail?: boolean;
  /** 停動がこの秒数続いたら止める(既定 Infinity = 止めない) */
  stallTimeout?: number;
}

/** (追加)ゴースト用の姿勢サンプル(10Hz)。脚の姿勢は design と motorAngle から運動学で再現する */
export interface PoseSample {
  time: number;
  position: Vec3;
  quaternion: Quat;
  motorAngle: number;
}

/** (追加)ヘッドレス実行の結果 */
export interface HeadlessResult {
  /** 終了時刻(s) */
  time: number;
  /** 重心の x 方向の移動量(m、後退なら負) */
  distance: number;
  reachedGoal: boolean;
  /** ゴールに達した時刻(s)。未到達なら null */
  goalTime: number | null;
  fallen: boolean;
  /** 終了時に停動していたか */
  stalled: boolean;
  /** 停動していた時間の合計(s) */
  stallTime: number;
  jammed: boolean;
  /** 消費エネルギー(J) */
  energy: number;
  /** 最大の傾き(rad) */
  maxTilt: number;
  /** 10Hz の姿勢列(t = 0 から) */
  trace: PoseSample[];
}

export const DEFAULT_SIM_PARAMS: SimParams = {
  dt: 1 / 240,
  gravity: 9.81,
  footRadius: 0.02,
  // 陰的に解くので硬くしても安定。70kg の機体が静止したときのめり込みは約 4mm
  contactStiffness: 50000,
  contactDamping: 1500,
  chassisMass: 8,
  // PART_SPECS.linkPerCm.mass(0.012kg/cm)に合わせた参考値
  linkDensity: 1.2,
  motor: { stallTorque: 60 },
  fallTilt: (60 * Math.PI) / 180,
};
