import type { HeadlessOptions, HeadlessResult, PoseSample, SimInput } from './types';
import { Walker } from './walker';

/** ゴースト用の姿勢サンプルの間隔(s) */
const TRACE_INTERVAL = 0.1;

/**
 * ヘッドレス実行(SIM-6、評価・ゴースト用)。描画なしで固定ステップを回し、要約を返す。
 *
 * 終了条件:maxTime に達した / 重心が goalX に達した / 転倒・組立不能(stopOnFail、既定 true)/
 * 停動が stallTimeout 秒続いた。
 * 決定論的:同じ入力なら同じ結果(地形も同じものを渡すこと)。
 */
export function runHeadless(input: SimInput, options: HeadlessOptions): HeadlessResult {
  const sim = new Walker(input);
  const dt = sim.params.dt;
  const stopOnFail = options.stopOnFail ?? true;
  const stallTimeout = options.stallTimeout ?? Infinity;
  const goalX = options.goalX;
  const maxSteps = Math.max(0, Math.ceil(options.maxTime / dt - 1e-9));
  const traceEvery = Math.max(1, Math.round(TRACE_INTERVAL / dt));
  const x0 = sim.com[0]!;

  const trace: PoseSample[] = [sim.poseSample()];
  let reachedGoal = goalX !== undefined && sim.com[0]! >= goalX;
  let goalTime: number | null = reachedGoal ? 0 : null;
  let stallTime = 0;
  let stallRun = 0;
  let maxTilt = sim.tilt;

  let step = 0;
  const failed = () => stopOnFail && (sim.fallen || sim.jammed);
  while (step < maxSteps && !reachedGoal && !failed() && stallRun < stallTimeout) {
    sim.step();
    step++;
    if (sim.stalled) {
      stallTime += dt;
      stallRun += dt;
    } else {
      stallRun = 0;
    }
    const tilt = sim.tilt;
    if (tilt > maxTilt) maxTilt = tilt;
    if (goalX !== undefined && sim.com[0]! >= goalX) {
      reachedGoal = true;
      goalTime = sim.time;
    }
    if (step % traceEvery === 0) trace.push(sim.poseSample());
  }
  if (step % traceEvery !== 0) trace.push(sim.poseSample());

  return {
    time: sim.time,
    distance: sim.com[0]! - x0,
    reachedGoal,
    goalTime,
    fallen: sim.fallen,
    stalled: sim.stalled,
    stallTime,
    jammed: sim.jammed,
    energy: sim.energy,
    maxTilt,
    trace,
  };
}
