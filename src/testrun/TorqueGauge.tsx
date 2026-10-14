import { useEffect, useRef } from 'react';
import { t } from '@/i18n';
import type { TestRunController } from './controller';

/**
 * クランクトルクのメーター(TR-5、S-07)。半円の目盛りに針。上限(停動トルク)に対する割合で
 * 緑・黄・赤の帯。針と数値は onFrame で直接書き換える(React の再描画なし)。
 */
export interface TorqueGaugeProps {
  controller: TestRunController;
  /** 目盛りの最大(N·m)。既定はモーターの停動トルク */
  max?: number;
}

const CX = 80;
const CY = 78;
const R = 62;

/** 割合 u ∈ [0,1] の点(左端 0 → 右端 1 の半円) */
function arcPoint(u: number, r: number) {
  const a = Math.PI * (1 - u);
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
}

function arcPath(u0: number, u1: number, r: number) {
  const p0 = arcPoint(u0, r);
  const p1 = arcPoint(u1, r);
  const large = u1 - u0 > 0.5 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

export function TorqueGauge({ controller, max }: TorqueGaugeProps) {
  const limit = max ?? controller.sim.params.motor.stallTorque;
  const needle = useRef<SVGGElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  const stall = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let shownDeg = Number.NaN;
    let shownVal = Number.NaN;
    let shownStall: boolean | null = null;
    const update = () => {
      const s = controller.getSnapshot();
      const tau = Math.abs(s.motorTorque);
      const u = Math.min(1, tau / Math.max(1e-6, limit));
      const deg = Math.round((u * 180 - 90) * 10) / 10;
      if (deg !== shownDeg && needle.current) {
        shownDeg = deg;
        needle.current.setAttribute('transform', `rotate(${deg} ${CX} ${CY})`);
      }
      const v = Math.round(tau * 10) / 10;
      if (v !== shownVal && value.current) {
        shownVal = v;
        value.current.textContent = t('testrun.torque.value', { v: v.toFixed(1) });
      }
      if (s.stalled !== shownStall && stall.current) {
        shownStall = s.stalled;
        stall.current.style.visibility = s.stalled ? 'visible' : 'hidden';
      }
    };
    update();
    return controller.onFrame(update);
  }, [controller, limit]);

  const ticks = Array.from({ length: 11 }, (_, i) => i / 10);
  return (
    <div className="tr-panel tr-gauge" aria-label={t('testrun.torque.title')}>
      <h3>{t('testrun.torque.title')}</h3>
      <svg viewBox="0 0 160 92" width="166" height="95" aria-hidden="true">
        <path d={arcPath(0, 0.6, R)} stroke="#6fbf73" strokeWidth="9" fill="none" />
        <path d={arcPath(0.6, 0.85, R)} stroke="#f2c14e" strokeWidth="9" fill="none" />
        <path d={arcPath(0.85, 1, R)} stroke="#e0533d" strokeWidth="9" fill="none" />
        {ticks.map((u) => {
          const major = Math.round(u * 10) % 5 === 0;
          const a = arcPoint(u, R - 7);
          const b = arcPoint(u, major ? R - 17 : R - 12);
          return (
            <line
              key={u}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="rgba(246,234,219,0.55)"
              strokeWidth={1.2}
            />
          );
        })}
        <g ref={needle} transform={`rotate(-90 ${CX} ${CY})`}>
          <line
            x1={CX}
            y1={CY}
            x2={CX}
            y2={CY - R + 6}
            stroke="#fff4df"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </g>
        <circle cx={CX} cy={CY} r="6" fill="#d4a442" stroke="#2b2118" strokeWidth="1.5" />
      </svg>
      <div className="tr-gauge-row">
        <span ref={value} className="tr-gauge-value" />
        <span ref={stall} className="tr-gauge-stall">
          {t('testrun.torque.stall')}
        </span>
        <span>{t('testrun.torque.limit', { v: limit })}</span>
      </div>
    </div>
  );
}
