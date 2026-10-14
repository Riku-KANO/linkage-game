import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useApp } from '@/app/store';
import type { Screen } from '@/ui/tokens';
import { damp } from '../rig/spring';
import { useSceneUi, type MenuItemId } from '../store';

/**
 * 物体に付いた小さな機構の「動き出し具合」(0..1)。ホバー中、または指定した画面にいる間 1 へ近づく。
 * 毎フレーム ref を書き換えるだけで React の再描画は起こさない。
 */
export function useActivity(
  id: MenuItemId | null,
  screens: readonly Screen[] = [],
  rate = 4,
): RefObject<number> {
  const ref = useRef(0);
  useFrame((_, dt) => {
    const hovered = id !== null && useSceneUi.getState().hovered === id;
    const app = useApp.getState();
    const target = hovered || screens.includes(app.screen) ? 1 : 0;
    ref.current = damp(ref.current, target, rate, dt);
  });
  return ref;
}
