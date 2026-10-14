import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import type { SimSnapshot, TerrainSpec, Vec3 } from '@/core/sim/types';
import { SPRINGS } from '@/ui/tokens';
import {
  createSpring3,
  DEFAULT_FOLLOW,
  followCameraGoal,
  followLookTarget,
  liftAboveTerrain,
  snapSpring3,
  stepSpring3,
  type FollowParams,
  type SpringParams,
} from './follow';
import { terrainHeightAt } from './terrain';

/**
 * 追従カメラ(TR-3):重心を、進行方向の先読みつきでばね(SPRINGS.follow)で追う。
 * ばねは実時間で進める(スロー中もカメラは滑らか)。カメラと注視点の線分が地形より上を通るよう
 * 持ち上げる。リセット(時刻が戻る)や大きな飛びではばねを使わず即座に合わせる。
 */
export interface FollowCameraProps {
  getSnapshot: () => SimSnapshot | null;
  terrain?: TerrainSpec | null;
  /** false の間は何もしない(OrbitControls などに任せる) */
  enabled?: boolean;
  /** 距離の倍率(機械の大きさ m の目安) */
  scale?: number;
  params?: Partial<FollowParams>;
  spring?: SpringParams;
}

export function FollowCamera({
  getSnapshot,
  terrain = null,
  enabled = true,
  scale = 1,
  params,
  spring = SPRINGS.follow,
}: FollowCameraProps) {
  const camera = useThree((s) => s.camera);
  const p = useMemo<FollowParams>(() => ({ ...DEFAULT_FOLLOW, ...params }), [params]);
  const st = useMemo(
    () => ({
      look: createSpring3(),
      cam: createSpring3(),
      lookGoal: { x: 0, y: 0, z: 0 } as Vec3,
      camGoal: { x: 0, y: 0, z: 0 } as Vec3,
      lookNow: { x: 0, y: 0, z: 0 } as Vec3,
      camNow: { x: 0, y: 0, z: 0 } as Vec3,
      active: false,
      lastTime: 0,
    }),
    [],
  );
  const heightAt = useMemo(
    () => (terrain ? (x: number, z: number) => terrainHeightAt(terrain, x, z) : () => -Infinity),
    [terrain],
  );

  useFrame((_, delta) => {
    if (!enabled) {
      st.active = false;
      return;
    }
    const s = getSnapshot();
    if (!s) return;
    followLookTarget(s.com, s.body.velocity, p, st.lookGoal);
    followCameraGoal(st.lookGoal, p, scale, st.camGoal);
    liftAboveTerrain(st.camGoal, st.lookGoal, heightAt, p.clearance);
    const far =
      Math.hypot(st.look.x - st.lookGoal.x, st.look.y - st.lookGoal.y, st.look.z - st.lookGoal.z) >
      6 * scale;
    if (!st.active) {
      // 有効になった瞬間:今のカメラ位置からばねで寄せる
      snapSpring3(st.cam, camera.position.x, camera.position.y, camera.position.z);
      snapSpring3(st.look, st.lookGoal.x, st.lookGoal.y, st.lookGoal.z);
      st.active = true;
    } else if (s.time < st.lastTime - 1e-6 || far) {
      snapSpring3(st.cam, st.camGoal.x, st.camGoal.y, st.camGoal.z);
      snapSpring3(st.look, st.lookGoal.x, st.lookGoal.y, st.lookGoal.z);
    } else {
      const dt = Math.min(delta, 0.1);
      stepSpring3(st.look, st.lookGoal.x, st.lookGoal.y, st.lookGoal.z, spring, dt);
      stepSpring3(st.cam, st.camGoal.x, st.camGoal.y, st.camGoal.z, spring, dt);
    }
    st.lastTime = s.time;
    // ばねの途中でも地形に潜らない
    st.camNow.x = st.cam.x;
    st.camNow.y = st.cam.y;
    st.camNow.z = st.cam.z;
    st.lookNow.x = st.look.x;
    st.lookNow.y = st.look.y;
    st.lookNow.z = st.look.z;
    if (liftAboveTerrain(st.camNow, st.lookNow, heightAt, p.clearance)) {
      st.cam.y = st.camNow.y;
      if (st.cam.vy < 0) st.cam.vy = 0;
    }
    camera.position.set(st.cam.x, st.cam.y, st.cam.z);
    camera.lookAt(st.look.x, st.look.y, st.look.z);
  });

  return null;
}
