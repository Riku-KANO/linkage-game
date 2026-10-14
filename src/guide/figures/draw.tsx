import { useEffect, useId, useState, type ReactNode } from 'react';
import type { CompiledMechanism } from '@/core/kinematics';
import { nextFrame } from '@/ui/mech';
import type { FitMap } from './motion';

/**
 * 図の描画の部品。設計ビューと同じ見た目(紙の上に、墨の縁取りの棒・ピン・斜線の固定点・
 * 橙のクランク・青い脚先)を小さく描く。
 */

/**
 * 図の時計:マウントしてからの経過秒。動きを減らすときは still で止まった 1 コマを返し、
 * 再描画しない(静止画)。
 */
export function useFigureClock(reducedMotion: boolean, still = 0): number {
  const [t, setT] = useState(reducedMotion ? still : 0);
  useEffect(() => {
    if (reducedMotion) {
      setT(still);
      return;
    }
    let origin: number | null = null;
    let cancel = () => {};
    const loop = (now: number) => {
      if (origin === null) origin = now;
      setT((now - origin) / 1000);
      cancel = nextFrame(loop);
    };
    cancel = nextFrame(loop);
    return () => cancel();
  }, [reducedMotion, still]);
  return t;
}

export const f1 = (v: number) => Math.round(v * 10) / 10;

