import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { analyzeMechanism } from '@/core/kinematics';
import type { DesignDoc, JointId, PartKind } from '@/core/model/types';
import { playSfx } from '@/audio/sfx';
import { useApp } from '@/app/store';
import { t } from '@/i18n';
import { useEditor } from './store';
import { MotionEngine } from './motion';
import { DesignCanvas, type CanvasApi } from './DesignCanvas';
import { Toolbar } from './Toolbar';
import { BillPanel, LegsPanel, MotorPanel, SelectionPanel, StatusPanel } from './panels';
import { resolveShortcut, type Command, type ToolId } from './keyboard';
import {
  copySelection,
  cutSelection,
  deleteSelection,
  mirrorCurrent,
  nudgeSelection,
  pasteClipboard,
  selectAll,
} from './commands';
import type { Locked } from './ops';
import type { WorldRect } from './viewport';
import './editor.css';

export interface MechanismEditorProps {
  /** 使える部品(チュートリアル用)。'link' / 'fixed' / 'crank' が道具に、'pin' が既存の点への接続に対応。省略で全部 */
  allowedParts?: readonly PartKind[];
  /** 動かせない・消せないジョイント(チュートリアル用) */
  lockedJoints?: readonly JointId[];
  /** ヒントとして薄く重ねる設計(null で非表示) */
  ghost?: DesignDoc | null;
  /** 予算。コストが超えると警告(null で予算なし) */
  budget?: number | null;
  /**
   * 表示する設計座標の矩形(cm)。指定するとこの矩形がビューにぴったり収まる(3D の製図用紙と位置合わせ用)。
   * onViewChange がなければパン・ズームは無効。省略すると内部で管理する(全体表示つき)。
   */
  view?: WorldRect | null;
  /** view を指定したとき、パン・ズームで新しい矩形を受け取る(制御コンポーネント) */
  onViewChange?: (rect: WorldRect) => void;
  /** 表示のみ(試走中の縮小版など) */
  readOnly?: boolean;
  /** 横のパネル(状態・選択・モーター・脚列・コスト)を出すか。既定 true */
  panels?: boolean;
  /** 最初から機構を動かすか。既定 true */
  autoPlay?: boolean;
  className?: string;
  style?: CSSProperties;
}

const ALL_PARTS: readonly PartKind[] = ['link', 'pin', 'fixed', 'crank'];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/**
 * 機構エディタ(E-02〜E-08)。設計は useEditor ストアを直接編集する。
 */
