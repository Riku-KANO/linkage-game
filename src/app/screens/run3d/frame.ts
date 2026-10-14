import type { Vec3 } from '@/core/sim/types';
import { liveAnchors } from '@/scene/rig/stations';
import { terrainHeightAt } from '@/testrun/terrain';
import type { Screen } from '@/ui/tokens';
import { stepFollowRig, type FollowRig } from './camera';
import type { RunView } from './runView';

/**
 * 試走の 1 フレーム(INT-2)。3D の描画ループ(RunWorld の useFrame、カメラリグより先)から呼ぶ。
 * React・three に依存しないのでテストできる。
 *
 *  - 試走画面に着いて(パネルが出る頃)から進める。演出が hold している間・結果画面では止めたまま
 *  - 機械の重心を工房の座標でカメラリグに渡す(liveAnchors.testMachine:試走・結果の定位置の中心)
 *  - 追従カメラの姿勢を進める(setStationOverride('testRun') がそれを返す)
 *  - モーターのうなり(回転数と負荷)
 *  - 終わったら END_PAUSE 秒だけ最後の姿勢を見せてから結果へ(finish: true を返す)
 */

/** 試走が終わってから結果へ移るまでの間(s、最後の姿勢を見せる) */
export const END_PAUSE = 0.8;

export interface FrameEnv {
  screen: Screen;
  /** パネルを出してよい画面(useSceneUi.revealed) */
  revealed: Screen | null;
  /** 演出が試走を止めている(run3dSignals.hold) */
  hold: boolean;
  /** performance.now()(ms) */
  nowMs: number;
}

export interface FrameHooks {
  follow: FollowRig;
  /** モーターのうなり(audio の setMotorHum) */
  hum?: (rpm: number, load: number) => void;
  /** カメラリグに渡す機械の位置(既定 liveAnchors.testMachine) */
  anchor?: [number, number, number];
}

export interface FrameResult {
  /** 試走を進めたか(試走画面で、止められていない) */
  active: boolean;
  /** 結果へ移す時が来た */
  finish: boolean;
}

/** 試走を進めてよいか */
export function isRunActive(env: Pick<FrameEnv, 'screen' | 'revealed' | 'hold'>): boolean {
  return env.screen === 'testRun' && env.revealed === 'testRun' && !env.hold;
}

const focus: Vec3 = { x: 0, y: 0, z: 0 };

export function runFrame(view: RunView, dt: number, env: FrameEnv, hooks: FrameHooks): FrameResult {
  const { controller, live, placement } = view;
  const active = isRunActive(env);
  controller.tick(active ? dt : 0);
  const snap = controller.getSnapshot();
  const [ox, oy, oz] = placement.offset;

  // カメラリグへ:試走・結果の定位置(機械の周り)の中心
  const anchor = hooks.anchor ?? liveAnchors.testMachine;
  anchor[0] = snap.com.x + ox;
  anchor[1] = snap.com.y + oy;
  anchor[2] = snap.com.z + oz;

  // 追従カメラ(試走画面の定位置)。地形の高さは sim の座標で引いて工房の座標へ
  focus.x = anchor[0];
  focus.y = anchor[1];
  focus.z = anchor[2];
  const terrain = live.stage.terrain;
  stepFollowRig(hooks.follow, {
    focus,
    velocity: snap.body.velocity,
    time: snap.time,
    scale: view.machineScale,
    heightAt: (x, z) => terrainHeightAt(terrain, x - ox, z - oz) + oy,
    dt,
  });

  // モーターのうなり
  if (hooks.hum) {
    const running = active && !live.done && controller.timeScale > 0;
    const stall = Math.max(1e-9, live.sim.params.motor.stallTorque);
    const rpm = running ? Math.abs((snap.motorSpeed * 60) / (2 * Math.PI)) : 0;
    hooks.hum(rpm, running ? Math.min(1, Math.max(0, snap.motorTorque / stall)) : 0);
  }

  // 終わった:最後の姿勢を少し見せてから結果へ
  let finish = false;
  if (live.done && active && !view.handedOver) {
    view.endedAt ??= env.nowMs;
    finish = env.nowMs - view.endedAt >= END_PAUSE * 1000;
  }
  return { active, finish };
}
