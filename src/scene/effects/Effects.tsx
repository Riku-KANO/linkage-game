import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  Outline,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import { ToneMappingMode, type DepthOfFieldEffect } from 'postprocessing';
import { useApp } from '@/app/store';
import { BENCH } from '../layout';
import { damp } from '../rig/spring';

/**
 * 後処理(通常モードだけ):ブルーム(太陽・電球が滲む)、被写界深度(ホームで作業台に焦点)、
 * ホバーの輪郭線、周辺減光、トーンマッピング。低性能モードでは丸ごと外す(SC-6)。
 */
export function Effects() {
  const lowPerf = useApp((s) => s.settings.lowPerf);
  if (lowPerf) return null;
  return <Composer />;
}

function Composer() {
  const dof = useRef<DepthOfFieldEffect>(null);
  const bokeh = useRef(0);
  useFrame(({ camera }, dt) => {
    const e = dof.current;
    if (!e) return;
    const app = useApp.getState();
    // 被写界深度は透視投影のホームでだけ(設計画面の平行投影では深度の読み方が変わるので切る)
    const on = app.screen === 'home' && !app.transition && !app.settings.reducedMotion;
    bokeh.current = damp(bokeh.current, on ? 2.4 : 0, 3, Math.min(dt, 0.1));
    e.bokehScale = bokeh.current;
    const [bx, by, bz] = BENCH.center;
    const d = Math.hypot(
      camera.position.x - bx,
      camera.position.y - (by + BENCH.top),
      camera.position.z - bz,
    );
    e.cocMaterial.focusDistance = d;
    e.cocMaterial.focusRange = 2.6;
  });
  return (
    <EffectComposer multisampling={4} enableNormalPass={false} autoClear={false}>
      <DepthOfField ref={dof} resolutionScale={0.5} />
      <Bloom mipmapBlur intensity={0.7} luminanceThreshold={1.0} luminanceSmoothing={0.3} />
      <Outline
        visibleEdgeColor={0xffb35c}
        hiddenEdgeColor={0x8a5226}
        edgeStrength={5}
        blur
        xRay
        pulseSpeed={0}
      />
      <Vignette offset={0.32} darkness={0.5} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
