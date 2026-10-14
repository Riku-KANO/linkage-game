import { useMemo } from 'react';
import { BENCH, BENCH_WALK } from '../layout';
import { KinematicWalker } from '../walker/KinematicWalker';
import { fitScale, REFERENCE_EXTENT } from './miniature';
import { useWorld } from './store';

/**
 * 作業台の見本機(WORLD-2):プレイヤーの最新の機械(useWorld().machineDesign)が歩く。
 * まだなければヤンセン型の見本機。大きさは見本機と同じくらいの机の上のおもちゃにそろえる。
 */
export function BenchWalker() {
  const design = useWorld((s) => s.machineDesign);
  const scale = useMemo(
    () => (design ? fitScale(design, REFERENCE_EXTENT * BENCH_WALK.scale) : BENCH_WALK.scale),
    [design],
  );
  return (
    <KinematicWalker
      {...(design ? { design } : {})}
      scale={scale}
      bounds={BENCH_WALK}
      groundY={BENCH.top}
      rpm={24}
      draggable
      dragArea={{
        xMin: BENCH.center[0] - BENCH.width / 2 + 0.2,
        xMax: BENCH.center[0] + BENCH.width / 2 - 0.2,
        zMin: BENCH.center[2] - BENCH.depth / 2 + 0.15,
        zMax: BENCH.center[2] + BENCH.depth / 2 - 0.15,
      }}
    />
  );
}
