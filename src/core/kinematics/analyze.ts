import type { DesignDoc } from '@/core/model/types';
import { compileMechanism, type CompiledMechanism, type CompileIssue } from './compile';
import { sampleCycle, type CycleSample } from './solve';
import { findGrashofLoops, grashofVariant } from './grashof';
import { analyzeConstraints, type ConstraintAnalysis } from './constraints';

/**
 * 機構の静的・動的な解析結果(E-04 自由度、E-05 不正状態の警告)。
 * エディタはこの結果だけを見て表示を決める。
 */
export interface MechanismAnalysis {
  /** グリューブラーの式 M = 3(n-1) - 2j による自由度(クランク入力を含む機構全体の可動度) */
  dof: number;
  grubler: { n: number; j: number };
  /** 0 以下:動かない、1:正常、2 以上:ぐらつく */
  dofStatus: 'locked' | 'ok' | 'loose';
  /** 設計姿勢(θ=0)で組み立てられるか */
  assemblable: boolean;
  /** クランクが一回転できるか */
  fullRotation: boolean;
  /** 組立不能になるモーター角(rad、サンプル点) */
  failAngles: number[];
  /** 死点に近い姿勢 */
  deadPoints: DeadPoint[];
  /** 四節ループごとのグラスホフ判定 */
  grashof: GrashofResult[];
  /** 赤く表示するリンク・ジョイント */
  problemLinks: string[];
  problemJoints: string[];
  /** 表示用メッセージ(文言は i18n キー) */
  messages: AnalysisMessage[];
  /** 1 回転分のサンプル(軌道表示に使う) */
  cycle: CycleSample;
  compiled: CompiledMechanism;
  /** 組立不能になる角度の範囲(サンプル点の連続区間。サンプル順に thetaStart → thetaEnd) */
  failRanges?: AngleRange[];
  /** E-04 余分な拘束にかかわるリンク(過拘束の部分。problemLinks にも入る) */
  redundantLinks?: string[];
  /** E-04 クランクを止めても動ける点(ぐらつく部分。problemJoints にも入る) */
  looseJoints?: string[];
  /** E-04 クランクを止めても動けるリンク */
  looseLinks?: string[];
  /** E-04 拘束のヤコビアンによる解析の詳細 */
  constraints?: ConstraintAnalysis;
}

/** モーター角の区間(rad)。サンプル順に start → end(1 周をまたぐことがある) */
export interface AngleRange {
  thetaStart: number;
  thetaEnd: number;
}

/**
 * 死点に近い姿勢。slack が閾値を下回るサンプルの連続区間ごとに 1 つ。
 * theta・joint・slack は区間の中で最も死点に近いサンプルの値。
 */
export interface DeadPoint {
  theta: number;
  joint: string;
  slack: number;
  /** 区間の最初と最後のサンプル角(rad) */
  thetaStart?: number;
  thetaEnd?: number;
  /** 一直線に近づく 2 本のリンク(joint を 2 円の交点として決めるリンク) */
  links?: string[];
}

export type GrashofType =
  'crank-rocker' | 'double-crank' | 'double-rocker' | 'change-point' | 'triple-rocker';

/** 四節ループの各節 */
export type FourBarMember = 'ground' | 'input' | 'coupler' | 'output';

export interface GrashofResult {
  /** [地節, 入力節(クランク), 中間節(カップラー), 出力節(揺動節)] のリンク id。地節は固定点同士なので null */
  links: [string | null, string, string, string];
  lengths: { ground: number; input: number; coupler: number; output: number };
  /** s + l <= p + q */
  grashof: boolean;
  type: GrashofType;
  /** ループのジョイント id [クランク軸 O, クランクピン A, 中間節と出力節の結合点 J, 出力節の固定点 Q] */
  joints?: [string, string, string, string];
  /** このループを駆動するクランクの id */
  crank?: string;
  /** 最短の節 */
  shortest?: FourBarMember;
  /**
   * 入力節(クランク)が一回転できるか。最短が地節か入力節のグラスホフ機構(変位点を含む)なら true。
   * 最短が出力節のとき type は 'crank-rocker' だが、回るのは出力側なので false。
   */
  inputCanRotate?: boolean;
}

export type AnalysisSeverity = 'info' | 'warn' | 'error';
export interface AnalysisMessage {
  severity: AnalysisSeverity;
  /** i18n キー(src/i18n/ja.ts の analysis.*) */
  key: string;
  params?: Record<string, string | number>;
}

