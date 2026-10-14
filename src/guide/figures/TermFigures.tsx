import { useMemo, type ReactNode } from 'react';
import { t } from '@/i18n';
import type { GlossaryId } from '../glossary';
import {
  f1,
  FigureSvg,
  Label,
  MechDraw,
  pathD,
  TurnArrow,
  useFigureClock,
  type LinkTone,
} from './draw';
import { DofTrioFigure } from './PageFigures';
import {
  boundsOf,
  cycleFigure,
  fitMap,
  jointPath,
  motorDir,
  poseAt,
  type CycleFigure,
  type FitMap,
} from './motion';

/**
 * 用語解説の小さな図(GUIDE-2)。用語ごとに 1 つ。機構は本物のソルバーで解いた姿勢で動く。
 */

const W = 260;
const H = 168;

interface TermFigureProps {
  id: GlossaryId;
  reducedMotion: boolean;
}

export function TermFigure({ id, reducedMotion }: TermFigureProps) {
  const label = t(`guide.term.${id}.name`);
  switch (id) {
    case 'dof':
      return <DofTrioFigure reducedMotion={reducedMotion} layout="row" />;
    case 'grubler':
      return <GrublerFigure reducedMotion={reducedMotion} label={label} />;
    case 'grashof':
      return <GrashofFigure reducedMotion={reducedMotion} label={label} />;
    case 'crankRocker':
      return <CrankRockerFigure reducedMotion={reducedMotion} label={label} />;
    case 'deadPoint':
      return <DeadPointFigure reducedMotion={reducedMotion} label={label} />;
    case 'couplerCurve':
      return <CouplerFigure reducedMotion={reducedMotion} label={label} />;
    case 'legPhase':
      return <LegPhaseFigure reducedMotion={reducedMotion} label={label} />;
    case 'notAssemblable':
      return <NoReachFigure reducedMotion={reducedMotion} label={label} />;
    case 'specialGeometry':
      return <SpecialFigure reducedMotion={reducedMotion} label={label} />;
  }
}

interface P {
  reducedMotion: boolean;
  label: string;
}

/** 図に収める写像(機構の全姿勢+余白の点) */
function useFit(fig: CycleFigure, extra: { x: number; y: number }[] = [], height = H, pad = 14) {
  const key = JSON.stringify(extra);
  return useMemo(
    () => fitMap(boundsOf(fig.cycle.positions, JSON.parse(key) as typeof extra), W, height, pad),
    [fig, key, height, pad],
  );
}

const mid = (map: FitMap, p: Float64Array, i: number, j: number) => ({
  x: map.x((p[i * 2]! + p[j * 2]!) / 2),
  y: map.y((p[i * 2 + 1]! + p[j * 2 + 1]!) / 2),
});

function Badge({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <g className="gd-badge">
      <circle cx={f1(x)} cy={f1(y)} r={8} />
      <text x={f1(x)} y={f1(y + 3.5)} textAnchor="middle">
        {children}
      </text>
    </g>
  );
}

function GrublerFigure({ reducedMotion, label }: P) {
  const fig = useMemo(() => cycleFigure('loopFourBar'), []);
  const map = useFit(fig, [{ x: -10, y: -16 }], H - 34);
  const time = useFigureClock(reducedMotion, 0.15);
  const pos = poseAt(fig.cycle, time / 4).positions;
  const { n, j } = fig.analysis.grubler;
  const ix = (id: string) => fig.mech.jointIndex.get(id)!;
  const li = (id: string) => fig.mech.links[fig.mech.linkIds.indexOf(id)]!;
  const numbered = ['crank', 'coupler', 'rocker'].map((id, k) => {
    const [a, b] = li(id) as [number, number];
    const m = mid(map, pos, a, b);
    return (
      <Badge key={id} x={m.x} y={m.y}>
        {k + 1}
      </Badge>
    );
  });
  const g = mid(map, pos, ix('O1'), ix('O2'));
  return (
    <FigureSvg width={W} height={H} label={label}>
      <line
        className="gd-frame-line"
        x1={f1(map.x(0))}
        y1={f1(map.y(0))}
        x2={f1(map.x(fig.mech.designPos[ix('O2') * 2]!))}
        y2={f1(map.y(0))}
      />
      <MechDraw mech={fig.mech} positions={pos} map={map} foot={false} weight={0.8} />
      {['O1', 'O2', 'A', 'B'].map((id) => (
        <circle
          key={id}
          className="gd-pin-ring"
          cx={f1(map.x(pos[ix(id) * 2]!))}
          cy={f1(map.y(pos[ix(id) * 2 + 1]!))}
          r={6}
        />
      ))}
      {numbered}
      <Badge x={g.x} y={g.y + 20}>
        4
      </Badge>
      <text className="gd-cap-sub" x={W / 2} y={H - 22} textAnchor="middle">
        {t('guide.fig.count', { n, j })}
      </text>
      <text className="gd-cap gd-cap--ok" x={W / 2} y={H - 5} textAnchor="middle">
        {t('guide.fig.formula', { n, j, dof: fig.analysis.dof })}
      </text>
    </FigureSvg>
  );
}

