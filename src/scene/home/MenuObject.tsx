import { useEffect, useRef, type ReactNode } from 'react';
import { Html } from '@react-three/drei';
import { Select } from '@react-three/postprocessing';
import type { ThreeEvent } from '@react-three/fiber';
import type { Group, Material, Mesh } from 'three';
import { useApp } from '@/app/store';
import { t } from '@/i18n';
import { highlightOf } from '../env/materials';
import { useSceneUi, type MenuItemId } from '../store';
import { activateMenu, menuItem } from './menu';

/**
 * 工房の物体をメニュー項目にする。ホバーで輪郭が光り(通常:輪郭線、低性能:ほのかな発光)、
 * 名前のラベルが空間に浮かぶ。クリックでその画面へ遷移する。ホームにいる間だけ反応する。
 */
export function MenuObject({
  id,
  labelAt,
  children,
}: {
  id: MenuItemId;
  /** ラベルを浮かべる位置(ワールド、m) */
  labelAt: readonly [number, number, number];
  children: ReactNode;
}) {
  const hovered = useSceneUi((s) => s.hovered === id);
  const atHome = useApp((s) => s.screen === 'home');
  const lowPerf = useApp((s) => s.settings.lowPerf);
  const group = useRef<Group>(null);
  const lit = hovered && atHome;

  // ほのかな発光(輪郭線のない低性能モードでも「光る」が分かるように、常に併用する)
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    g.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const ud = m.userData as { baseMaterial?: Material };
      if (lit) {
        ud.baseMaterial ??= m.material as Material;
        m.material = highlightOf(ud.baseMaterial);
      } else if (ud.baseMaterial) {
        m.material = ud.baseMaterial;
      }
    });
  }, [lit]);

  const item = menuItem(id);
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const app = useApp.getState();
    if (app.screen !== 'home') return;
    useSceneUi.getState().setHovered(id);
    document.body.style.cursor = 'pointer';
  };
  const out = () => {
    if (useSceneUi.getState().hovered === id) useSceneUi.getState().setHovered(null);
    document.body.style.cursor = '';
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // ドラッグ(カメラ・機械の持ち上げ)の後のクリックは無視
    if (e.delta > 6) return;
    document.body.style.cursor = '';
    activateMenu(id);
  };

  return (
    <>
      <Select enabled={lit && !lowPerf}>
        <group ref={group} onPointerOver={over} onPointerOut={out} onClick={click}>
          {children}
        </group>
      </Select>
      {lit && (
        <Html position={[...labelAt]} center zIndexRange={[20, 10]} pointerEvents="none">
          <div className="ak-label" role="presentation">
            <span className="ak-label__name">{t(item.labelKey)}</span>
            <span className="ak-label__sub">{t(item.objectKey)}</span>
          </div>
        </Html>
      )}
    </>
  );
}