export interface AnalyzeOptions {
  /** 1 回転のサンプル数 */
  steps?: number;
  /** slack がこれ未満なら死点に近いとみなす */
  deadPointSlack?: number;
}

/** グリューブラーの式で自由度を計算する(E-04) */
export function grublerDof(design: DesignDoc): { dof: number; n: number; j: number } {
  const valid = new Set(design.joints.map((j) => j.id));
  const links = design.links.filter(
    (l) => new Set(l.joints.filter((id) => valid.has(id))).size >= 2,
  );
  const n = links.length + 1; // + ground (frame)
  let j = 0;
  for (const joint of design.joints) {
    let bodies = joint.fixed ? 1 : 0;
    for (const l of links) if (l.joints.includes(joint.id)) bodies++;
    j += Math.max(0, bodies - 1);
  }
  return { dof: 3 * (n - 1) - 2 * j, n, j };
}

export function analyzeMechanism(
  design: DesignDoc,
  options: AnalyzeOptions = {},
): MechanismAnalysis {
  const steps = options.steps ?? 180;
  const deadSlack = options.deadPointSlack ?? 0.05;
  const compiled = compileMechanism(design);
  const { dof, n, j } = grublerDof(design);
  const dofStatus = dof <= 0 ? 'locked' : dof === 1 ? 'ok' : 'loose';
  const cycle = sampleCycle(compiled, steps);
  const failAngles: number[] = [];
  cycle.ok.forEach((ok, s) => {
    if (!ok) failAngles.push(cycle.thetas[s]!);
  });
  const messages: AnalysisMessage[] = [];
  const problemLinks = new Set<string>();
  const problemJoints = new Set<string>();
  const linkId = (i: number) => compiled.linkIds[i]!;
  const jointId = (i: number) => compiled.jointIds[i]!;

  messages.push({
    severity: dofStatus === 'ok' ? 'info' : 'error',
    key: `analysis.dof.${dofStatus}`,
    params: { dof },
  });
  if (design.cranks.length === 0 && design.joints.length > 0) {
    messages.push({ severity: 'warn', key: 'analysis.noCrank' });
  }

  // E-05 組立不能:原因のリンク・点と、届かない角度の範囲
  const failRanges = circularRuns(cycle.steps, (s) => !cycle.ok[s]).map((run) => ({
    thetaStart: cycle.thetas[run[0]!]!,
    thetaEnd: cycle.thetas[run[run.length - 1]!]!,
  }));
  for (const l of cycle.failedLinks ?? []) problemLinks.add(linkId(l));
  for (const jt of cycle.causeJoints ?? []) problemJoints.add(jointId(jt));
  if (!cycle.ok[0]) messages.push({ severity: 'error', key: 'analysis.notAssemblable' });
  else if (!cycle.fullRotation) {
    const first = failRanges[0];
    messages.push({
      severity: 'error',
      key: 'analysis.noFullRotation',
      params: first
        ? { from: toDeg(first.thetaStart), to: toDeg(first.thetaEnd), ranges: failRanges.length }
        : {},
    });
  }
  for (const issue of compiled.issues) messages.push(issueMessage(issue));

  // E-05 死点:2 円の交点がほぼ接する(リンクが一直線に並ぶ)姿勢
  const deadPoints = findDeadPoints(compiled, cycle, deadSlack);
  for (const dp of deadPoints) {
    problemJoints.add(dp.joint);
    messages.push({
      severity: 'warn',
      key: 'analysis.deadPoint',
      params: { angle: toDeg(dp.theta), joint: dp.joint },
    });
  }

  // E-04 過拘束・ぐらつく部分(拘束のヤコビアンの零空間・左零空間)
  const constraints = constraintsAtRegularPose(compiled, cycle);
  for (const l of constraints.redundantLinks) problemLinks.add(l);
  for (const jt of constraints.looseJoints) problemJoints.add(jt);
  if (constraints.redundantLinks.length > 0) {
    messages.push({
      severity: 'warn',
      key: 'analysis.redundantLinks',
      params: { count: constraints.redundancy },
    });
  }
  if (constraints.looseJoints.length > 0) {
    messages.push({
      severity: 'warn',
      key: 'analysis.looseJoints',
      params: { count: constraints.freedom },
    });
  }

  // E-05 グラスホフ判定(同じ判定は 1 つのメッセージにまとめる)
  const grashof = findGrashofLoops(compiled);
  const grashofCounts = new Map<string, number>();
  for (const g of grashof) {
    const v = grashofVariant(g);
    grashofCounts.set(v, (grashofCounts.get(v) ?? 0) + 1);
  }
  for (const [variant, count] of grashofCounts) {
    messages.push({
      severity: variant === 'crank-rocker' || variant === 'double-crank' ? 'info' : 'warn',
      key: `analysis.grashof.${variant}`,
      params: { count },
    });
  }

  return {
    dof,
    grubler: { n, j },
    dofStatus,
    assemblable: cycle.ok[0] ?? false,
    fullRotation: cycle.fullRotation,
    failAngles,
    deadPoints,
    grashof,
    problemLinks: [...problemLinks],
    problemJoints: [...problemJoints],
    messages,
    cycle,
    compiled,
    failRanges,
    redundantLinks: constraints.redundantLinks,
    looseJoints: constraints.looseJoints,
    looseLinks: constraints.looseLinks,
    constraints,
  };
}