function GrashofFigure({ reducedMotion, label }: P) {
  const fig = useMemo(() => cycleFigure('loopFourBar'), []);
  const map = useFit(fig, [{ x: -10, y: -16 }], H - 20);
  const time = useFigureClock(reducedMotion, 0.2);
  const pos = poseAt(fig.cycle, time / 3).positions;
  const g = fig.analysis.grashof[0]!;
  // 長さの順に s(最短)・p・q・l(最長)を付ける(同じ長さなら地節→入力→中間→出力の順)
  const members = (['ground', 'input', 'coupler', 'output'] as const)
    .map((m, k) => ({ m, len: g.lengths[m], k }))
    .sort((a, b) => a.len - b.len || a.k - b.k);
  const letter = new Map(members.map((x, k) => [x.m, ['s', 'p', 'q', 'l'][k]!]));
  const s = members[0]!.len;
  const l = members[3]!.len;
  const pq = members[1]!.len + members[2]!.len;
  const ix = (id: string) => fig.mech.jointIndex.get(id)!;
  const at = (a: string, b: string, dy = 0) => {
    const m = mid(map, pos, ix(a), ix(b));
    return { x: m.x, y: m.y + dy };
  };
  const tags = [
    { m: 'input' as const, ...at('O1', 'A') },
    { m: 'coupler' as const, ...at('A', 'B', -4) },
    { m: 'output' as const, ...at('O2', 'B') },
    { m: 'ground' as const, ...at('O1', 'O2', 16) },
  ];
  return (
    <FigureSvg width={W} height={H} label={label}>
      <line
        className="gd-frame-line"
        x1={f1(map.x(0))}
        y1={f1(map.y(0))}
        x2={f1(map.x(fig.mech.designPos[ix('O2') * 2]!))}
        y2={f1(map.y(0))}
      />
      <MechDraw mech={fig.mech} positions={pos} map={map} foot={false} weight={0.8} />
      {tags.map((tg) => (
        <Badge key={tg.m} x={tg.x} y={tg.y}>
          {letter.get(tg.m)}
        </Badge>
      ))}
      <text className="gd-cap gd-cap--ok" x={W / 2} y={H - 5} textAnchor="middle">
        {t('guide.fig.grashof', { sl: Math.round(s + l), pq: Math.round(pq) })}
      </text>
    </FigureSvg>
  );
}

