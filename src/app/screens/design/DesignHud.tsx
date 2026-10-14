import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import {
  isHintSuggested,
  isSandboxStage,
  sandboxStage,
  selectRevealedHints,
  selectStage,
  selectTutorial,
  useSession,
  type TutorialView,
} from '@/app/flow';
import { playSfx } from '@/audio/sfx';
import { analyzeMechanism, type MechanismAnalysis } from '@/core/kinematics';
import { computeBill } from '@/core/model/parts';
import type { DesignDoc } from '@/core/model/types';
import { useEditor } from '@/editor/store';
import {
  preflight as runPreflight,
  stageTextParams,
  type PreflightProblem,
  type StageDef,
} from '@/game';
import {
  GlossaryDialog,
  HowToPlay,
  pickTip,
  ShortcutSheet,
  TipBubble,
  useShortcutSheetHotkey,
  type Tip,
} from '@/guide';
import { HintPanel, StageHeader, TestRunButton, TutorialBubble } from '@/hud';
import { t } from '@/i18n';
import type { ScreenOverlayProps } from '@/scene/overlay/placeholders';
import { runViewStore, setPreflightOpen } from '../run3d/runView';
import { DesignScreen } from './DesignScreen';
import {
  designGuide,
  dismissTip,
  guideEvents,
  hintGhost,
  installDesignGuide,
  problemSelection,
  setGhostShown,
  tutorialCallout,
} from './guide';

/**
 * 設計画面の HUD と案内(INT-7a)。DesignScreen の差し込み口に、flow のセッションから組んだ部品を入れる。
 *
 *   上の帯:← 戻る │ ステージの見出し(StageHeader、たたんで課題を 1 行)│ ヒント(HintPanel)・? 操作一覧・遊び方
 *   横の列:チュートリアルの吹き出し(なければ状況の一言)/ エディタのパネル / 試走ボタン
 *
 * どれも紙(=機械)には重ねない。開いた見出し・ヒントだけが、押している間だけ帯の下に垂れる。
 */
export interface DesignHudScreenProps extends ScreenOverlayProps {
  /** 試走前チェックを通ったときの試走(App から beginTestRun) */
  onTestRun: () => void;
}

export function DesignHudScreen({ screen, onTestRun }: DesignHudScreenProps) {
  const stage = useSession(selectStage);
  const real = stage && !isSandboxStage(stage) ? stage : null;
  // チュートリアルが押してほしい道具・試走ボタンをそっと光らせる
  const step = useSession((s) => selectTutorial(s)?.step ?? null);
  const tool = useEditor((s) => s.tool);
  const callout = tutorialCallout(step, tool);
  return (
    <DesignScreen
      screen={screen}
      calloutTool={callout.tool}
      stageHeader={real ? <DesignStageHeader stage={real} /> : undefined}
      hints={
        <>
          {real && <DesignHints stage={real} />}
          <DesignHelp />
        </>
      }
      guide={<DesignGuide />}
      testRun={<DesignTestRun onTestRun={onTestRun} callout={callout.testRun} />}
    />
  );
}

// ---- 解析(エディタと同じ設計なら 1 回だけ) ----

const analyses = new WeakMap<DesignDoc, MechanismAnalysis>();
function analysisOf(design: DesignDoc): MechanismAnalysis {
  let a = analyses.get(design);
  if (!a) analyses.set(design, (a = analyzeMechanism(design)));
  return a;
}

/** エディタの図面で点と棒を選んで示す(場所のない自由度の問題は解析で補う) */
function showOnDesign(p: Partial<Pick<PreflightProblem, 'code' | 'jointIds' | 'linkIds'>>) {
  const design = useEditor.getState().design;
  const sel = problemSelection(p, analysisOf(design));
  if (sel.joints.length + sel.links.length > 0) useEditor.getState().setSelection(sel);
}

// ---- 上の帯 ----