/**
 * 設計姿勢で拘束を解析する。設計姿勢がたまたま特異(リンクが一直線に並ぶなど)だと、
 * 見かけの過拘束とぐらつきが同時に出るので、そのときは余裕(slack)の最も大きい別の姿勢でも確かめる。
 */
function constraintsAtRegularPose(mech: CompiledMechanism, cycle: CycleSample): ConstraintAnalysis {
  const atDesign = analyzeConstraints(mech);
  if (atDesign.redundancy === 0 || atDesign.freedom === 0) return atDesign;
  let best = -1;
  for (let s = 1; s < cycle.steps; s++) {
    if (!cycle.ok[s]) continue;
    const sl = cycle.slack?.[s] ?? 1;
    if (best < 0 || sl > (cycle.slack?.[best] ?? 1)) best = s;
  }
  if (best < 0) return atDesign;
  const alt = analyzeConstraints(mech, cycle.positions[best]);
  return alt.redundancy + alt.freedom < atDesign.redundancy + atDesign.freedom ? alt : atDesign;
}

/** rad → 0..359 の整数の度 */
function toDeg(theta: number): number {
  const d = Math.round((theta * 180) / Math.PI) % 360;
  return d < 0 ? d + 360 : d;
}

/**
 * pred を満たすサンプルの連続区間(1 周を循環とみなす)。区間はサンプル index の配列で、
 * 区間の並びは最初のサンプル index の昇順(0 をまたぐ区間は先頭)。
 */
export function circularRuns(steps: number, pred: (s: number) => boolean): number[][] {
  if (steps <= 0) return [];
  let start = -1;
  for (let s = 0; s < steps; s++) {
    if (!pred(s)) {
      start = s;
      break;
    }
  }
  if (start < 0) return [Array.from({ length: steps }, (_, s) => s)];
  const runs: number[][] = [];
  let cur: number[] | null = null;
  for (let k = 1; k <= steps; k++) {
    const s = (start + k) % steps;
    if (pred(s)) (cur ??= []).push(s);
    else if (cur) {
      runs.push(cur);
      cur = null;
    }
  }
  // start の次から 1 周したので、0 をまたぐ区間が最後に来ることがある。先頭の index で並べ直す
  const key = (r: number[]) => (r[0]! > r[r.length - 1]! ? -1 : r[0]!);
  return runs.sort((a, b) => key(a) - key(b));
}

function findDeadPoints(
  mech: CompiledMechanism,
  cycle: CycleSample,
  threshold: number,
): DeadPoint[] {
  const { slack, slackJoint } = cycle;
  if (!slack || !slackJoint) return [];
  const runs = circularRuns(
    cycle.steps,
    (s) => cycle.ok[s]! && slackJoint[s]! >= 0 && slack[s]! < threshold,
  );
  return runs.map((run) => {
    let rep = run[0]!;
    for (const s of run) if (slack[s]! < slack[rep]!) rep = s;
    const j = slackJoint[rep]!;
    const step = mech.plan[mech.solvedBy[j]!];
    const links =
      step && step.kind === 'dyad'
        ? [mech.linkIds[step.linkA]!, mech.linkIds[step.linkB]!]
        : undefined;
    return {
      theta: cycle.thetas[rep]!,
      joint: mech.jointIds[j]!,
      slack: slack[rep]!,
      thetaStart: cycle.thetas[run[0]!]!,
      thetaEnd: cycle.thetas[run[run.length - 1]!]!,
      links,
    };
  });
}

function issueMessage(issue: CompileIssue): AnalysisMessage {
  return {
    severity: issue.code === 'floating-joint' ? 'warn' : 'error',
    key: `analysis.issue.${issue.code}`,
  };
}
