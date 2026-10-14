import type { DesignDoc } from '@/core/model/types';
import { compileMechanism, type CompiledMechanism, type CompileIssue } from './compile';
import { sampleCycle, type CycleSample } from './solve';
import { findGrashofLoops, grashofVariant } from './grashof';

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
}

export interface DeadPoint {
  theta: number;
  joint: string;
  slack: number;
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
  const deadPoints: DeadPoint[] = [];
  const messages: AnalysisMessage[] = [];
  const problemLinks = new Set<string>();
  const problemJoints = new Set<string>();

  messages.push({
    severity: dofStatus === 'ok' ? 'info' : 'error',
    key: `analysis.dof.${dofStatus}`,
    params: { dof },
  });
  if (design.cranks.length === 0 && design.joints.length > 0) {
    messages.push({ severity: 'warn', key: 'analysis.noCrank' });
  }
  if (!cycle.ok[0]) messages.push({ severity: 'error', key: 'analysis.notAssemblable' });
  else if (!cycle.fullRotation)
    messages.push({ severity: 'error', key: 'analysis.noFullRotation' });
  for (const issue of compiled.issues) messages.push(issueMessage(issue));

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
  };
  // TODO(kinematics-analysis): dead points (deadSlack), Grashof loops, problem links/joints
  void deadSlack;
}

function issueMessage(issue: CompileIssue): AnalysisMessage {
  return {
    severity: issue.code === 'floating-joint' ? 'warn' : 'error',
    key: `analysis.issue.${issue.code}`,
  };
}
