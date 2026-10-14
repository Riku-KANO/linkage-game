import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useApp } from '@/app/store';
import { playSfx } from '@/audio/sfx';
import { useEditor } from '@/editor/store';
import type { DesignDoc } from '@/core/model/types';
import type { SimSnapshot } from '@/core/sim/types';
import { copySnapshot, createEmptySnapshot } from '@/testrun/snapshot';
import { createPose, copyPose, type V3 } from '../rig/pose';
import { liveAnchors, resolveStation } from '../rig/stations';
import { rigSignals } from '../store';
import { assemblyCamera, createCameraScratch, decayOffset, goalCamera } from './camera';
import { setFxCameraHook } from './cameraHook';
import { TRACK_LANDING } from './crane';
import { classifyTransition, isOutdoor } from './director';
import { CraneRenderer } from './craneRenderer';
import { createTrackPose, FxMachineRenderer, type TrackPose } from './machineRenderer';
import { restingBodyY } from './poses';
import {
  emitHandover,
  fxDirector,
  getPaperMapping,
  getTrackMachine,
  useFx,
  type TrackMachine,
} from './store';
import { TrackStandIn } from './StandIn';
import { eventsBetween, soundFor, type FxEvent } from './timeline';

/**
 * 演出の層(工房の Canvas の中に 1 つ置く)。
 *  - 毎フレーム(カメラリグより先、優先度 −2)演出の進行役を進め、機械・クレーン・音・カメラの目印を更新する
 *  - カメラリグに演出中のカメラ(組み上げを見る → 機械を追う → 半周)を渡す
 *  - 統合側の試走の機体がなければ、代わりの機体をコースに置く(TrackStandIn)
 */
/** 設計がこの時間(ms)変わらなければ、試走ボタンを押す前に演出の機械を作っておく */
const PREBUILD_AFTER_MS = 400;

