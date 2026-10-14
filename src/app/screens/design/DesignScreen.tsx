import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useStore } from 'zustand';
import {
  isSandboxStage,
  selectAllowedParts,
  selectLockedJoints,
  selectRevealedHints,
  selectStage,
  useSession,
} from '@/app/flow';
import { useApp } from '@/app/store';
import { MechanismEditor, type MechanismEditorProps } from '@/editor';
import { stageNumber } from '@/hud/stageSelect';
import { stageTextParams } from '@/game';
import { t } from '@/i18n';
import { BackButton, Button } from '@/scene/overlay/Panel';
import type { ScreenOverlayProps } from '@/scene/overlay/placeholders';
import { setPaperInsets, usePaperViewport } from '@/scene/store';
import { designGuide, hintGhost } from './guide';
import { DESIGN_UI, designLayout, predictPaperRect, sideDocks, toWorldRect } from './layout';
import { designSignals } from './signals';
import './designScreen.css';

/**
 * 設計画面(INT-1)。工房の作業台の製図用紙にカメラが真上から降りきると、紙にぴったり重なる
 * 位置にエディタ(MechanismEditor)が現れる。紙の 1 cm = エディタの 1 cm(view = 紙の設計範囲)。
 *
 * - 位置合わせ:usePaperViewport() の紙の画面矩形にエディタの描画面(.ed-canvas)を置く。
 *   降りきる前(ready でない間)は、カメラが落ち着いたときの矩形を予測して隠したまま用意しておく
 * - 紙と同じ見た目:エディタの背景・方眼・軸は消し(3D の紙のものが見える)、図面だけを重ねる。
 *   3D の紙のインク(PaperInk)は同じ図面を同じ位置に描いており、エディタが出ると隠れる
 * - 余白:道具の帯・横のパネルの分だけ紙の周りを空ける(useDesignPaperInsets → setPaperInsets)。
 *   パネルが紙(機構)を隠すことはない
 * - 入力:Esc はまずエディタが作図・選択・道具を 1 段ずつ戻し、何も残っていなければ「戻る」。
 *   紙の上の右クリックはエディタのもの(パン用。この画面ではパン・ズームしないので何も起きない)、
 *   紙の外の右クリックは「戻る」
 *
 * HUD などの差し込み口(後のストリーム用。props で渡す):
 * - stageHeader:上の帯の左(戻るの右)の 1 行(高さ 48px)。既定は「1-1 こわれた機械」と課題の文。
 *   HUD の StageHeader(HUD-1)はたたんだ 1 行で置き、開いた中身は帯から下へ紙の上に重なってよい
 * - hints:上の帯の右(試走の左)。ヒント 3 段階のボタン(HintPanel、HUD-1 / INT-7)。開いた中身は同上
 * - tutorial:画面全体に重なる層(中身だけがマウスを受け取る)。紙の上の点を指すときは
 *   usePaperViewport() と designToScreen() で位置を求める
 * - guide:横のパネルの列の上に積む案内(INT-7a:チュートリアルの吹き出し・状況の一言)。
 *   紙には重ねず、高さの分だけエディタのパネルを縮める(sideDocks)
 * - testRun:横のパネルの列の下に積む試走ボタン(INT-7a:HUD の TestRunButton と試走前チェックの一覧)。
 *   渡すと上の帯の試走ボタンは出さない
 * - onTestRun:上の帯の試走ボタン(testRun を渡さないとき)。既定は useApp.go('testRun')
 * - editor:エディタの制約の上書き。既定は flow のセッションの今のステージから:使える部品
 *   (チュートリアルで渡した分だけ、selectAllowedParts)、動かせない点、開いたヒントの影
 *   (designGuide で「重ねない」にしたものを除く)、予算、脚列を変えられるか(章 2 から)
 * 例:overlays={{ design: () => <DesignScreen screen="design" stageHeader={<StageHeader … collapsed />} /> }}
 */
export interface DesignScreenProps extends ScreenOverlayProps {
  stageHeader?: ReactNode;
  hints?: ReactNode;
  tutorial?: ReactNode;
  guide?: ReactNode;
  testRun?: ReactNode;
  onTestRun?: () => void;
  editor?: Pick<
    MechanismEditorProps,
    'allowedParts' | 'lockedJoints' | 'ghost' | 'budget' | 'legArray'
  >;
}