/** 点列 [x0, y0, ...] を図の座標の SVG パスに */
export function pathD(points: Float64Array, map: FitMap, close = false, skip?: boolean[]): string {
  let d = '';
  let pen = false;
  for (let i = 0; i + 1 < points.length; i += 2) {
    if (skip?.[i / 2]) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${f1(map.x(points[i]!))} ${f1(map.y(points[i + 1]!))}`;
    pen = true;
  }
  return close && d ? `${d}Z` : d;
}

/** 凸包(反時計回り、Andrew の単調連鎖)。3 点以上の剛体リンクを板として描くのに使う */
export function convexHull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0)
      lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0)
      upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export type LinkTone = 'ink' | 'crank' | 'problem' | 'loose' | 'ghost' | 'leg1' | 'leg2';

export interface MechDrawProps {
  mech: CompiledMechanism;
  positions: Float64Array;
  map: FitMap;
  /** リンク index → 色。省略したリンクは ink(クランクは自動で crank) */
  tones?: ReadonlyMap<number, LinkTone>;
  /** すべてのリンクの色を上書き(ゴースト・脚列の奥の脚など) */
  tone?: LinkTone;
  /** 固定点の記号(三角と斜線)を描くか */
  ground?: boolean;
  /** 脚先の点を描くか */
  foot?: boolean;
  /** 描かない点 */
  hidden?: ReadonlySet<number>;
  /** 描かないリンク */
  hiddenLinks?: ReadonlySet<number>;
  /** 線の太さの倍率(小さな図では細く) */
  weight?: number;
  className?: string;
}

/** 機構 1 つを、今の姿勢で描く */
export function MechDraw({
  mech,
  positions,
  map,
  tones,
  tone,
  ground = true,
  foot = true,
  hidden,
  hiddenLinks,
  weight = 1,
  className,
}: MechDrawProps) {
  const P = (j: number): [number, number] => [
    map.x(positions[j * 2]!),
    map.y(positions[j * 2 + 1]!),
  ];
  const crankLinks = new Set(
    mech.design.cranks.map((c) => mech.linkIds.indexOf(c.link)).filter((i) => i >= 0),
  );
  const toneOf = (li: number): LinkTone =>
    tone ?? tones?.get(li) ?? (crankLinks.has(li) ? 'crank' : 'ink');
  const outer = 6 * weight;
  const inner = 2.6 * weight;
  const pinR = 2.6 * weight;

  const links: ReactNode[] = [];
  mech.links.forEach((js, li) => {
    if (hiddenLinks?.has(li)) return;
    const pts = js.map(P);
    const cls = `gd-link gd-tone-${toneOf(li)}`;
    if (pts.length >= 3) {
      const hull = convexHull(pts);
      const d = `${hull.map((p, i) => `${i ? 'L' : 'M'}${f1(p[0])} ${f1(p[1])}`).join('')}Z`;
      links.push(
        <g key={li} className={cls}>
          <path className="gd-plate" d={d} />
          <path className="gd-bar-outer" d={d} strokeWidth={outer} />
          <path className="gd-bar-inner" d={d} strokeWidth={inner} />
        </g>,
      );
      return;
    }
    const [a, b] = pts as [[number, number], [number, number]];
    const d = `M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}`;
    links.push(
      <g key={li} className={cls}>
        <path className="gd-bar-outer" d={d} strokeWidth={outer} />
        <path className="gd-bar-inner" d={d} strokeWidth={inner} />
      </g>,
    );
  });

  const marks: ReactNode[] = [];
  const pins: ReactNode[] = [];
  for (let j = 0; j < mech.jointIds.length; j++) {
    if (hidden?.has(j)) continue;
    const [x, y] = P(j);
    if (mech.fixed[j] && ground) marks.push(<GroundMark key={`g${j}`} x={x} y={y} s={weight} />);
    if (foot && j === mech.footIndex) continue;
    pins.push(
      <circle
        key={`p${j}`}
        className={`gd-pin${tone === 'ghost' ? ' gd-pin--ghost' : ''}`}
        cx={f1(x)}
        cy={f1(y)}
        r={pinR}
      />,
    );
  }
  const footDot =
    foot && mech.footIndex >= 0 && !hidden?.has(mech.footIndex) ? (
      <circle
        className={`gd-foot${tone === 'ghost' ? ' gd-foot--ghost' : ''}`}
        cx={f1(P(mech.footIndex)[0])}
        cy={f1(P(mech.footIndex)[1])}
        r={pinR * 1.5}
      />
    ) : null;

  return (
    <g className={className}>
      {marks}
      {links}
      {pins}
      {footDot}
    </g>
  );
}

/** 固定点の記号:点を頂点にした三角と、下の斜線 */
export function GroundMark({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const w = 7 * s;
  const h = 8 * s;
  const hatch: ReactNode[] = [];
  for (let i = -w; i < w; i += 3.5 * s) {
    hatch.push(
      <line
        key={i}
        className="gd-hatch"
        x1={f1(x + i)}
        y1={f1(y + h + 4 * s)}
        x2={f1(x + i + 3 * s)}
        y2={f1(y + h)}
      />,
    );
  }
  return (
    <g>
      <path
        className="gd-ground"
        d={`M${f1(x)} ${f1(y)}L${f1(x - w * 0.75)} ${f1(y + h)}L${f1(x + w * 0.75)} ${f1(y + h)}Z`}
      />
      <line
        className="gd-ground-base"
        x1={f1(x - w)}
        y1={f1(y + h)}
        x2={f1(x + w)}
        y2={f1(y + h)}
      />
      {hatch}
    </g>
  );
}

/** 寸法線(両端に矢じり、中央にラベル) */
export function Dimension({
  x1,
  y1,
  x2,
  y2,
  label,
  side = 'below',
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  side?: 'below' | 'above' | 'left' | 'right';
}) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const head = (x: number, y: number, a: number) => {
    const s = 5;
    return `M${f1(x)} ${f1(y)}L${f1(x - s * Math.cos(a - 0.45))} ${f1(y - s * Math.sin(a - 0.45))}L${f1(x - s * Math.cos(a + 0.45))} ${f1(y - s * Math.sin(a + 0.45))}Z`;
  };
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const off = { below: [0, 13], above: [0, -6], left: [-6, 4], right: [6, 4] }[side];
  const anchor = side === 'left' ? 'end' : side === 'right' ? 'start' : 'middle';
  return (
    <g className="gd-dim">
      <line x1={f1(x1)} y1={f1(y1)} x2={f1(x2)} y2={f1(y2)} />
      <path className="gd-dim-head" d={head(x2, y2, ang)} />
      <path className="gd-dim-head" d={head(x1, y1, ang + Math.PI)} />
      <text x={f1(mx + off[0]!)} y={f1(my + off[1]!)} textAnchor={anchor}>
        {label}
      </text>
    </g>
  );
}

/** 図の中の文字(紙色の縁取りつき) */
export function Label({
  x,
  y,
  children,
  anchor = 'middle',
  tone,
}: {
  x: number;
  y: number;
  children: ReactNode;
  anchor?: 'start' | 'middle' | 'end';
  tone?: 'crank' | 'foot' | 'ok' | 'error' | 'warn' | 'muted';
}) {
  return (
    <text
      className={`gd-label${tone ? ` gd-label--${tone}` : ''}`}
      x={f1(x)}
      y={f1(y)}
      textAnchor={anchor}
    >
      {children}
    </text>
  );
}

/** 回転の向きを示す円弧の矢印(中心 cx, cy、半径 r、a0→a1 rad、図の座標で反時計回りが正) */
export function TurnArrow({
  cx,
  cy,
  r,
  a0,
  a1,
  className = 'gd-turn',
}: {
  cx: number;
  cy: number;
  r: number;
  a0: number;
  a1: number;
  className?: string;
}) {
  // 図の座標は y が下向きなので、角度は設計座標(反時計回り正)で受けて y を反転する
  const pt = (a: number) => [cx + r * Math.cos(a), cy - r * Math.sin(a)] as const;
  const [sx, sy] = pt(a0);
  const [ex, ey] = pt(a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const sweep = a1 > a0 ? 0 : 1;
  const tangent = a1 > a0 ? a1 + Math.PI / 2 : a1 - Math.PI / 2;
  const tx = Math.cos(tangent);
  const ty = -Math.sin(tangent);
  const s = 5;
  const head = `M${f1(ex + tx * s)} ${f1(ey + ty * s)}L${f1(ex - ty * s * 0.6)} ${f1(ey + tx * s * 0.6)}L${f1(ex + ty * s * 0.6)} ${f1(ey - tx * s * 0.6)}Z`;
  return (
    <g className={className}>
      <path
        d={`M${f1(sx)} ${f1(sy)}A${f1(r)} ${f1(r)} 0 ${large} ${sweep} ${f1(ex)} ${f1(ey)}`}
        fill="none"
      />
      <path className="gd-turn-head" d={head} />
    </g>
  );
}

/** 図の枠:紙の背景と方眼。中身は設計座標を fitMap で写して描く */
export function FigureSvg({
  width,
  height,
  label,
  children,
  className,
  grid = true,
}: {
  width: number;
  height: number;
  label: string;
  children: ReactNode;
  className?: string;
  grid?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className={['gd-fig', className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      {grid && (
        <>
          <defs>
            <pattern id={`g${id}`} width="12" height="12" patternUnits="userSpaceOnUse">
              <path className="gd-grid" d="M12 0H0V12" />
            </pattern>
          </defs>
          <rect width={width} height={height} fill={`url(#g${id})`} />
        </>
      )}
      {children}
    </svg>
  );
}
