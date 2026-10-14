import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  compileMechanism,
  grashofVariant,
  sampleCycle,
  type MechanismAnalysis,
  type CycleSample,
  type CompiledMechanism,
} from '@/core/kinematics';
import type { DesignDoc, JointId, LinkId } from '@/core/model/types';
import { playSfx } from '@/audio/sfx';
import { t } from '@/i18n';
import { MICRO } from '@/ui/tokens';
import { useEditor } from './store';
import {
  addJoint,
  addLink,
  attachToLink,
  deleteItems,
  mergeJoints,
  moveJoints,
  selectionJoints,
  setFoot,
  toggleCrank,
  toggleFixed,
  type CrankFailure,
  type Locked,
  type PointRef,
  type Selection,
} from './ops';
import { hitTest, selectInRect, snapPoint, snapToGrid, type Hit, type SnapResult } from './snap';
import {
  cameraForRect,
  fitPoints,
  gridSteps,
  panBy,
  snapStep,
  toScreen,
  toWorld,
  visibleRect,
  zoomAt,
  type Camera,
  type Size,
  type WorldRect,
} from './viewport';
import type { MotionEngine } from './motion';
import { nearestSample } from './motion';
import { LiveLayer } from './LiveLayer';
import {
  fmt1,
  footGuide,
  linkOutlineOrder,
  pointsAttr,
  polylinePath,
  sampleRun,
  trajectoryExtent,
  trajectoryPaths,
  type FootGuide,
} from './render';
import type { ToolId } from './keyboard';
import type { Pt } from './geometry';

/** 当たり判定・吸い寄せの半径(画面 px) */
const JOINT_HIT_PX = 10;
const LINK_HIT_PX = 7;
const MAGNET_PX = 14;
/** これ以下の移動はクリックとみなす(px) */
const CLICK_TOL_PX = 4;
const FALLBACK_SIZE: Size = { width: 800, height: 600 };

export interface CanvasApi {
  /** 操作中のジェスチャー(棒の作図など)を取り消す。取り消したら true */
  cancel(): boolean;
  /** 機構全体が見えるようにする */
  fit(): void;
}

export interface DesignCanvasProps {
  design: DesignDoc;
  analysis: MechanismAnalysis;
  engine: MotionEngine;
  tool: ToolId;
  selection: Selection;
  locked: Locked;
  /** 既存の点に棒をつなげるか(allowedParts に 'pin' があるか) */
  pinAllowed: boolean;
  readOnly: boolean;
  ghost: DesignDoc | null;
  view: WorldRect | null;
  onViewChange?: (rect: WorldRect) => void;
  /** replaceDesign の回数。変わったら全体表示し直す */
  loadCount: number;
  spaceHeld: RefObject<boolean>;
  apiRef: RefObject<CanvasApi | null>;
  onNotice: (key: string, kind?: 'info' | 'error') => void;
  onFailChange: (failing: boolean) => void;
  failing: boolean;
  dofPulse: number;
  reducedMotion: boolean;
  onFocusRequest: () => void;
  liveVisible: boolean;
  /** ビューの上に重ねる要素(知らせなど) */
  overlay?: ReactNode;
}

type Gesture =
  | { kind: 'pan'; id: number; sx: number; sy: number; cam0: Camera }
  /** 動かせない点をつかんだ:動かそうとしたら一度だけ知らせる */
  | { kind: 'blocked'; id: number; sx: number; sy: number; told: boolean }
  | {
      kind: 'drag';
      id: number;
      ids: JointId[];
      anchor: { id: JointId; x: number; y: number };
      grab: Pt;
      base: DesignDoc;
      group: string;
      single: JointId | null;
      exclude: Set<JointId>;
      magnet: JointId | null;
      moved: boolean;
      sx: number;
      sy: number;
      clicked: Hit;
      shift: boolean;
    }
  | { kind: 'rect'; id: number; a: Pt; b: Pt; additive: Selection | null; sx: number; sy: number }
  | {
      kind: 'link';
      id: number | null;
      from: { ref: PointRef; x: number; y: number };
      /** 棒の途中から引いたとき:新しい点をこのリンクに固く付ける */
      attach: LinkId | null;
      sx: number;
      sy: number;
      end: SnapResult;
      pending: boolean;
    };

type Preview =
  | { kind: 'rect'; a: Pt; b: Pt }
  | { kind: 'link'; a: Pt; b: Pt; attach: boolean; joint: JointId | null }
  | null;

let gestureSeq = 0;

function hitKey(h: Hit | null): string {
  return h ? `${h.kind}:${h.id}` : '';
}

