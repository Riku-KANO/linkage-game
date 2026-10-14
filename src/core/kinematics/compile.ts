import type { DesignDoc, JointId } from '@/core/model/types';
import { circleIntersection } from '@/core/math/vec2';

/**
 * 設計データを、毎フレーム高速に解ける「解法プラン」に変換する。
 *
 * 解く順序(S-01):
 *  1. 固定点は既知
 *  2. クランクのリンク上の点は、ピボット回りの回転で既知になる
 *  3. 以下を進展がなくなるまで繰り返す
 *     - rigid: 既知の点を 2 つ以上持つリンクの残りの点は、剛体変換で決まる
 *     - dyad : 2 本のリンクがそれぞれ既知の点を持ち、共有する未知点 J は 2 円の交点(解析解)
 *  4. 残った未知点はまとめてニュートン法(レーベンバーグ・マルカート)で解く
 *  どのリンクとも既知の点につながらない点は「浮いている」として設計位置のままにする。
 */

export type SolveStep =
  | { kind: 'crank'; crank: number; pivot: number; joints: number[]; phase: number }
  | {
      kind: 'rigid';
      link: number;
      a: number;
      b: number;
      targets: number[];
      /** targets ごとの (u, v):a→b の単位ベクトル e と法線 n で表した局所座標 */
      local: Float64Array;
    }
  | {
      kind: 'dyad';
      j: number;
      a: number;
      ra: number;
      linkA: number;
      b: number;
      rb: number;
      linkB: number;
      /** 設計姿勢での向き(有向線分 a→b の左なら +1) */
      sign: 1 | -1;
    }
  | { kind: 'newton'; unknowns: number[]; constraints: DistanceConstraint[] };

export interface DistanceConstraint {
  i: number;
  j: number;
  d: number;
  link: number;
}

export type CompileIssueCode =
  | 'unknown-joint'
  | 'link-too-few-joints'
  | 'crank-pivot-not-fixed'
  | 'crank-pivot-not-on-link'
  | 'crank-link-missing'
  | 'crank-link-has-other-fixed'
  | 'link-all-fixed'
  | 'floating-joint'
  /** ニュートン法でまとめて解く点が多すぎる(計算が重くなる。試走前チェックで止める) */
  | 'newton-too-large';

export interface CompileIssue {
  code: CompileIssueCode;
  jointIds?: JointId[];
  linkIds?: string[];
  crankIds?: string[];
}

export interface CompiledMechanism {
  design: DesignDoc;
  jointIds: JointId[];
  jointIndex: Map<JointId, number>;
  /** 設計位置 [x0, y0, x1, y1, ...] */
  designPos: Float64Array;
  fixed: Uint8Array;
  /** リンクごとのジョイント index */
  links: number[][];
  linkIds: string[];
  plan: SolveStep[];
  /** どの既知点にもつながらない点(設計位置のまま) */
  floating: number[];
  /** ジョイントを解いた plan のステップ index(-1:固定点 / 浮いた点) */
  solvedBy: Int32Array;
  issues: CompileIssue[];
  footIndex: number;
  /**
   * 解いた後に確かめる距離(リンクごとに剛体を決める 2n-3 本)。
   * 解法プランが使わない余分な拘束(三角形で固めた部分など)が守られているかをここで検査する。
   */
  checks?: DistanceConstraint[];
}

const EPS = 1e-9;

/**
 * ニュートン法でまとめて解く点の上限。密行列の解法なので計算量は点の数の 3 乗で増える
 * (sec の計測:上限いっぱいの設計で 1 ステップ 17ms)。これを超える設計は試走前チェックで止める。
 */
export const MAX_NEWTON_JOINTS = 12;

