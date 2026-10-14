import { analyzeMechanism, type MechanismAnalysis } from '@/core/kinematics/analyze';
import { computeBill } from '@/core/model/parts';
import type { DesignDoc, LegLayout, PartKind } from '@/core/model/types';
import { MAX_RPM } from '@/core/model/types';
import { t } from '@/i18n';
import { footStance, walkDirection } from './gait';
import { stageLegs } from './stages';
import type { PartCounts, PreflightProblem, PreflightResult, StageDef } from './types';

/**
 * 試走前チェック(GAME-2)。試走を止める問題(error)と、注意だけの問題(warn)を重要な順に返す。
 * 決定事項:ばねを解放する章 5 までは、自由度が 1 でない機構は試走前にエラーにする。
 */
export interface PreflightOptions {
  /** エディタが計算済みの解析結果(なければここで計算する) */
  analysis?: MechanismAnalysis;
  /** 使える部品をさらに絞る(チュートリアルで渡した部品だけ、など)。既定は stage.parts */
  allowedParts?: PartKind[];
}

/** 設計の部品数(片脚の設計図で数える。ピンは「つないだ箇所」の数) */
export function partCounts(design: DesignDoc): PartCounts {
  const bill = computeBill(design);
  return {
    link: bill.perLeg.links,
    pin: bill.perLeg.pins,
    fixed: bill.perLeg.fixed,
    crank: design.cranks.length,
  };
}

/** 設計に使われている部品の種類 */
export function usedParts(design: DesignDoc): PartKind[] {
  const c = partCounts(design);
  return (['link', 'pin', 'fixed', 'crank'] as const).filter((k) => c[k] > 0);
}

/** 試走できる最大の自由度。ばねが使えるステージでは、ばねで拘束した自由度 2 まで許す */
export function maxDofFor(stage: StageDef): number {
  return stage.parts.includes('spring') ? 2 : 1;
}

export function sameLegLayout(a: LegLayout, b: LegLayout): boolean {
  return (
    a.count === b.count &&
    a.phaseStepDeg === b.phaseStepDeg &&
    a.spacing === b.spacing &&
    a.mirrorX === b.mirrorX
  );
}

export function preflight(
  stage: StageDef,
  design: DesignDoc,
  options: PreflightOptions = {},
): PreflightResult {
  const problems: PreflightProblem[] = [];
  const error = (p: Omit<PreflightProblem, 'severity'>) =>
    problems.push({ ...p, severity: 'error' });
  const warn = (p: Omit<PreflightProblem, 'severity'>) => problems.push({ ...p, severity: 'warn' });

  if (design.links.length === 0) {
    error({ code: 'empty', key: 'game.preflight.empty' });
    return finish();
  }

  const analysis = options.analysis ?? analyzeMechanism(design);

  // 1. 構造の問題(存在しない点を参照、クランクの軸が固定点でない、など)
  let structural = false;
  for (const issue of analysis.compiled.issues) {
    if (issue.code === 'floating-joint') continue;
    structural = true;
    error({
      code: 'mechanism',
      key: `analysis.issue.${issue.code}`,
      ...(issue.linkIds ? { linkIds: issue.linkIds } : {}),
      ...(issue.jointIds ? { jointIds: issue.jointIds } : {}),
    });
  }

  // 2. クランク
  const hasCrank = design.cranks.length > 0;
  if (!hasCrank) error({ code: 'noCrank', key: 'game.preflight.noCrank' });

  // 3. 自由度(E-04)
  const { dof } = analysis;
  const maxDof = maxDofFor(stage);
  if (dof < 1) error({ code: 'dofLocked', key: 'game.preflight.dofLocked', params: { dof } });
  else if (dof > maxDof)
    error({ code: 'dofLoose', key: 'game.preflight.dofLoose', params: { dof } });

  // 4. 組立と一回転(E-05)。自由度 1 の機構だけを見る
  const movable = hasCrank && !structural && dof === 1;
  const highlight = analysis.problemLinks.length > 0 ? { linkIds: analysis.problemLinks } : {};
  if (movable && !analysis.assemblable) {
    error({ code: 'notAssemblable', key: 'game.preflight.notAssemblable', ...highlight });
  } else if (movable && !analysis.fullRotation) {
    error({ code: 'noFullRotation', key: 'game.preflight.noFullRotation', ...highlight });
  }

  // 5. 使える部品
  const allowed = options.allowedParts ?? stage.parts;
  for (const kind of usedParts(design)) {
    if (!allowed.includes(kind)) {
      error({
        code: 'partNotAllowed',
        key: 'game.preflight.partNotAllowed',
        params: { part: t(`game.part.${kind}`) },
      });
    }
  }

  // 6. 脚列の複製(章 2 で解放)
  if (!stage.features.legArray && !sameLegLayout(design.legs, stageLegs(stage))) {
    error({ code: 'legArrayLocked', key: 'game.preflight.legArrayLocked' });
  }

  // 7. 予算(E-07)
  if (stage.budget !== null) {
    const { cost } = computeBill(design);
    if (cost > stage.budget) {
      error({
        code: 'overBudget',
        key: 'game.preflight.overBudget',
        params: { cost, budget: stage.budget },
      });
    }
  }

  // 8. モーター
  const { rpm } = design.motor;
  if (!Number.isFinite(rpm) || rpm === 0) {
    error({ code: 'motorStopped', key: 'game.preflight.motorStopped' });
  } else if (Math.abs(rpm) > MAX_RPM) {
    error({ code: 'rpmTooHigh', key: 'game.preflight.rpmTooHigh', params: { max: MAX_RPM } });
  }

  // 9. 注意(試走はできる)
  if (design.foot === null) {
    warn({ code: 'noFoot', key: 'game.preflight.noFoot' });
  } else if (movable && analysis.fullRotation && Number.isFinite(rpm) && rpm !== 0) {
    const stance = footStance(analysis);
    if (stance && walkDirection(stance, rpm) < 0) {
      warn({
        code: 'walksBackward',
        key: 'game.preflight.walksBackward',
        jointIds: [design.foot],
      });
    }
  }

  return finish();

  function finish(): PreflightResult {
    return { ok: problems.every((p) => p.severity !== 'error'), problems };
  }
}
