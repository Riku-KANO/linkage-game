import { analyzeMechanism, walkDirection, type MechanismAnalysis } from '@/core/kinematics';
import type { GrashofResult } from '@/core/kinematics';
import { CM, type DesignDoc } from '@/core/model/types';
import { maxStepUp } from '@/game/stages';
import type { FailReason, Progress, StageDef } from '@/game/types';

/**
 * 状況に応じた一言(GUIDE-4)。設計と解析結果(と、あればステージ・進行・最近の出来事)から、
 * 今いちばん役に立つ一言を 1 つ選ぶ純関数。表示は TipBubble、文言は guide.tip.<id>。
 *
 * 優先順:組み始めの手引き → 動かない理由(試走できない問題)→ 脚先の問題 → 試走の結果 → 軌道の改善。
 * 先に当てはまったものを返す。閉じられた一言(tipDismissed)は飛ばして次を探す。
 */

export type TipId =
  | 'empty'
  | 'noFixed'
  | 'noCrank'
  | 'floating'
  | 'dofLoose'
  | 'dofLocked'
  | 'noFullRotation'
  | 'noFoot'
  | 'footNotLowest'
  | 'walksBackward'
  | 'lowLiftStep'
  | 'fallen'
  | 'timeout'
  | 'stalled'
  | 'lowLift'
  | 'noFlat'
  | 'special';

/**
 * info:次の一歩・改善の提案、warn:試走はできるが失敗しそう、error:このままでは試走できない
 * (試走前チェックの error と同じ)
 */
export type TipSeverity = 'info' | 'warn' | 'error';

export interface Tip {
  id: TipId;
  /** 文言キー(guide.tip.*)。`[[term|表示]]` の用語リンクを含むことがある */
  key: string;
  params?: Record<string, string | number>;
  severity: TipSeverity;
  /** 図の上で示すとよいリンク・点(分かるとき) */
  linkIds?: string[];
  jointIds?: string[];
}

/** 最近の出来事(古い順)。統合側が試走の結果や「閉じた」操作を積んで渡す */
export type GuideEvent =
  | { type: 'runFailed'; reason: FailReason }
  | { type: 'runCleared' }
  | { type: 'tipDismissed'; tip: TipId };

export interface TipInput {
  design: DesignDoc;
  /** エディタが計算済みの解析(なければここで計算する) */
  analysis?: MechanismAnalysis;
  stage?: StageDef | null;
  progress?: Progress | null;
  events?: readonly GuideEvent[];
  /** チュートリアルの吹き出しが出ている間は一言を出さない(吹き出しを優先する) */
  tutorialActive?: boolean;
}

/** 足上げがこれ未満だと、戻るときに脚先が地面をこする(cm) */
export const LOW_LIFT_CM = 3;
/** 段差のあるステージでは、足上げを段差のこの倍率より高くしたい */
export const STEP_MARGIN = 1.2;
/** これ以上の段差があるステージで、足上げを確かめる(cm) */
export const MIN_STEP_CM = 2;
/** 脚先より他の点がこれ以上低いと、その点が先に地面に当たる(cm) */
export const BELOW_FOOT_CM = 1;

