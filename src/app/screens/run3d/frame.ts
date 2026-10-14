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
 *  - 時間は演出(scene/fx)の倍率を掛けて進める(getFxTimeScale:T-03 の組み上げ・T-05 の分解の間は 0、
 *    T-04 のゴールで 1 → 0.2 → 0)。試走画面に着いて(パネルが出る頃)から進める
 *  - 終わったら(ゴール・転倒など)すぐに結果へ(finish: true)。評価の後は余韻として機体を
 *    演出の倍率で少し動かし続ける(T-04 のスローの間も歩く。controller.startCoast)
 *  - 機械の重心を工房の座標でカメラリグに渡す(liveAnchors.testMachine:試走・結果の定位置の中心)
 *  - 追従カメラの姿勢を進める(setStationOverride('testRun') がそれを返す)
 *  - モーターのうなり(回転数と負荷)
 */

/**
 * 追従カメラの距離の倍率(機械の大きさに掛ける)。testrun の既定より引いて、上の帯・トルク計・
 * 設計図の縮小版・操作盤に囲まれても機械の全体と足元のコースが見えるようにする
 */
export const FOLLOW_DISTANCE = 1.6;

export interface FrameEnv {
  screen: Screen;
  /** パネルを出してよい画面(useSceneUi.revealed) */
  revealed: Screen | null;
  /** 演出の時間の倍率(scene/fx の getFxTimeScale()) */
  timeScale: number;
}

export interface FrameHooks {
  follow: FollowRig;
  /** モーターのうなり(audio の setMotorHum) */
  hum?: (rpm: number, load: number) => void;
  /** カメラリグに渡す機械の位置(既定 liveAnchors.testMachine) */
  anchor?: [number, number, number];
}

export interface FrameResult {
  /** 試走を進めてよい(試走画面に着いている) */
  active: boolean;
  /** 結果へ移す時が来た */
  finish: boolean;
}

/** 試走を進めてよいか(試走画面に着いた。止めるのは演出の倍率) */
export function isRunActive(env: Pick<FrameEnv, 'screen' | 'revealed'>): boolean {
  return env.screen === 'testRun' && env.revealed === 'testRun';
}

const OUTDOOR: ReadonlySet<Screen> = new Set<Screen>(['testRun', 'result']);

const focus: Vec3 = { x: 0, y: 0, z: 0 };

export function runFrame(view: RunView, dt: number, env: FrameEnv, hooks: FrameHooks): FrameResult {
  const { controller, live, placement } = view;
  const active = isRunActive(env);
  // 評価の後の余韻は、試走 → 結果(T-04)と結果画面の間も演出の倍率で動く
  const coast = view.handedOver && controller.coasting && OUTDOOR.has(env.screen);
  const scale = Number.isFinite(env.timeScale) ? Math.max(0, env.timeScale) : 1;
  controller.tick(active || coast ? dt * scale : 0);
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
    scale: view.machineScale * FOLLOW_DISTANCE,
    heightAt: (x, z) => terrainHeightAt(terrain, x - ox, z - oz) + oy,
    dt,
  });

  // モーターのうなり
  if (hooks.hum) {
    const running = active && !live.done && scale > 0 && controller.timeScale > 0;
    const stall = Math.max(1e-9, live.sim.params.motor.stallTorque);
    const rpm = running ? Math.abs((snap.motorSpeed * 60) / (2 * Math.PI)) : 0;
    hooks.hum(rpm, running ? Math.min(1, Math.max(0, snap.motorTorque / stall)) : 0);
  }

  // 終わった:すぐに結果へ(ゴールの瞬間のスローは T-04 の演出が受け持つ)
  const finish = live.done && active && !view.handedOver;
  return { active, finish };
}