function CrankRockerFigure({ reducedMotion, label }: P) {
  const fig = useMemo(() => cycleFigure('loopFourBar'), []);
  const map = useFit(fig, [{ x: -14, y: -16 }]);
  const time = useFigureClock(reducedMotion, 0.3);
  const pos = poseAt(fig.cycle, time / 3).positions;
  const a = fig.mech.jointIndex.get('A')!;
  const b = fig.mech.jointIndex.get('B')!;
  const bb = boundsOf([jointPath(fig.cycle, b)]);
  return (
    <FigureSvg width={W} height={H} label={label}>
      <path className="gd-trace gd-trace--crank" d={pathD(jointPath(fig.cycle, a), map, true)} />
      <path className="gd-trace gd-trace--rocker" d={pathD(jointPath(fig.cycle, b), map)} />
      <MechDraw mech={fig.mech} positions={pos} map={map} foot={false} weight={0.8} />
      <Label
        x={map.x(0) - 12 * map.scale - 6}
        y={map.y(0) - 12 * map.scale}
        anchor="end"
        tone="crank"
      >
        {t('guide.fig.turns')}
      </Label>
      <Label x={map.x(bb.maxX) + 6} y={map.y(bb.maxY) - 4} anchor="start" tone="foot">
        {t('guide.fig.rocker')}
      </Label>
    </FigureSvg>
  );
}

function DeadPointFigure({ reducedMotion, label }: P) {
  const fig = useMemo(() => cycleFigure('deadPointBar'), []);
  const map = useFit(fig, [{ x: -24, y: -26 }]);
  const dp = fig.analysis.deadPoints[0]!;
  const dpIndex = fig.cycle.thetas.findIndex((th) => th === dp.theta);
  const time = useFigureClock(reducedMotion, (dpIndex / fig.cycle.steps) * 4);
  const pose = poseAt(fig.cycle, time / 4);
  const slack = fig.cycle.slack?.[pose.index] ?? 1;
  const near = slack < 0.12;
  const tones = new Map<number, LinkTone>(
    near ? (dp.links ?? []).map((id) => [fig.mech.linkIds.indexOf(id), 'problem']) : [],
  );
  const j = fig.mech.jointIndex.get(dp.joint)!;
  const at = fig.cycle.positions[Math.max(0, dpIndex)]!;
  const xx = map.x(at[j * 2]!);
  const xy = map.y(at[j * 2 + 1]!);
  return (
    <FigureSvg width={W} height={H} label={label}>
      <path className="gd-trace" d={pathD(jointPath(fig.cycle, j), map)} />
      <MechDraw
        mech={fig.mech}
        positions={pose.positions}
        map={map}
        tones={tones}
        foot={false}
        weight={0.8}
      />
      <path
        className="gd-dead-mark"
        d={`M${f1(xx - 5)} ${f1(xy - 5)}L${f1(xx + 5)} ${f1(xy + 5)}M${f1(xx + 5)} ${f1(xy - 5)}L${f1(xx - 5)} ${f1(xy + 5)}`}
      />
      <Label x={xx + 9} y={xy - 7} anchor="start" tone={near ? 'error' : 'muted'}>
        {t('guide.fig.dead')}
      </Label>
    </FigureSvg>
  );
}

const COUPLER_TONES = ['gd-trace--p1', 'gd-trace--foot', 'gd-trace--p3'] as const;

function CouplerFigure({ reducedMotion, label }: P) {
  const fig = useMemo(() => cycleFigure('couplerPoints'), []);
  const map = useFit(fig, [], H, 10);
  const time = useFigureClock(reducedMotion, 0.4);
  const pos = poseAt(fig.cycle, time / 3.4).positions;
  const ids = ['P1', 'P2', 'P3'];
  return (
    <FigureSvg width={W} height={H} label={label}>
      {ids.map((id, k) => (
        <path
          key={id}
          className={`gd-trace ${COUPLER_TONES[k]}`}
          d={pathD(jointPath(fig.cycle, fig.mech.jointIndex.get(id)!), map, true)}
        />
      ))}
      <MechDraw mech={fig.mech} positions={pos} map={map} weight={0.75} />
      {ids.map((id, k) => {
        const j = fig.mech.jointIndex.get(id)!;
        return (
          <circle
            key={id}
            className={`gd-dot ${COUPLER_TONES[k]}`}
            cx={f1(map.x(pos[j * 2]!))}
            cy={f1(map.y(pos[j * 2 + 1]!))}
            r={3.4}
          />
        );
      })}
    </FigureSvg>
  );
}

