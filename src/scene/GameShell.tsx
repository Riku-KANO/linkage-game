import { useMemo, useState, type ReactNode } from 'react';
import type { Screen } from '@/ui/tokens';
import { WorkshopCanvas } from './WorkshopCanvas';
import { useReducedMotionSync, useTransitionInput } from './input';
import { OverlayLayer } from './overlay/OverlayLayer';
import { PLACEHOLDER_OVERLAYS, type ScreenOverlay } from './overlay/placeholders';
import { applyStoredPerfDecision } from './perf/PerfProbe';
import { preloadModels } from './env/ModelSlot';
import './scene.css';

export interface GameShellProps {
  /**
   * 画面ごとの DOM オーバーレイ(仮のものを上書きする)。例:`{ design: EditorOverlay }`。
   * カメラが行き先に着く頃にマウントされ、画面を離れるとアンマウントされる。
   */
  overlays?: Partial<Record<Screen, ScreenOverlay>>;
  /** 工房の中に足す 3D(R3F の要素) */
  scene3d?: ReactNode;
  /** オーバーレイ層に常に出す DOM(デバッグパネルなど) */
  children?: ReactNode;
}

/**
 * ゲームの外枠:全画面の工房(Canvas)と、その上の DOM オーバーレイ層。
 * 起動(boot)から始まり、ロゴが組み上がるとカメラが引いてホームになる(T-00)。
 */
export function GameShell({ overlays, scene3d, children }: GameShellProps) {
  // 保存済みの性能判定を Canvas より先に反映する(なければ起動中に測る)
  const [measurePerf] = useState(() => {
    // 置いてある GLB は最初に読み始める(カメラ移動の裏で読み終える)
    preloadModels();
    return !applyStoredPerfDecision();
  });
  useReducedMotionSync();
  useTransitionInput();
  const merged = useMemo(() => ({ ...PLACEHOLDER_OVERLAYS, ...overlays }), [overlays]);
  return (
    <div className="ak-shell">
      <WorkshopCanvas measurePerf={measurePerf}>{scene3d}</WorkshopCanvas>
      <OverlayLayer overlays={merged}>{children}</OverlayLayer>
    </div>
  );
}