/** ステージの見出し:たたんで番号と名前、横に課題の 1 行。開くとゴール・制限時間・予算と今のコスト・最高記録 */
function DesignStageHeader({ stage }: { stage: StageDef }) {
  const best = useSession((s) => s.progress.best[stage.id] ?? null);
  const design = useEditor((s) => s.design);
  const cost = useMemo(() => computeBill(design).cost, [design]);
  const [collapsed, setCollapsed] = useState(true);
  const desc = t(stage.descKey, stageTextParams(stage));
  return (
    <>
      <StageHeader
        stage={stage}
        best={best}
        cost={stage.budget !== null ? cost : undefined}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
      />
      {collapsed && (
        <span className="ds-sub" title={desc}>
          {desc}
        </span>
      )}
    </>
  );
}

/** ヒントを促すかを時間でも判定するため、間隔ごとに見直す */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** 3 段階のヒント。影は「図面に重ねる」で切り替え(designGuide)、エディタの ghost になる */
function DesignHints({ stage }: { stage: StageDef }) {
  const revealed = useSession(selectRevealedHints);
  const now = useNow(10_000);
  const suggested = useSession((s) => s.hintSuggested || isHintSuggested(s, now));
  const hidden = useStore(designGuide, (s) => s.hiddenGhosts[stage.id]);
  const shown = useMemo(() => hintGhost(revealed, hidden).shown, [revealed, hidden]);
  const [collapsed, setCollapsed] = useState(true);
  return (
    <HintPanel
      stage={stage}
      revealed={revealed.length}
      onReveal={() => {
        useSession.getState().revealHint();
        setCollapsed(false);
      }}
      suggested={suggested}
      ghostsShown={shown}
      onToggleGhost={(level, show) =>
        designGuide.setState(setGhostShown(designGuide.getState(), stage.id, level, show), true)
      }
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
    />
  );
}

type GuideDialog = 'book' | 'glossary' | 'keys';

/**
 * 遊び方の本・用語集・操作一覧(? キーでも)。開いた順に重ね、閉じると 1 つ前へ戻る
 * (本は開いていたページに戻る)。開いている間は右クリックで画面を戻さない。
 */
function DesignHelp() {
  const [stack, setStack] = useState<GuideDialog[]>([]);
  const [bookPage, setBookPage] = useState(0);
  const top = stack[stack.length - 1] ?? null;
  const open = useCallback(
    (d: GuideDialog) => setStack((s) => [...s.filter((x) => x !== d), d]),
    [],
  );
  const close = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  useShortcutSheetHotkey(() => open('keys'), top !== 'keys');
  useEffect(() => {
    if (top === null) return;
    const block = (e: Event) => e.preventDefault();
    window.addEventListener('contextmenu', block, true);
    return () => window.removeEventListener('contextmenu', block, true);
  }, [top]);

  return (
    <div className="ds-help" role="group" aria-label={t('app.design.help.region')}>
      <button
        type="button"
        className="ak-btn ak-btn--ghost ds-help__btn ds-help__btn--key"
        aria-label={t('app.design.help.keys')}
        title={t('app.design.help.keys')}
        aria-keyshortcuts="?"
        onPointerDown={() => playSfx('press')}
        onClick={() => open('keys')}
      >
        ?
      </button>
      <button
        type="button"
        className="ak-btn ak-btn--ghost ds-help__btn"
        onPointerDown={() => playSfx('press')}
        onClick={() => open('book')}
      >
        <BookIcon />
        {t('app.design.help.book')}
      </button>
      {top === 'book' && (
        <HowToPlay
          initialPage={bookPage}
          onPageChange={(i) => setBookPage(i)}
          onClose={() => {
            setBookPage(0);
            close();
          }}
          onOpenGlossary={() => open('glossary')}
          onOpenShortcuts={() => open('keys')}
        />
      )}
      {top === 'glossary' && <GlossaryDialog onClose={close} />}
      {top === 'keys' && <ShortcutSheet onClose={close} />}
    </div>
  );
}

function BookIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden className="ds-help__icon">
      <path
        d="M2 3.2c2.2-.9 4.3-.7 6 .8 1.7-1.5 3.8-1.7 6-.8v9.4c-2.2-.9-4.3-.7-6 .8-1.7-1.5-3.8-1.7-6-.8z M8 4v9.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---- 横の列:上 ----