function LegPhaseFigure({ reducedMotion, label }: P) {
  const fig = useMemo(() => cycleFigure('goodLeg'), []);
  const f = fig.mech.footIndex;
  const path = useMemo(() => jointPath(fig.cycle, f), [fig, f]);
  const map = useMemo(() => {
    const b = boundsOf([path]);
    return fitMap({ ...b, minX: b.minX - 8, maxX: b.maxX + 8, minY: b.minY - 6 }, W, H, 16);
  }, [path]);
  const time = useFigureClock(reducedMotion, 0.3);
  const phase = (motorDir(fig.design) * time) / 2.4;
  const offsets = [0, 1 / 3, 2 / 3];
  const minY = fig.analysis.foot!.minY;
  return (
    <FigureSvg width={W} height={H} label={label}>
      <line className="gd-ground-line" x1={0} y1={f1(map.y(minY))} x2={W} y2={f1(map.y(minY))} />
      <path className="gd-trace gd-trace--foot" d={pathD(path, map, true)} />
      {offsets.map((off, k) => {
        const p = poseAt(fig.cycle, phase + off).positions;
        const x = map.x(p[f * 2]!);
        const y = map.y(p[f * 2 + 1]!);
        return (
          <g key={k} className={`gd-phase gd-phase--${k}`}>
            <circle cx={f1(x)} cy={f1(y)} r={5} />
            <Label x={x} y={y - 9}>
              {t('guide.fig.phase', { deg: Math.round(off * 360) })}
            </Label>
          </g>
        );
      })}
    </FigureSvg>
  );
}

function NoReachFigure({ reducedMotion, label }: P) {
  const fig = useMemo(() => cycleFigure('tooLongCrank'), []);
  const map = useFit(fig, [{ x: -32, y: -34 }]);
  const time = useFigureClock(reducedMotion, 0);
  const n = fig.cycle.steps;
  const firstBad = fig.cycle.ok.findIndex((ok) => !ok);
  const phase = reducedMotion ? (firstBad + 2) / n : time / 4;
  const pose = poseAt(fig.cycle, phase);
  const tones = new Map<number, LinkTone>(
    pose.ok ? [] : fig.analysis.problemLinks.map((id) => [fig.mech.linkIds.indexOf(id), 'problem']),
  );
  const a = fig.mech.jointIndex.get('A')!;
  const crankPath = jointPath(fig.cycle, a);
  // 届く角度の円弧と、届かない角度の円弧(pathD は skip が true の点を飛ばす)
  const skipFail = fig.cycle.ok.map((ok) => !ok);
  const skipOk = fig.cycle.ok.map((ok) => ok);
  return (
    <FigureSvg width={W} height={H} label={label}>
      <path className="gd-trace gd-trace--crank" d={pathD(crankPath, map, false, skipFail)} />
      <path className="gd-trace gd-trace--fail" d={pathD(crankPath, map, false, skipOk)} />
      <g className={!pose.ok && !reducedMotion ? 'gd-shake' : undefined}>
        <MechDraw
          mech={fig.mech}
          positions={pose.positions}
          map={map}
          tones={tones}
          foot={false}
          weight={0.8}
        />
      </g>
      {!pose.ok && (
        <Label x={W - 10} y={18} anchor="end" tone="error">
          {t('guide.fig.noReach')}
        </Label>
      )}
    </FigureSvg>
  );
}

function SpecialFigure({ reducedMotion, label }: P) {
  const fig = useMemo(() => cycleFigure('doubleParallelogram'), []);
  const map = useFit(fig, [{ x: -14, y: -18 }], H - 18);
  const time = useFigureClock(reducedMotion, 0.4);
  const pos = poseAt(fig.cycle, time / 3.4).positions;
  return (
    <FigureSvg width={W} height={H} label={label}>
      <TurnArrow cx={map.x(0)} cy={map.y(0)} r={12 * map.scale + 8} a0={0.6} a1={2.2} />
      <MechDraw mech={fig.mech} positions={pos} map={map} foot={false} weight={0.8} />
      <text className="gd-cap gd-cap--warn" x={W / 2} y={H - 5} textAnchor="middle">
        {t('guide.fig.special')}
      </text>
    </FigureSvg>
  );
}
