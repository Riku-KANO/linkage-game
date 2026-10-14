import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Matrix4 } from 'three';
import { useApp, type ActiveTransition } from '@/app/store';
import { playSfx } from '@/audio/sfx';
import { HOME_CAMERA, SPRINGS, type Screen } from '@/ui/tokens';
import { PAPER_DESIGN } from '../layout';
import { rigDebug, rigSignals, useSceneUi } from '../store';
import { BlendCamera, viewProjection } from './BlendCamera';
import { crossFade } from './CrossFade';
import { paperScreenRect } from './paper';
import { copyPose, createPose, type CameraPath, type V3 } from './pose';
import { damp, springStep, type Spring1 } from './spring';
import { buildTransitionPath, resolveStation, type StationContext } from './stations';
import { TransitionDriver } from './timeline';

/**
 * カメラリグ(SC-2 / SC-3)。useApp の画面と遷移を見てカメラを動かす。
 * - 遷移:今の姿勢 → 経由点 → 行き先の定位置 をトークンの時間とイージングでなぞる。割り込み・スキップ可
 * - reduced-motion:カメラは即座に行き先へ、画は 0.3 秒のクロスフェード
 * - 落ち着いている間:定位置にばねで追従(画面サイズの変化・動く被写体)。設計画面だけは厳密に合わせる
 * - ホーム:ゆっくり呼吸する揺れとマウスの視差(低性能モード・reduced-motion では止める)
 * 毎フレームの処理は ref だけを書き換え、React の再描画は起こさない。
 */
