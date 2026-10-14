import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
  type InstancedMesh,
  type Material,
} from 'three';
import { compileMechanism, solvePose } from '@/core/kinematics';
import type { DesignDoc } from '@/core/model/types';
import { brass, steel } from '../env/materials';

/**
 * 机や棚に飾る小さなリンク機構の模型(1 脚分)。activity が 1 に近いほど速く回る。
 * 棒は設計平面(xy)に並べ、リンクごとに少し奥行きをずらす。
 */
export function LinkageToy({
  design,
  scale,
  activity,
  rpm = 30,
  idleRpm = 0,
  barMaterial = brass,
}: {
  design: DesignDoc;
  /** m / 設計 cm */
  scale: number;
  activity: RefObject<number>;
  rpm?: number;
  /** activity が 0 のときの回転数 */
  idleRpm?: number;
  barMaterial?: Material;
}) {
  const mech = useMemo(() => compileMechanism(design), [design]);
  const bars = useMemo(() => {
    const out: { a: number; b: number; layer: number }[] = [];
    mech.links.forEach((js, layer) => {
      for (let i = 0; i < js.length; i++) {
        for (let k = i + 1; k < js.length; k++) out.push({ a: js[i]!, b: js[k]!, layer });
      }
    });
    return out;
  }, [mech]);
  const barRef = useRef<InstancedMesh>(null);
  const pinRef = useRef<InstancedMesh>(null);
  const state = useMemo(() => {
    const n = mech.jointIds.length * 2;
    // 前フレームの解と出力を交互に使う(毎フレームの確保をしない)
    return { theta: 0, bufs: [new Float64Array(n), new Float64Array(n)], k: 0, hasPrev: false };
  }, [mech]);
  const { barGeo, pinGeo } = useMemo(() => {
    const pinGeo = new CylinderGeometry(1, 1, 1, 8);
    pinGeo.rotateX(Math.PI / 2);
    return { barGeo: new BoxGeometry(1, 1, 1), pinGeo };
  }, []);
  useEffect(
    () => () => {
      barGeo.dispose();
      pinGeo.dispose();
    },
    [barGeo, pinGeo],
  );
  const sign = (design.motor.rpm || 1) < 0 ? -1 : 1;

  useFrame((_, dt) => {
    const a = activity.current ?? 0;
    const w = ((idleRpm + (rpm - idleRpm) * a) * Math.PI * 2) / 60;
    const st = state;
    st.theta += sign * w * Math.min(dt, 0.1);
    const out = st.bufs[st.k]!;
    const prev = st.hasPrev ? st.bufs[1 - st.k]! : null;
    const p = solvePose(mech, st.theta, { prev, out }).positions;
    st.k = 1 - st.k;
    st.hasPrev = true;
    const b = barRef.current;
    const pins = pinRef.current;
    if (!b || !pins) return;
    bars.forEach((bar, i) => {
      const ax = p[bar.a * 2]!;
      const ay = p[bar.a * 2 + 1]!;
      const bx = p[bar.b * 2]!;
      const by = p[bar.b * 2 + 1]!;
      P.set((ax + bx) / 2, (ay + by) / 2, bar.layer * 1.6);
      Q.setFromEuler(E.set(0, 0, Math.atan2(by - ay, bx - ax)));
      S.set(Math.hypot(bx - ax, by - ay) + 3, 3, 1.1);
      b.setMatrixAt(i, M.compose(P, Q, S));
    });
    b.instanceMatrix.needsUpdate = true;
    Q.identity();
    const len = mech.links.length * 1.6 + 1.5;
    for (let j = 0; j < mech.jointIds.length; j++) {
      P.set(p[j * 2]!, p[j * 2 + 1]!, ((mech.links.length - 1) * 1.6) / 2);
      S.set(1.3, 1.3, len);
      pins.setMatrixAt(j, M.compose(P, Q, S));
    }
    pins.instanceMatrix.needsUpdate = true;
  });

  return (
    <group scale={scale}>
      <instancedMesh
        ref={barRef}
        args={[barGeo, barMaterial, bars.length]}
        castShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={pinRef}
        args={[pinGeo, steel, mech.jointIds.length]}
        frustumCulled={false}
      />
    </group>
  );
}

const M = new Matrix4();
const Q = new Quaternion();
const P = new Vector3();
const S = new Vector3();
const E = new Euler();