export function compileMechanism(design: DesignDoc): CompiledMechanism {
  const issues: CompileIssue[] = [];
  const jointIds = design.joints.map((j) => j.id);
  const jointIndex = new Map<JointId, number>();
  jointIds.forEach((id, i) => jointIndex.set(id, i));
  const n = jointIds.length;
  const designPos = new Float64Array(n * 2);
  const fixed = new Uint8Array(n);
  design.joints.forEach((j, i) => {
    designPos[i * 2] = j.x;
    designPos[i * 2 + 1] = j.y;
    fixed[i] = j.fixed ? 1 : 0;
  });

  const links: number[][] = [];
  const linkIds: string[] = [];
  for (const link of design.links) {
    const idx: number[] = [];
    for (const jid of link.joints) {
      const k = jointIndex.get(jid);
      if (k === undefined) {
        issues.push({ code: 'unknown-joint', jointIds: [jid], linkIds: [link.id] });
        continue;
      }
      if (!idx.includes(k)) idx.push(k);
    }
    if (idx.length < 2) {
      issues.push({ code: 'link-too-few-joints', linkIds: [link.id] });
    }
    links.push(idx);
    linkIds.push(link.id);
  }

  const px = (i: number) => designPos[i * 2]!;
  const py = (i: number) => designPos[i * 2 + 1]!;
  const ddist = (i: number, j: number) => Math.hypot(px(i) - px(j), py(i) - py(j));

  // joint -> links containing it
  const jointLinks: number[][] = Array.from({ length: n }, () => []);
  links.forEach((ls, li) => ls.forEach((j) => jointLinks[j]!.push(li)));

  const known = new Uint8Array(n);
  const solvedBy = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (fixed[i]) known[i] = 1;

  const plan: SolveStep[] = [];

  // links whose joints are all fixed are part of the frame (redundant)
  links.forEach((ls, li) => {
    if (ls.length >= 2 && ls.every((j) => fixed[j])) {
      issues.push({ code: 'link-all-fixed', linkIds: [linkIds[li]!] });
    }
  });

  // 2. cranks
  design.cranks.forEach((c, ci) => {
    const li = linkIds.indexOf(c.link);
    const pivot = jointIndex.get(c.pivot);
    if (li < 0) {
      issues.push({ code: 'crank-link-missing', crankIds: [c.id] });
      return;
    }
    if (pivot === undefined || !fixed[pivot]) {
      issues.push({ code: 'crank-pivot-not-fixed', crankIds: [c.id], linkIds: [c.link] });
      return;
    }
    const ls = links[li]!;
    if (!ls.includes(pivot)) {
      issues.push({ code: 'crank-pivot-not-on-link', crankIds: [c.id], linkIds: [c.link] });
      return;
    }
    const others = ls.filter((j) => j !== pivot && fixed[j]);
    if (others.length > 0) {
      issues.push({
        code: 'crank-link-has-other-fixed',
        crankIds: [c.id],
        linkIds: [c.link],
        jointIds: others.map((j) => jointIds[j]!),
      });
    }
    const targets = ls.filter((j) => j !== pivot && !known[j]);
    const stepIndex = plan.length;
    plan.push({ kind: 'crank', crank: ci, pivot, joints: targets, phase: c.phase });
    targets.forEach((j) => {
      known[j] = 1;
      solvedBy[j] = stepIndex;
    });
  });

  // 3. rigid / dyad propagation
  let progress = true;
  while (progress) {
    progress = false;
    // rigid
    for (let li = 0; li < links.length; li++) {
      const ls = links[li]!;
      const unknown = ls.filter((j) => !known[j]);
      if (unknown.length === 0) continue;
      const knownPts = ls.filter((j) => known[j]);
      if (knownPts.length < 2) continue;
      // pick the pair of known points furthest apart for numerical robustness
      let a = -1;
      let b = -1;
      let best = EPS;
      for (let p = 0; p < knownPts.length; p++) {
        for (let q = p + 1; q < knownPts.length; q++) {
          const d = ddist(knownPts[p]!, knownPts[q]!);
          if (d > best) {
            best = d;
            a = knownPts[p]!;
            b = knownPts[q]!;
          }
        }
      }
      if (a < 0) continue;
      const ex = (px(b) - px(a)) / best;
      const ey = (py(b) - py(a)) / best;
      const local = new Float64Array(unknown.length * 2);
      unknown.forEach((t, k) => {
        const rx = px(t) - px(a);
        const ry = py(t) - py(a);
        local[k * 2] = rx * ex + ry * ey; // u along e
        local[k * 2 + 1] = -rx * ey + ry * ex; // v along n = (-ey, ex)
      });
      const stepIndex = plan.length;
      plan.push({ kind: 'rigid', link: li, a, b, targets: unknown, local });
      unknown.forEach((j) => {
        known[j] = 1;
        solvedBy[j] = stepIndex;
      });
      progress = true;
    }
    if (progress) continue;
    // dyad: first unknown joint that can be located from two links
    outer: for (let j = 0; j < n; j++) {
      if (known[j]) continue;
      const cand: { link: number; k: number }[] = [];
      for (const li of jointLinks[j]!) {
        for (const k of links[li]!) {
          if (k !== j && known[k]) {
            cand.push({ link: li, k });
            break;
          }
        }
      }
      for (let p = 0; p < cand.length; p++) {
        for (let q = p + 1; q < cand.length; q++) {
          const A = cand[p]!;
          const B = cand[q]!;
          if (A.link === B.link || A.k === B.k) continue;
          if (ddist(A.k, B.k) < EPS) continue;
          const ra = ddist(j, A.k);
          const rb = ddist(j, B.k);
          const cr =
            (px(B.k) - px(A.k)) * (py(j) - py(A.k)) - (py(B.k) - py(A.k)) * (px(j) - px(A.k));
          const stepIndex = plan.length;
          plan.push({
            kind: 'dyad',
            j,
            a: A.k,
            ra,
            linkA: A.link,
            b: B.k,
            rb,
            linkB: B.link,
            sign: cr >= 0 ? 1 : -1,
          });
          known[j] = 1;
          solvedBy[j] = stepIndex;
          progress = true;
          break outer;
        }
      }
    }
  }

  // 4. remaining unknowns: those connected (through links) to something known go to newton
  const remaining: number[] = [];
  for (let j = 0; j < n; j++) if (!known[j]) remaining.push(j);
  if (remaining.length > 0) {
    // flood-fill from known joints through links to find unknowns that are constrained
    const reach = new Uint8Array(n);
    const queue: number[] = [];
    for (let j = 0; j < n; j++)
      if (known[j]) {
        reach[j] = 1;
        queue.push(j);
      }
    while (queue.length) {
      const j = queue.pop()!;
      for (const li of jointLinks[j]!) {
        for (const k of links[li]!) {
          if (!reach[k]) {
            reach[k] = 1;
            queue.push(k);
          }
        }
      }
    }
    const unknowns = remaining.filter((j) => reach[j]);
    const floating = remaining.filter((j) => !reach[j]);
    if (unknowns.length > 0) {
      const inBlock = new Uint8Array(n);
      unknowns.forEach((j) => (inBlock[j] = 1));
      const constraints: DistanceConstraint[] = [];
      links.forEach((ls, li) => {
        for (let p = 0; p < ls.length; p++) {
          for (let q = p + 1; q < ls.length; q++) {
            const i = ls[p]!;
            const k = ls[q]!;
            if (inBlock[i] || inBlock[k]) constraints.push({ i, j: k, d: ddist(i, k), link: li });
          }
        }
      });
      if (unknowns.length > MAX_NEWTON_JOINTS) {
        issues.push({ code: 'newton-too-large', jointIds: unknowns.map((j) => jointIds[j]!) });
      }
      const stepIndex = plan.length;
      plan.push({ kind: 'newton', unknowns, constraints });
      unknowns.forEach((j) => (solvedBy[j] = stepIndex));
    }
    if (floating.length > 0) {
      issues.push({ code: 'floating-joint', jointIds: floating.map((j) => jointIds[j]!) });
    }
    return finish(floating);
  }
  return finish([]);

  function finish(floating: number[]): CompiledMechanism {
    const checks = rigidityChecks(links, designPos);
    return {
      design,
      jointIds,
      jointIndex,
      designPos,
      fixed,
      links,
      linkIds,
      plan,
      floating,
      solvedBy,
      issues,
      footIndex: design.foot ? (jointIndex.get(design.foot) ?? -1) : -1,
      checks,
    };
  }
}