export function CameraRig() {
  const get = useThree((s) => s.get);
  const r = useMemo(
    () => ({
      driver: new TransitionDriver(),
      path: null as CameraPath | null,
      tr: null as ActiveTransition | null,
      /** 揺れを足す前の姿勢 */
      cur: createPose(),
      /** カメラに当てた姿勢 */
      applied: createPose(),
      dest: createPose(),
      snapped: false,
      sway: 0,
      px: 0,
      py: 0,
      springs: Array.from({ length: 6 }, (): Spring1 => ({ x: 0, v: 0 })),
      fps: { frames: 0, t0: performance.now() },
      vp: new Matrix4(),
    }),
    [],
  );

  useEffect(() => {
    const ctx = (): StationContext => {
      const { size } = get();
      return { width: size.width, height: size.height, insets: useSceneUi.getState().paperInsets };
    };
    const snapTo = (screen: Screen) => {
      resolveStation(screen, ctx(), r.cur);
      copyPose(r.cur, r.applied);
      r.snapped = false;
      r.sway = 0;
    };
    const begin = (tr: ActiveTransition) => {
      const plan = r.driver.begin(tr, useApp.getState().settings);
      r.tr = tr;
      useSceneUi.getState().setRevealed(null);
      // 揺れを含めた今の見た目から始める(跳ばない)
      copyPose(r.applied, r.cur);
      r.sway = 0;
      if (plan.mode === 'fade') {
        r.path = null;
        crossFade.capture();
      } else {
        r.path = buildTransitionPath(r.applied, tr.from, tr.to, ctx());
        if (tr.from !== 'boot') playSfx('whoosh', { rate: Math.min(2, 0.6 / plan.duration) });
      }
    };
    const s0 = useApp.getState();
    if (s0.transition) {
      snapTo(s0.transition.from);
      begin(s0.transition);
    } else {
      snapTo(s0.screen);
      useSceneUi.getState().setRevealed(s0.screen);
    }
    return useApp.subscribe((s, prev) => {
      if (s.transition && s.transition !== prev.transition) {
        begin(s.transition);
      } else if (!s.transition && prev.transition) {
        // 自分で終えたときは r.tr が既に null。そうでなければ他所で打ち切られた
        if (r.tr !== prev.transition) return;
        r.driver.clear();
        r.path = null;
        r.tr = null;
        crossFade.setOpacity(0);
        // 画面も変わっていれば切り替える(同じなら定位置へばねで寄る)
        if (s.screen !== prev.screen) snapTo(s.screen);
        useSceneUi.getState().setRevealed(s.screen);
      } else if (!s.transition && s.screen !== prev.screen) {
        // 遷移なしで画面が変わった(開発用の瞬間移動など):切り替える
        r.driver.clear();
        r.path = null;
        r.tr = null;
        crossFade.setOpacity(0);
        snapTo(s.screen);
        useSceneUi.getState().setRevealed(s.screen);
      }
    });
  }, [get, r]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const now = performance.now();
    const app = useApp.getState();
    const ui = useSceneUi.getState();
    const camera = state.camera;
    if (!(camera instanceof BlendCamera)) return;
    const ctx: StationContext = {
      width: state.size.width,
      height: state.size.height,
      insets: ui.paperInsets,
    };
    resolveStation(app.screen, ctx, r.dest);

    if (rigSignals.skip) {
      rigSignals.skip = false;
      r.driver.skip();
    }
    const sample = r.driver.sample(now);
    const plan = r.driver.plan;
    let moving = false;
    if (sample && plan) {
      if (plan.mode === 'fly' && r.path) {
        r.path.setEnd(r.dest);
        r.path.evaluate(sample.eased, r.cur);
      } else {
        copyPose(r.dest, r.cur);
      }
      crossFade.setOpacity(plan.mode === 'fade' ? 1 - sample.t : 0);
      if (sample.revealed) ui.setRevealed(plan.to);
      moving = !sample.done;
      rigDebug.transitionId = plan.id ?? `${plan.from}→${plan.to}`;
      rigDebug.progress = sample.t;
      rigDebug.eased = sample.eased;
      rigDebug.mode = plan.mode;
      rigDebug.duration = plan.duration;
      rigDebug.reverse = plan.reverse;
      rigDebug.short = plan.short;
      if (sample.done) {
        const tr = r.tr;
        r.driver.clear();
        r.path = null;
        r.tr = null;
        r.snapped = false;
        crossFade.setOpacity(0);
        ui.setRevealed(app.screen);
        if (tr && useApp.getState().transition === tr) useApp.getState().finishTransition();
      }
    } else {
      rigDebug.transitionId = null;
      rigDebug.mode = 'idle';
      followStation(dt, app.screen === 'design');
    }

    // ホームの呼吸と視差
    const swayOn =
      !moving &&
      !r.driver.active &&
      app.screen === 'home' &&
      !app.settings.lowPerf &&
      !app.settings.reducedMotion;
    r.sway = swayOn ? Math.min(1, r.sway + dt / HOME_CAMERA.swayFadeIn) : 0;
    r.px = damp(r.px, state.pointer.x, 2.5, dt);
    r.py = damp(r.py, state.pointer.y, 2.5, dt);
    applySway(now / 1000);
    camera.applyPose(r.applied);

    updatePaper(camera, ctx, app.screen === 'design' && !r.driver.active);
    rigDebug.screen = app.screen;
    rigDebug.ortho = camera.orthoBlend;
    rigDebug.fov = camera.fov;
    r.fps.frames++;
    if (now - r.fps.t0 > 500) {
      rigDebug.fps = (r.fps.frames * 1000) / (now - r.fps.t0);
      r.fps.frames = 0;
      r.fps.t0 = now;
    }
  }, -1);

  /** 落ち着いている間は定位置にばねで追従(設計画面は紙と画面を厳密に合わせるため即座に) */
  function followStation(dt: number, exact: boolean) {
    if (exact || !r.snapped) {
      copyPose(r.dest, r.cur);
      r.springs.forEach((s, i) => {
        s.x = i < 3 ? r.cur.position[i]! : r.cur.target[i - 3]!;
        s.v = 0;
      });
      r.snapped = true;
      return;
    }
    for (let i = 0; i < 6; i++) {
      const s = r.springs[i]!;
      const goal = i < 3 ? r.dest.position[i]! : r.dest.target[i - 3]!;
      springStep(s, goal, SPRINGS.camera, dt);
      if (i < 3) r.cur.position[i] = s.x;
      else r.cur.target[i - 3] = s.x;
    }
    r.cur.up[0] = r.dest.up[0];
    r.cur.up[1] = r.dest.up[1];
    r.cur.up[2] = r.dest.up[2];
    r.cur.fov = damp(r.cur.fov, r.dest.fov, 8, dt);
    r.cur.ortho = r.dest.ortho;
  }

  function applySway(t: number) {
    copyPose(r.cur, r.applied);
    const w = r.sway;
    if (w <= 0) return;
    const ease = w * w * (3 - 2 * w);
    const A = HOME_CAMERA.breathAmplitude;
    const T = HOME_CAMERA.breathPeriod;
    const bx = Math.sin((t * 2 * Math.PI) / T) * A;
    const by = Math.sin((t * 2 * Math.PI) / (T * 0.73) + 1.3) * A * 0.6;
    const ox = (bx + r.px * HOME_CAMERA.parallax) * ease;
    const oy = (by + r.py * HOME_CAMERA.parallax * 0.6) * ease;
    // カメラの右・上方向
    const p = r.cur.position;
    const q = r.cur.target;
    const f: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const u = r.cur.up;
    const right: V3 = [
      f[1] * u[2] - f[2] * u[1],
      f[2] * u[0] - f[0] * u[2],
      f[0] * u[1] - f[1] * u[0],
    ];
    const rl = Math.hypot(...right) || 1;
    right[0] /= rl;
    right[1] /= rl;
    right[2] /= rl;
    const fl = Math.hypot(...f) || 1;
    const up: V3 = [
      (right[1] * f[2] - right[2] * f[1]) / fl,
      (right[2] * f[0] - right[0] * f[2]) / fl,
      (right[0] * f[1] - right[1] * f[0]) / fl,
    ];
    for (let k = 0; k < 3; k++) {
      const d = right[k]! * ox + up[k]! * oy;
      r.applied.position[k] = p[k]! + d;
      r.applied.target[k] = q[k]! + d * 0.35;
    }
  }

  function updatePaper(camera: BlendCamera, ctx: StationContext, ready: boolean) {
    const ui = useSceneUi.getState();
    if (!ready) {
      if (ui.paper.ready) ui.setPaper({ ...ui.paper, ready: false });
      return;
    }
    const rect = paperScreenRect(viewProjection(camera, r.vp), ctx.width, ctx.height);
    ui.setPaper({
      ready: true,
      screen: rect,
      design: { ...PAPER_DESIGN },
      pxPerCm: rect.width / (PAPER_DESIGN.xMax - PAPER_DESIGN.xMin),
    });
  }

  return null;
}
