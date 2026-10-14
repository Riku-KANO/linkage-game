import { useMemo } from 'react';
import { ROOM, WINDOW } from '../layout';
import { box, mergeParts } from './geometry';
import { PALETTE, invisible, vcMatte } from './materials';

/**
 * 奥の壁の窓(「窓の外の荒野」= サンドボックス)。窓枠と、窓の開口を覆う見えない面
 * (マウスの当たり判定と輪郭線用)。ホバーすると外の風車が勢いよく回る(Wasteland の Windmill)。
 */
export function WindowHotspot() {
  const frame = useMemo(() => {
    const T = ROOM.wallThickness;
    const fw = 0.08;
    const wx = (WINDOW.xMin + WINDOW.xMax) / 2;
    const ww = WINDOW.xMax - WINDOW.xMin;
    const wh = WINDOW.yMax - WINDOW.yMin;
    const wy = (WINDOW.yMin + WINDOW.yMax) / 2;
    return mergeParts([
      box([ww + 2 * fw, fw, T + 0.08], [wx, WINDOW.yMax + fw / 2, ROOM.zBack], PALETTE.woodDark),
      box([fw, wh, T + 0.08], [WINDOW.xMin - fw / 2, wy, ROOM.zBack], PALETTE.woodDark),
      box([fw, wh, T + 0.08], [WINDOW.xMax + fw / 2, wy, ROOM.zBack], PALETTE.woodDark),
      // 窓台は内側へ張り出す
      box([ww + 0.3, 0.05, T + 0.22], [wx, WINDOW.yMin - 0.025, ROOM.zBack + 0.07], PALETTE.wood),
    ]);
  }, []);
  return (
    <group>
      <mesh geometry={frame} material={vcMatte} castShadow receiveShadow />
      <mesh
        position={[(WINDOW.xMin + WINDOW.xMax) / 2, (WINDOW.yMin + WINDOW.yMax) / 2, ROOM.zBack]}
        material={invisible}
      >
        <planeGeometry args={[WINDOW.xMax - WINDOW.xMin, WINDOW.yMax - WINDOW.yMin]} />
      </mesh>
    </group>
  );
}