/**
 * リンクごとに、剛体であることを確かめる距離の組を作る。
 * 最も離れた 2 点 a, b を基準に、a-b と、残りの各点から a・b への距離(2n-3 本)。
 */
function rigidityChecks(links: number[][], designPos: Float64Array): DistanceConstraint[] {
  const out: DistanceConstraint[] = [];
  const d = (i: number, j: number) =>
    Math.hypot(
      designPos[i * 2]! - designPos[j * 2]!,
      designPos[i * 2 + 1]! - designPos[j * 2 + 1]!,
    );
  links.forEach((ls, li) => {
    if (ls.length < 2) return;
    let a = ls[0]!;
    let b = ls[1]!;
    let best = -1;
    for (let p = 0; p < ls.length; p++) {
      for (let q = p + 1; q < ls.length; q++) {
        const v = d(ls[p]!, ls[q]!);
        if (v > best) {
          best = v;
          a = ls[p]!;
          b = ls[q]!;
        }
      }
    }
    out.push({ i: a, j: b, d: best, link: li });
    for (const t of ls) {
      if (t === a || t === b) continue;
      out.push({ i: a, j: t, d: d(a, t), link: li });
      out.push({ i: b, j: t, d: d(b, t), link: li });
    }
  });
  return out;
}

/** circleIntersection を再輸出(テストや解析で使う) */
export { circleIntersection };
