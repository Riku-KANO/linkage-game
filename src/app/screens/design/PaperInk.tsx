import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace, type Mesh } from 'three';
import { analyzeMechanism } from '@/core/kinematics';
import { useEditor } from '@/editor/store';
import { t } from '@/i18n';
import { PAPER_DESIGN, PAPER_WORLD } from '@/scene/layout';
import { designToWorld, type Insets } from '@/scene/rig/paper';
import { useSceneUi } from '@/scene/store';
import { drawDesignInk, inkBounds, inkRegion, type InkRegion } from './ink';
import { paperPxPerCm, predictPaperRect } from './layout';
import { designSignals } from './signals';

/** 紙の面から浮かせる高さ(m)。平行投影の深度精度(約 0.05mm)より十分大きく、見た目には分からない */
const LIFT = 0.0004;
/** 紙の上にエディタが出ている間は、最後の編集からこれだけ待ってから描き直す(ms) */
const LIVE_DEBOUNCE = 300;

/**
 * 3D の製図用紙に今の設計(useEditor)をインクで描く(INT-1)。
 * ホームからも、T-02 / T-07 で紙へ降りる途中も、T-03 で紙から離れるときも、紙の上にあるのは
 * プレイヤーの機械。設計画面に降りきると同じ位置に DOM のエディタが重なり、この板は隠れる。
 *
 * 描き直すのは設計か画面の大きさ(1 cm の画面 px)・画素比が変わったときだけ。
 * テクスチャは図面の外接矩形だけを覆い、降りきったときにテクスチャの 1 px が画面の 1 画素に重なる。
 */
export function PaperInk() {
  const mesh = useRef<Mesh>(null);
  const r = useMemo(
    () => ({
      canvas: null as HTMLCanvasElement | null,
      texture: null as CanvasTexture | null,
      region: null as InkRegion | null,
      dirty: true,
      changedAt: 0,
      key: '',
      hasInk: false,
    }),
    [],
  );
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        transparent: true,
        roughness: 0.92,
        metalness: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
      }),
    [],
  );

  useEffect(
    () =>
      useEditor.subscribe((s, prev) => {
        if (s.design === prev.design) return;
        r.dirty = true;
        r.changedAt = performance.now();
      }),
    [r],
  );

  useEffect(
    () => () => {
      r.texture?.dispose();
      material.dispose();
    },
    [r, material],
  );

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const live = designSignals.editorLive;
    const insets = useSceneUi.getState().paperInsets;
    const pxPerCm = paperPxPerCm(state.size.width, state.size.height, insets);
    const dpr = state.gl.getPixelRatio();
    const key = `${pxPerCm.toFixed(4)}|${dpr}`;
    if (key !== r.key) {
      r.key = key;
      r.dirty = true;
    }
    // 編集中は隠れているので急がない(ドラッグ中に毎フレーム描き直さない)
    if (r.dirty && !(live && performance.now() - r.changedAt < LIVE_DEBOUNCE)) {
      r.dirty = false;
      redraw(m, state.size, insets, pxPerCm, dpr);
    }
    m.visible = r.hasInk && !live;
  });

  function redraw(
    m: Mesh,
    size: { width: number; height: number },
    insets: Insets,
    pxPerCm: number,
    dpr: number,
  ) {
    if (typeof document === 'undefined') return;
    const design = useEditor.getState().design;
    const analysis = analyzeMechanism(design);
    const bounds = inkBounds(design, analysis);
    // 降りきったときの紙の左上:テクスチャの画素を画面の画素にそろえる
    const origin = predictPaperRect(size.width, size.height, insets);
    const region = bounds
      ? inkRegion(bounds, PAPER_DESIGN, pxPerCm, dpr, { origin: { x: origin.left, y: origin.top } })
      : null;
    r.region = region;
    if (!region) {
      r.hasInk = false;
      return;
    }
    // 大きさが変わったら作り直す(確保済みのテクスチャの大きさは変えられない)
    if (!r.canvas || r.canvas.width !== region.width || r.canvas.height !== region.height) {
      r.texture?.dispose();
      r.canvas = document.createElement('canvas');
      r.canvas.width = region.width;
      r.canvas.height = region.height;
      r.texture = new CanvasTexture(r.canvas);
      r.texture.colorSpace = SRGBColorSpace;
      r.texture.anisotropy = 8;
      material.map = r.texture;
      material.needsUpdate = true;
    }
    const ctx = r.canvas.getContext('2d');
    if (!ctx || !r.texture) {
      r.hasInk = false;
      return;
    }
    drawDesignInk(ctx, design, analysis, region, t('editor.label.foot'));
    r.texture.needsUpdate = true;
    // 板を図面の範囲に合わせる(紙の +x = 設計の +x、紙の奥 = 設計の +y)
    const { rect } = region;
    const [wx, wy, wz] = designToWorld((rect.minX + rect.maxX) / 2, (rect.minY + rect.maxY) / 2);
    const perCm = PAPER_WORLD.width / (PAPER_DESIGN.xMax - PAPER_DESIGN.xMin);
    m.position.set(wx, wy + LIFT, wz);
    m.scale.set((rect.maxX - rect.minX) * perCm, (rect.maxY - rect.minY) * perCm, 1);
    r.hasInk = true;
  }

  return (
    <mesh
      ref={mesh}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
      renderOrder={1}
      visible={false}
      receiveShadow
    >
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