export function FxLayer() {
  const lowPerf = useApp((s) => s.settings.lowPerf);
  const get = useThree((s) => s.get);
  const r = useMemo(
    () => ({
      machine: new FxMachineRenderer(),
      crane: new CraneRenderer(),
      track: createTrackPose(),
      /** 分解の吊り上げ元(遷移の始まりに写す) */
      captured: createEmptySnapshot(),
      capturedOrigin: [0, 0, 0] as V3,
      capturedValid: false,
      capturedDesign: null as DesignDoc | null,
      cam: createCameraScratch(),
      fxPose: createPose(),
      fxAtStart: createPose(),
      startPose: createPose(),
      designPose: createPose(),
      trackPose: createPose(),
      cameraPlanStart: -1,
      events: [] as FxEvent[],
      prevLevel: 0,
      /** 設計画面で見ている設計と、それが変わらなくなった時刻 */
      pendingDesign: null as DesignDoc | null,
      pendingSince: 0,
      warmed: false,
    }),
    [],
  );

  useEffect(() => {
    r.machine.setShadows(!lowPerf);
  }, [r, lowPerf]);

  useEffect(
    () => () => {
      r.machine.dispose();
      r.crane.dispose();
    },
    [r],
  );

  // 分解の始まり:試走の機体の今の姿勢をその場で写しておく(統合側が機体を片付けても困らない)
  useEffect(
    () =>
      useApp.subscribe((s, prev) => {
        const tr = s.transition;
        if (!tr || tr === prev.transition || classifyTransition(tr) !== 'disassemble') return;
        const m = getTrackMachine();
        const snap = m?.getSnapshot() ?? null;
        r.capturedValid = !!snap && !fxDirector.frame.machineInFx;
        if (snap && m) {
          copySnapshot(snap, r.captured);
          r.capturedOrigin[0] = m.origin[0];
          r.capturedOrigin[1] = m.origin[1];
          r.capturedOrigin[2] = m.origin[2];
          r.capturedDesign = m.design;
        }
      }),
    [r],
  );

  // カメラ:演出の遷移の間はリグの既定の経路の代わりにこちらの姿勢
  useEffect(() => {
    setFxCameraHook((plan, start, dest, ctx, out) => {
      const f = fxDirector.frame;
      const p = f.plan;
      if (!p || p.startedAt !== plan.startedAt || p.from !== plan.from || p.to !== plan.to) {
        return false;
      }
      if (f.kind === 'goal') {
        goalCamera(f.t, start, dest, out);
        return true;
      }
      const m = r.machine.model;
      if ((f.kind !== 'assemble' && f.kind !== 'disassemble') || !m || m.empty) return false;
      // 行き先の定位置はリグが求めた dest。もう一方は、組み上げなら設計の定位置(毎フレーム)、
      // 分解なら試走(結果)の定位置(機械は吊り上げ元で止まっているので始めに一度だけ)
      const first = r.cameraPlanStart !== plan.startedAt;
      let design = dest;
      let track = dest;
      if (f.kind === 'assemble') design = resolveStation('design', ctx, r.designPose);
      else {
        if (first) resolveStation(plan.from, ctx, r.trackPose);
        track = r.trackPose;
      }
      if (first) {
        // 始まり:今のカメラと演出の姿勢のずれを覚える(割り込みでなければ、ずれはほぼない)
        r.cameraPlanStart = plan.startedAt;
        copyPose(start, r.startPose);
        assemblyCamera(f.fromLevel, design, track, r.machine.crane, r.cam, r.fxAtStart);
      }
      assemblyCamera(f.level, design, track, r.machine.crane, r.cam, r.fxPose);
      decayOffset(r.fxPose, r.startPose, r.fxAtStart, f.t / 0.3, out);
      return true;
    });
    return () => setFxCameraHook(null);
  }, [r]);

  useFrame(() => {
    const app = useApp.getState();
    const now = performance.now();
    const f = fxDirector.update(app, now, rigSignals.skip);
    const moving = f.kind === 'assemble' || f.kind === 'disassemble';
    if (!moving && app.screen === 'design' && !app.transition) prebuild(now);
    if (f.started && moving) {
      // 演出の機械:組み上げはエディタの設計、分解はコースの機械の設計
      const design =
        f.kind === 'disassemble' && r.capturedValid && r.capturedDesign
          ? r.capturedDesign
          : useEditor.getState().design;
      const model = r.machine.setDesign(design);
      r.machine.setPaperMapping(getPaperMapping());
      r.machine.setShadows(!useApp.getState().settings.lowPerf);
      if (f.kind === 'disassemble' && !r.capturedValid && f.fromLevel >= 1) {
        // 吊り上げ元が分からない:既定の置き場所から(組み上げの途中からの割り込みなら今の着地点のまま)
        defaultTrack(r.track, restingBodyY(model.sweeps, TRACK_LANDING.groundY));
      }
      r.prevLevel = f.fromLevel;
    }
    const model = r.machine.model;
    if (model && (f.machineInFx || f.started)) {
      if (f.kind === 'assemble') {
        const restY = restingBodyY(model.sweeps, TRACK_LANDING.groundY);
        readTrack(getTrackMachine(), r.track, model.K, model.sweeps.n2, restY);
      } else if (f.kind === 'disassemble' && r.capturedValid) {
        trackFromSnapshot(r.captured, r.capturedOrigin, r.track, model.K, model.sweeps.n2);
      }
      r.machine.setTrack(r.track);
      // 試走の定位置のカメラが見る点:着地点(分解では吊り上げ元)
      liveAnchors.testMachine[0] = r.track.position[0];
      liveAnchors.testMachine[1] = r.track.position[1];
      liveAnchors.testMachine[2] = r.track.position[2];
    }
    r.machine.update(f.level, r.track, f.machineInFx);
    r.crane.update(f.level, r.machine.hook, r.machine.pose, model, f.machineInFx);

    // 音:部品がはまる・クレーン・着地(大きく跳んだとき・動きを減らす設定では鳴らさない)
    if (model && moving && !f.started && !app.settings.reducedMotion) {
      const n = eventsBetween(model.plan.events, r.prevLevel, f.level, r.events);
      const back = f.level < r.prevLevel;
      for (let i = 0; i < n; i++) {
        const v = soundFor(r.events[i]!, back);
        if (v) playSfx(v.sfx, { volume: v.volume, rate: v.rate });
      }
    }
    r.prevLevel = f.level;

    // 離散的な状態(変わったときだけ)
    const tr = app.transition;
    const ownsTrack =
      isOutdoor(app.screen) || f.machineInFx || (!!tr && (isOutdoor(tr.from) || isOutdoor(tr.to)));
    const kind = fxDirector.active;
    const ui = useFx.getState();
    if (ui.kind !== kind || ui.machineInFx !== f.machineInFx || ui.ownsTrack !== ownsTrack) {
      useFx.setState({ kind, machineInFx: f.machineInFx, ownsTrack });
    }
    if (f.handover) emitHandover();
  }, -2);

  /**
   * 設計画面で設計が落ち着いたら、演出の機械を先に作り、シェーダーも先にコンパイルしておく
   * (試走ボタンを押した最初のフレームで止まらない)。
   */
  function prebuild(now: number) {
    const d = useEditor.getState().design;
    if (d !== r.pendingDesign) {
      r.pendingDesign = d;
      r.pendingSince = now;
      return;
    }
    if (d === r.machine.model?.design || now - r.pendingSince < PREBUILD_AFTER_MS) return;
    r.machine.setDesign(d);
    r.machine.setShadows(!useApp.getState().settings.lowPerf);
    if (r.warmed) return;
    r.warmed = true;
    const { gl, camera, scene } = get();
    for (const root of [r.machine.root, r.crane.root]) {
      void gl.compileAsync(root, camera, scene).catch(() => {});
    }
  }

  return (
    <>
      <primitive object={r.machine.root} />
      <primitive object={r.crane.root} />
      <TrackStandIn />
    </>
  );
}

function defaultTrack(out: TrackPose, bodyY: number) {
  out.position[0] = TRACK_LANDING.x;
  out.position[1] = bodyY;
  out.position[2] = TRACK_LANDING.z;
  out.quaternion[0] = 0;
  out.quaternion[1] = 0;
  out.quaternion[2] = 0;
  out.quaternion[3] = 1;
  out.legs = null;
  out.motorAngle = 0;
}

/** スナップショット(シミュレーション座標)→ 着地点(ワールド)。脚は形が合うときだけ */
function trackFromSnapshot(
  s: SimSnapshot,
  origin: readonly number[],
  out: TrackPose,
  K: number,
  n2: number,
) {
  out.position[0] = origin[0]! + s.body.position.x;
  out.position[1] = origin[1]! + s.body.position.y;
  out.position[2] = origin[2]! + s.body.position.z;
  out.quaternion[0] = s.body.quaternion.x;
  out.quaternion[1] = s.body.quaternion.y;
  out.quaternion[2] = s.body.quaternion.z;
  out.quaternion[3] = s.body.quaternion.w;
  out.legs =
    s.legPositions.length === K && s.legPositions[0]?.length === n2 ? s.legPositions : null;
  out.motorAngle = s.motorAngle;
}

function readTrack(m: TrackMachine | null, out: TrackPose, K: number, n2: number, restY: number) {
  const s = m?.getSnapshot() ?? null;
  if (m && s) trackFromSnapshot(s, m.origin, out, K, n2);
  else defaultTrack(out, restY);
}
