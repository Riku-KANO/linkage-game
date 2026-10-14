import { useMemo, type ReactNode } from 'react';
import { walkDirection } from '@/core/kinematics';
import { t } from '@/i18n';
import { EASINGS } from '@/ui/tokens';
import {
  Dimension,
  f1,
  FigureSvg,
  Label,
  MechDraw,
  pathD,
  TurnArrow,
  useFigureClock,
  type LinkTone,
} from './draw';
import {
  boundsOf,
  cycleFigure,
  fitMap,
  fiveBarSway,
  jointPath,
  motorDir,
  poseAt,
  walkerTrack,
  type Bounds,
  type FitMap,
} from './motion';

/**
 * 遊び方の本の各ページの図(GUIDE-1)。機構はどれも本物のソルバーで解いた姿勢で動く。
 * reducedMotion のときは意味の分かる 1 コマで止める。
 */

export interface FigureProps {
  reducedMotion: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const frac = (v: number) => v - Math.floor(v);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/* ------------------------------------------------------------------------------------------------
 * 歩く機械(1 ページ目・7 ページ目・6 ページ目の横から見た図・はじめての方へ)
 * ---------------------------------------------------------------------------------------------- */

const WALK_OFFSETS = [0, 1 / 3, 2 / 3] as const;
const WALK_PERIOD = 2.4;
/** 手前の脚はふつうの色(クランクは橙)、奥の脚ほど薄く */
const LEG_TONES: (LinkTone | undefined)[] = [undefined, 'leg1', 'leg2'];

function useWalker() {
  return useMemo(() => {
    const fig = cycleFigure('goodLeg');
    const dir = motorDir(fig.design);
    const track = walkerTrack(fig.cycle, fig.mech.footIndex, WALK_OFFSETS, dir);
    const legs = boundsOf(fig.cycle.positions);
    const fixed = fig.design.joints.filter((j) => j.fixed);
    const body = {
      x0: Math.min(...fixed.map((j) => j.x)) - 9,
      x1: Math.max(...fixed.map((j) => j.x)) + 9,
      y0: Math.min(...fixed.map((j) => j.y)) - 4,
      y1: Math.max(...fixed.map((j) => j.y)) + 6,
    };
    const avgY = track.bodyY.reduce((a, b) => a + b, 0) / track.bodyY.length;
    return { fig, dir, track, legs, body, avgY };
  }, []);
}

/** 経過時間 → 機体の位置と、各脚の位相 */
function walkerAt(w: ReturnType<typeof useWalker>, time: number) {
  const n = w.fig.cycle.steps;
  const turns = time / WALK_PERIOD;
  const k = frac(turns) * n;
  const i = Math.floor(k) % n;
  const u = k - Math.floor(k);
  const bx =
    lerp(w.track.bodyX[i]!, w.track.bodyX[i + 1]!, u) + Math.floor(turns) * w.track.advance;
  const by = lerp(w.track.bodyY[i]!, w.track.bodyY[(i + 1) % n]!, u);
  const phases = WALK_OFFSETS.map((off) => w.dir * turns + off);
  return { bx, by, phases };
}

/** 機体(固定点をつなぐ木のフレーム)と、位相をずらした脚 3 本。フレームは脚の後ろに描く */
function Walker({
  w,
  map,
  phases,
  weight = 0.8,
}: {
  w: ReturnType<typeof useWalker>;
  map: FitMap;
  phases: number[];
  weight?: number;
}) {
  const { fig } = w;
  const fixed = fig.design.joints.filter((j) => j.fixed);
  const frame = fixed.map((j, i) => `${i ? 'L' : 'M'}${f1(map.x(j.x))} ${f1(map.y(j.y))}`).join('');
  return (
    <>
      <path className="gd-frame" d={frame} strokeWidth={f1(9 * weight)} />
      {[2, 1, 0].map((k) => (
        <MechDraw
          key={k}
          mech={fig.mech}
          positions={poseAt(fig.cycle, phases[k]!).positions}
          map={map}
          tone={LEG_TONES[k]}
          ground={false}
          weight={weight}
        />
      ))}
      {fixed.map((j) => (
        <circle
          key={j.id}
          className="gd-axle"
          cx={f1(map.x(j.x))}
          cy={f1(map.y(j.y))}
          r={3 * weight}
        />
      ))}
    </>
  );
}

const shift = (map: FitMap, dx: number, dy: number): FitMap => ({
  x: (x) => map.x(x + dx),
  y: (y) => map.y(y + dy),
  scale: map.scale,
});

export function WalkerFigure({
  reducedMotion,
  width = 360,
  height = 280,
}: FigureProps & { width?: number; height?: number }) {
  const w = useWalker();
  const time = useFigureClock(reducedMotion, 0.7);
  const { bx, by, phases } = walkerAt(w, time);
  const map = fitMap(
    { minX: w.legs.minX - 8, maxX: w.legs.maxX + 8, minY: -6, maxY: w.avgY + w.body.y1 + 4 },
    width,
    height,
    10,
  );
  // カメラが機体を追い、地面の目印が後ろへ流れる
  const gy = map.y(0);
  const gap = 14;
  const off = ((bx % gap) + gap) % gap;
  const pebbles: ReactNode[] = [];
  for (let x = w.legs.minX - 8 - off; x < w.legs.maxX + 8; x += gap) {
    pebbles.push(
      <line
        key={f1(x)}
        className="gd-hatch"
        x1={f1(map.x(x))}
        y1={f1(gy + 6)}
        x2={f1(map.x(x) + 5)}
        y2={f1(gy + 1)}
      />,
    );
  }
  return (
    <FigureSvg width={width} height={height} label={t('guide.page.about.title')}>
      <line className="gd-ground-line" x1={0} y1={f1(gy)} x2={width} y2={f1(gy)} />
      {pebbles}
      <Walker w={w} map={shift(map, 0, by)} phases={phases} />
    </FigureSvg>
  );
}

/* ------------------------------------------------------------------------------------------------
 * 2 ページ目:棒を引いてつなぐ
 * ---------------------------------------------------------------------------------------------- */

const BUILD = {
  period: 7.6,
  bars: [
    { from: 'O1', to: 'A', start: 0.4, end: 1.3 },
    { from: 'A', to: 'B', start: 1.6, end: 2.7 },
    { from: 'B', to: 'O2', start: 3.0, end: 4.0 },
  ],
  move: { start: 4.5, end: 6.9 },
} as const;

export function BuildFigure({ reducedMotion }: FigureProps) {
  const fig = useMemo(() => cycleFigure('loopFourBar'), []);
  const W = 360;
  const H = 300;
  const map = useMemo(
    () =>
      fitMap(
        boundsOf(fig.cycle.positions, [
          { x: -6, y: -12 },
          { x: 56, y: 46 },
        ]),
        W,
        H,
        16,
      ),
    [fig],
  );
  const time = useFigureClock(reducedMotion, 4.3);
  const tt = time % BUILD.period;
  const idx = (id: string) => fig.mech.jointIndex.get(id)!;
  const moveU = clamp01((tt - BUILD.move.start) / (BUILD.move.end - BUILD.move.start));
  const moving = tt >= BUILD.move.start && moveU < 1;
  const pose = poseAt(fig.cycle, moving ? EASINGS.glide(moveU) : 0).positions;
  const P = (id: string) => ({
    x: map.x(pose[idx(id) * 2]!),
    y: map.y(pose[idx(id) * 2 + 1]!),
  });

  const built = tt >= BUILD.bars[2].end;
  const ends = BUILD.bars.map((b) => {
    const g = clamp01((tt - b.start) / (b.end - b.start));
    const a = P(b.from);
    const z = P(b.to);
    const e = EASINGS.snap(g);
    return { g, a, end: { x: lerp(a.x, z.x, e), y: lerp(a.y, z.y, e) } };
  });
  const tipPt = ends.find((e) => e.g > 0 && e.g < 1)?.end ?? null;
  const bars = ends.map(({ g, a, end }, k) => {
    if (g <= 0) return null;
    const d = `M${f1(a.x)} ${f1(a.y)}L${f1(end.x)} ${f1(end.y)}`;
    return (
      <g key={k} className="gd-link gd-tone-ink">
        <path className="gd-bar-outer" d={d} strokeWidth={7} />
        <path className="gd-bar-inner" d={d} strokeWidth={3} />
      </g>
    );
  });
  const pinAt = (id: string, from: number) =>
    tt >= from ? (
      <circle key={id} className="gd-pin" cx={f1(P(id).x)} cy={f1(P(id).y)} r={3.2} />
    ) : null;
  const snapRing = (id: string, at: number) => {
    const u = (tt - at) / 0.5;
    if (u < 0 || u > 1 || reducedMotion) return null;
    return (
      <circle
        key={`r${id}`}
        className="gd-snap-ring"
        cx={f1(P(id).x)}
        cy={f1(P(id).y)}
        r={f1(4 + u * 14)}
        opacity={f1(1 - u)}
      />
    );
  };
  const fixedOnly = new Set([idx('A'), idx('B')]);
  const noLinks = new Set(fig.mech.links.map((_, l) => l));

  return (
    <FigureSvg width={W} height={H} label={t('guide.page.link.title')}>
      {built ? (
        <MechDraw mech={fig.mech} positions={pose} map={map} tone="ink" weight={1.15} />
      ) : (
        <>
          <MechDraw
            mech={fig.mech}
            positions={pose}
            map={map}
            hidden={fixedOnly}
            hiddenLinks={noLinks}
            weight={1.15}
          />
          {bars}
          {pinAt('A', BUILD.bars[1].start)}
          {pinAt('B', BUILD.bars[2].start)}
        </>
      )}
      {snapRing('A', BUILD.bars[1].start)}
      {snapRing('B', BUILD.bars[2].start)}
      {snapRing('O2', BUILD.bars[2].end)}
      {tipPt && (
        <g className="gd-cursor" transform={`translate(${f1(tipPt.x)} ${f1(tipPt.y)})`}>
          <circle className="gd-free-end" r={3.2} />
          <path d="M4 4L4 18L8 14L11 20L13.5 19L10.5 13L16 13Z" />
          <Label x={20} y={30} anchor="start" tone="muted">
            {t('guide.keys.cap.drag')}
          </Label>
        </g>
      )}
      {tt >= BUILD.bars[1].start && !moving && (
        <Label x={P('A').x - 10} y={P('A').y - 8} anchor="end" tone="muted">
          {t('guide.fig.pin')}
        </Label>
      )}
      {tt >= BUILD.bars[2].end && !moving && (
        <Label x={P('O2').x + 12} y={P('O2').y - 8} anchor="start" tone="foot">
          {t('guide.fig.snap')}
        </Label>
      )}
    </FigureSvg>
  );
}

/* ------------------------------------------------------------------------------------------------
 * 3 ページ目:固定点とクランク
 * ---------------------------------------------------------------------------------------------- */

export function CrankFigure({ reducedMotion }: FigureProps) {
  const fig = useMemo(() => cycleFigure('loopFourBar'), []);
  const W = 360;
  const H = 300;
  const map = useMemo(
    () =>
      fitMap(
        boundsOf(fig.cycle.positions, [
          { x: -40, y: -26 },
          { x: 50, y: 44 },
        ]),
        W,
        H,
        12,
      ),
    [fig],
  );
  const time = useFigureClock(reducedMotion, 0.4);
  const pose = poseAt(fig.cycle, time / 3);
  const o2 = fig.mech.jointIndex.get('O2')!;
  const a = fig.mech.jointIndex.get('A')!;
  const b = fig.mech.jointIndex.get('B')!;
  const O1 = { x: map.x(0), y: map.y(0) };
  const O2 = { x: map.x(fig.mech.designPos[o2 * 2]!), y: map.y(0) };
  const crankR = Math.hypot(fig.mech.designPos[a * 2]!, fig.mech.designPos[a * 2 + 1]!) * map.scale;
  return (
    <FigureSvg width={W} height={H} label={t('guide.page.crank.title')}>
      <path className="gd-trace gd-trace--crank" d={pathD(jointPath(fig.cycle, a), map, true)} />
      <path className="gd-trace" d={pathD(jointPath(fig.cycle, b), map)} />
      <TurnArrow cx={O1.x} cy={O1.y} r={crankR + 12} a0={0.7} a1={2.5} />
      <MechDraw mech={fig.mech} positions={pose.positions} map={map} foot={false} weight={1.15} />
      <circle className="gd-axle" cx={f1(O1.x)} cy={f1(O1.y)} r={5} />
      <Label x={O1.x - crankR - 16} y={O1.y - 4} anchor="end" tone="crank">
        {t('guide.fig.crank')}
      </Label>
      <Label x={O1.x - crankR - 16} y={O1.y + 11} anchor="end" tone="muted">
        ({t('guide.fig.motor')})
      </Label>
      <Label x={O1.x} y={O1.y + crankR + 16} tone="muted">
        {t('guide.fig.fixed')}
      </Label>
      <Label x={O2.x} y={O2.y + 26} tone="muted">
        {t('guide.fig.fixed')}
      </Label>
    </FigureSvg>
  );
}

/* ------------------------------------------------------------------------------------------------
 * 4 ページ目:自由度 1 で動く/0 で固まる/2 でぐらつく
 * ---------------------------------------------------------------------------------------------- */

type DofKind = 'ok' | 'locked' | 'loose';

/**
 * 三つ並べた図。layout='row' は横一列(用語の小窓)、'grid' は上に 2 つ・下に 1 つ(本のページ)。
 */
export function DofTrioFigure({
  reducedMotion,
  layout = 'grid',
}: FigureProps & { layout?: 'row' | 'grid' }) {
  const data = useMemo(() => {
    const ok = cycleFigure('loopFourBar');
    const locked = cycleFigure('loopTriangle');
    const loose = cycleFigure('loopFiveBar');
    const sway = fiveBarSway();
    const b: Bounds = boundsOf(
      [...ok.cycle.positions, ...sway, locked.mech.designPos],
      [{ x: -14, y: -10 }],
    );
    return { ok, locked, loose, sway, b };
  }, []);
  const row = layout === 'row';
  const PW = row ? 160 : 210;
  const PH = row ? 120 : 170;
  const CAP = row ? 26 : 44;
  const W = row ? PW * 3 : PW * 2;
  const H = row ? PH + CAP : (PH + CAP) * 2;
  const origin: Record<DofKind, { x: number; y: number }> = row
    ? { ok: { x: 0, y: 0 }, locked: { x: PW, y: 0 }, loose: { x: PW * 2, y: 0 } }
    : { ok: { x: 0, y: 0 }, locked: { x: PW, y: 0 }, loose: { x: PW / 2, y: PH + CAP } };
  const time = useFigureClock(reducedMotion, 0.3);
  const base = fitMap(data.b, PW, PH, 10);
  const maps = Object.fromEntries(
    (Object.keys(origin) as DofKind[]).map((k) => [
      k,
      {
        x: (x: number) => base.x(x) + origin[k].x,
        y: (y: number) => base.y(y) + origin[k].y,
        scale: base.scale,
      },
    ]),
  ) as Record<DofKind, FitMap>;
  const okPose = poseAt(data.ok.cycle, time / 2.6).positions;
  const K = data.sway.length;
  const sw = reducedMotion ? Math.round(K / 4) : Math.floor(frac(time / 2.2) * K) % K;
  const swayPose = data.sway[sw]!;
  const swayGhost = data.sway[(sw + K / 2) % K]!;
  const problem = new Map<number, LinkTone>(
    data.locked.analysis.problemLinks.map((id) => [
      data.locked.mech.linkIds.indexOf(id),
      'problem',
    ]),
  );
  const loose = new Map<number, LinkTone>(
    (data.loose.analysis.looseLinks ?? []).map((id) => [
      data.loose.mech.linkIds.indexOf(id),
      'loose',
    ]),
  );
  const weight = row ? 0.8 : 1;
  const crankArrow = (m: FitMap, cls: string) => (
    <TurnArrow cx={m.x(0)} cy={m.y(0)} r={12 * m.scale + 8} a0={0.6} a1={2.2} className={cls} />
  );
  const caption = (kind: DofKind) => {
    const o = origin[kind];
    return (
      <g key={kind}>
        <text
          className={`gd-cap gd-cap--${kind}`}
          x={o.x + PW / 2}
          y={o.y + PH + 16}
          textAnchor="middle"
        >
          {t(`guide.page.dof.cap.${kind}`)}
        </text>
        {!row && (
          <text className="gd-cap-sub" x={o.x + PW / 2} y={o.y + PH + 34} textAnchor="middle">
            {t(`guide.page.dof.sub.${kind}`)}
          </text>
        )}
      </g>
    );
  };
  return (
    <FigureSvg width={W} height={H} label={t('guide.page.dof.title')}>
      {row ? (
        <>
          <line className="gd-sep" x1={PW} y1={8} x2={PW} y2={H - 8} />
          <line className="gd-sep" x1={PW * 2} y1={8} x2={PW * 2} y2={H - 8} />
        </>
      ) : (
        <>
          <line className="gd-sep" x1={PW} y1={8} x2={PW} y2={PH + CAP - 8} />
          <line className="gd-sep" x1={8} y1={PH + CAP} x2={W - 8} y2={PH + CAP} />
        </>
      )}
      {crankArrow(maps.ok, 'gd-turn')}
      <MechDraw mech={data.ok.mech} positions={okPose} map={maps.ok} foot={false} weight={weight} />
      {caption('ok')}

      {crankArrow(maps.locked, 'gd-turn gd-turn--error')}
      <g className={reducedMotion ? undefined : 'gd-shake'}>
        <MechDraw
          mech={data.locked.mech}
          positions={data.locked.mech.designPos}
          map={maps.locked}
          tones={problem}
          foot={false}
          weight={weight}
        />
      </g>
      <Label x={maps.locked.x(-4)} y={maps.locked.y(12) - 26} anchor="middle" tone="error">
        {t('guide.fig.stuck')}
      </Label>
      {caption('locked')}

      <MechDraw
        mech={data.loose.mech}
        positions={swayGhost}
        map={maps.loose}
        tone="ghost"
        foot={false}
        ground={false}
        weight={weight}
      />
      <MechDraw
        mech={data.loose.mech}
        positions={swayPose}
        map={maps.loose}
        tones={loose}
        foot={false}
        weight={weight}
      />
      <Label x={maps.loose.x(-4)} y={maps.loose.y(12) - 12} anchor="middle" tone="crank">
        {t('guide.fig.hold')}
      </Label>
      {caption('loose')}
    </FigureSvg>
  );
}

/* ------------------------------------------------------------------------------------------------
 * 5 ページ目:脚先の軌道
 * ---------------------------------------------------------------------------------------------- */

export function FootPathFigure({ reducedMotion }: FigureProps) {
  const fig = useMemo(() => cycleFigure('jansen'), []);
  const W = 360;
  const H = 300;
  const foot = fig.analysis.foot!;
  const f = fig.mech.footIndex;
  const path = useMemo(() => jointPath(fig.cycle, f), [fig, f]);
  const fb = boundsOf([path]);
  const map = useMemo(
    () =>
      fitMap(
        boundsOf(fig.cycle.positions, [
          { x: fb.maxX + 26, y: foot.minY - 14 },
          { x: fb.minX - 4, y: foot.minY - 14 },
        ]),
        W,
        H,
        12,
      ),
    [fig, fb.maxX, fb.minX, foot.minY],
  );
  const time = useFigureClock(reducedMotion, 1.2);
  const pose = poseAt(fig.cycle, (motorDir(fig.design) * time) / 3.2);
  // 接地区間(サンプル順に contactStart → contactEnd、1 周をまたぐことがある)
  const contact = useMemo(() => {
    const n = fig.cycle.steps;
    const pts: number[] = [];
    let s = foot.contactStart;
    for (let k = 0; k < n; k++) {
      pts.push(path[s * 2]!, path[s * 2 + 1]!);
      if (s === foot.contactEnd) break;
      s = (s + 1) % n;
    }
    return new Float64Array(pts);
  }, [fig, foot, path]);
  const dir = walkDirection(foot, fig.design.motor.rpm);
  const gy = map.y(foot.minY);
  const cb = boundsOf([contact]);
  const arrowY = map.y(fb.maxY) - 8;
  const ax0 = map.x(fb.minX);
  const ax1 = ax0 + 50 * (dir || 1);
  return (
    <FigureSvg width={W} height={H} label={t('guide.page.path.title')}>
      <line className="gd-ground-line" x1={0} y1={f1(gy)} x2={W} y2={f1(gy)} />
      <path className="gd-contact" d={pathD(contact, map)} />
      <path className="gd-trace gd-trace--foot" d={pathD(path, map, true)} />
      <MechDraw mech={fig.mech} positions={pose.positions} map={map} weight={0.85} />
      <Dimension
        x1={map.x(cb.minX)}
        y1={gy + 10}
        x2={map.x(cb.maxX)}
        y2={gy + 10}
        label={t('guide.fig.stride', { cm: Math.round(foot.stride) })}
      />
      <Dimension
        x1={map.x(fb.maxX) + 10}
        y1={gy}
        x2={map.x(fb.maxX) + 10}
        y2={map.y(foot.minY + foot.lift)}
        label={t('guide.fig.lift', { cm: Math.round(foot.lift) })}
        side="right"
      />
      {dir !== 0 && (
        <g className="gd-walk">
          <line x1={f1(ax0)} y1={f1(arrowY)} x2={f1(ax1)} y2={f1(arrowY)} />
          <path
            d={`M${f1(ax1 + 7 * dir)} ${f1(arrowY)}L${f1(ax1)} ${f1(arrowY - 5)}L${f1(ax1)} ${f1(arrowY + 5)}Z`}
          />
          <Label x={ax0} y={arrowY - 9} anchor="start" tone="ok">
            {t('guide.fig.forward')}
          </Label>
        </g>
      )}
      <Label x={map.x((cb.minX + cb.maxX) / 2)} y={gy - 7} tone="foot">
        {t('guide.fig.contact')}
      </Label>
    </FigureSvg>
  );
}

/* ------------------------------------------------------------------------------------------------
 * 6 ページ目:脚を増やす
 * ---------------------------------------------------------------------------------------------- */

export function LegArrayFigure({ reducedMotion }: FigureProps) {
  const w = useWalker();
  const { fig } = w;
  const W = 360;
  const H = 300;
  const SH = 190;
  const time = useFigureClock(reducedMotion, 0.55);
  const { by, phases } = walkerAt(w, time);
  const map = fitMap(
    { minX: w.legs.minX - 4, maxX: w.legs.maxX + 22, minY: -4, maxY: w.avgY + w.body.y1 + 2 },
    W,
    SH - 18,
    10,
  );
  const shifted = shift(map, 0, by);
  const f = fig.mech.footIndex;
  const poses = phases.map((p) => poseAt(fig.cycle, p).positions);
  const lowest = Math.min(...poses.map((p) => p[f * 2 + 1]!));
  const gy = map.y(0);
  // 前から見た図:左は脚先が一列(倒れる)、右は手前と奥に広がる(立てる)
  const sway = reducedMotion ? 0 : 0.12 * Math.sin(time * 2.4);
  const fy = H - 30;
  return (
    <FigureSvg width={W} height={H} label={t('guide.page.legs.title')}>
      <line className="gd-ground-line" x1={0} y1={f1(gy)} x2={W} y2={f1(gy)} />
      <Walker w={w} map={shifted} phases={phases} />
      {poses.map((p, k) => {
        const x = shifted.x(p[f * 2]!);
        const y = shifted.y(p[f * 2 + 1]!);
        const down = p[f * 2 + 1]! - lowest < 0.8;
        return (
          <g key={k} className={`gd-phase gd-phase--${k}`}>
            {down && <ellipse className="gd-contact-dot" cx={f1(x)} cy={f1(gy)} rx={8} ry={2.6} />}
            <circle cx={f1(x)} cy={f1(y)} r={4} />
          </g>
        );
      })}
      <g className="gd-legend">
        {WALK_OFFSETS.map((off, k) => (
          <g key={k} className={`gd-phase gd-phase--${k}`}>
            <circle cx={W - 54} cy={18 + k * 17} r={4.5} />
            <Label x={W - 44} y={22 + k * 17} anchor="start" tone={k === 0 ? 'foot' : 'muted'}>
              {t('guide.fig.phase', { deg: Math.round(off * 360) })}
            </Label>
          </g>
        ))}
      </g>
      <text className="gd-cap-sub" x={W / 2} y={SH + 2} textAnchor="middle">
        {t('guide.page.legs.side')}
      </text>
      <line className="gd-sep" x1={10} y1={SH + 12} x2={W - 10} y2={SH + 12} />
      <FrontView x={W / 2 - 70} y={fy} spread={false} tilt={sway} reducedMotion={reducedMotion} />
      <FrontView x={W / 2 + 70} y={fy} spread tilt={0} reducedMotion={reducedMotion} />
      <text className="gd-cap-sub" x={W / 2} y={H - 4} textAnchor="middle">
        {t('guide.page.legs.front')}
      </text>
    </FigureSvg>
  );
}

/** 前から見た機械の模式図。spread:脚先が手前と奥に広がっているか */
function FrontView({
  x,
  y,
  spread,
  tilt,
  reducedMotion,
}: {
  x: number;
  y: number;
  spread: boolean;
  tilt: number;
  reducedMotion: boolean;
}) {
  const bodyY = y - 52;
  const deg = spread ? 0 : (tilt * 180) / Math.PI + (reducedMotion ? 7 : 0);
  return (
    <g>
      <line className="gd-ground-line" x1={x - 40} y1={f1(y)} x2={x + 40} y2={f1(y)} />
      <g transform={`rotate(${f1(deg)} ${x} ${f1(y)})`}>
        {(spread ? [-22, -9, 9, 22] : [-3, 3]).map((dx) => (
          <line
            key={dx}
            className="gd-front-leg"
            x1={x + dx * (spread ? 0.85 : 1)}
            y1={f1(bodyY + 8)}
            x2={x + (spread ? dx : 0)}
            y2={f1(y)}
          />
        ))}
        <rect className="gd-body" x={x - 28} y={f1(bodyY - 4)} width={56} height={12} rx={3} />
        <circle className="gd-com" cx={x} cy={f1(bodyY + 2)} r={3} />
        <line className="gd-com-line" x1={x} y1={f1(bodyY + 5)} x2={x} y2={f1(y)} />
      </g>
      <Label x={x + 46} y={bodyY + 4} anchor="start" tone={spread ? 'ok' : 'error'}>
        {spread ? `✓ ${t('guide.fig.stands')}` : `✕ ${t('guide.fig.tips')}`}
      </Label>
      <Label x={x} y={y + 14} tone="muted">
        {spread ? t('guide.fig.spread') : t('guide.fig.oneRow')}
      </Label>
    </g>
  );
}

/* ------------------------------------------------------------------------------------------------
 * 7 ページ目:試走とメダル(スタートからゴールまで歩く)
 * ---------------------------------------------------------------------------------------------- */

export function RunFigure({ reducedMotion }: FigureProps) {
  const w = useWalker();
  const W = 360;
  const H = 300;
  const time = useFigureClock(reducedMotion, 0.7 + WALK_PERIOD);
  const { bx, by, phases } = walkerAt(w, time);
  const courseLen = w.track.advance * 1.6;
  const loop = courseLen + w.track.advance * 0.6;
  const pos = ((bx % loop) + loop) % loop;
  const fade = clamp01((loop - pos) / (w.track.advance * 0.3));
  const map = fitMap(
    {
      minX: w.legs.minX - 4,
      maxX: courseLen + w.legs.maxX + 4,
      minY: -16,
      maxY: w.avgY + w.body.y1 + 26,
    },
    W,
    H,
    10,
  );
  const gy = map.y(0);
  // ゴールまでの時間を数える(スタートを出てからゴールに着くまで)
  const front = pos + w.legs.maxX;
  const reached = front >= courseLen;
  const secs = (pos / w.track.advance) * WALK_PERIOD;
  return (
    <FigureSvg width={W} height={H} label={t('guide.page.run.title')}>
      <line className="gd-ground-line" x1={0} y1={f1(gy)} x2={W} y2={f1(gy)} />
      <Flag x={map.x(w.legs.maxX)} y={gy} label={t('guide.fig.start')} />
      <Flag x={map.x(courseLen + w.legs.maxX)} y={gy} label={t('guide.fig.goal')} goal />
      <g opacity={f1(fade)}>
        <Walker w={w} map={shift(map, pos, by)} phases={phases} weight={0.9} />
      </g>
      <g className={`gd-clock${reached ? ' is-done' : ''}`}>
        <rect x={W - 92} y={12} width={80} height={26} rx={5} />
        <text x={W - 52} y={30} textAnchor="middle">
          {t('guide.fig.seconds', {
            s: (reached ? (courseLen / w.track.advance) * WALK_PERIOD : secs).toFixed(1),
          })}
        </text>
      </g>
    </FigureSvg>
  );
}

function Flag({ x, y, label, goal }: { x: number; y: number; label: string; goal?: boolean }) {
  return (
    <g className={`gd-flag${goal ? ' gd-flag--goal' : ''}`}>
      <line x1={f1(x)} y1={f1(y)} x2={f1(x)} y2={f1(y - 40)} />
      <path d={`M${f1(x)} ${f1(y - 40)}L${f1(x + 18)} ${f1(y - 34)}L${f1(x)} ${f1(y - 28)}Z`} />
      <Label x={x} y={y + 15} tone="muted">
        {label}
      </Label>
    </g>
  );
}

/* ------------------------------------------------------------------------------------------------
 * 8 ページ目:操作一覧(脚先がキーを押す)
 * ---------------------------------------------------------------------------------------------- */

const KEY_CAPS = ['L', 'F', 'C', 'A'] as const;

export function KeysFigure({ reducedMotion }: FigureProps) {
  const fig = useMemo(() => cycleFigure('goodLeg'), []);
  const W = 360;
  const H = 300;
  const foot = fig.analysis.foot!;
  const f = fig.mech.footIndex;
  const path = useMemo(() => jointPath(fig.cycle, f), [fig, f]);
  const fb = boundsOf([path]);
  const keyW = 15;
  const gap = 3;
  const keysX0 = fb.minX - 3 - KEY_CAPS.length * (keyW + gap);
  const map = useMemo(
    () => fitMap(boundsOf(fig.cycle.positions, [{ x: keysX0 - 2, y: foot.minY - 12 }]), W, H, 12),
    [fig, keysX0, foot.minY],
  );
  const time = useFigureClock(reducedMotion, 1.1);
  const pose = poseAt(fig.cycle, (motorDir(fig.design) * time) / 2.2);
  const fy = pose.positions[f * 2 + 1]!;
  const pressed = fy - foot.minY < 0.8;
  const top = map.y(foot.minY);
  const capH = 7 * map.scale;
  const cap = (x0: number, x1: number, label: string, down: boolean, key: string) => (
    <g key={key} className={`gd-keycap${down ? ' is-down' : ''}`}>
      <rect
        className="gd-keycap-base"
        x={f1(x0)}
        y={f1(top + 3)}
        width={f1(x1 - x0)}
        height={f1(capH)}
        rx={4}
      />
      <g transform={down ? 'translate(0 2.5)' : undefined}>
        <rect
          className="gd-keycap-top"
          x={f1(x0)}
          y={f1(top)}
          width={f1(x1 - x0)}
          height={f1(capH)}
          rx={4}
        />
        <text x={f1((x0 + x1) / 2)} y={f1(top + capH / 2 + 4)} textAnchor="middle">
          {label}
        </text>
      </g>
    </g>
  );
  return (
    <FigureSvg width={W} height={H} label={t('guide.page.keys.title')}>
      {KEY_CAPS.map((k, i) => {
        const x0 = map.x(keysX0 + i * (keyW + gap));
        return cap(x0, x0 + keyW * map.scale, k, false, k);
      })}
      {cap(map.x(fb.minX - 1), map.x(fb.maxX + 1), '?', pressed, 'q')}
      <path className="gd-trace gd-trace--foot" d={pathD(path, map, true)} />
      <MechDraw mech={fig.mech} positions={pose.positions} map={map} weight={1} />
    </FigureSvg>
  );
}
