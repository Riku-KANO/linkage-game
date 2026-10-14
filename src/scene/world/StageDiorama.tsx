import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Matrix4,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Group,
  type InstancedMesh,
} from 'three';
import { useApp } from '@/app/store';
import { getStage } from '@/game/stages';
import type { Medal, Progress, StageId } from '@/game/types';
import { t } from '@/i18n';
import { ModelSlot } from '../env/ModelSlot';
import { invisible, vcMatte } from '../env/materials';
import { worldDebug } from './debug';
import { getDioramaLayout, MARKER_RADIUS, type DioramaLayout, type MarkerSpec } from './diorama';
import {
  glowMat,
  hullMat,
  MARKER_COLORS,
  markerMat,
  MEDAL_COLORS,
  propMat,
  ringMat,
} from './materials';
import { markerMedals, markerState, MEDAL_AXES, type MarkerState } from './stageView';
import { buildDioramaTerrain } from './terrain';
import './world.css';

/**
 * ステージ選択のジオラマ(WORLD-1)。コース模型の板の上(ローカル座標)に置く。
 * 章ごとの台地・小道・橋と、ステージの目印(インスタンス描画)。
 * - 未解放:暗い台座に南京錠 / 遊べる:明るい台座と光る輪・浮かぶ菱形 / クリア:旗と軸ごとのメダルの粒
 * - ホバー:台座の輪郭が光り、ステージ名のラベルが浮かぶ / 選択:台座の周りに輪
 * 表示は props だけで決まる(DOM の一覧とホバー・選択を共有するため、状態は持たない)。
 */
export interface StageDioramaProps {
  progress: Progress;
  hoveredStageId?: StageId | null;
  selectedStageId?: StageId | null;
  /** 目印にマウスが乗った・離れた(null) */
  onHoverStage?: (id: StageId | null) => void;
  /** 目印をクリックした(未解放でも呼ぶ。弾くのは受け取る側) */
  onSelectStage?: (id: StageId) => void;
  /** 目印が操作を受け付けるか(ステージ選択で遷移していない間)。false の間は操作を素通しする */
  interactive?: boolean;
  /** 光の脈動などの動きを止める */
  reducedMotion?: boolean;
}

