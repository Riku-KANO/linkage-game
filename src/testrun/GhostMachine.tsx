import { useCallback, useMemo } from 'react';
import type { ColorRepresentation } from 'three';
import type { Ghost } from '@/core/model/ghost';
import type { DesignDoc } from '@/core/model/types';
import { createGhostPlayer } from './ghostPlayer';
import { MachineModel } from './MachineModel';

/**
 * ゴースト(TR-6):前回の試走・共有相手の記録を半透明の機体で並走させる。
 * 姿勢は記録(10Hz)を補間し、脚はモーター角から運動学で再現する。時刻は getTime()(試走の
 * シミュレーション時刻)に合わせるので、一時停止・スロー・早送りにもそのまま付いてくる。
 */
export interface GhostMachineProps {
  /** ゴーストの機械の設計(共有相手の機械なら相手の設計) */
  design: DesignDoc;
  ghost: Ghost;
  /** 今のシミュレーション時刻(s)。useFrame の中で毎フレーム読む */
  getTime: () => number;
  /** 本体と重ならないようにずらす(m) */
  offset?: [number, number, number];
  color?: ColorRepresentation;
  opacity?: number;
}

export function GhostMachine({
  design,
  ghost,
  getTime,
  offset = [0, 0, 0],
  color = '#9fd8ff',
  opacity = 0.28,
}: GhostMachineProps) {
  const player = useMemo(() => createGhostPlayer(design, ghost), [design, ghost]);
  const getSnapshot = useCallback(
    () => (player.update(getTime()) ? player.snapshot : null),
    [player, getTime],
  );
  return (
    <group position={offset}>
      <MachineModel
        design={design}
        getSnapshot={getSnapshot}
        ghost
        ghostColor={color}
        ghostOpacity={opacity}
      />
    </group>
  );
}