export function DesignCanvas(props: DesignCanvasProps) {
  const {
    design,
    analysis,
    engine,
    tool,
    selection,
    locked,
    pinAllowed,
    readOnly,
    ghost,
    view,
    onViewChange,
    loadCount,
    spaceHeld,
    apiRef,
    onNotice,
    onFailChange,
    failing,
    dofPulse,
    reducedMotion,
    onFocusRequest,
    liveVisible,
    overlay,
  } = props;

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [camState, setCamState] = useState<Camera | null>(null);
  const [hover, setHover] = useState<Hit | null>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const [panning, setPanning] = useState(false);
  const [wobble, setWobble] = useState<{ x: number; y: number; key: number } | null>(null);
  const [flashLink, setFlashLink] = useState<LinkId | null>(null);
  const gesture = useRef<Gesture | null>(null);

  const sz = size && size.width > 0 && size.height > 0 ? size : FALLBACK_SIZE;
  const fitTargets = useCallback((): Pt[] => {
    const pts: Pt[] = design.joints.map((j) => ({ x: j.x, y: j.y }));
    const f = analysis.compiled.footIndex;
    if (f >= 0) {
      for (const p of analysis.cycle.positions) pts.push({ x: p[f * 2]!, y: p[f * 2 + 1]! });
    }
    if (ghost) for (const j of ghost.joints) pts.push({ x: j.x, y: j.y });
    return pts;
  }, [design, analysis, ghost]);

  const cam: Camera = useMemo(() => {
    if (view) return cameraForRect(view, sz);
    return camState ?? fitPoints(fitTargets(), sz);
  }, [view, sz, camState, fitTargets]);
  const camRef = useRef(cam);
  camRef.current = cam;
  const sizeRef = useRef(sz);
  sizeRef.current = sz;
  const canNavigate = !view || !!onViewChange;

  const setCam = useCallback(
    (next: Camera) => {
      if (view) {
        onViewChange?.(visibleRect(next, sizeRef.current));
        return;
      }
      setCamState(next);
    },
    [view, onViewChange],
  );

  // 大きさの追従
  const prevSize = useRef<Size | null>(null);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const prev = prevSize.current;
      if (prev && prev.width === r.width && prev.height === r.height) return;
      // 中心を保ったまま大きさだけ変える
      if (prev && prev.width > 0 && r.width > 0) {
        const dw = (r.width - prev.width) / 2;
        const dh = (r.height - prev.height) / 2;
        setCamState((c) => (c ? panBy(c, dw, dh) : c));
      }
      prevSize.current = { width: r.width, height: r.height };
      setSize(prevSize.current);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (view) return;
    setCamState(fitPoints(fitTargets(), sizeRef.current));
  }, [view, fitTargets]);

  // 読み込み(replaceDesign)のたびに全体表示
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => {
    setCamState(null);
  }, [loadCount]);
  // 初回に大きさが分かったら、その大きさで全体表示を固定する
  useEffect(() => {
    if (!camState && size && !view) fitRef.current();
  }, [camState, size, view]);

  // ホイールで拡大縮小(passive: false が必要なので直接登録)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!canNavigate) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const k = e.ctrlKey ? 0.01 : 0.0015;
      const factor = Math.exp(-e.deltaY * k);
      setCam(zoomAt(camRef.current, e.clientX - r.left, e.clientY - r.top, factor));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [canNavigate, setCam]);

  const showWobble = useCallback(
    (x: number, y: number) => {
      playSfx('snap');
      if (!reducedMotion) setWobble({ x, y, key: ++gestureSeq });
    },
    [reducedMotion],
  );

  const flash = useCallback((id: LinkId) => {
    setFlashLink(id);
    window.setTimeout(() => setFlashLink((cur) => (cur === id ? null : cur)), 700);
  }, []);

  const cancel = useCallback((): boolean => {
    const g = gesture.current;
    if (!g) return false;
    if (g.kind === 'link' || g.kind === 'rect') {
      gesture.current = null;
      setPreview(null);
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    apiRef.current = { cancel, fit };
  }, [apiRef, cancel, fit]);

  // 道具を変えたら作図中の棒は取り消す
  useEffect(() => {
    cancel();
  }, [tool, cancel]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  const crankNotice = (reason: CrankFailure) =>
    onNotice(
      reason === 'multi-fixed' ? 'editor.notice.crankMultiFixed' : 'editor.notice.crankNoFixed',
      'error',
    );

  const finishLink = (g: Extract<Gesture, { kind: 'link' }>) => {
    const s = useEditor.getState();
    const end = g.end;
    const endRef: PointRef = end.joint ? { joint: end.joint } : { x: end.x, y: end.y };
    if (g.attach) {
      const r = attachToLink(s.design, g.attach, endRef);
      if (r.jointId) {
        s.commit(r.design);
        s.setSelection({ joints: [], links: [g.attach] });
      }
    } else {
      const r = addLink(s.design, g.from.ref, endRef);
      if (r.linkId) {
        s.commit(r.design);
        s.setSelection({ joints: [], links: [r.linkId] });
      }
    }
    s.seal();
    gesture.current = null;
    setPreview(null);
  };

  const snapOpts = (alt: boolean, exclude?: Set<JointId>) => {
    const c = camRef.current;
    return {
      grid: alt ? null : snapStep(c.scale),
      magnetRadius: pinAllowed ? MAGNET_PX / c.scale : 0,
      exclude,
    };
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    onFocusRequest();
    const { sx, sy } = local(e);
    const c = camRef.current;
    const panButton = e.button === 1 || e.button === 2 || (e.button === 0 && spaceHeld.current);
    if (panButton || (readOnly && e.button === 0)) {
      if (!canNavigate) return;
      e.preventDefault();
      gesture.current = { kind: 'pan', id: e.pointerId, sx, sy, cam0: c };
      svgRef.current?.setPointerCapture?.(e.pointerId);
      setPanning(true);
      return;
    }
    if (e.button !== 0 || readOnly) return;
    const s = useEditor.getState();
    const d = s.design;
    const w = toWorld(c, sx, sy);
    const g0 = gesture.current;

    // 2 回クリックで棒を引く途中
    if (g0?.kind === 'link' && g0.pending) {
      g0.end = snapPoint(d, w, snapOpts(e.altKey, linkExclude(d, g0)));
      finishLink(g0);
      return;
    }

    const hit = hitTest(d, w, JOINT_HIT_PX / c.scale, LINK_HIT_PX / c.scale);
    switch (tool) {
      case 'select': {
        if (hit) {
          const sel = s.selection;
          const isJ = hit.kind === 'joint';
          const inSel = isJ ? sel.joints.includes(hit.id) : sel.links.includes(hit.id);
          let next: Selection;
          if (e.shiftKey) {
            next = isJ
              ? {
                  ...sel,
                  joints: inSel ? sel.joints.filter((x) => x !== hit.id) : [...sel.joints, hit.id],
                }
              : {
                  ...sel,
                  links: inSel ? sel.links.filter((x) => x !== hit.id) : [...sel.links, hit.id],
                };
          } else if (inSel) next = sel;
          else next = isJ ? { joints: [hit.id], links: [] } : { joints: [], links: [hit.id] };
          s.setSelection(next);
          if (isJ && locked.has(hit.id)) {
            gesture.current = { kind: 'blocked', id: e.pointerId, sx, sy, told: false };
            svgRef.current?.setPointerCapture?.(e.pointerId);
            return;
          }
          const stillSelected = isJ ? next.joints.includes(hit.id) : next.links.includes(hit.id);
          if (!stillSelected) return;
          const ids = selectionJoints(d, next).filter((id) => !locked.has(id));
          const anchorId = isJ
            ? hit.id
            : ids.find((id) => d.links.find((l) => l.id === hit.id)?.joints.includes(id));
          const anchor = anchorId ? d.joints.find((j) => j.id === anchorId) : undefined;
          if (!anchor || ids.length === 0) return;
          const single = isJ && ids.length === 1 ? hit.id : null;
          const exclude = new Set(ids);
          if (single) {
            for (const l of d.links)
              if (l.joints.includes(single)) l.joints.forEach((x) => exclude.add(x));
          }
          gesture.current = {
            kind: 'drag',
            id: e.pointerId,
            ids,
            anchor: { id: anchor.id, x: anchor.x, y: anchor.y },
            grab: { x: anchor.x - w.x, y: anchor.y - w.y },
            base: d,
            group: `drag:${++gestureSeq}`,
            single,
            exclude,
            magnet: null,
            moved: false,
            sx,
            sy,
            clicked: hit,
            shift: e.shiftKey,
          };
          svgRef.current?.setPointerCapture?.(e.pointerId);
        } else {
          gesture.current = {
            kind: 'rect',
            id: e.pointerId,
            a: w,
            b: w,
            additive: e.shiftKey ? s.selection : null,
            sx,
            sy,
          };
          if (!e.shiftKey) s.setSelection({ joints: [], links: [] });
          svgRef.current?.setPointerCapture?.(e.pointerId);
        }
        return;
      }
      case 'link': {
        let from: { ref: PointRef; x: number; y: number };
        let attach: LinkId | null = null;
        if (hit?.kind === 'joint') {
          if (!pinAllowed) {
            onNotice('editor.notice.noPin', 'error');
            return;
          }
          const j = d.joints.find((x) => x.id === hit.id)!;
          from = { ref: { joint: j.id }, x: j.x, y: j.y };
        } else if (hit?.kind === 'link') {
          attach = hit.id;
          from = { ref: { x: hit.at.x, y: hit.at.y }, x: hit.at.x, y: hit.at.y };
        } else {
          const p = e.altKey ? w : snapToGrid(w, snapStep(c.scale));
          from = { ref: { x: p.x, y: p.y }, x: p.x, y: p.y };
        }
        const g: Gesture = {
          kind: 'link',
          id: e.pointerId,
          from,
          attach,
          sx,
          sy,
          end: { x: from.x, y: from.y, joint: null },
          pending: false,
        };
        gesture.current = g;
        setPreview({ kind: 'link', a: from, b: from, attach: !!attach, joint: null });
        svgRef.current?.setPointerCapture?.(e.pointerId);
        return;
      }
      case 'fixed': {
        if (hit?.kind === 'joint') {
          if (locked.has(hit.id)) {
            onNotice('editor.notice.locked', 'error');
            return;
          }
          s.commit(toggleFixed(d, hit.id, locked));
          s.setSelection({ joints: [hit.id], links: [] });
        } else {
          const p = e.altKey ? w : snapToGrid(w, snapStep(c.scale));
          const r = addJoint(d, p, true);
          s.commit(r.design);
          s.setSelection({ joints: [r.id], links: [] });
        }
        playSfx('press');
        return;
      }
      case 'crank': {
        let linkId: LinkId | null = null;
        if (hit?.kind === 'link') linkId = hit.id;
        else if (hit?.kind === 'joint') {
          const cands = d.links.filter((l) => l.joints.includes(hit.id));
          const good = cands.find(
            (l) => l.joints.filter((id) => d.joints.find((j) => j.id === id)?.fixed).length === 1,
          );
          linkId = (good ?? cands[0])?.id ?? null;
        }
        if (!linkId) return;
        const r = toggleCrank(d, linkId);
        if (!r.ok) {
          crankNotice(r.reason);
          flash(linkId);
          playSfx('error');
          return;
        }
        s.commit(r.design);
        s.setSelection({ joints: [], links: [linkId] });
        playSfx('press');
        return;
      }
      case 'foot': {
        if (hit?.kind !== 'joint') return;
        s.commit(setFoot(d, d.foot === hit.id ? null : hit.id));
        s.setSelection({ joints: [hit.id], links: [] });
        playSfx('press');
        return;
      }
      case 'delete': {
        if (!hit) return;
        if (hit.kind === 'joint' && locked.has(hit.id)) {
          onNotice('editor.notice.locked', 'error');
          return;
        }
        const sel: Selection =
          hit.kind === 'joint' ? { joints: [hit.id], links: [] } : { joints: [], links: [hit.id] };
        const next = deleteItems(d, sel, locked);
        if (next !== d) {
          s.commit(next);
          playSfx('release');
        }
        setHover(null);
        return;
      }
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const { sx, sy } = local(e);
    const c = camRef.current;
    const w = toWorld(c, sx, sy);
    if (cursorRef.current)
      cursorRef.current.textContent = t('editor.cursor', { x: fmt1(w.x), y: fmt1(w.y) });
    const g = gesture.current;
    if (!g) {
      if (readOnly) return;
      const d = useEditor.getState().design;
      const h = hitTest(d, w, JOINT_HIT_PX / c.scale, LINK_HIT_PX / c.scale);
      if (hitKey(h) !== hitKey(hover)) setHover(h);
      return;
    }
    if (g.kind !== 'link' || !g.pending) {
      if (g.id !== e.pointerId) return;
    }
    switch (g.kind) {
      case 'blocked':
        if (!g.told && Math.hypot(sx - g.sx, sy - g.sy) >= CLICK_TOL_PX) {
          g.told = true;
          onNotice('editor.notice.locked', 'error');
          playSfx('error');
        }
        return;
      case 'pan':
        setCam(panBy(g.cam0, sx - g.sx, sy - g.sy));
        return;
      case 'drag': {
        if (!g.moved && Math.hypot(sx - g.sx, sy - g.sy) < CLICK_TOL_PX) return;
        g.moved = true;
        const target = { x: w.x + g.grab.x, y: w.y + g.grab.y };
        let snapped: SnapResult;
        if (g.single) snapped = snapPoint(g.base, target, snapOpts(e.altKey, g.exclude));
        else {
          const p = e.altKey ? target : snapToGrid(target, snapStep(c.scale));
          snapped = { x: p.x, y: p.y, joint: null };
        }
        const next = moveJoints(
          g.base,
          g.ids,
          snapped.x - g.anchor.x,
          snapped.y - g.anchor.y,
          locked,
        );
        useEditor.getState().commit(next, { group: g.group });
        if (snapped.joint !== g.magnet) {
          g.magnet = snapped.joint;
          if (snapped.joint) showWobble(snapped.x, snapped.y);
        }
        return;
      }
      case 'rect':
        g.b = w;
        setPreview({ kind: 'rect', a: g.a, b: g.b });
        return;
      case 'link': {
        const d = useEditor.getState().design;
        const end = snapPoint(d, w, snapOpts(e.altKey, linkExclude(d, g)));
        if (end.joint !== g.end.joint && end.joint) showWobble(end.x, end.y);
        g.end = end;
        setPreview({ kind: 'link', a: g.from, b: end, attach: !!g.attach, joint: end.joint });
        return;
      }
    }
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const { sx, sy } = local(e);
    svgRef.current?.releasePointerCapture?.(e.pointerId);
    const s = useEditor.getState();
    switch (g.kind) {
      case 'pan':
        gesture.current = null;
        setPanning(false);
        return;
      case 'blocked':
        gesture.current = null;
        return;
      case 'drag': {
        gesture.current = null;
        if (g.moved && g.magnet && g.single) {
          const merged = mergeJoints(s.design, g.magnet, g.single, locked);
          s.commit(merged, { group: g.group });
          s.setSelection({ joints: [g.magnet], links: [] });
        } else if (!g.moved && !g.shift) {
          // 複数選択の中の 1 つをクリックしただけなら、それだけを選ぶ
          const only: Selection =
            g.clicked.kind === 'joint'
              ? { joints: [g.clicked.id], links: [] }
              : { joints: [], links: [g.clicked.id] };
          s.setSelection(only);
        }
        s.seal();
        return;
      }
      case 'rect': {
        gesture.current = null;
        setPreview(null);
        if (Math.hypot(sx - g.sx, sy - g.sy) < CLICK_TOL_PX) return;
        const r = selectInRect(s.design, g.a, g.b);
        const base = g.additive;
        s.setSelection(
          base
            ? {
                joints: [...new Set([...base.joints, ...r.joints])],
                links: [...new Set([...base.links, ...r.links])],
              }
            : r,
        );
        return;
      }
      case 'link': {
        const clickOnly = Math.hypot(sx - g.sx, sy - g.sy) < CLICK_TOL_PX;
        if (clickOnly && g.attach) {
          // 棒の途中をクリック:その位置に点を足す(三角リンクの頂点やピンの足場になる)
          const r = attachToLink(s.design, g.attach, g.from.ref);
          if (r.jointId) {
            s.commit(r.design);
            s.seal();
            s.setSelection({ joints: [r.jointId], links: [] });
            playSfx('snap');
          }
          gesture.current = null;
          setPreview(null);
          return;
        }
        if (clickOnly) {
          // クリックだけなら 2 回目のクリックで終点を決める
          g.pending = true;
          g.id = null;
          return;
        }
        finishLink(g);
        return;
      }
    }
  };

  const onPointerCancel = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    setPreview(null);
    setPanning(false);
    useEditor.getState().seal();
  };

  const onPointerLeave = () => {
    if (!gesture.current && hover) setHover(null);
  };

  // ---------- 描画 ----------
  const S = (x: number, y: number) => toScreen(cam, x, y);
  const joints = design.joints;
  const jointScreen = useMemo(
    () => new Map(joints.map((j) => [j.id, toScreen(cam, j.x, j.y)])),
    [joints, cam],
  );
  const crankLinks = useMemo(() => new Set(design.cranks.map((c) => c.link)), [design.cranks]);
  const problemLinks = useMemo(() => new Set(analysis.problemLinks), [analysis]);
  const problemJoints = useMemo(() => new Set(analysis.problemJoints), [analysis]);
  const selJ = useMemo(() => new Set(selection.joints), [selection]);
  const selL = useMemo(() => new Set(selection.links), [selection]);

  const trajectories = useMemo(() => {
    const m = analysis.compiled;
    const out: { id: string; foot: boolean; ok: string; fail: string }[] = [];
    if (design.cranks.length === 0) return out;
    const floating = new Set(m.floating);
    m.jointIds.forEach((id, i) => {
      if (m.fixed[i] || floating.has(i)) return;
      if (trajectoryExtent(analysis.cycle, i) < 0.05) return;
      out.push({ id, foot: i === m.footIndex, ...trajectoryPaths(analysis.cycle, i, cam) });
    });
    // 脚先を最後(いちばん上)に
    return out.sort((a, b) => Number(a.foot) - Number(b.foot));
  }, [analysis, cam, design.cranks.length]);

  // 死点:軌道上の × 印と、死点に近い区間の赤い帯(E-05)
  const dead = useMemo(() => {
    const marks: Pt[] = [];
    const ranges: string[] = [];
    const m = analysis.compiled;
    const cyc = analysis.cycle;
    for (const dp of analysis.deadPoints ?? []) {
      const k = nearestSample(cyc, dp.theta);
      const pos = cyc.positions[k];
      if (!pos) continue;
      const ji = m.jointIndex.get(dp.joint) ?? -1;
      for (const i of [ji, m.footIndex]) {
        if (i < 0) continue;
        const p = toScreen(cam, pos[i * 2]!, pos[i * 2 + 1]!);
        if (marks.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 8)) marks.push(p);
      }
      if (ji >= 0 && dp.thetaStart !== undefined && dp.thetaEnd !== undefined) {
        const run = sampleRun(
          cyc.steps,
          nearestSample(cyc, dp.thetaStart),
          nearestSample(cyc, dp.thetaEnd),
        );
        if (run.length > 1) ranges.push(polylinePath(cyc, ji, run, cam));
      }
    }
    return { marks, ranges };
  }, [analysis, cam]);

  // 脚先の寸法(歩幅・足上げ)と進む向き(E-03)
  const guide = useMemo(() => footGuide(analysis, design.motor.rpm), [analysis, design.motor.rpm]);

  // グラスホフ判定(クランクで駆動する最初の四節ループ)
  const grashofChip = useMemo(() => {
    const g = (analysis.grashof ?? [])[0];
    if (!g) return null;
    const variant = grashofVariant(g);
    return {
      label: t(`editor.grashof.${variant}`),
      ok: variant === 'crank-rocker' || variant === 'double-crank',
    };
  }, [analysis]);

  const ghostData = useMemo(() => {
    if (!ghost) return null;
    const compiled = compileMechanism(ghost);
    const cycle = sampleCycle(compiled, 120);
    return { compiled, cycle };
  }, [ghost]);

  const gridInfo = gridSteps(cam.scale);
  const minorPx = gridInfo.minor * cam.scale;
  const majorPx = gridInfo.major * cam.scale;
  const mod = (a: number, m: number) => ((a % m) + m) % m;

  const hoverKey = hitKey(hover);
  const hintKey = readOnly
    ? 'editor.hint.readOnly'
    : gesture.current?.kind === 'link' && gesture.current.pending
      ? 'editor.hint.pending'
      : `editor.hint.${tool}`;

  return (
    <div
      ref={wrapRef}
      className="ed-canvas"
      data-tool={readOnly ? 'view' : tool}
      data-hover={hover?.kind ?? ''}
      data-panning={panning ? 'true' : 'false'}
    >
      <svg
        ref={svgRef}
        className="ed-svg"
        role="img"
        aria-label={t('editor.region')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern
            id="ed-grid-minor"
            patternUnits="userSpaceOnUse"
            width={minorPx}
            height={minorPx}
            x={mod(cam.ox, minorPx)}
            y={mod(cam.oy, minorPx)}
          >
            <path className="ed-grid-minor" d={`M${minorPx} 0H0V${minorPx}`} />
          </pattern>
          <pattern
            id="ed-grid-major"
            patternUnits="userSpaceOnUse"
            width={majorPx}
            height={majorPx}
            x={mod(cam.ox, majorPx)}
            y={mod(cam.oy, majorPx)}
          >
            <path className="ed-grid-major" d={`M${majorPx} 0H0V${majorPx}`} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ed-grid-minor)" />
        <rect width="100%" height="100%" fill="url(#ed-grid-major)" />
        <line className="ed-axis" x1={0} x2={sz.width} y1={cam.oy} y2={cam.oy} />
        <line className="ed-axis" x1={cam.ox} x2={cam.ox} y1={0} y2={sz.height} />

        {ghost && ghostData && <GhostLayer ghost={ghost} data={ghostData} cam={cam} />}

        <g className="ed-trajectories">
          {trajectories.map((tr) => (
            <g key={tr.id}>
              {tr.ok && <path className={tr.foot ? 'ed-traj-foot' : 'ed-traj'} d={tr.ok} />}
              {tr.fail && <path className="ed-traj-fail" d={tr.fail} />}
            </g>
          ))}
          {dead.ranges.map((d, i) => (
            <path key={`r${i}`} className="ed-dead-range" d={d} />
          ))}
          {dead.marks.map((p, i) => (
            <path
              key={i}
              className="ed-dead"
              d={`M${p.x - 4} ${p.y - 4}L${p.x + 4} ${p.y + 4}M${p.x - 4} ${p.y + 4}L${p.x + 4} ${p.y - 4}`}
            />
          ))}
        </g>
        {guide && (
          <FootGuides
            guide={guide}
            cycle={analysis.cycle}
            footIndex={analysis.compiled.footIndex}
            cam={cam}
          />
        )}

        <g className="ed-links">
          {design.links.map((l, li) => {
            const ord = linkOutlineOrder(design, li);
            const pts = ord.map((i) => jointScreen.get(joints[i]!.id)!);
            if (pts.length < 2) return null;
            const problem = problemLinks.has(l.id) || flashLink === l.id;
            const cls = [
              'ed-link',
              crankLinks.has(l.id) && 'is-crank',
              problem && 'is-problem ed-shake',
              selL.has(l.id) && 'is-selected',
              hoverKey === `link:${l.id}` && 'is-hover',
            ]
              .filter(Boolean)
              .join(' ');
            if (pts.length === 2) {
              const [a, b] = pts as [Pt, Pt];
              return (
                <g key={l.id} className={cls}>
                  <line className="ed-link-halo" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                  <line className="ed-link-outer" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                  <line className="ed-link-inner" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                </g>
              );
            }
            const pa = pointsAttr(pts);
            return (
              <g key={l.id} className={cls}>
                <polygon className="ed-link-halo" points={pa} />
                <polygon className="ed-plate" points={pa} />
                <polygon className="ed-link-outer" points={pa} />
                <polygon className="ed-link-inner" points={pa} />
              </g>
            );
          })}
        </g>

        <LiveLayer
          engine={engine}
          design={design}
          compiled={analysis.compiled}
          cam={cam}
          visible={liveVisible && design.cranks.length > 0}
          onFailChange={onFailChange}
        />

        <g className="ed-joints">
          {design.cranks.map((c) => {
            const p = jointScreen.get(c.pivot);
            return p ? <CrankArrow key={c.id} p={p} ccw={design.motor.rpm >= 0} /> : null;
          })}
          {joints.map((j) => {
            const p = jointScreen.get(j.id)!;
            const cls = [
              'ed-joint',
              selJ.has(j.id) && 'is-selected',
              hoverKey === `joint:${j.id}` && 'is-hover',
              problemJoints.has(j.id) && 'is-problem ed-shake',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <g key={j.id} className={cls}>
                <circle className="ed-joint-halo" cx={p.x} cy={p.y} r={11} />
                {j.fixed && <GroundSymbol p={p} />}
                {design.foot === j.id && (
                  <>
                    <circle className="ed-foot-ring" cx={p.x} cy={p.y} r={8.5} />
                    <text className="ed-foot-label" x={p.x + 11} y={p.y + 16}>
                      {t('editor.label.foot')}
                    </text>
                  </>
                )}
                <circle className="ed-pin" cx={p.x} cy={p.y} r={4.5} />
                {locked.has(j.id) && <circle className="ed-lock" cx={p.x} cy={p.y} r={1.8} />}
              </g>
            );
          })}
        </g>

        <LengthLabels design={design} selection={selL} jointScreen={jointScreen} />

        {preview?.kind === 'rect' && (
          <RectPreview a={S(preview.a.x, preview.a.y)} b={S(preview.b.x, preview.b.y)} />
        )}
        {preview?.kind === 'link' && (
          <LinkPreview
            a={S(preview.a.x, preview.a.y)}
            b={S(preview.b.x, preview.b.y)}
            attach={preview.attach}
            length={Math.hypot(preview.b.x - preview.a.x, preview.b.y - preview.a.y)}
          />
        )}
        {wobble && (
          <circle
            key={wobble.key}
            className="ed-wobble"
            cx={S(wobble.x, wobble.y).x}
            cy={S(wobble.x, wobble.y).y}
            r={10}
            style={{ animationDuration: `${MICRO.snapWobble * 2}s` }}
          />
        )}
      </svg>

      <div className="ed-chips">
        <span
          key={dofPulse}
          className={`ed-badge${dofPulse > 0 ? ' is-pulse' : ''}`}
          data-status={analysis.dofStatus}
          role="status"
        >
          {t('editor.dof.badge', { dof: analysis.dof })}・{t(`editor.dof.${analysis.dofStatus}`)}
        </span>
        {grashofChip && (
          <span className="ed-chip" data-ok={grashofChip.ok ? 'true' : 'false'}>
            {grashofChip.label}
          </span>
        )}
        {failing && design.cranks.length > 0 && (
          <span className="ed-chip-fail">{t('editor.status.failNow')}</span>
        )}
      </div>
      {design.joints.length === 0 && !readOnly && (
        <div className="ed-empty">{t('editor.empty')}</div>
      )}
      {overlay}
      <div className="ed-statusbar">
        <span className="ed-hint">
          {t(hintKey)} {canNavigate ? `/${t('editor.hint.view')}` : ''}
        </span>
        <span className="ed-num" ref={cursorRef} />
        <span className="ed-num">{t('editor.zoom', { pct: Math.round(cam.scale * 20) })}</span>
      </div>
    </div>
  );
}

