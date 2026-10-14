import { analyzeMechanism, type MechanismAnalysis } from '@/core/kinematics/analyze';
import type { DesignDoc, PartKind } from '@/core/model/types';
import { PART_ORDER } from './chapters';
import { partCounts } from './preflight';
import type {
  PartCounts,
  StageDef,
  TutorialEvent,
  TutorialSnapshot,
  TutorialState,
  TutorialStep,
} from './types';

/**
 * チュートリアルの進行(GAME-5、U-05)。純粋な状態機械。
 * 部品をひとつずつ渡し(give は前のステップの分と合わせて使える)、操作をひとつずつ教える。
 * エディタは設計が変わるたびに { type: 'design' }、試走で { type: 'testRun' }、
 * 「次へ」で { type: 'click' } を送り、tutorialTextKey と tutorialAllowedParts を表示に使う。
 */

/** 設計からチュートリアルが見る状態を作る(analysis はエディタの計算済みのものを渡せる) */
export function tutorialSnapshot(
  design: DesignDoc,
  analysis: MechanismAnalysis = analyzeMechanism(design),
): TutorialSnapshot {
  const parts = partCounts(design);
  return {
    parts,
    dof: analysis.dof,
    fullRotation: parts.crank > 0 && parts.link > 0 && analysis.fullRotation,
  };
}

const countOf = (counts: PartCounts, part: PartKind): number =>
  part in counts ? counts[part as keyof PartCounts] : 0;

/** ステップの完了条件のうち、設計の状態だけで決まるものを今の状態で満たしているか */
function satisfied(step: TutorialStep, state: TutorialState): boolean {
  const { until } = step;
  const { snapshot } = state;
  switch (until.kind) {
    case 'place':
      return (
        countOf(snapshot.parts, until.part) - countOf(state.baseline, until.part) >= until.count
      );
    case 'dof':
      return snapshot.dof === until.value;
    case 'fullRotation':
      return snapshot.dof === 1 && snapshot.fullRotation;
    case 'testRun':
    case 'click':
      return false;
  }
}

/** 次のステップへ進み、状態だけで満たしている(自由度・一回転の)ステップは続けて飛ばす */
function advanceFrom(steps: TutorialStep[], state: TutorialState): TutorialState {
  let next: TutorialState = { ...state, index: state.index + 1, baseline: state.snapshot.parts };
  while (next.index < steps.length && satisfied(steps[next.index]!, next)) {
    next = { ...next, index: next.index + 1, baseline: next.snapshot.parts };
  }
  return next;
}

export function startTutorial(steps: TutorialStep[], snapshot: TutorialSnapshot): TutorialState {
  const state: TutorialState = { index: 0, baseline: snapshot.parts, snapshot };
  const first = steps[0];
  if (!first) return state;
  const until = first.until.kind;
  return (until === 'dof' || until === 'fullRotation') && satisfied(first, state)
    ? advanceFrom(steps, state)
    : state;
}

export function advanceTutorial(
  steps: TutorialStep[],
  state: TutorialState,
  event: TutorialEvent,
): TutorialState {
  const step = steps[state.index];
  if (!step) return state;
  switch (event.type) {
    case 'design': {
      const next: TutorialState = { ...state, snapshot: event.snapshot };
      return satisfied(step, next) ? advanceFrom(steps, next) : next;
    }
    case 'testRun':
      return step.until.kind === 'testRun' ? advanceFrom(steps, state) : state;
    case 'click':
      return step.until.kind === 'click' ? advanceFrom(steps, state) : state;
  }
}

export function currentStep(steps: TutorialStep[], state: TutorialState): TutorialStep | null {
  return steps[state.index] ?? null;
}

export function isTutorialDone(steps: TutorialStep[], state: TutorialState): boolean {
  return state.index >= steps.length;
}

/** 今のステップの文言(i18n キー)。終わっていれば null */
export function tutorialTextKey(steps: TutorialStep[], state: TutorialState): string | null {
  return currentStep(steps, state)?.key ?? null;
}

/** ここまでに渡した部品(今のステップまでの give の和、表示順) */
export function givenParts(steps: TutorialStep[], state: TutorialState): PartKind[] {
  const set = new Set<PartKind>();
  steps
    .slice(0, Math.min(steps.length, state.index + 1))
    .forEach((s) => s.give?.forEach((p) => set.add(p)));
  return PART_ORDER.filter((p) => set.has(p));
}

/**
 * 今使える部品。チュートリアルがない・終わったステージでは stage.parts そのもの。
 * state が null ならチュートリアルなしとして扱う。
 */
export function tutorialAllowedParts(stage: StageDef, state: TutorialState | null): PartKind[] {
  const steps = stage.tutorial ?? [];
  if (!state || steps.length === 0 || isTutorialDone(steps, state)) return [...stage.parts];
  const given = givenParts(steps, state);
  return stage.parts.filter((p) => given.includes(p));
}