export function DesignScreen({
  stageHeader,
  hints,
  tutorial,
  guide,
  testRun,
  onTestRun,
  editor,
}: DesignScreenProps) {
  const reduced = useApp((s) => s.settings.reducedMotion);
  const stage = useSession(selectStage);
  const allowedParts = useSession(selectAllowedParts);
  const lockedJoints = useSession(selectLockedJoints);
  const revealed = useSession(selectRevealedHints);
  const hiddenGhosts = useStore(designGuide, (s) => (stage ? s.hiddenGhosts[stage.id] : undefined));
  const ghost = useMemo(() => hintGhost(revealed, hiddenGhosts).ghost, [revealed, hiddenGhosts]);
  const vp = usePaperViewport();
  const size = useViewportSize();
  const lay = useMemo(() => designLayout(size.width, size.height), [size.width, size.height]);
  // 横のパネルの列に積む案内(上:吹き出し・一言、下:試走ボタン)の高さに合わせてパネルを縮める
  const [guideRef, guideH] = useMeasuredHeight();
  const [runRef, runH] = useMeasuredHeight();
  const docks = useMemo(
    () => sideDocks(lay, guide ? guideH : 0, testRun ? runH : 0),
    [lay, guide, guideH, testRun, runH],
  );
  const live = vp.ready;
  const paper = live ? vp.screen : predictPaperRect(size.width, size.height, lay.insets);
  const { xMin, yMin, xMax, yMax } = vp.design;
  const view = useMemo(() => toWorldRect({ xMin, yMin, xMax, yMax }), [xMin, yMin, xMax, yMax]);
  const rootRef = useRef<HTMLDivElement>(null);

  // 降りきったら 3D の紙のインクを隠し、キー操作がすぐ効くようエディタにフォーカスを渡す
  useLayoutEffect(() => {
    designSignals.editorLive = live;
    if (live) {
      const active = document.activeElement;
      if (!active || active === document.body) {
        rootRef.current?.querySelector<HTMLElement>('.ed-root')?.focus({ preventScroll: true });
      }
    }
    return () => {
      designSignals.editorLive = false;
    };
  }, [live]);

  const vars = cssVars({
    '--ds-m': DESIGN_UI.margin,
    '--ds-header-h': DESIGN_UI.headerHeight,
    '--ds-toolbar-left': lay.toolbar.left,
    '--ds-toolbar-top': lay.toolbar.top,
    '--ds-toolbar-w': lay.toolbar.width,
    '--ds-toolbar-h': lay.toolbar.height,
    '--ds-side-left': docks.side.left,
    '--ds-side-top': docks.side.top,
    '--ds-side-w': docks.side.width,
    '--ds-side-h': docks.side.height,
    '--ds-col-top': lay.side.top,
    '--ds-col-bottom': size.height - (lay.side.top + lay.side.height),
    '--ds-dock-top-h': docks.top.height,
    '--ds-dock-bottom-h': docks.bottom.height,
    '--ds-paper-left': paper.left,
    '--ds-paper-top': paper.top,
    '--ds-paper-w': paper.width,
    '--ds-paper-h': paper.height,
    '--ds-status-gap': DESIGN_UI.gap / 2,
  });

  const cls = ['ds-root', live && 'is-live', lay.compact && 'is-compact', reduced && 'is-reduced']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={rootRef}
      className={cls}
      style={vars}
      data-live={live ? 'true' : 'false'}
      data-paper-rect={[paper.left, paper.top, paper.width, paper.height]
        .map((v) => v.toFixed(2))
        .join(',')}
    >
      <header className="ds-header" aria-label={t('app.design.header')}>
        <BackButton />
        <div className="ds-slot ds-slot--stage" data-slot="stage">
          {stageHeader ?? <DefaultStageHeader />}
        </div>
        <div className="ds-slot ds-slot--hints" data-slot="hints">
          {hints}
        </div>
        {!testRun && (
          <Button variant="primary" onClick={onTestRun ?? goTestRun}>
            {t('app.design.testRun')}
          </Button>
        )}
      </header>
      <MechanismEditor
        className="ds-editor"
        view={view}
        allowedParts={stage ? allowedParts : undefined}
        lockedJoints={lockedJoints}
        ghost={ghost}
        budget={stage?.budget ?? null}
        legArray={stage?.features.legArray ?? true}
        {...editor}
      />
      {guide && (
        <div
          className="ds-dock ds-dock--guide"
          data-slot="guide"
          data-scroll={guideH > docks.top.height + 0.5 || undefined}
        >
          <div ref={guideRef} className="ds-dock__inner">
            {guide}
          </div>
        </div>
      )}
      {testRun && (
        <div
          className="ds-dock ds-dock--run"
          data-slot="testRun"
          data-scroll={runH > docks.bottom.height + 0.5 || undefined}
        >
          <div ref={runRef} className="ds-dock__inner">
            {testRun}
          </div>
        </div>
      )}
      <div className="ds-slot ds-slot--float" data-slot="tutorial">
        {tutorial}
      </div>
    </div>
  );
}

function goTestRun() {
  useApp.getState().go('testRun');
}

/** HUD の見出しが入るまでの既定:ステージの番号と名前、課題の文(サンドボックスなら「自由に設計」) */
function DefaultStageHeader() {
  const stage = useSession(selectStage);
  if (!stage || isSandboxStage(stage)) {
    return (
      <>
        <strong className="ds-title">{t('app.design.title')}</strong>
        <span className="ds-sub">{t('app.design.free')}</span>
      </>
    );
  }
  const desc = t(stage.descKey, stageTextParams(stage));
  return (
    <>
      <span className="ds-tag">{stageNumber(stage)}</span>
      <strong className="ds-title">{t(stage.titleKey)}</strong>
      <span className="ds-sub" title={desc}>
        {desc}
      </span>
    </>
  );
}

/**
 * 設計画面の紙の余白を、画面の大きさに合わせて scene に渡し続ける(App で 1 回呼ぶ)。
 * 設計画面へ向かう遷移の最初から行き先(紙の収まる位置)が決まっているよう、画面に入る前から設定する。
 */
export function useDesignPaperInsets(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const apply = () => setPaperInsets(designLayout(window.innerWidth, window.innerHeight).insets);
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);
}

/**
 * 要素の(縮める前の)中身の高さを測り続ける。ResizeObserver がない環境(jsdom)では 0 のまま。
 * ref は差し込み口の中身を包む要素に付ける(差し込み口そのものは高さを制限してスクロールさせる)
 */
function useMeasuredHeight(): [(el: HTMLElement | null) => void, number] {
  const [height, setHeight] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) {
      setHeight(0);
      return;
    }
    const read = () => setHeight(Math.ceil(el.getBoundingClientRect().height));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(read);
    observer.current.observe(el);
  }, []);
  return [ref, height];
}

function useViewportSize(): { width: number; height: number } {
  const read = () => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 720 : window.innerHeight,
  });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const on = () => setSize(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}

/** 数値は px にして CSS 変数として渡す */
function cssVars(vars: Record<string, number>): CSSProperties {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) out[k] = `${v}px`;
  return out as CSSProperties;
}
