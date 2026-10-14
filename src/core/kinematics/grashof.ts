import type { CompiledMechanism } from './compile';
import type { FourBarMember, GrashofResult, GrashofType } from './analyze';

/**
 * E-05 グラスホフの条件。
 *
 * クランクを含む四節ループ O(固定)→ A(クランクピン)→ J → Q(固定)を設計から探し、
 * 4 本の長さ(地節 |OQ|、入力節 |OA|、中間節 |AJ|、出力節 |JQ|)で型を判定する。
 *
 *  - s + l < p + q(グラスホフ)
 *    - 最短が地節   → 両クランク(入力は一回転できる)
 *    - 最短が入力節 → てこクランク(入力は一回転できる)
 *    - 最短が中間節 → 両てこ(入力は一回転できない)
 *    - 最短が出力節 → てこクランク(回るのは出力側。入力は一回転できない)
 *  - s + l = p + q → 変位点(一直線に並ぶ姿勢で向きが定まらない)
 *  - s + l > p + q → 三重てこ(どの節も一回転できない)
 */

export interface FourBarLengths {
  ground: number;
  input: number;
  coupler: number;
  output: number;
}

export interface GrashofClass {
  grashof: boolean;
  type: GrashofType;
  shortest: FourBarMember;
  inputCanRotate: boolean;
}

/** 等号(変位点)とみなす相対誤差。設計座標は小数 6 桁に丸めるので、それより十分大きくとる */
const EQUAL_TOL = 1e-5;

export function classifyGrashof(len: FourBarLengths): GrashofClass {
  const members: [FourBarMember, number][] = [
    ['ground', len.ground],
    ['input', len.input],
    ['coupler', len.coupler],
    ['output', len.output],
  ];
  let s = Infinity;
  let l = -Infinity;
  for (const [, v] of members) {
    s = Math.min(s, v);
    l = Math.max(l, v);
  }
  const total = len.ground + len.input + len.coupler + len.output;
  const pq = total - s - l;
  const tol = EQUAL_TOL * Math.max(1, l);
  // 最短が複数あるときは、入力が回れる側(地節 → 入力節)を優先する
  const shortest = members.find(([, v]) => v <= s + tol)![0];
  const inputRotatesIfGrashof = shortest === 'ground' || shortest === 'input';
  if (Math.abs(s + l - pq) <= tol) {
    return { grashof: true, type: 'change-point', shortest, inputCanRotate: inputRotatesIfGrashof };
  }
  if (s + l > pq) {
    return { grashof: false, type: 'triple-rocker', shortest, inputCanRotate: false };
  }
  const type: GrashofType =
    shortest === 'ground'
      ? 'double-crank'
      : shortest === 'coupler'
        ? 'double-rocker'
        : 'crank-rocker';
  return { grashof: true, type, shortest, inputCanRotate: inputRotatesIfGrashof };
}

/**
 * クランクを含む四節ループをすべて探して判定する。
 * ループ:クランク軸 O(固定)→ クランクピン A → 中間節(A と J を含み、固定点を含まないリンク)
 * → 出力節(J と別の固定点 Q を含むリンク)。
 */
export function findGrashofLoops(mech: CompiledMechanism): GrashofResult[] {
  const { design, links, linkIds, fixed, jointIds, designPos } = mech;
  const out: GrashofResult[] = [];
  const dist = (i: number, j: number) =>
    Math.hypot(
      designPos[i * 2]! - designPos[j * 2]!,
      designPos[i * 2 + 1]! - designPos[j * 2 + 1]!,
    );
  const linksOf: number[][] = jointIds.map(() => []);
  links.forEach((ls, li) => ls.forEach((j) => linksOf[j]!.push(li)));

  for (const step of mech.plan) {
    if (step.kind !== 'crank') continue;
    const crank = design.cranks[step.crank];
    if (!crank) continue;
    const crankLink = linkIds.indexOf(crank.link);
    if (crankLink < 0) continue;
    const O = step.pivot;
    for (const A of links[crankLink]!) {
      if (A === O || fixed[A]) continue;
      for (const cl of linksOf[A]!) {
        if (cl === crankLink) continue;
        const coupler = links[cl]!;
        if (coupler.some((j) => fixed[j])) continue;
        for (const J of coupler) {
          if (J === A) continue;
          for (const rl of linksOf[J]!) {
            if (rl === crankLink || rl === cl) continue;
            const rocker = links[rl]!;
            if (rocker.includes(A)) continue;
            for (const Q of rocker) {
              if (!fixed[Q] || Q === O) continue;
              const lengths = {
                ground: dist(O, Q),
                input: dist(O, A),
                coupler: dist(A, J),
                output: dist(J, Q),
              };
              const cls = classifyGrashof(lengths);
              out.push({
                links: [null, linkIds[crankLink]!, linkIds[cl]!, linkIds[rl]!],
                lengths,
                grashof: cls.grashof,
                type: cls.type,
                joints: [jointIds[O]!, jointIds[A]!, jointIds[J]!, jointIds[Q]!],
                crank: crank.id,
                shortest: cls.shortest,
                inputCanRotate: cls.inputCanRotate,
              });
            }
          }
        }
      }
    }
  }
  return out;
}

/** メッセージ用の判定名(最短が出力節のてこクランクは 'rocker-crank' として区別する) */
export function grashofVariant(g: GrashofResult): GrashofType | 'rocker-crank' {
  return g.type === 'crank-rocker' && g.inputCanRotate === false ? 'rocker-crank' : g.type;
}
