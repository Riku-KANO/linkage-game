import { useMemo } from 'react';
import type { WalkerSim } from '@/core/sim/types';
import {
  createTestRunController,
  type TestRunController,
  type TestRunControllerOptions,
} from './controller';

/**
 * sim から試走の進行役を作って保つ(sim が変わったら作り直す)。
 * options は作るときに 1 回だけ読む(変えたいときは sim を作り直すか key を変える)。
 */
export function useTestRunController(
  sim: WalkerSim,
  options: Omit<TestRunControllerOptions, 'sim'> = {},
): TestRunController {
  // options は作成時だけ使う(毎回の新しいオブジェクトで作り直さない)
  return useMemo(() => createTestRunController({ ...options, sim }), [sim]);
}