/** 棒を引くとき:始点のジョイントと、すでに同じリンクにある点には吸い寄せない */
function linkExclude(d: DesignDoc, g: Extract<Gesture, { kind: 'link' }>): Set<JointId> {
  const ex = new Set<JointId>();
  if ('joint' in g.from.ref) ex.add(g.from.ref.joint);
  if (g.attach) d.links.find((l) => l.id === g.attach)?.joints.forEach((j) => ex.add(j));
  return ex;
}

function GroundSymbol({ p }: { p: Pt }) {
  const h = 13;
  const w = 8;
  const y = p.y + h;
  const hatch: ReactNode[] = [];
  for (let i = 0; i < 5; i++) {
    const x = p.x - 10 + i * 5;
    hatch.push(<line key={i} className="ed-hatch" x1={x} y1={y + 5} x2={x + 4} y2={y} />);
  }
  return (
    <g>
      <polygon className="ed-ground" points={`${p.x},${p.y} ${p.x - w},${y} ${p.x + w},${y}`} />
      <line className="ed-hatch" x1={p.x - 12} y1={y} x2={p.x + 12} y2={y} />
      {hatch}
    </g>
  );
}

/** クランク軸の回転方向の矢印(rpm の符号) */
function CrankArrow({ p, ccw }: { p: Pt; ccw: boolean }) {
  const r = 17;
  const a0 = (40 * Math.PI) / 180;
  const a1 = (300 * Math.PI) / 180;
  const pt = (a: number) => ({ x: p.x + r * Math.cos(a), y: p.y - r * Math.sin(a) });
  let d = '';
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const q = pt(a0 + ((a1 - a0) * i) / n);
    d += `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
  }
  // 矢じり:反時計回りなら a1 の先、時計回りなら a0 の先
  const at = ccw ? a1 : a0;
  const dir = ccw ? 1 : -1;
  const tip = pt(at);
  const tx = -Math.sin(at) * dir;
  const ty = -Math.cos(at) * dir;
  const nx = Math.cos(at);
  const ny = -Math.sin(at);
  const head = `${tip.x + tx * 6},${tip.y + ty * 6} ${tip.x + nx * 4},${tip.y + ny * 4} ${tip.x - nx * 4},${tip.y - ny * 4}`;
  return (
    <g aria-hidden="true">
      <path className="ed-crank-arrow" d={d} />
      <polygon className="ed-crank-arrow-head" points={head} />
    </g>
  );
}

function LengthLabels({
  design,
  selection,
  jointScreen,
}: {
  design: DesignDoc;
  selection: Set<LinkId>;
  jointScreen: Map<JointId, Pt>;
}) {
  if (selection.size === 0) return null;
  const out: ReactNode[] = [];
  for (const l of design.links) {
    if (!selection.has(l.id) || l.joints.length !== 2) continue;
    const a = design.joints.find((j) => j.id === l.joints[0]);
    const b = design.joints.find((j) => j.id === l.joints[1]);
    const sa = jointScreen.get(l.joints[0]!);
    const sb = jointScreen.get(l.joints[1]!);
    if (!a || !b || !sa || !sb) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const mx = (sa.x + sb.x) / 2;
    const my = (sa.y + sb.y) / 2;
    const dx = sb.x - sa.x;
    const dy = sb.y - sa.y;
    const L = Math.hypot(dx, dy) || 1;
    out.push(
      <text
        key={l.id}
        className="ed-len-label"
        x={mx + (-dy / L) * 14}
        y={my + (dx / L) * 14}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {fmt1(len)} cm
      </text>,
    );
  }
  return <g>{out}</g>;
}

function RectPreview({ a, b }: { a: Pt; b: Pt }) {
  return (
    <rect
      className="ed-rect"
      x={Math.min(a.x, b.x)}
      y={Math.min(a.y, b.y)}
      width={Math.abs(a.x - b.x)}
      height={Math.abs(a.y - b.y)}
    />
  );
}

function LinkPreview({ a, b, attach, length }: { a: Pt; b: Pt; attach: boolean; length: number }) {
  return (
    <g>
      <line
        className={`ed-rubber${attach ? ' is-attach' : ''}`}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
      />
      <circle className="ed-rubber-end" cx={a.x} cy={a.y} r={3.5} />
      <circle className="ed-rubber-end" cx={b.x} cy={b.y} r={4.5} />
      {length > 0.05 && (
        <text className="ed-len-label" x={b.x + 10} y={b.y - 10}>
          {fmt1(length)} cm
        </text>
      )}
    </g>
  );
}

function GhostLayer({
  ghost,
  data,
  cam,
}: {
  ghost: DesignDoc;
  data: { compiled: CompiledMechanism; cycle: CycleSample };
  cam: Camera;
}) {
  const S = (x: number, y: number) => toScreen(cam, x, y);
  const f = data.compiled.footIndex;
  const path = f >= 0 && ghost.cranks.length > 0 ? trajectoryPaths(data.cycle, f, cam).ok : '';
  return (
    <g className="ed-ghost" aria-hidden="true">
      {path && <path className="ed-ghost-traj" d={path} />}
      {ghost.links.map((l, li) => {
        const ord = linkOutlineOrder(ghost, li);
        const pts = ord.map((i) => S(ghost.joints[i]!.x, ghost.joints[i]!.y));
        if (pts.length < 2) return null;
        if (pts.length === 2)
          return (
            <line
              key={l.id}
              className="ed-ghost-link"
              x1={pts[0]!.x}
              y1={pts[0]!.y}
              x2={pts[1]!.x}
              y2={pts[1]!.y}
            />
          );
        return <polygon key={l.id} className="ed-ghost-link" points={pointsAttr(pts)} />;
      })}
      {ghost.joints.map((j) => {
        const p = S(j.x, j.y);
        return <circle key={j.id} className="ed-ghost-joint" cx={p.x} cy={p.y} r={5} />;
      })}
    </g>
  );
}

/** 脚先の接地区間・地面・歩幅と足上げの寸法線・進む向きの矢印 */
function FootGuides({
  guide,
  cycle,
  footIndex,
  cam,
}: {
  guide: FootGuide;
  cycle: CycleSample;
  footIndex: number;
  cam: Camera;
}) {
  const g = guide;
  const a = toScreen(cam, g.stride.x0, g.stride.y);
  const b = toScreen(cam, g.stride.x1, g.stride.y);
  const lo = toScreen(cam, g.bounds.minX, g.bounds.minY);
  const hi = toScreen(cam, g.bounds.maxX, g.bounds.maxY);
  const groundY = a.y;
  const dimY = groundY + 16;
  const liftX = hi.x + 18;
  const l0 = toScreen(cam, g.lift.x, g.lift.y0).y;
  const l1 = toScreen(cam, g.lift.x, g.lift.y1).y;
  const cx = (a.x + b.x) / 2;
  const walkY = dimY + 30;
  const w = g.walk;
  const contact = polylinePath(cycle, footIndex, g.contact, cam);
  return (
    <g className="ed-guides" aria-hidden="true">
      {contact && <path className="ed-contact" d={contact} />}
      <line className="ed-ground-line" x1={lo.x - 24} x2={hi.x + 24} y1={groundY} y2={groundY} />
      {g.stride.length > 0.5 && (
        <g>
          <line className="ed-dim" x1={a.x} x2={a.x} y1={groundY + 3} y2={dimY + 5} />
          <line className="ed-dim" x1={b.x} x2={b.x} y1={groundY + 3} y2={dimY + 5} />
          <line className="ed-dim" x1={a.x} x2={b.x} y1={dimY} y2={dimY} />
          <polygon
            className="ed-dim-head"
            points={`${a.x},${dimY} ${a.x + 6},${dimY - 3} ${a.x + 6},${dimY + 3}`}
          />
          <polygon
            className="ed-dim-head"
            points={`${b.x},${dimY} ${b.x - 6},${dimY - 3} ${b.x - 6},${dimY + 3}`}
          />
          <text className="ed-dim-label" x={cx} y={dimY + 13} textAnchor="middle">
            {t('analysis.metric.stride')} {fmt1(g.stride.length)} cm
          </text>
        </g>
      )}
      {g.lift.length > 0.5 && (
        <g>
          <line className="ed-dim" x1={liftX - 5} x2={liftX + 5} y1={l0} y2={l0} />
          <line className="ed-dim" x1={liftX - 5} x2={liftX + 5} y1={l1} y2={l1} />
          <line className="ed-dim" x1={liftX} x2={liftX} y1={l0} y2={l1} />
          <polygon
            className="ed-dim-head"
            points={`${liftX},${l0} ${liftX - 3},${l0 - 6} ${liftX + 3},${l0 - 6}`}
          />
          <polygon
            className="ed-dim-head"
            points={`${liftX},${l1} ${liftX - 3},${l1 + 6} ${liftX + 3},${l1 + 6}`}
          />
          <text className="ed-dim-label" x={liftX + 8} y={(l0 + l1) / 2} dominantBaseline="central">
            {t('analysis.metric.lift')} {fmt1(g.lift.length)} cm
          </text>
        </g>
      )}
      {w !== 0 && (
        <g className="ed-walk">
          <line x1={cx - 26 * w} x2={cx + 20 * w} y1={walkY} y2={walkY} />
          <polygon
            points={`${cx + 30 * w},${walkY} ${cx + 18 * w},${walkY - 7} ${cx + 18 * w},${walkY + 7}`}
          />
          <text
            className="ed-walk-label"
            x={cx + 38 * w}
            y={walkY}
            textAnchor={w > 0 ? 'start' : 'end'}
            dominantBaseline="central"
          >
            {t(w > 0 ? 'analysis.metric.direction.forward' : 'analysis.metric.direction.backward')}
          </text>
        </g>
      )}
    </g>
  );
}
