import type { StoreApi, UseBoundStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { RunOutcome, SessionState } from '@/app/flow';
import type { MechanismAnalysis } from '@/core/kinematics';
import type { DesignDoc, JointId } from '@/core/model/types';
import type { DesignSlot } from '@/core/storage/persistence';
import type { ToolId } from '@/editor/keyboard';
import type { HintLevel, PreflightProblem, RevealedHint, TutorialStep } from '@/game';
import type { GuideEvent, TipId } from '@/guide';

/**
 * 設計画面の案内(INT-7a)が覚えておくこと。どれもこのセッションの間だけ(保存しない)。
 *
 * - 試走の結果:状況の一言(pickTip)の events。スロットごとに分け、別のステージの失敗を持ち込まない
 * - 閉じた一言:× で閉じた一言はこのセッションの間は出さない(どのステージでも)
 * - ヒントの影:ステージごとに「図面に重ねない」と切り替えたレベル(既定はどれも重ねる)
 */
export interface DesignGuideState {
  runs: Record<DesignSlot, GuideEvent[]>;
  dismissed: TipId[];
  hiddenGhosts: Record<string, HintLevel[]>;
}

/** スロットごとに覚えておく試走の結果の数(一言が見るのは最後の 1 つ) */
export const RUN_EVENTS_KEPT = 4;

export function initialDesignGuide(): DesignGuideState {
  return { runs: {}, dismissed: [], hiddenGhosts: {} };
}

/** 試走の結果 → 一言の出来事 */
export function outcomeEvent(outcome: Pick<RunOutcome, 'result'>): GuideEvent {
  const { cleared, reason } = outcome.result;
  return cleared || reason === null ? { type: 'runCleared' } : { type: 'runFailed', reason };
}

export function noteOutcome(
  state: DesignGuideState,
  outcome: Pick<RunOutcome, 'result' | 'slot'>,
): DesignGuideState {
  const list = [...(state.runs[outcome.slot] ?? []), outcomeEvent(outcome)];
  return {
    ...state,
    runs: { ...state.runs, [outcome.slot]: list.slice(-RUN_EVENTS_KEPT) },
  };
}

export function dismissTip(state: DesignGuideState, id: TipId): DesignGuideState {
  if (state.dismissed.includes(id)) return state;
  return { ...state, dismissed: [...state.dismissed, id] };
}

export function setGhostShown(
  state: DesignGuideState,
  stageId: string,
  level: HintLevel,
  show: boolean,
): DesignGuideState {
  const hidden = state.hiddenGhosts[stageId] ?? [];
  const next = show ? hidden.filter((l) => l !== level) : [...new Set([...hidden, level])];
  if (next.length === hidden.length && next.every((l, i) => l === hidden[i])) return state;
  return { ...state, hiddenGhosts: { ...state.hiddenGhosts, [stageId]: next } };
}

/** pickTip に渡す出来事:このスロットの試走の結果(古い順)と、閉じた一言 */
export function guideEvents(
  runs: readonly GuideEvent[] | undefined,
  dismissed: readonly TipId[],
): GuideEvent[] {
  return [...(runs ?? []), ...dismissed.map((tip) => ({ type: 'tipDismissed', tip }) as const)];
}

/**
 * 開いたヒントのうち、図面に重ねる影。エディタに重ねられる影は 1 つなので、重ねると決めた中で
 * 一番進んだレベルを描く(shown は切り替えが「重ねる」になっているレベル)。
 */
export function hintGhost(
  revealed: readonly RevealedHint[],
  hidden: readonly HintLevel[] = [],
): { ghost: DesignDoc | null; shown: HintLevel[] } {
  let ghost: DesignDoc | null = null;
  const shown: HintLevel[] = [];
  for (const h of revealed) {
    if (h.hint.kind !== 'ghost' || hidden.includes(h.level)) continue;
    shown.push(h.level);
    ghost = h.hint.design;
  }
  return { ghost, shown };
}

/**
 * 試走前チェックの問題(・状況の一言)→ 図面で選んで示す点と棒。問題が場所を持たない自由度の問題は、
 * 解析の「ぐらつく点」(自由度が多すぎる)・「余分な拘束の棒」(固まる)で補う
 */
export function problemSelection(
  p: Partial<Pick<PreflightProblem, 'code' | 'jointIds' | 'linkIds'>>,
  analysis?: Pick<MechanismAnalysis, 'looseJoints' | 'problemLinks'>,
): { joints: JointId[]; links: string[] } {
  const joints = [...(p.jointIds ?? [])];
  const links = [...(p.linkIds ?? [])];
  if (joints.length + links.length === 0 && analysis) {
    if (p.code === 'dofLoose') joints.push(...(analysis.looseJoints ?? []));
    if (p.code === 'dofLocked') links.push(...analysis.problemLinks);
  }
  return { joints, links };
}

/**
 * チュートリアルが今押してほしいもの(そっと光らせる)。
 * - 部品を置くステップ(リンク・固定点・クランク)で、その道具をまだ選んでいなければ道具のボタン
 * - 試走で進むステップなら試走ボタン
 */
export function tutorialCallout(
  step: Pick<TutorialStep, 'until'> | null | undefined,
  tool: ToolId,
): { tool: ToolId | null; testRun: boolean } {
  const until = step?.until;
  if (!until) return { tool: null, testRun: false };
  if (until.kind === 'testRun') return { tool: null, testRun: true };
  if (until.kind === 'place' && CALLOUT_TOOLS.has(until.part) && tool !== until.part) {
    return { tool: until.part as ToolId, testRun: false };
  }
  return { tool: null, testRun: false };
}

const CALLOUT_TOOLS: ReadonlySet<string> = new Set(['link', 'fixed', 'crank']);

/** アプリ全体で 1 つ */
export const designGuide = createStore<DesignGuideState>(initialDesignGuide);

/**
 * 試走が終わるたびに結果を覚える(App で 1 回。外す関数を返す)。
 * 結果は結果画面で出るので、設計画面が出ていない間も聞いておく。
 */
export function installDesignGuide(
  session: UseBoundStore<StoreApi<SessionState>>,
  store: StoreApi<DesignGuideState> = designGuide,
): () => void {
  return session.subscribe((s, prev) => {
    if (s.lastOutcome && s.lastOutcome !== prev.lastOutcome) {
      store.setState(noteOutcome(store.getState(), s.lastOutcome), true);
    }
    // 進行を消したら、覚えた結果も消す(閉じた一言と影の切り替えは残す)
    if (s.lastOutcome === null && prev.lastOutcome !== null) {
      store.setState({ ...store.getState(), runs: {} }, true);
    }
  });
}
