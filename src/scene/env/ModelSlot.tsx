import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import type { Mesh } from 'three';
import { modelUrl, presentModelUrls, type ModelId } from '../assets';

/**
 * Blender の GLB があればそれを、なければ手続き生成の形(children)を出す。
 * 置き換わるのは動かない部分だけ(リンク機構などの動く部品は手続き生成のまま)。
 * 読み込み中・読み込み失敗のときも手続き生成の形を出すので、画面が欠けたり止まったりしない。
 */
export function ModelSlot({ id, children }: { id: ModelId; children: ReactNode }) {
  const url = modelUrl(id);
  if (!url) return <>{children}</>;
  return (
    <ModelErrorBoundary fallback={children}>
      <Suspense fallback={children}>
        <GltfModel url={url} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

function GltfModel({ url }: { url: string }) {
  // Draco / Meshopt は使わない(デコーダーを外部から読まない)
  const gltf = useGLTF(url, false, false);
  const scene = useMemo(() => {
    const s = gltf.scene.clone(true);
    s.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return s;
  }, [gltf]);
  return <primitive object={scene} />;
}

class ModelErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** 置いてある GLB を先に読み込んでおく(カメラ移動の裏で読み、遷移を止めない) */
export function preloadModels(): void {
  for (const url of presentModelUrls()) useGLTF.preload(url, false, false);
}