/** 軌道の底が平らでない:平らさ(cm)がこれを超え、かつ足上げに対しても大きい */
export function isBumpy(flatness: number, lift: number): boolean {
  return flatness > Math.max(1.5, 0.15 * lift);
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function pickTip(input: TipInput): Tip | null {
  if (input.tutorialActive) return null;
  const dismissed = new Set<TipId>();
  for (const e of input.events ?? []) if (e.type === 'tipDismissed') dismissed.add(e.tip);
  for (const tip of candidates(input)) if (!dismissed.has(tip.id)) return tip;
  return null;
}

/** 当てはまる一言を優先順に(pickTip は先頭の閉じられていないものを返す) */
export function* candidates(input: TipInput): Generator<Tip> {
  const { design, stage } = input;
  const tip = (
    id: TipId,
    severity: TipSeverity,
    extra: Omit<Tip, 'id' | 'severity' | 'key'> & { key?: string } = {},
  ): Tip => ({ id, key: `guide.tip.${id}`, severity, ...extra });

  // 1. 組み始めの手引き
  if (design.links.length === 0) {
    const veteran = Object.keys(input.progress?.best ?? {}).length > 0;
    yield tip('empty', 'info', veteran ? { key: 'guide.tip.emptyShort' } : {});
    return;
  }
  if (!design.joints.some((j) => j.fixed)) {
    yield tip('noFixed', 'info');
    return;
  }
  const cranksAllowed = !stage || stage.parts.includes('crank');
  if (design.cranks.length === 0 && cranksAllowed) yield tip('noCrank', 'info');

  const analysis = input.analysis ?? analyzeMechanism(design);
  const floating = analysis.compiled.issues
    .filter((i) => i.code === 'floating-joint')
    .flatMap((i) => i.jointIds ?? []);
  if (floating.length > 0) yield tip('floating', 'warn', { jointIds: floating });
  if (design.cranks.length === 0) return;

  // 2. 動かない理由(自由度・一回転)
  const { dof } = analysis;
  if (dof >= 2) {
    yield tip('dofLoose', 'error', {
      params: { dof, need: dof - 1 },
      ...(analysis.looseJoints?.length ? { jointIds: analysis.looseJoints } : {}),
    });
    return;
  }
  if (dof <= 0 && !analysis.specialGeometry) {
    yield tip('dofLocked', 'error', {
      params: { dof, extra: 1 - dof },
      ...(analysis.problemLinks.length ? { linkIds: analysis.problemLinks } : {}),
    });
    return;
  }
  if (!analysis.fullRotation) {
    const highlight = analysis.problemLinks.length ? { linkIds: analysis.problemLinks } : {};
    const g = analysis.grashof.find((x) => x.inputCanRotate === false);
    const max = g ? maxCrankLength(g) : null;
    if (g && max !== null && max < g.lengths.input) {
      yield tip('noFullRotation', 'error', {
        key: 'guide.tip.noFullRotationGrashof',
        params: { crank: round1(g.lengths.input), max: Math.floor(max) },
        linkIds: [g.links[1]],
      });
    } else yield tip('noFullRotation', 'error', highlight);
    return;
  }

  // 3. 脚先
  const foot = analysis.foot;
  const footIndex = analysis.compiled.footIndex;
  if (design.foot === null || !foot || footIndex < 0) {
    yield tip('noFoot', 'info');
    return;
  }
  const below = jointsBelowFoot(analysis, footIndex, foot.minY - BELOW_FOOT_CM);
  if (below.length > 0) yield tip('footNotLowest', 'warn', { jointIds: below });
  if (walkDirection(foot, design.motor.rpm) < 0) {
    yield tip('walksBackward', 'warn', { jointIds: [design.foot] });
  }
  const stepCm = stage ? maxStepUp(stage) / CM : 0;
  if (stepCm >= MIN_STEP_CM && foot.lift < stepCm * STEP_MARGIN) {
    yield tip('lowLiftStep', 'warn', {
      params: { lift: Math.round(foot.lift), step: Math.round(stepCm) },
      jointIds: [design.foot],
    });
  }

  // 4. 試走の結果
  const run = lastRun(input.events ?? []);
  if (run?.type === 'runFailed') {
    if (run.reason === 'fallen') {
      const canAddLegs = !stage || stage.features.legArray;
      yield tip('fallen', 'info', canAddLegs ? { key: 'guide.tip.fallenLegs' } : {});
    } else if (run.reason === 'timeout') yield tip('timeout', 'info');
    else if (run.reason === 'stalled') yield tip('stalled', 'info');
  }

  // 5. 軌道の改善
  if (foot.lift < LOW_LIFT_CM) {
    yield tip('lowLift', 'info', { params: { lift: round1(foot.lift) } });
  }
  if (isBumpy(foot.flatness, foot.lift)) {
    yield tip('noFlat', 'info', { params: { flat: round1(foot.flatness) } });
  }
  if (analysis.specialGeometry) yield tip('special', 'info');
}

/**
 * グラスホフの条件から、クランクが一回転できる最大の長さ(cm)。クランクを最短にし、
 * s + l ≤ p + q を満たす長さ。残りの 3 本だけでは満たせなければ null。
 */
export function maxCrankLength(g: GrashofResult): number | null {
  const { ground, coupler, output } = g.lengths;
  const others = [ground, coupler, output].sort((a, b) => a - b);
  const [p, q, l] = others as [number, number, number];
  const max = Math.min(p + q - l, p);
  return max > 0 ? max : null;
}

/** 1 回転のどこかで脚先の最下点より低くなる点(脚先以外) */
function jointsBelowFoot(analysis: MechanismAnalysis, footIndex: number, limit: number): string[] {
  const { cycle, compiled } = analysis;
  const out: string[] = [];
  for (let j = 0; j < compiled.jointIds.length; j++) {
    if (j === footIndex) continue;
    for (let s = 0; s < cycle.steps; s++) {
      if (!cycle.ok[s]) continue;
      if (cycle.positions[s]![j * 2 + 1]! < limit) {
        out.push(compiled.jointIds[j]!);
        break;
      }
    }
  }
  return out;
}

function lastRun(events: readonly GuideEvent[]): GuideEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.type === 'runFailed' || e.type === 'runCleared') return e;
  }
  return null;
}
