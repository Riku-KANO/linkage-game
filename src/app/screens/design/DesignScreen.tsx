import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useApp } from '@/app/store';
import { MechanismEditor, type MechanismEditorProps } from '@/editor';
import { t } from '@/i18n';
import { BackButton, Button } from '@/scene/overlay/Panel';
import type { ScreenOverlayProps } from '@/scene/overlay/placeholders';
import { setPaperInsets, usePaperViewport } from '@/scene/store';
import { DESIGN_UI, designLayout, predictPaperRect, toWorldRect } from './layout';
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
 * - stageHeader:上の帯の左(戻るの右)。ステージ名・課題・制限(HUD-1)
 * - hints:上の帯の右(試走の左)。ヒント 3 段階のボタン(HUD-1 / INT-7)
 * - tutorial:画面全体に重なる層。チュートリアルの吹き出し・状況の一言(INT-7)。
 *   紙の上の点を指すときは usePaperViewport() と designToScreen() で位置を求める
 * - onTestRun:試走ボタン。既定は useApp.go('testRun')。flow の試走前チェック(FLOW-2)がここに入る
 * - editor:ステージの制約(使える部品・動かせない点・ヒントの影・予算)
 * 例:overlays={{ design: () => <DesignScreen screen="design" stageHeader={<StageHeader />} /> }}
 */
export interface DesignScreenProps extends ScreenOverlayProps {
  stageHeader?: ReactNode;
  hints?: ReactNode;
  tutorial?: ReactNode;
  onTestRun?: () => void;
  editor?: Pick<MechanismEditorProps, 'allowedParts' | 'lockedJoints' | 'ghost' | 'budget'>;
}

export function DesignScreen({
  stageHeader,
  hints,
  tutorial,
  onTestRun,
  editor,
}: DesignScreenProps) {
  const reduced = useApp((s) => s.settings.reducedMotion);
  const vp = usePaperViewport();
  const size = useViewportSize();
  const lay = useMemo(() => designLayout(size.width, size.height), [size.width, size.height]);
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
    '--ds-side-left': lay.side.left,
    '--ds-side-top': lay.side.top,
    '--ds-side-w': lay.side.width,
    '--ds-side-h': lay.side.height,
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
        <Button variant="primary" onClick={onTestRun ?? goTestRun}>
          {t('app.design.testRun')}
        </Button>
      </header>
      <MechanismEditor className="ds-editor" view={view} {...editor} />
      <div className="ds-slot ds-slot--float" data-slot="tutorial">
        {tutorial}
      </div>
    </div>
  );
}

function goTestRun() {
  useApp.getState().go('testRun');
}

/** HUD の見出しが入るまでの既定:「設計」とステージ番号 */
function DefaultStageHeader() {
  const stageId = useApp((s) => s.stageId);
  return (
    <>
      <strong className="ds-title">{t('app.design.title')}</strong>
      <span className="ds-sub">
        {stageId ? t('app.design.stage', { id: stageId }) : t('app.design.free')}
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