export function StageDiorama({
  progress,
  hoveredStageId = null,
  selectedStageId = null,
  onHoverStage,
  onSelectStage,
  interactive = true,
  reducedMotion = false,
}: StageDioramaProps) {
  const layout = getDioramaLayout();
  const terrain = useMemo(() => buildDioramaTerrain(layout), [layout]);
  useEffect(() => () => terrain.dispose(), [terrain]);
  const hovered = layout.markers.find((m) => m.stageId === hoveredStageId);
  const selected = layout.markers.find((m) => m.stageId === selectedStageId);

  return (
    <group>
      <ModelSlot id="courseModel">
        <mesh geometry={terrain} material={vcMatte} castShadow receiveShadow />
      </ModelSlot>
      <Markers
        layout={layout}
        progress={progress}
        interactive={interactive}
        reducedMotion={reducedMotion}
        onHoverStage={onHoverStage}
        onSelectStage={onSelectStage}
      />
      {selected && (
        <mesh
          position={[selected.x, selected.y + 0.0015, selected.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={ringMat}
        >
          <torusGeometry args={[MARKER_RADIUS * 2, 0.0011, 4, 40]} />
        </mesh>
      )}
      {hovered && (
        <>
          <mesh position={[hovered.x, hovered.y + 0.003, hovered.z]} material={hullMat}>
            <cylinderGeometry
              args={[MARKER_RADIUS * 0.9 + 0.0035, MARKER_RADIUS + 0.0035, 0.0105, 12]}
            />
          </mesh>
          <Html
            position={[hovered.x, hovered.y + 0.075, hovered.z]}
            center
            zIndexRange={[20, 10]}
            pointerEvents="none"
          >
            <MarkerLabel marker={hovered} progress={progress} />
          </Html>
        </>
      )}
    </group>
  );
}

/** ホバー中の目印のラベル:番号とステージ名、状態(クリアならメダル) */
function MarkerLabel({ marker, progress }: { marker: MarkerSpec; progress: Progress }) {
  const stage = getStage(marker.stageId);
  const state = markerState(progress, marker.stageId);
  const medals = markerMedals(progress, marker.stageId);
  return (
    <div className={`ak-label ak-world-label is-${state}`} role="presentation">
      <span className="ak-label__name">
        <span className="ak-world-label__code">
          {t('world.marker.code', { chapter: marker.chapter, order: marker.order })}
        </span>
        {stage ? t(stage.titleKey) : marker.stageId}
      </span>
      <span className="ak-label__sub">
        {t(`world.marker.${state}`)}
        {state === 'cleared' && (
          <span className="ak-world-medals">
            {medals.map((m, i) => (
              <i
                key={MEDAL_AXES[i]}
                className={`ak-world-medal is-${m ?? 'none'}`}
                title={t('world.marker.medal', {
                  axis: t(`game.axis.${MEDAL_AXES[i]}`),
                  medal: t(`game.medal.${m ?? 'none'}`),
                })}
              />
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

const M = new Matrix4();
const Q = new Quaternion();
const P = new Vector3();
const S = new Vector3();
const E = new Euler();
const C = new Color();
const ZERO = new Vector3(0, 0, 0);
const ONE = new Vector3(1, 1, 1);
const FLAT = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
const V = new Vector3();

function place(mesh: InstancedMesh, i: number, x: number, y: number, z: number, q = Q, s = ONE) {
  P.set(x, y, z);
  mesh.setMatrixAt(i, M.compose(P, q, s));
}
/** 見せないインスタンス:大きさ 0(位置は目印に置いて、境界球を目印の範囲に保つ) */
function hide(mesh: InstancedMesh, i: number, m: MarkerSpec) {
  mesh.setMatrixAt(i, M.compose(P.set(m.x, m.y, m.z), Q.identity(), ZERO));
}

const PIP_SPACING = 0.0072;
const PAD_H = 0.006;

function Markers({
  layout,
  progress,
  interactive,
  reducedMotion,
  onHoverStage,
  onSelectStage,
}: {
  layout: DioramaLayout;
  progress: Progress;
  interactive: boolean;
  reducedMotion: boolean;
  onHoverStage?: (id: StageId | null) => void;
  onSelectStage?: (id: StageId) => void;
}) {
  const n = layout.markers.length;
  const geo = useMemo(() => {
    const shackle = new TorusGeometry(0.0036, 0.0011, 5, 10, Math.PI);
    return {
      pad: new CylinderGeometry(MARKER_RADIUS * 0.9, MARKER_RADIUS, PAD_H, 10),
      glow: new TorusGeometry(MARKER_RADIUS * 1.35, 0.0022, 4, 28),
      beacon: new OctahedronGeometry(0.0042),
      pole: new CylinderGeometry(0.0009, 0.0009, 0.042, 5),
      flag: new BoxGeometry(0.018, 0.011, 0.0012),
      body: new BoxGeometry(0.011, 0.009, 0.006),
      shackle,
      pip: new SphereGeometry(0.0029, 8, 6),
      hit: new CylinderGeometry(0.022, 0.022, 0.075, 8),
    };
  }, []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const pads = useRef<InstancedMesh>(null);
  const glows = useRef<InstancedMesh>(null);
  const beacons = useRef<InstancedMesh>(null);
  const poles = useRef<InstancedMesh>(null);
  const flags = useRef<InstancedMesh>(null);
  const bodies = useRef<InstancedMesh>(null);
  const shackles = useRef<InstancedMesh>(null);
  const pips = useRef<InstancedMesh>(null);
  const hits = useRef<InstancedMesh>(null);
  const root = useRef<Group>(null);
  const states = useRef<MarkerState[]>(layout.markers.map(() => 'locked'));
  const pointerHover = useRef<StageId | null>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  // 進行が変わったときだけ、全ての目印の形と色を書き直す
  useLayoutEffect(() => {
    const pad = pads.current;
    const pole = poles.current;
    const flag = flags.current;
    const body = bodies.current;
    const shackle = shackles.current;
    const pip = pips.current;
    const hit = hits.current;
    const glow = glows.current;
    const beacon = beacons.current;
    if (!pad || !pole || !flag || !body || !shackle || !pip || !hit || !glow || !beacon) return;
    layout.markers.forEach((m, i) => {
      const st = markerState(progress, m.stageId);
      states.current[i] = st;
      Q.setFromEuler(E.set(0, m.heading, 0));
      place(pad, i, m.x, m.y + PAD_H / 2, m.z);
      pad.setColorAt(i, C.set(MARKER_COLORS[st]));
      place(hit, i, m.x, m.y + 0.03, m.z);
      Q.identity();
      if (st === 'cleared') {
        place(pole, i, m.x - 0.005, m.y + PAD_H + 0.021, m.z - 0.002);
        pole.setColorAt(i, C.set('#4a3020'));
        place(flag, i, m.x + 0.0045, m.y + PAD_H + 0.035, m.z - 0.002);
        flag.setColorAt(i, C.set('#c4432d'));
      } else {
        hide(pole, i, m);
        hide(flag, i, m);
      }
      if (st === 'locked') {
        place(body, i, m.x, m.y + PAD_H + 0.0045, m.z);
        body.setColorAt(i, C.set('#7d6a3c'));
        place(shackle, i, m.x, m.y + PAD_H + 0.009, m.z);
        shackle.setColorAt(i, C.set('#9aa2aa'));
      } else {
        hide(body, i, m);
        hide(shackle, i, m);
      }
      const medals = markerMedals(progress, m.stageId);
      for (let k = 0; k < 4; k++) {
        const j = i * 4 + k;
        if (st !== 'cleared') {
          hide(pip, j, m);
          continue;
        }
        place(pip, j, m.x + (k - 1.5) * PIP_SPACING, m.y + 0.003, m.z + MARKER_RADIUS + 0.007);
        pip.setColorAt(j, C.set(MEDAL_COLORS[medalKey(medals[k] ?? null)]));
      }
      if (st !== 'playable') {
        hide(glow, i, m);
        hide(beacon, i, m);
      }
    });
    animate(0);
    for (const m of [pad, pole, flag, body, shackle, pip, hit, glow, beacon]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      // 見せるインスタンスが変わったので、視錐台の判定とレイキャストの境界を作り直す
      m.computeBoundingSphere();
      m.computeBoundingBox();
    }
  }, [layout, progress]);

  // 遊べる目印の光の脈動と浮かぶ菱形
  function animate(time: number) {
    const glow = glows.current;
    const beacon = beacons.current;
    if (!glow || !beacon) return;
    let any = false;
    const list = layout.markers;
    for (let i = 0; i < list.length; i++) {
      const m = list[i]!;
      if (states.current[i] !== 'playable') continue;
      any = true;
      const pulse = reducedMotion ? 1 : 1 + 0.12 * Math.sin(time * 3.2 + i);
      place(glow, i, m.x, m.y + 0.0012, m.z, FLAT, S.set(pulse, pulse, pulse));
      const bob = reducedMotion ? 0 : 0.003 * Math.sin(time * 2.1 + i * 0.7);
      Q.setFromEuler(E.set(0, reducedMotion ? 0 : time * 1.6, 0));
      place(beacon, i, m.x, m.y + 0.034 + bob, m.z);
    }
    if (any) {
      glow.instanceMatrix.needsUpdate = true;
      beacon.instanceMatrix.needsUpdate = true;
    }
  }

  useFrame(({ clock }) => animate(clock.elapsedTime));

  // 開発・E2E 用:目印の画面上の位置
  useEffect(() => {
    worldDebug.markerScreen = (id) => {
      const m = layout.markers.find((x) => x.stageId === id);
      const g = root.current;
      if (!m || !g) return null;
      V.set(m.x, m.y + 0.01, m.z)
        .applyMatrix4(g.matrixWorld)
        .project(camera);
      if (V.z > 1) return null;
      return { x: ((V.x + 1) / 2) * size.width, y: ((1 - V.y) / 2) * size.height };
    };
    return () => {
      worldDebug.markerScreen = null;
    };
  }, [layout, camera, size]);

  // 操作できなくなったら(画面を離れた・遷移が始まった)マウスのホバーを消す
  useEffect(() => {
    if (interactive || !pointerHover.current) return;
    pointerHover.current = null;
    onHoverStage?.(null);
    document.body.style.cursor = '';
  }, [interactive, onHoverStage]);

  const idAt = (e: ThreeEvent<PointerEvent | MouseEvent>) =>
    e.instanceId === undefined ? null : (layout.markers[e.instanceId]?.stageId ?? null);
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    const id = idAt(e);
    if (id === pointerHover.current) return;
    pointerHover.current = id;
    onHoverStage?.(id);
    const locked = id ? markerState(progress, id) === 'locked' : false;
    document.body.style.cursor = id ? (locked ? 'not-allowed' : 'pointer') : '';
  };
  const onOut = () => {
    if (!pointerHover.current) return;
    pointerHover.current = null;
    onHoverStage?.(null);
    document.body.style.cursor = '';
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    if (e.delta > 6) return;
    const id = idAt(e);
    if (id) onSelectStage?.(id);
  };

  return (
    <group ref={root}>
      <instancedMesh ref={pads} args={[geo.pad, markerMat, n]} castShadow receiveShadow />
      <instancedMesh ref={glows} args={[geo.glow, glowMat, n]} frustumCulled={false} />
      <instancedMesh ref={beacons} args={[geo.beacon, glowMat, n]} frustumCulled={false} />
      <instancedMesh ref={poles} args={[geo.pole, propMat, n]} castShadow />
      <instancedMesh ref={flags} args={[geo.flag, propMat, n]} castShadow />
      <instancedMesh ref={bodies} args={[geo.body, propMat, n]} castShadow />
      <instancedMesh ref={shackles} args={[geo.shackle, markerMat, n]} />
      <instancedMesh ref={pips} args={[geo.pip, markerMat, n * 4]} />
      <instancedMesh
        ref={hits}
        args={[geo.hit, invisible, n]}
        onPointerMove={onMove}
        onPointerOut={onOut}
        onClick={onClick}
      />
    </group>
  );
}

function medalKey(m: Medal): keyof typeof MEDAL_COLORS {
  return m ?? 'none';
}

/** 今の画面と設定から、目印を操作できるか(ステージ選択で遷移していない間) */
export function useDioramaInteractive(): boolean {
  return useApp((s) => s.screen === 'stageSelect' && s.transition === null);
}
