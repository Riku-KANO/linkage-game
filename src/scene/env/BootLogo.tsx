import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
  type Group,
  type InstancedMesh,
} from 'three';
import { useApp } from '@/app/store';
import { BOOT, EASINGS } from '@/ui/tokens';
import { LOGO_SIGN } from '../layout';
import { rigSignals } from '../store';
import { box, mergeParts, seeded } from './geometry';
import { PALETTE, brass, darkMetal, steel, vcMatte } from './materials';
import { LOGO_WIDTH, barSchedule, logoBars, logoPins } from './logoShape';

/**
 * タイトルの看板(T-00)。起動するとロゴのリンクが飛んできて組み上がり、
 * クランクが一回転してロゴが一歩踏み出す。終わったらホームへ(カメラが引く)。
 * クリック・キーでいつでも飛ばせる。看板はそのまま工房の壁に残る。
 */
const U = 0.3; // 文字の高さ(m)
const TOTAL = BOOT.logoAssemble + BOOT.logoFlourish;

export function BootLogo() {
  const bars = useMemo(logoBars, []);
  const pins = useMemo(() => logoPins(bars), [bars]);
  const scatter = useMemo(() => {
    const rnd = seeded(99);
    return bars.map(() => ({
      dx: (rnd() - 0.5) * 1.6,
      dy: (rnd() - 0.2) * 1.2,
      dz: 0.6 + rnd() * 0.8,
      da: (rnd() - 0.5) * 5,
    }));
  }, [bars]);
  const barRef = useRef<InstancedMesh>(null);
  const pinRef = useRef<InstancedMesh>(null);
  const crank = useRef<Group>(null);
  // start は最初の描画フレームで決める(シェーダーのコンパイル待ちで演出が欠けないように)
  const clock = useRef({ start: NaN, done: false });
  const { barGeo, pinGeo, sign } = useMemo(() => {
    const pinGeo = new CylinderGeometry(1, 1, 1, 10);
    pinGeo.rotateX(Math.PI / 2);
    const sign = mergeParts([
      box([LOGO_SIGN.width, LOGO_SIGN.height, 0.03], [0, 0, 0], PALETTE.woodDeep),
      box([LOGO_SIGN.width + 0.04, 0.025, 0.04], [0, LOGO_SIGN.height / 2, 0.005], PALETTE.brass),
      box([LOGO_SIGN.width + 0.04, 0.025, 0.04], [0, -LOGO_SIGN.height / 2, 0.005], PALETTE.brass),
    ]);
    return { barGeo: new BoxGeometry(1, 1, 1), pinGeo, sign };
  }, []);
  useEffect(
    () => () => {
      barGeo.dispose();
      pinGeo.dispose();
      sign.dispose();
    },
    [barGeo, pinGeo, sign],
  );

  // 起動画面に戻ったら(開発用の T-00 再生)最初から組み直す
  useEffect(
    () =>
      useApp.subscribe((s, prev) => {
        if (s.screen === 'boot' && prev.screen !== 'boot') {
          clock.current = { start: NaN, done: false };
        }
      }),
    [],
  );

  const ox = -(LOGO_WIDTH * U + 0.22) / 2;
  const oy = -U / 2;

  useFrame(() => {
    const app = useApp.getState();
    const c = clock.current;
    if (Number.isNaN(c.start)) c.start = performance.now();
    if (app.screen === 'boot') {
      if (rigSignals.skipBoot) {
        rigSignals.skipBoot = false;
        c.start = -Infinity;
      }
    } else if (!c.done && c.start !== -Infinity) {
      // 起動以外の画面で始まった(開発用に直接開いたなど)ときは完成形で表示
      c.start = -Infinity;
    }
    const t = (performance.now() - c.start) / 1000;
    if (app.screen === 'boot' && t >= TOTAL && !app.transition) {
      const skipped = c.start === -Infinity;
      app.go('home');
      if (skipped) rigSignals.skip = true;
    }
    if (c.done && t > TOTAL + 0.5) return;
    c.done = t > TOTAL + 0.5;
    write(Math.min(t, TOTAL + 1));
  });

  function write(t: number) {
    const b = barRef.current;
    const p = pinRef.current;
    if (!b || !p) return;
    const A = BOOT.logoAssemble;
    const F = BOOT.logoFlourish;
    // 一歩踏み出す(クランクが回った後、文字ごとに少しずつずらして)
    const stepT = (t - A - F * 0.55) / (F * 0.45);
    const glyphOffset = (g: number) => {
      const k = Math.min(1, Math.max(0, stepT * 1.4 - g * 0.12));
      return { x: 0.05 * U * EASINGS.glide(k), y: Math.sin(Math.PI * k) * 0.12 * U };
    };
    bars.forEach((bar, i) => {
      const { start, dur } = barSchedule(i, bars.length, A);
      const k = Math.min(1, Math.max(0, (t - start) / dur));
      const e = k <= 0 ? 0 : EASINGS.settle(k);
      const s = scatter[i]!;
      const off = glyphOffset(bar.glyph);
      const mx = ((bar.x0 + bar.x1) / 2) * U + ox + off.x;
      const my = ((bar.y0 + bar.y1) / 2) * U + oy + off.y;
      const ang = Math.atan2(bar.y1 - bar.y0, bar.x1 - bar.x0);
      const len = Math.hypot(bar.x1 - bar.x0, bar.y1 - bar.y0) * U + 0.04;
      P.set(mx + s.dx * (1 - e), my + s.dy * (1 - e), 0.045 + s.dz * (1 - e));
      Q.setFromEuler(EU.set(0, 0, ang + s.da * (1 - e)));
      const sc = k <= 0 ? 0 : 0.3 + 0.7 * Math.min(1, e);
      S.set(len * sc, 0.04 * sc, 0.016 * sc);
      b.setMatrixAt(i, M.compose(P, Q, S));
    });
    b.instanceMatrix.needsUpdate = true;
    Q.identity();
    pins.forEach((pin, i) => {
      // ピンはその文字の最後の棒がはまった直後に現れる
      const last = bars.reduce((acc, bar, j) => (bar.glyph === pin.glyph ? j : acc), 0);
      const { start, dur } = barSchedule(last, bars.length, A);
      const k = Math.min(1, Math.max(0, (t - start - dur * 0.6) / 0.18));
      const off = glyphOffset(pin.glyph);
      P.set(pin.x * U + ox + off.x, pin.y * U + oy + off.y, 0.05);
      const r = 0.017 * EASINGS.snap(k);
      S.set(r, r, k > 0 ? 0.035 : 0);
      p.setMatrixAt(i, M.compose(P, Q, S));
    });
    p.instanceMatrix.needsUpdate = true;
    const cr = crank.current;
    if (cr) {
      const k = Math.min(1, Math.max(0, (t - A) / (F * 0.55)));
      cr.rotation.z = -Math.PI * 2 * EASINGS.glide(k);
      const appear = Math.min(1, Math.max(0, (t - A * 0.75) / (A * 0.25)));
      cr.scale.setScalar(Math.max(0.001, EASINGS.snap(appear)));
    }
  }

  return (
    <group position={LOGO_SIGN.center}>
      <mesh geometry={sign} material={vcMatte} castShadow receiveShadow />
      <instancedMesh
        ref={barRef}
        args={[barGeo, brass, bars.length]}
        frustumCulled={false}
        castShadow
      />
      <instancedMesh ref={pinRef} args={[pinGeo, steel, pins.length]} frustumCulled={false} />
      {/* クランク:円盤と腕。組み上がると一回転する */}
      <group ref={crank} position={[-ox - 0.1, 0, 0.045]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={darkMetal}>
          <cylinderGeometry args={[0.075, 0.075, 0.02, 14]} />
        </mesh>
        <mesh position={[0.045, 0, 0.015]} material={brass}>
          <boxGeometry args={[0.1, 0.022, 0.012]} />
        </mesh>
        <mesh position={[0.085, 0, 0.025]} rotation={[Math.PI / 2, 0, 0]} material={steel}>
          <cylinderGeometry args={[0.012, 0.012, 0.03, 8]} />
        </mesh>
      </group>
    </group>
  );
}

const M = new Matrix4();
const Q = new Quaternion();
const P = new Vector3();
const S = new Vector3();
const EU = new Euler();
