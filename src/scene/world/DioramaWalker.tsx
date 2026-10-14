import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, InstancedMesh } from 'three';
import { useApp, type ActiveTransition } from '@/app/store';
import { jansenWalker } from '@/core/model/presets';
import { useActivity } from '../home/activity';
import { createPose } from '../rig/pose';
import { setStationOverride } from '../rig/stations';
import { planTransition } from '../rig/timeline';
import { worldDebug } from './debug';
import { createRouteSample, getDioramaLayout, markerOf, sampleRoute } from './diorama';
import { MachineMeshes, useMachineRig, writeMachineInstances } from './machine';
import { fitScale } from './miniature';
import { planWalk, restingStage, type WalkPlan } from './stageView';
import { useWorld } from './store';
import { closeUpPose, T06_WALK, t06WalkEnd, t06WalkProgress } from './t06';

/**
 * ジオラマの上の小さな機械(プレイヤーの最新の機械、なければヤンセン型の見本機)。
 * ふだんは今のステージの目印の横(小道の上)に立ち、T-06 では次のステージまで歩く(時間割は t06.ts)。
 * 脚は運動学で動かし、進んだ距離からクランク角を決める(脚先が滑らない)。
 * 歩く間はステージ選択のカメラの定位置を「歩く区間に寄った姿勢」に差し替える(歩き終えて少し後に戻す)。
 */

/** 模型の大きさ(m) */
export const WALKER_SIZE = 0.048;
/** ホームでコース模型にマウスを乗せたときの足踏みの速さ(rad/s) */
const IDLE_OMEGA = 5;
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab']);

interface WalkRun {
  plan: WalkPlan;
  tr: ActiveTransition;
  s0: number;
  s1: number;
  /** 遷移の長さ(s) */
  duration: number;
  /** カメラの遷移が終わった(残りは歩きだけ。クリック・キーでスキップできる) */
  tail: boolean;
}

