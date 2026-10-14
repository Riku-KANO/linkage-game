import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace, type Mesh } from 'three';
import { analyzeMechanism } from '@/core/kinematics';
import { useEditor } from '@/editor/store';
import { t } from '@/i18n';
import { drawPaperSheet, paperSheetHeight } from '@/scene/env/paperTexture';
import { PAPER_DESIGN, PAPER_WORLD } from '@/scene/layout';
import { designToWorld, type Insets } from '@/scene/rig/paper';
import { useSceneUi } from '@/scene/store';
import { drawSheet, sheetRegion, type SheetRegion } from './ink';
import { paperPxPerCm, predictPaperRect } from './layout';
import { designSignals } from './signals';

/** 紙の面から浮かせる高さ(m)。平行投影の深度精度(約 0.05mm)より十分大きく、見た目には分からない */
const LIFT = 0.0004;
/** 紙の上にエディタが出ている間は、最後の編集からこれだけ待ってから描き直す(ms) */
const LIVE_DEBOUNCE = 300;
/** 紙の絵を描くときの基準の幅(scene の紙のテクスチャと同じ座標で描き、縮めて写す) */
const PAINTER = { draw: drawPaperSheet, width: 2048, height: paperSheetHeight(2048) };

interface Layer {
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
}

/**
 * 3D の製図用紙に今の設計(useEditor)をインクで描く(INT-1)。
 * ホームからも、T-02 / T-07 で紙へ降りる途中も、T-03 で紙から離れるときも、紙の上にあるのはプレイヤーの機械。
 *
 * 紙にぴったり重なる不透明な板で、紙の絵ごと設計画面の画素の細かさで描き直したテクスチャを貼る
 * (ink.ts)。テクスチャは 2 枚:
 * - 紙+図面:エディタが出ていない間(ホーム・遷移中)
 * - 紙だけ:設計画面に降りきって DOM のエディタが重なっている間(図面はエディタの SVG が描く)。
 *   紙の見え方(画素の細かさ)は切り替わりの前後で変わらない
 * 描き直すのは設計か、画面の大きさ(1 cm の画面 px)・画素比が変わったときだけ。
 */
export function PaperInk() {
  const mesh = useRef<Mesh>(null);
  const r = useMemo(
    () => ({
      sheet: null as Layer | null,
      inked: null as Layer | null,
      region: null as SheetRegion | null,
      key: '',
      inkDirty: true,
      changedAt: 0,
    }),
    [],
  );
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.92,
        metalness: 0,
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
        r.inkDirty = true;
        r.changedAt = performance.now();
      }),
    [r],
  );

  useEffect(
    () => () => {
      r.sheet?.texture.dispose();
      r.inked?.texture.dispose();
      material.dispose();
    },
    [r, material],
  );

  useFrame((state) => {
    const m = mesh.current;
    if (!m || typeof document === 'undefined') return;
    const live = designSignals.editorLive;
    const insets = useSceneUi.getState().paperInsets;
    const pxPerCm = paperPxPerCm(state.size.width, state.size.height, insets);
    const dpr = state.gl.getPixelRatio();
    const key = `${state.size.width}x${state.size.height}|${pxPerCm.toFixed(5)}|${dpr}`;
    if (key !== r.key) {
      // 画面の大きさが変わった:範囲と解像度を決め直し、紙の絵を描き直す
      r.key = key;
      r.region = layoutRegion(m, state.size, insets, pxPerCm, dpr);
      r.sheet = r.region ? paint(r.sheet, r.region, false) : null;
      r.inkDirty = true;
      r.changedAt = 0;
    }
    const region = r.region;
    if (!region || !r.sheet) {
      m.visible = false;
      return;
    }
    // 編集中は図面の板は見えていないので急がない(ドラッグ中に毎フレーム描き直さない)
    if (r.inkDirty && !(live && performance.now() - r.changedAt < LIVE_DEBOUNCE)) {
      r.inkDirty = false;
      r.inked = paint(r.inked, region, true);
    }
    const layer = live || !r.inked ? r.sheet : r.inked;
    if (material.map !== layer.texture) {
      material.map = layer.texture;
      material.needsUpdate = true;
    }
    m.visible = true;
  });

  /** 板の範囲(設計画面での紙の画素にそろえる)と、板の置き場所 */
  function layoutRegion(
    m: Mesh,
    size: { width: number; height: number },
    insets: Insets,
    pxPerCm: number,
    dpr: number,
  ): SheetRegion | null {
    const origin = predictPaperRect(size.width, size.height, insets);
    const region = sheetRegion(PAPER_DESIGN, pxPerCm, dpr, {
      origin: { x: origin.left, y: origin.top },
    });
    if (!region) return null;
    // 紙の +x = 設計の +x、紙の奥 = 設計の +y
    const { rect } = region;
    const [wx, wy, wz] = designToWorld((rect.minX + rect.maxX) / 2, (rect.minY + rect.maxY) / 2);
    const perCm = PAPER_WORLD.width / (PAPER_DESIGN.xMax - PAPER_DESIGN.xMin);
    m.position.set(wx, wy + LIFT, wz);
    m.scale.set((rect.maxX - rect.minX) * perCm, (rect.maxY - rect.minY) * perCm, 1);
    return region;
  }

  /** 板のテクスチャを描く(大きさが変わったら作り直す:確保済みのテクスチャの大きさは変えられない) */
  function paint(layer: Layer | null, region: SheetRegion, withInk: boolean): Layer | null {
    let l = layer;
    if (!l || l.canvas.width !== region.width || l.canvas.height !== region.height) {
      l?.texture.dispose();
      const canvas = document.createElement('canvas');
      canvas.width = region.width;
      canvas.height = region.height;
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 8;
      l = { canvas, texture };
    }
    const ctx = l.canvas.getContext('2d');
    if (!ctx) return null;
    let ink = null;
    if (withInk) {
      const design = useEditor.getState().design;
      ink = { design, analysis: analyzeMechanism(design), footLabel: t('editor.label.foot') };
    }
    drawSheet(ctx, region, PAPER_DESIGN, PAINTER, ink);
    l.texture.needsUpdate = true;
    return l;
  }

  return (
    <mesh
      ref={mesh}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
      visible={false}
      receiveShadow
    >
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
