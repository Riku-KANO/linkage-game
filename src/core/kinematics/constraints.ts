import type { CompiledMechanism } from './compile';
import { nullSpace, transpose } from './linalg';

/**
 * E-04 過拘束・ぐらつきの場所を特定する。
 *
 * 各リンクを剛体(x, y, 角度 の 3 変数)とし、ピンジョイントごとに「つながったリンク上の点の速度が等しい」
 * (固定点なら 0)という拘束を 2 本ずつ、クランクごとに「クランクの角速度が 0」(クランクを止める)を 1 本立てる。
 * この拘束のヤコビアン J(行 = 拘束、列 = 変数)について
 *  - 零空間 J v = 0 :クランクを止めても残る動き → 動く点・リンクが「ぐらつく」部分
 *  - 左零空間 Jᵀ u = 0 :どこにも動きを生まない拘束の組み合わせ(内力)→ 力がかかるリンクが「過拘束」の部分
 * グリューブラーの式とは freedom − redundancy = dof − クランク数 の関係にある。
 */
export interface ConstraintAnalysis {
  /** 拘束式の数(ピンごとに 2 本 + クランクごとに 1 本) */
  rows: number;
  /** 変数の数(リンクごとに 3) */
  cols: number;
  rank: number;
  /** 余分な拘束の数(rows − rank)。1 以上なら過拘束の部分がある */
  redundancy: number;
  /** クランクを止めても残る自由度(cols − rank)。1 以上ならぐらつく部分がある */
  freedom: number;
  /** 余分な拘束にかかわるリンク id(過拘束の部分) */
  redundantLinks: string[];
  /** クランクを止めても動ける点の id */
  looseJoints: string[];
  /** クランクを止めても動けるリンクの id */
  looseLinks: string[];
  /** クランクを固定して判定したか。クランクがなければ動き全体が残るので looseJoints/looseLinks は空 */
  crankHeld: boolean;
}

/** 零空間・左零空間の成分を 0 とみなす大きさ(基底は単位ベクトル) */
const SUPPORT_TOL = 1e-6;

interface PinRow {
  joint: number;
  body: number;
  /** 相手のリンク(-1:フレーム) */
  ref: number;
  comp: 0 | 1;
}

/**
 * positions(省略時は設計位置)の姿勢で拘束のヤコビアンを作り、過拘束・ぐらつく部分を返す。
 */
