import { useEffect, useMemo, useRef } from 'react';
import type { DesignDoc } from '@/core/model/types';
import { t } from '@/i18n';
import type { TestRunController } from './controller';
import { buildMiniModel, crankAngleDeg } from './mini';

/**
 * 試走中の設計図の縮小版(TR-7、U-04)。読み取り専用の小さな SVG。
 * 脚先の 1 回転の軌道(静的)と、今のクランク角での機構(onFrame で属性だけ書き換える)。
 */
export interface MiniDesignViewProps {
  design: DesignDoc;
  /** 今の姿勢の出どころ。省略時は設計姿勢のまま */
  controller?: TestRunController | null;
  /** 表示する脚の組(既定 0) */
  instance?: number;
  width?: number;
  height?: number;
  /** 赤く表示するリンク id */
  highlightLinks?: readonly string[];
}

const INK = '#2b2118';
const CRANK = '#a8452c';
const FOOT = '#d9822b';
const HOT = '#e0533d';

export function MiniDesignView({
  design,
  controller = null,
  instance = 0,
  width = 220,
  height = 150,
  highlightLinks,
}: MiniDesignViewProps) {
  const model = useMemo(() => buildMiniModel(design), [design]);
  const hot = useMemo(() => new Set(highlightLinks ?? []), [highlightLinks]);
  const bars = useRef<(SVGLineElement | null)[]>([]);
  const plates = useRef<(SVGPolygonElement | null)[]>([]);
  const joints = useRef<(SVGElement | null)[]>([]);
  const footDot = useRef<SVGCircleElement>(null);
  const angleText = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let shownDeg = Number.NaN;
    const f = (v: number) => (Math.round(v * 10) / 10).toString();
    const draw = (pos: ArrayLike<number>) => {
      model.bars.forEach((b, i) => {
        const el = bars.current[i];
        if (!el) return;
        el.setAttribute('x1', f(pos[b.a * 2]!));
        el.setAttribute('y1', f(-pos[b.a * 2 + 1]!));
        el.setAttribute('x2', f(pos[b.b * 2]!));
        el.setAttribute('y2', f(-pos[b.b * 2 + 1]!));
      });
      model.plates.forEach((p, i) => {
        const el = plates.current[i];
        if (!el) return;
        el.setAttribute(
          'points',
          p.joints.map((j) => `${f(pos[j * 2]!)},${f(-pos[j * 2 + 1]!)}`).join(' '),
        );
      });
      joints.current.forEach((el, j) => {
        if (!el) return;
        el.setAttribute('transform', `translate(${f(pos[j * 2]!)} ${f(-pos[j * 2 + 1]!)})`);
      });
      if (footDot.current && model.foot >= 0) {
        footDot.current.setAttribute('cx', f(pos[model.foot * 2]!));
        footDot.current.setAttribute('cy', f(-pos[model.foot * 2 + 1]!));
      }
      const deg = crankAngleDeg(model, pos);
      const shown = deg === null ? Number.NaN : Math.round(deg);
      if (angleText.current && shown !== shownDeg) {
        shownDeg = shown;
        angleText.current.textContent = deg === null ? '' : t('testrun.mini.angle', { deg: shown });
      }
    };
    draw(model.designPos);
    if (!controller) return;
    let lastAngle = Number.NaN;
    const update = () => {
      const s = controller.getSnapshot();
      const pos = s.legPositions[instance];
      if (!pos || pos.length !== model.designPos.length) return;
      if (s.motorAngle === lastAngle) return;
      lastAngle = s.motorAngle;
      draw(pos);
    };
    update();
    return controller.onFrame(update);
  }, [controller, model, instance]);

  const [vx, vy, vw, vh] = model.viewBox;
  const sw = model.stroke;
  const fixedSet = new Set(model.fixed);
  return (
    <div className="tr-panel tr-mini" aria-label={t('testrun.mini.title')}>
      <h3>
        <span>{t('testrun.mini.title')}</span>
        <span ref={angleText} />
      </h3>
      <svg
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        width={width}
        height={height}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {model.footPath && (
          <path
            d={model.footPath}
            fill="none"
            stroke={FOOT}
            strokeWidth={sw * 0.9}
            strokeDasharray={`${sw * 2.5} ${sw * 1.5}`}
            opacity={0.85}
          />
        )}
        {model.plates.map((p, i) => (
          <polygon
            key={p.link}
            ref={(el) => void (plates.current[i] = el)}
            fill={hot.has(p.link) ? 'rgba(224,83,61,0.25)' : 'rgba(185,130,80,0.28)'}
            stroke={hot.has(p.link) ? HOT : p.crank ? CRANK : INK}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        ))}
        {model.bars.map((b, i) => (
          <line
            key={b.link}
            ref={(el) => void (bars.current[i] = el)}
            stroke={hot.has(b.link) ? HOT : b.crank ? CRANK : INK}
            strokeWidth={b.crank ? sw * 1.8 : sw * 1.3}
            strokeLinecap="round"
          />
        ))}
        {design.joints.map((j, i) =>
          fixedSet.has(i) ? (
            <g key={j.id} ref={(el) => void (joints.current[i] = el)}>
              <path
                d={`M 0 0 L ${-sw * 3} ${sw * 4.5} L ${sw * 3} ${sw * 4.5} Z`}
                fill="rgba(43,33,24,0.15)"
                stroke={INK}
                strokeWidth={sw * 0.7}
              />
              <circle r={sw * 1.4} fill="#efe6d2" stroke={INK} strokeWidth={sw * 0.7} />
            </g>
          ) : (
            <g key={j.id} ref={(el) => void (joints.current[i] = el)}>
              <circle r={sw * 1.1} fill="#efe6d2" stroke={INK} strokeWidth={sw * 0.6} />
            </g>
          ),
        )}
        {model.foot >= 0 && (
          <circle ref={footDot} r={sw * 2} fill={FOOT} stroke={INK} strokeWidth={sw * 0.5} />
        )}
      </svg>
    </div>
  );
}
