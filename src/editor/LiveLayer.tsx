import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import type { CompiledMechanism } from '@/core/kinematics';
import type { DesignDoc } from '@/core/model/types';
import type { MotionEngine } from './motion';
import { linkOutlineOrder } from './render';
import type { Camera } from './viewport';

/**
 * 動いている機構の重ね描き(ED-3)。
 * React は要素を作るだけで、毎フレームの位置はエンジンの購読で SVG 属性を直接書き換える。
 * その角度で組み立てられない点・リンクは赤く震わせる(ED-4)。
 */
export interface LiveLayerProps {
  engine: MotionEngine;
  design: DesignDoc;
  compiled: CompiledMechanism;
  cam: Camera;
  visible: boolean;
  onFailChange?: (failing: boolean) => void;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export const LiveLayer = memo(function LiveLayer({
  engine,
  design,
  compiled,
  cam,
  visible,
  onFailChange,
}: LiveLayerProps) {
  const linkEls = useRef<(SVGElement | null)[]>([]);
  const jointEls = useRef<(SVGCircleElement | null)[]>([]);
  const footEl = useRef<SVGCircleElement | null>(null);
  const failing = useRef(false);

  const orders = useMemo(() => design.links.map((_, li) => linkOutlineOrder(design, li)), [design]);
  const crankLinks = useMemo(() => new Set(design.cranks.map((c) => c.link)), [design]);

  useLayoutEffect(() => {
    const draw = (e: MotionEngine) => {
      if (e.mechanism !== compiled) return;
      const pose = e.pose;
      if (!pose) return;
      const P = pose.positions;
      const sx = (i: number) => r1(cam.ox + cam.scale * P[i * 2]!);
      const sy = (i: number) => r1(cam.oy - cam.scale * P[i * 2 + 1]!);
      const failedLinks = new Set(pose.failedLinks);
      // 赤くするのは原因の点だけ(引きずられて解けなかった点は除く)
      const failedJoints = new Set(pose.causeJoints ?? pose.failedJoints);
      for (let li = 0; li < orders.length; li++) {
        const el = linkEls.current[li];
        const ord = orders[li]!;
        if (!el) continue;
        if (ord.length === 2) {
          el.setAttribute('x1', String(sx(ord[0]!)));
          el.setAttribute('y1', String(sy(ord[0]!)));
          el.setAttribute('x2', String(sx(ord[1]!)));
          el.setAttribute('y2', String(sy(ord[1]!)));
        } else {
          let pts = '';
          for (const i of ord) pts += `${sx(i)},${sy(i)} `;
          el.setAttribute('points', pts);
        }
        const fail = failedLinks.has(li);
        el.classList.toggle('is-fail', fail);
        el.classList.toggle('ed-shake', fail);
      }
      for (let i = 0; i < jointEls.current.length; i++) {
        const el = jointEls.current[i];
        if (!el) continue;
        el.setAttribute('cx', String(sx(i)));
        el.setAttribute('cy', String(sy(i)));
        el.classList.toggle('is-fail', failedJoints.has(i));
      }
      const f = compiled.footIndex;
      if (footEl.current && f >= 0) {
        footEl.current.setAttribute('cx', String(sx(f)));
        footEl.current.setAttribute('cy', String(sy(f)));
      }
      const now = !pose.ok;
      if (now !== failing.current) {
        failing.current = now;
        onFailChange?.(now);
      }
    };
    draw(engine);
    return engine.subscribe(draw);
  }, [engine, compiled, cam, orders, onFailChange]);

  return (
    <g className="ed-live" style={visible ? undefined : { display: 'none' }} aria-hidden="true">
      {orders.map((ord, li) => {
        const cls = `ed-live-link${crankLinks.has(design.links[li]!.id) ? ' is-crank' : ''}`;
        if (ord.length === 2)
          return (
            <line
              key={design.links[li]!.id}
              className={cls}
              ref={(el) => {
                linkEls.current[li] = el;
              }}
            />
          );
        if (ord.length > 2)
          return (
            <polygon
              key={design.links[li]!.id}
              className={cls}
              ref={(el) => {
                linkEls.current[li] = el;
              }}
            />
          );
        return null;
      })}
      {design.joints.map((j, i) =>
        j.fixed ? null : (
          <circle
            key={j.id}
            r={3}
            className="ed-live-joint"
            ref={(el) => {
              jointEls.current[i] = el;
            }}
          />
        ),
      )}
      {compiled.footIndex >= 0 && <circle ref={footEl} r={5.5} className="ed-live-foot" />}
    </g>
  );
});
