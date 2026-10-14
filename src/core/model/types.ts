/**
 * 設計データ(DesignDoc)の型定義。全モジュール共通の契約。
 *
 * 座標系(設計ビュー):単位は cm。+x が前進方向、+y が上。
 * 3D 試走ビューでは機構平面が body ローカルの xy 平面になり、脚列は z 方向(奥行き)に複製される。
 *
 * 変更するときは DESIGN_VERSION を上げ、src/core/model/migrate.ts に移行処理を足すこと(データ互換の非機能要件)。
 */

export const DESIGN_VERSION = 1 as const;

/** 設計単位(cm)から物理単位(m)への換算 */
export const CM = 0.01;

export type JointId = string;
export type LinkId = string;
export type CrankId = string;

/** ジョイント(リンク上の点)。複数のリンクが共有するとピンジョイントになる。 */
export interface Joint {
  id: JointId;
  /** 設計位置(cm)。クランク角 0 のときの姿勢。 */
  x: number;
  y: number;
  /** 固定点(フレームに固定)。全ての固定点は同じ剛体(機体フレーム)に属する。 */
  fixed: boolean;
}

/**
 * リンク(剛体)。2 点なら棒、3 点以上なら剛体プレート(三角リンクや延長したカップラー)。
 * 点同士の相対位置は設計位置から決まり、運動中は不変。
 */
export interface Link {
  id: LinkId;
  joints: JointId[];
}

/** クランク:モーターで回転するリンク。共有のモーター角 θ に phase を足した角度だけ設計姿勢から回る。 */
export interface Crank {
  id: CrankId;
  link: LinkId;
  /** 回転中心となる固定点(モーター軸) */
  pivot: JointId;
  /** 位相(rad) */
  phase: number;
}

export interface MotorSettings {
  /** 目標回転数(rpm)。符号つき。正は設計ビューで反時計回り。|rpm| <= MAX_RPM */
  rpm: number;
}

export const MAX_RPM = 120;

/** E-06 脚列の複製 */
export interface LegLayout {
  /** 奥行き方向に並べる脚の組数(1以上) */
  count: number;
  /** 隣り合う組のクランク位相差(度) */
  phaseStepDeg: number;
  /** 組の間隔(cm) */
  spacing: number;
  /** 各組に前後反転(x 反転)した脚を追加するか。同じクランクを共有する。 */
  mirrorX: boolean;
}

export interface DesignDoc {
  version: typeof DESIGN_VERSION;
  name: string;
  joints: Joint[];
  links: Link[];
  cranks: Crank[];
  /** 脚先(軌道を強調表示し、主な接地点として扱うジョイント)。未指定なら null */
  foot: JointId | null;
  motor: MotorSettings;
  legs: LegLayout;
}

export const DEFAULT_LEGS: LegLayout = { count: 1, phaseStepDeg: 0, spacing: 20, mirrorX: false };

export function createEmptyDesign(name = '新しい機械'): DesignDoc {
  return {
    version: DESIGN_VERSION,
    name,
    joints: [],
    links: [],
    cranks: [],
    foot: null,
    motor: { rpm: 30 },
    legs: { ...DEFAULT_LEGS },
  };
}

/** 部品の種類(E-01)。MVP はリンク・ピン・固定点・クランクのみ。 */
export type PartKind = 'link' | 'pin' | 'fixed' | 'crank' | 'slider' | 'gear' | 'spring';