export function analyzeConstraints(
  mech: CompiledMechanism,
  positions: Float64Array = mech.designPos,
): ConstraintAnalysis {
  const { links, linkIds, jointIds, fixed } = mech;
  // 2 点以上をもつリンクだけが剛体(grublerDof と同じ数え方)
  const bodyLink: number[] = [];
  const bodyOf = new Int32Array(links.length).fill(-1);
  links.forEach((ls, li) => {
    if (ls.length >= 2) {
      bodyOf[li] = bodyLink.length;
      bodyLink.push(li);
    }
  });
  const nb = bodyLink.length;
  const cols = nb * 3;
  // 各リンクの重心と代表長さ(角速度の列を他の列と同じ大きさにそろえる)
  const cx = new Float64Array(nb);
  const cy = new Float64Array(nb);
  let Lc = 1;
  bodyLink.forEach((li, b) => {
    const ls = links[li]!;
    for (const j of ls) {
      cx[b]! += positions[j * 2]!;
      cy[b]! += positions[j * 2 + 1]!;
    }
    cx[b]! /= ls.length;
    cy[b]! /= ls.length;
    for (const j of ls) {
      Lc = Math.max(Lc, Math.hypot(positions[j * 2]! - cx[b]!, positions[j * 2 + 1]! - cy[b]!));
    }
  });
  const jointBodies: number[][] = jointIds.map(() => []);
  bodyLink.forEach((li, b) => links[li]!.forEach((j) => jointBodies[j]!.push(b)));

  // 行を作る
  const pinRows: PinRow[] = [];
  for (let j = 0; j < jointIds.length; j++) {
    const bs = jointBodies[j]!;
    if (fixed[j]) {
      for (const b of bs) {
        pinRows.push(
          { joint: j, body: b, ref: -1, comp: 0 },
          { joint: j, body: b, ref: -1, comp: 1 },
        );
      }
    } else {
      for (let k = 1; k < bs.length; k++) {
        const b = bs[k]!;
        const ref = bs[0]!;
        pinRows.push({ joint: j, body: b, ref, comp: 0 }, { joint: j, body: b, ref, comp: 1 });
      }
    }
  }
  const crankBodies: number[] = [];
  for (const step of mech.plan) {
    if (step.kind !== 'crank') continue;
    const crank = mech.design.cranks[step.crank];
    const li = crank ? linkIds.indexOf(crank.link) : -1;
    const b = li >= 0 ? bodyOf[li]! : -1;
    if (b >= 0) crankBodies.push(b);
  }
  const rows = pinRows.length + crankBodies.length;
  const empty = {
    rows,
    cols,
    rank: 0,
    redundancy: rows,
    freedom: cols,
    redundantLinks: [],
    looseJoints: [],
    looseLinks: [],
    crankHeld: crankBodies.length > 0,
  };
  if (cols === 0) return empty;

  // 点 j をリンク b 上の点とみなしたときの速度:(vx − ω·(y − cy), vy + ω·(x − cx))、ω の列は Lc 倍で正規化
  const armX = (j: number, b: number) => (positions[j * 2]! - cx[b]!) / Lc;
  const armY = (j: number, b: number) => (positions[j * 2 + 1]! - cy[b]!) / Lc;
  const J = new Float64Array(rows * cols);
  const put = (r: number, b: number, comp: 0 | 1, j: number, sign: number) => {
    const base = r * cols + b * 3;
    if (comp === 0) {
      J[base]! += sign;
      J[base + 2]! += -sign * armY(j, b);
    } else {
      J[base + 1]! += sign;
      J[base + 2]! += sign * armX(j, b);
    }
  };
  pinRows.forEach((pr, r) => {
    put(r, pr.body, pr.comp, pr.joint, 1);
    if (pr.ref >= 0) put(r, pr.ref, pr.comp, pr.joint, -1);
  });
  crankBodies.forEach((b, k) => {
    J[(pinRows.length + k) * cols + b * 3 + 2] = 1;
  });

  // 零空間:クランクを止めても残る動き
  const ns = nullSpace(J, rows, cols);
  const rank = ns.rank;
  const looseBody = new Uint8Array(nb);
  const looseJoint = new Uint8Array(jointIds.length);
  const crankHeld = crankBodies.length > 0;
  if (crankHeld) {
    for (const z of ns.basis) {
      for (let b = 0; b < nb; b++) {
        if (
          Math.abs(z[b * 3]!) > SUPPORT_TOL ||
          Math.abs(z[b * 3 + 1]!) > SUPPORT_TOL ||
          Math.abs(z[b * 3 + 2]!) > SUPPORT_TOL
        ) {
          looseBody[b] = 1;
        }
      }
      for (let j = 0; j < jointIds.length; j++) {
        const b = jointBodies[j]![0];
        if (b === undefined || fixed[j]) continue;
        const w = z[b * 3 + 2]!;
        const vx = z[b * 3]! - w * armY(j, b);
        const vy = z[b * 3 + 1]! + w * armX(j, b);
        if (Math.hypot(vx, vy) > SUPPORT_TOL) looseJoint[j] = 1;
      }
    }
  }

  // 左零空間:内力(自己釣り合いの力)。力がかかるリンクが過拘束の部分
  const redundantBody = new Uint8Array(nb);
  if (rows > rank) {
    const left = nullSpace(transpose(J, rows, cols), cols, rows);
    // (リンク, 点) ごとの力。fx, fy を 2 本の配列に
    const fx = new Float64Array(nb * jointIds.length);
    const fy = new Float64Array(nb * jointIds.length);
    for (const u of left.basis) {
      fx.fill(0);
      fy.fill(0);
      pinRows.forEach((pr, r) => {
        const lam = u[r]!;
        const f = pr.comp === 0 ? fx : fy;
        f[pr.body * jointIds.length + pr.joint]! += lam;
        if (pr.ref >= 0) f[pr.ref * jointIds.length + pr.joint]! -= lam;
      });
      for (let b = 0; b < nb; b++) {
        for (let j = 0; j < jointIds.length; j++) {
          const k = b * jointIds.length + j;
          if (Math.hypot(fx[k]!, fy[k]!) > SUPPORT_TOL) redundantBody[b] = 1;
        }
      }
      crankBodies.forEach((b, k) => {
        if (Math.abs(u[pinRows.length + k]!) > SUPPORT_TOL) redundantBody[b] = 1;
      });
    }
  }

  const pickLinks = (flags: Uint8Array) =>
    bodyLink.filter((_, b) => flags[b]).map((li) => linkIds[li]!);
  return {
    rows,
    cols,
    rank,
    redundancy: rows - rank,
    freedom: cols - rank,
    redundantLinks: pickLinks(redundantBody),
    looseJoints: jointIds.filter((_, j) => looseJoint[j]),
    looseLinks: pickLinks(looseBody),
    crankHeld,
  };
}
