import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import { clamp01, f2, panelProgress, scissorGeometry } from './math';
import { nextFrame } from './useClock';
import { useReducedMotion } from './useReducedMotion';
import './mech.css';

export interface LinkagePanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** 開いているか(既定 true)。false にすると伸縮リンクが縮んで畳まれる */
  open?: boolean;
  /** 開き始めるまで(s) */
  delay?: number;
  /** 開く長さ(s) */
  duration?: number;
  /** true で開ききった(閉じきった)状態へ飛ぶ */
  skip?: boolean;
  /** 省略時はアプリと OS の設定に従う。減らすときは 0.3 秒のフェード */
  reducedMotion?: boolean;
  onOpened?: () => void;
  onClosed?: () => void;
  ref?: Ref<HTMLDivElement>;
}

/** 左右の伸縮リンクを置く余白(px)と棒の長さ(余白に収まる長さ) */
const GUTTER = 22;
const BAR = 19;
/** 伸びきったときの 1 段の高さの目安(px) */
const CELL = 17;
const PIN_R = 1.6;

/**
 * 伸縮リンク(パンタグラフ)で開くパネル(RS-4)。上の梁から左右のリンクが伸びて下の梁を押し下げ、
 * それに合わせて中身が上から現れる。中身の配置は最初から決まっていて、動くのは clip-path と
 * transform だけ(レイアウトがずれない)。動きの軽減では 0.3 秒のフェード。
 */
export function LinkagePanel({
  children,
  open = true,
  delay = 0,
  duration = 0.55,
  skip = false,
  reducedMotion,
  onOpened,
  onClosed,
  className,
  style,
  ref,
  ...rest
}: LinkagePanelProps) {
  const instant = useReducedMotion(reducedMotion);
  const jump = skip || instant || !(duration > 0);
  const [p, setP] = useState(() => (open && jump ? 1 : 0));
  const pRef = useRef(p);
  const cbs = useRef({ onOpened, onClosed, delay, duration });
  useLayoutEffect(() => {
    cbs.current = { onOpened, onClosed, delay, duration };
  });

  useEffect(() => {
    const target = open ? 1 : 0;
    const done = () => (open ? cbs.current.onOpened : cbs.current.onClosed)?.();
    if (jump) {
      pRef.current = target;
      setP(target);
      done();
      return;
    }
    const from = pRef.current;
    if (from === target) return;
    let start: number | null = null;
    let cancel = () => {};
    const loop = (now: number) => {
      if (start === null) start = now;
      const { delay: d, duration: dur } = cbs.current;
      const span = dur * Math.abs(target - from);
      const t = (now - start) / 1000 - (open ? d : 0);
      const u = span > 0 ? clamp01(t / span) : 1;
      // 開くときは snap、閉じるときは glide(panelProgress と同じイージング)
      const e = open ? panelProgress(u, 1, true) : 1 - panelProgress(u, 1, false);
      const v = from + (target - from) * e;
      pRef.current = v;
      setP(v);
      if (u < 1) cancel = nextFrame(loop);
      else done();
    };
    cancel = nextFrame(loop);
    return () => cancel();
  }, [open, jump]);

  // 伸縮リンクを描くために中身の高さを測る(中身の配置は変えない)
  const bodyRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ext = height * p;
  const cells = Math.max(3, Math.round(height / CELL));
  const tongs = height > 0 ? tongsPaths(ext, cells) : null;
  const hidden = p <= 0 && !open;

  return (
    <div
      {...rest}
      ref={ref}
      className={['mech-panel', instant && 'mech-panel--fade', className].filter(Boolean).join(' ')}
      data-open={open || undefined}
      data-opened={p >= 1 || undefined}
      aria-hidden={hidden || undefined}
      style={
        {
          ...style,
          '--mech-gutter': `${GUTTER}px`,
          visibility: hidden ? 'hidden' : style?.visibility,
        } as CSSProperties
      }
    >
      <div
        className="mech-panel__shadow"
        aria-hidden
        style={{ transform: p >= 1 ? undefined : `scaleY(${f2(p)})` }}
      />
      <div
        ref={bodyRef}
        className="mech-panel__body"
        style={{ clipPath: p >= 1 ? undefined : `inset(0 0 ${f2((1 - p) * 100)}% 0 round 10px)` }}
      >
        {children}
      </div>
      {tongs && (
        <>
          <svg
            className="mech-panel__tongs mech-panel__tongs--left"
            width={GUTTER}
            height={height}
            aria-hidden
          >
            <path className="mech-panel__bars" d={tongs.bars} />
            <path className="mech-panel__pins" d={tongs.pins} />
          </svg>
          <svg
            className="mech-panel__tongs mech-panel__tongs--right"
            width={GUTTER}
            height={height}
            aria-hidden
          >
            <path className="mech-panel__bars" d={tongs.bars} />
            <path className="mech-panel__pins" d={tongs.pins} />
          </svg>
        </>
      )}
      <div className="mech-panel__beam mech-panel__beam--top" aria-hidden />
      <div
        className="mech-panel__beam mech-panel__beam--bottom"
        aria-hidden
        style={{ transform: `translateY(${f2(ext)}px)`, opacity: p > 0 ? 1 : 0 }}
      />
    </div>
  );
}

function tongsPaths(ext: number, cells: number): { bars: string; pins: string } {
  const g = scissorGeometry(ext, cells, BAR, GUTTER / 2);
  const bars = g.bars
    .map(([x1, y1, x2, y2]) => `M${f2(x1)} ${f2(y1)}L${f2(x2)} ${f2(y2)}`)
    .join('');
  const pins = g.pins
    .map(
      ([x, y]) =>
        `M${f2(x - PIN_R)} ${f2(y)}a${PIN_R} ${PIN_R} 0 1 0 ${PIN_R * 2} 0a${PIN_R} ${PIN_R} 0 1 0 ${-PIN_R * 2} 0`,
    )
    .join('');
  return { bars, pins };
}