/** チュートリアルの間は吹き出し、終われば状況の一言 */
function DesignGuide() {
  const tut = useSession(selectTutorial);
  return tut ? <DesignTutorial tut={tut} /> : <DesignTip />;
}

function DesignTutorial({ tut }: { tut: TutorialView }) {
  const stage = useSession(selectStage);
  const params = useMemo(() => (stage ? stageTextParams(stage) : undefined), [stage]);
  return (
    <TutorialBubble
      steps={tut.steps}
      index={tut.index}
      params={params}
      onNext={() => useSession.getState().tutorialClick()}
      onSkip={() => useSession.getState().skipTutorial()}
    />
  );
}

/** 状況の一言(pickTip)。× で閉じたものはこのセッションの間は出さない。場所が分かれば図面で示す */
function DesignTip() {
  const design = useEditor((s) => s.design);
  const stage = useSession(selectStage);
  const progress = useSession((s) => s.progress);
  const slot = useSession((s) => s.slot);
  const runs = useStore(designGuide, (s) => (slot !== null ? s.runs[slot] : undefined));
  const dismissed = useStore(designGuide, (s) => s.dismissed);
  // 試走前チェックの一覧が開いている間は、同じことを言う「動きません」の一言を重ねて出さない
  const listOpen = useStore(runViewStore, (s) => s.preflightOpen);
  const tip = useMemo(() => {
    const picked = pickTip({
      design,
      analysis: analysisOf(design),
      stage,
      progress,
      events: guideEvents(runs, dismissed),
    });
    return listOpen && picked?.severity === 'error' ? null : picked;
  }, [design, stage, progress, runs, dismissed, listOpen]);
  const locatable = !!tip && (tip.jointIds?.length ?? 0) + (tip.linkIds?.length ?? 0) > 0;
  return (
    <TipBubble
      tip={tip}
      onDismiss={(x: Tip) => designGuide.setState(dismissTip(designGuide.getState(), x.id), true)}
      actionLabel={locatable ? t('app.design.tip.locate') : undefined}
      onAction={locatable ? showOnDesign : undefined}
    />
  );
}

// ---- 横の列:下 ----

/**
 * 試走ボタンと試走前チェック。チェックは設計が変わるたびに行い、ボタンの状態(押せる・直すところ N 件)に出す。
 * 一覧は押して止められてから開く(それまでは状態の 1 行だけ)。行を押すと図面でその点・棒を選んで示す。
 */
function DesignTestRun({ onTestRun, callout }: { onTestRun: () => void; callout: boolean }) {
  const design = useEditor((s) => s.design);
  const stage = useSession(selectStage);
  const progress = useSession((s) => s.progress);
  const loading = useSession((s) => s.run.phase === 'loading');
  const open = useStore(runViewStore, (s) => s.preflightOpen);
  const preflight = useMemo(
    () => runPreflight(stage ?? sandboxStage(progress), design, { analysis: analysisOf(design) }),
    [stage, progress, design],
  );
  const [highlighted, setHighlighted] = useState<PreflightProblem | null>(null);
  const onHighlight = (p: PreflightProblem) => {
    setHighlighted(p);
    showOnDesign(p);
    if (!runViewStore.getState().preflightOpen) {
      // 止められた:一覧を開き、以後は設計の変更に合わせてセッションのチェックも更新させる
      useSession.getState().prepareRun();
      setPreflightOpen(true);
    }
  };
  return (
    <TestRunButton
      preflight={preflight}
      onTestRun={onTestRun}
      onHighlight={onHighlight}
      highlighted={highlighted}
      collapsed={!open}
      disabled={loading}
      className={callout ? 'ds-callout' : undefined}
    />
  );
}

/** 試走の結果を状況の一言のために覚える(App で 1 回。アンマウントで外す) */
export function useDesignGuide(): void {
  useEffect(() => installDesignGuide(useSession), []);
}
