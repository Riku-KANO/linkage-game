import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Fog, Object3D, type DirectionalLight } from 'three';
import { useApp } from '@/app/store';
import { SUN_DIRECTION, TEST_TRACK, WINDOW } from '../layout';
import { SKY_COLORS } from './Sky';

/**
 * 光:窓から差し込む西日(影を落とす唯一の光)、空と床からの弱い環境光、遠景の霞。
 * 影の範囲はカメラが屋内か屋外かで切り替える(屋内は工房、屋外は試走コース)。
 * 低性能モードでは影を落とさない。
 */
export function Lights() {
  const lowPerf = useApp((s) => s.settings.lowPerf);
  const sun = useRef<DirectionalLight>(null);
  const target = useMemo(() => new Object3D(), []);
  const scene = useThree((s) => s.scene);
  const zone = useRef<'in' | 'out' | null>(null);

  useEffect(() => {
    scene.fog = new Fog(SKY_COLORS.horizon, 45, 220);
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  useFrame(({ camera }) => {
    const light = sun.current;
    if (!light) return;
    const out = camera.position.z < WINDOW.z - 0.3 ? 'out' : 'in';
    if (out === zone.current) return;
    zone.current = out;
    // 影の範囲の中心
    const c: [number, number, number] =
      out === 'out'
        ? [(TEST_TRACK.xStart + TEST_TRACK.xGoal) / 2, 0.5, TEST_TRACK.z]
        : [0, 1.2, 0.6];
    const r = out === 'out' ? 13 : 6.5;
    target.position.set(...c);
    target.updateMatrixWorld();
    light.position.set(
      c[0] + SUN_DIRECTION[0] * 30,
      c[1] + SUN_DIRECTION[1] * 30,
      c[2] + SUN_DIRECTION[2] * 30,
    );
    const cam = light.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 10;
    cam.far = 50;
    cam.updateProjectionMatrix();
    light.shadow.needsUpdate = true;
  });

  return (
    <>
      <hemisphereLight args={['#8d86c4', '#5a3a26', 1.5]} />
      <primitive object={target} />
      <directionalLight
        ref={sun}
        color="#ffb67a"
        intensity={4.2}
        target={target}
        castShadow={!lowPerf}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
      />
    </>
  );
}