export function MechanismEditor({
  allowedParts,
  lockedJoints,
  ghost = null,
  budget = null,
  view = null,
  onViewChange,
  readOnly = false,
  panels = true,
  autoPlay = true,
  className,
  style,
}: MechanismEditorProps) {
  const design = useEditor((s) => s.design);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const loadCount = useEditor((s) => s.loadCount);
  const canUndo = useEditor((s) => s.history.past.length > 0);
  const canRedo = useEditor((s) => s.history.future.length > 0);
  const canPaste = useEditor((s) => s.clipboard !== null);

  // 編集のたびに解析し直す(ヤンセンで 0.1ms 程度なので間引かない)
  const analysis = useMemo(() => analyzeMechanism(design), [design]);

  const [engine] = useState(() => {
    const e = new MotionEngine();
    if (!autoPlay) e.setPlaying(false);
    return e;
  });
  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);
  useLayoutEffect(() => {
    engine.setMechanism(analysis.compiled, analysis.cycle, design.motor.rpm);
  }, [engine, analysis, design.motor.rpm]);

  const lockedKey = (lockedJoints ?? []).join('\u0000');
  const locked: Locked = useMemo(
    () => new Set(lockedKey ? lockedKey.split('\u0000') : []),
    [lockedKey],
  );
  const partsKey = (allowedParts ?? ALL_PARTS).join(',');
  const parts = useMemo(() => new Set(partsKey.split(',') as PartKind[]), [partsKey]);
  const pinAllowed = parts.has('pin');
  const isEnabled = useCallback(
    (tl: ToolId) => {
      if (readOnly) return false;
      if (tl === 'link') return parts.has('link');
      if (tl === 'fixed') return parts.has('fixed');
      if (tl === 'crank') return parts.has('crank');
      return true;
    },
    [parts, readOnly],
  );
  useEffect(() => {
    if (!isEnabled(tool) && !readOnly) useEditor.getState().setTool('select');
  }, [tool, isEnabled, readOnly]);

  const osReduced = usePrefersReducedMotion();
  const appReduced = useApp((s) => s.settings.reducedMotion);
  const reducedMotion = osReduced || appReduced;

  // 組み立て不能の表示(重ね描きが角度ごとに知らせる)
  const [failing, setFailing] = useState(false);

  // 知らせ(短いトースト)
  const [notice, setNotice] = useState<{
    key: string;
    kind: 'info' | 'error';
    params?: Record<string, string | number>;
    n: number;
  } | null>(null);
  const noticeSeq = useRef(0);
  const onNotice = useCallback(
    (key: string, kind: 'info' | 'error' = 'info', params?: Record<string, string | number>) => {
      setNotice({ key, kind, params, n: ++noticeSeq.current });
    },
    [],
  );
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 2300);
    return () => window.clearTimeout(id);
  }, [notice]);

  // 自由度がちょうど 1 になった瞬間、一度だけ試しに動かす(ED-8)
  const [dofPulse, setDofPulse] = useState(0);
  const prevDof = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevDof.current;
    prevDof.current = analysis.dof;
    if (prev === null || prev === 1 || analysis.dof !== 1) return;
    if (design.cranks.length === 0 || !analysis.assemblable) return;
    if (!reducedMotion) engine.startTrial();
    setDofPulse((n) => n + 1);
  }, [analysis, design.cranks.length, engine, reducedMotion]);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasApi = useRef<CanvasApi | null>(null);
  const spaceHeld = useRef(false);
  const focusRoot = useCallback(() => {
    const el = rootRef.current;
    if (el && document.activeElement !== el) el.focus({ preventScroll: true });
  }, []);

  const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);

  const run = (cmd: Command): boolean => {
    const s = useEditor.getState();
    const editing = !readOnly;
    switch (cmd.kind) {
      case 'undo':
        if (editing) s.undo();
        return editing;
      case 'redo':
        if (editing) s.redo();
        return editing;
      case 'copy': {
        if (copySelection()) {
          const n = useEditor.getState().clipboard?.joints.length ?? 0;
          onNotice('editor.notice.copied', 'info', { n });
        }
        return true;
      }
      case 'cut':
        if (editing) cutSelection(locked);
        return editing;
      case 'paste':
        if (editing && pasteClipboard()) playSfx('snap');
        return editing;
      case 'selectAll':
        selectAll();
        return true;
      case 'delete':
        if (editing && deleteSelection(locked)) playSfx('release');
        return editing;
      case 'escape':
        if (canvasApi.current?.cancel()) return true;
        if (s.selection.joints.length + s.selection.links.length > 0) {
          s.setSelection({ joints: [], links: [] });
          return true;
        }
        if (s.tool !== 'select') s.setTool('select');
        return true;
      case 'mirror':
        if (editing) mirrorCurrent(locked);
        return editing;
      case 'fit':
        canvasApi.current?.fit();
        return true;
      case 'togglePlay':
        engine.toggle();
        return true;
      case 'stepAngle':
        engine.setPlaying(false);
        engine.setTheta(engine.theta + (cmd.deg * Math.PI) / 180);
        return true;
      case 'nudge':
        if (editing) nudgeSelection(cmd.dx, cmd.dy, locked);
        return editing;
      case 'tool':
        if (isEnabled(cmd.tool)) s.setTool(cmd.tool);
        return true;
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) {
      if (e.key === 'Escape') target.blur?.();
      return;
    }
    const onButton = target.closest('button');
    if (onButton && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.key === ' ') {
      spaceHeld.current = true;
      e.preventDefault();
      return;
    }
    const cmd = resolveShortcut(e);
    if (!cmd) return;
    if (run(cmd)) e.preventDefault();
  };

  const onKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ') spaceHeld.current = false;
    if (e.key.startsWith('Arrow')) useEditor.getState().seal();
  };

  const rootClass = ['ed-root', !panels && 'ed-no-panels', reducedMotion && 'ed-reduced', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={rootRef}
      className={rootClass}
      style={style}
      tabIndex={0}
      role="application"
      aria-label={t('editor.region')}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => {
        spaceHeld.current = false;
      }}
    >
      <Toolbar
        tool={tool}
        isEnabled={isEnabled}
        readOnly={readOnly}
        canUndo={canUndo}
        canRedo={canRedo}
        canPaste={canPaste}
        hasSelection={selection.joints.length + selection.links.length > 0}
        isMac={isMac}
        onTool={(tl) => {
          useEditor.getState().setTool(tl);
          playSfx('press');
        }}
        onUndo={() => run({ kind: 'undo' })}
        onRedo={() => run({ kind: 'redo' })}
        onPaste={() => run({ kind: 'paste' })}
        onMirror={() => run({ kind: 'mirror' })}
        onDelete={() => run({ kind: 'delete' })}
        onFit={() => run({ kind: 'fit' })}
      />
      <DesignCanvas
        design={design}
        analysis={analysis}
        engine={engine}
        tool={tool}
        selection={selection}
        locked={locked}
        pinAllowed={pinAllowed}
        readOnly={readOnly}
        ghost={ghost}
        view={view}
        onViewChange={onViewChange}
        loadCount={loadCount}
        spaceHeld={spaceHeld}
        apiRef={canvasApi}
        onNotice={onNotice}
        onFailChange={setFailing}
        failing={failing}
        dofPulse={dofPulse}
        reducedMotion={reducedMotion}
        onFocusRequest={focusRoot}
        liveVisible
        overlay={
          notice && (
            <div
              key={notice.n}
              className={`ed-notice${notice.kind === 'error' ? ' is-error' : ''}`}
              role="status"
            >
              {t(notice.key, notice.params)}
            </div>
          )
        }
      />
      {panels && (
        <aside className="ed-side">
          <StatusPanel analysis={analysis} failing={failing} hasCrank={design.cranks.length > 0} />
          <SelectionPanel
            design={design}
            selection={selection}
            locked={locked}
            readOnly={readOnly}
            canFix={parts.has('fixed')}
            canCrank={parts.has('crank')}
            onNotice={onNotice}
          />
          <MotorPanel design={design} engine={engine} readOnly={readOnly} />
          <LegsPanel design={design} analysis={analysis} engine={engine} readOnly={readOnly} />
          <BillPanel design={design} budget={budget} />
        </aside>
      )}
    </div>
  );
}