export function DioramaWalker() {
  const design = useWorld((s) => s.machineDesign);
  const doc = useMemo(() => design ?? jansenWalker(), [design]);
  const rig = useMachineRig(doc);
  const scale = useMemo(() => fitScale(doc, WALKER_SIZE), [doc]);
  const hover = useActivity('stageSelect');
  const root = useRef<Group>(null);
  const bars = useRef<InstancedMesh>(null);
  const pins = useRef<InstancedMesh>(null);
  const layout = getDioramaLayout();
  const st = useMemo(
    () => ({
      s: 0,
      restS: 0,
      walk: null as WalkRun | null,
      holdUntil: 0,
      closeUp: false,
      minFootY: 0,
      needsPose: true,
      sample: createRouteSample(),
      a: [0, 0, 0] as [number, number, number],
      b: [0, 0, 0] as [number, number, number],
      pose: createPose(),
      /** 歩き終えたとき(毎フレームの処理から呼ぶ) */
      complete: (_hold: boolean) => {},
      releaseCamera: () => {},
    }),
    [],
  );

  useEffect(() => {
    st.needsPose = true;
  }, [rig, st]);

  useEffect(() => {
    const restS = () => {
      const w = useWorld.getState();
      const current = w.currentStageId ?? useApp.getState().stageId;
      const id = restingStage(w.progress, current, w.lastClearedStageId);
      return markerOf(layout, id)?.s ?? 0;
    };
    st.restS = restS();
    st.s = st.restS;

    const releaseCamera = () => {
      st.holdUntil = 0;
      if (!st.closeUp) return;
      st.closeUp = false;
      worldDebug.closeUp = false;
      setStationOverride('stageSelect', null);
    };
    /** 次の目印に着く。hold なら寄ったカメラを少し見せてから戻す */
    const complete = (hold: boolean) => {
      const w = st.walk;
      if (!w) return;
      st.walk = null;
      st.s = w.s1;
      worldDebug.walkProgress = 1;
      useWorld.getState().finishWalk();
      st.restS = restS();
      if (hold && st.closeUp) st.holdUntil = performance.now() + T06_WALK.hold * 1000;
      else releaseCamera();
    };
    st.complete = complete;
    st.releaseCamera = releaseCamera;

    const begin = (tr: ActiveTransition) => {
      const w = useWorld.getState();
      const plan = planWalk(w.progress, w.lastClearedStageId);
      const from = markerOf(layout, plan?.from ?? null);
      const to = markerOf(layout, plan?.to ?? null);
      if (!plan || !from || !to) return;
      const timing = planTransition(tr, useApp.getState().settings);
      w.beginWalk(plan);
      st.walk = { plan, tr, s0: from.s, s1: to.s, duration: timing.duration, tail: false };
      st.s = from.s;
      worldDebug.walkProgress = 0;
      if (timing.mode === 'fade' || timing.duration <= 0) {
        // 動きを減らす設定:歩かずに次の目印へ
        complete(false);
        return;
      }
      const p = st.sample;
      sampleRoute(layout.route, from.s, p);
      st.a[0] = p.x;
      st.a[1] = p.y;
      st.a[2] = p.z;
      sampleRoute(layout.route, to.s, p);
      st.b[0] = p.x;
      st.b[1] = p.y;
      st.b[2] = p.z;
      st.closeUp = true;
      worldDebug.closeUp = true;
      setStationOverride('stageSelect', (_, ctx) =>
        closeUpPose(st.a, st.b, ctx.width / Math.max(1, ctx.height), st.pose),
      );
    };

    const unsubApp = useApp.subscribe((s, prev) => {
      if (s.transition && s.transition !== prev.transition) {
        // 新しい遷移:歩いている途中なら打ち切って次の目印へ、寄ったカメラも戻す
        if (st.walk) complete(false);
        releaseCamera();
        const tr = s.transition;
        if (tr.id === 'T-06' && !tr.reverse && tr.to === 'stageSelect') begin(tr);
      } else if (!s.transition && prev.transition && st.walk?.tr === prev.transition) {
        // カメラが着いた。予定より早ければスキップ(歩きも飛ばす)、そうでなければ残りを歩く
        const w = st.walk;
        const elapsed = (performance.now() - w.tr.startedAt) / 1000;
        if (elapsed < w.duration * T06_WALK.skippedBefore) complete(false);
        else w.tail = true;
      }
      if (s.stageId !== prev.stageId && !st.walk) st.restS = restS();
    });
    const unsubWorld = useWorld.subscribe((s, prev) => {
      if (st.walk) return;
      if (
        s.progress !== prev.progress ||
        s.currentStageId !== prev.currentStageId ||
        s.lastClearedStageId !== prev.lastClearedStageId
      ) {
        st.restS = restS();
      }
    });
    // カメラが着いた後の残りの歩きは、クリック・キーでスキップできる(パネルの中の操作は数えない)
    const onInput = (e: Event) => {
      if (!st.walk?.tail) return;
      if (e instanceof KeyboardEvent && (e.repeat || MODIFIER_KEYS.has(e.key))) return;
      if (e instanceof PointerEvent && e.button !== 0) return;
      complete(false);
    };
    window.addEventListener('pointerdown', onInput);
    window.addEventListener('keydown', onInput);
    return () => {
      unsubApp();
      unsubWorld();
      window.removeEventListener('pointerdown', onInput);
      window.removeEventListener('keydown', onInput);
      releaseCamera();
    };
  }, [layout, st]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const now = performance.now();
    let target = st.restS;
    const w = st.walk;
    if (w) {
      const elapsed = (now - w.tr.startedAt) / 1000;
      const k = t06WalkProgress(elapsed, w.duration);
      target = w.s0 + (w.s1 - w.s0) * k;
      worldDebug.walkProgress = k;
    }
    const ds = target - st.s;
    st.s = target;
    // 歩いた距離(cm)だけクランクを回す。止まっている間はホバーで足踏みだけ
    let dTheta = 0;
    if (w && ds !== 0) dTheta = (rig.direction * Math.abs(ds / scale)) / rig.stride;
    else if (!w) dTheta = rig.direction * IDLE_OMEGA * (hover.current ?? 0) * dt;
    if (Math.abs(dTheta) > 1e-6 || st.needsPose) {
      st.minFootY = rig.gait.step(dTheta).minFootY;
      writeMachineInstances(rig.model, bars.current, pins.current);
      st.needsPose = false;
    }
    const p = sampleRoute(layout.route, st.s, st.sample);
    const g = root.current;
    if (g) {
      g.position.set(p.x, p.y - st.minFootY * scale, p.z);
      g.rotation.y = p.heading;
    }
    // 歩き終えた(カメラの遷移は終わっている)
    if (w?.tail && (now - w.tr.startedAt) / 1000 >= t06WalkEnd(w.duration)) st.complete(true);
    if (st.holdUntil && now > st.holdUntil) st.releaseCamera();
    worldDebug.walkerS = st.s;
  });

  return (
    <group ref={root}>
      <group scale={scale}>
        <MachineMeshes rig={rig} bars={bars} pins={pins} />
      </group>
    </group>
  );
}
