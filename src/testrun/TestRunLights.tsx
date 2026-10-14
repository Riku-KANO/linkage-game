import { Environment, Lightformer } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Object3D, type DirectionalLight } from 'three';
import type { Vec3 } from '@/core/sim/types';

/**
 * 夕暮れの工房の光(試走ビューを単独で見るとき用。統合時は scene の照明を使ってよい)。
 * 低い西日(暖色・影)+窓からの青い補助光+半球光。金属の映り込みのために、光の板だけで作った
 * 環境マップを 1 回だけ描く(画像の読み込みなし)。太陽と影の範囲は機体を追う。
 */
export interface TestRunLightsProps {
  /** 影の中心(機体の重心など)。毎フレーム読む */
  getFocus?: () => Vec3 | null;
  shadows?: boolean;
  /** 光の板の環境マップ(既定 true) */
  environment?: boolean;
}

const SUN_OFFSET = { x: -3.5, y: 5.5, z: 4.5 };

export function TestRunLights({
  getFocus,
  shadows = false,
  environment = true,
}: TestRunLightsProps) {
  const sun = useRef<DirectionalLight>(null);
  const target = useRef(new Object3D());

  useFrame(() => {
    const f = getFocus?.();
    const s = sun.current;
    if (!f || !s) return;
    target.current.position.set(f.x, f.y, f.z);
    target.current.updateMatrixWorld();
    s.position.set(f.x + SUN_OFFSET.x, f.y + SUN_OFFSET.y, f.z + SUN_OFFSET.z);
  });

  return (
    <>
      <hemisphereLight args={['#ffd9b3', '#3a281d', 0.65]} />
      <directionalLight
        ref={sun}
        color="#ffb37a"
        intensity={2.6}
        position={[SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z]}
        target={target.current}
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
      />
      <directionalLight color="#8fb4ff" intensity={0.45} position={[6, 3, -4]} />
      {environment && (
        <Environment resolution={64} frames={1}>
          <Lightformer
            form="rect"
            intensity={2.2}
            color="#ffbe86"
            position={[-4, 4, 3]}
            scale={[6, 3, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.1}
            color="#9cc0ff"
            position={[5, 2, -3]}
            scale={[4, 2, 1]}
          />
          <Lightformer
            form="rect"
            intensity={0.6}
            color="#ffe7c9"
            position={[0, 6, 0]}
            rotation-x={Math.PI / 2}
            scale={[8, 8, 1]}
          />
          <Lightformer
            form="rect"
            intensity={0.25}
            color="#3a281d"
            position={[0, -2, 0]}
            rotation-x={-Math.PI / 2}
            scale={[10, 10, 1]}
          />
        </Environment>
      )}
    </>
  );
}
