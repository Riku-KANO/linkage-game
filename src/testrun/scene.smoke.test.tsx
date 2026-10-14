// @vitest-environment jsdom
import { act, advance, createRoot, extend, type ReconcilerRoot } from '@react-three/fiber';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { InstancedMesh, Mesh, type Object3D } from 'three';
import { jansenWalker } from '@/core/model/presets';
import type { TerrainSpec } from '@/core/sim/types';
import { syntheticWalkGhost } from '@/core/model/ghostFixture';
import { t } from '@/i18n';
import { createTestRunController } from './controller';
import { createKinematicPreviewSim } from './previewSim';
import { TestRunHud } from './TestRunHud';
import { TestRunScene } from './TestRunScene';
import { TestRunLights } from './TestRunLights';

/**
 * 煙テスト:WebGL なしで R3F の木を組み、手動でフレームを進めて、例外なく動き、
 * 毎フレームの更新(インスタンスの行列・カメラ)が起きることを確かめる。DOM の操作盤も押してみる。
 */

const course: TerrainSpec = {
  ground: { y: -0.6 },
  shapes: [
    { kind: 'box', min: [-3, -0.6, -0.9], max: [4, 0, 0.9] },
    { kind: 'box', min: [4, -0.6, -0.9], max: [7, 0.06, 0.9] },
    { kind: 'box', min: [7, -0.6, -0.9], max: [7.4, -0.25, 0.9] },
    { kind: 'ramp', x0: 7.4, x1: 9, y0: 0, y1: 0.1, z0: -0.9, z1: 0.9, bottom: -0.6 },
  ],
};
const stage = { start: { x: 0, z: 0 }, goal: { x: 12 } };

/** WebGLRenderer の代わり(R3F が触るところだけ) */
function stubRenderer(canvas: HTMLCanvasElement) {
  return {
    domElement: canvas,
    render: vi.fn(),
    setSize: () => {},
    setPixelRatio: () => {},
    dispose: () => {},
    forceContextLoss: () => {},
    renderLists: { dispose: () => {} },
    shadowMap: { enabled: false, type: 0, needsUpdate: false },
    outputColorSpace: 'srgb',
    toneMapping: 0,
    capabilities: { getMaxAnisotropy: () => 1 },
    // 環境マップ(CubeCamera.update)が使う
    autoClear: true,
    coordinateSystem: THREE.WebGLCoordinateSystem,
    xr: { enabled: false },
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
  };
}

beforeAll(() => {
  // <Canvas> を使わないので、R3F の部品の一覧に three を登録する
  extend(THREE as never);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom の canvas は 2D コンテキストを持たない(テクスチャは null で描かれる)。警告を黙らせる
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

let root: ReconcilerRoot<HTMLCanvasElement> | null = null;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
});

function collect(obj: Object3D, pred: (o: Object3D) => boolean, out: Object3D[] = []): Object3D[] {
  if (pred(obj)) out.push(obj);
  for (const c of obj.children) collect(c, pred, out);
  return out;
}

describe('TestRunScene (smoke)', () => {
  it('mounts in a Canvas, steps the sim and updates the machine every frame', async () => {
    const design = jansenWalker();
    const controller = createTestRunController({
      sim: createKinematicPreviewSim(design, course, { start: stage.start }),
      goalX: stage.goal.x,
    });
    const canvas = document.createElement('canvas');
    const gl = stubRenderer(canvas);
    root = createRoot(canvas);
    await root.configure({
      gl: gl as never,
      frameloop: 'never',
      size: { width: 800, height: 600, top: 0, left: 0 },
      events: undefined,
      shadows: true,
    });
    await act(async () =>
      root!.render(
        <TestRunScene
          controller={controller}
          design={design}
          terrain={course}
          stage={stage}
          ghost={syntheticWalkGhost(10)}
          options={{ shadows: true, highlightLinks: ['f'] }}
        />,
      ),
    );
    const camStart = { x: 0, y: 0, z: 0 };
    let scene: Object3D | null = null;
    await act(async () => {
      for (let i = 1; i <= 90; i++) advance(i / 60);
    });
    // シミュレーションが 1.5 秒進んだ
    expect(controller.clock.steps).toBe(360);
    expect(controller.getSnapshot().time).toBeCloseTo(1.5, 6);
    expect(gl.render).toHaveBeenCalled();
    const call = gl.render.mock.calls.at(-1) as [Object3D, Object3D];
    scene = call[0];
    const camera = call[1];
    // 追従カメラが機体の近くへ動いた
    expect(camera.position.x).not.toBe(camStart.x);
    const com = controller.getSnapshot().com;
    expect(Math.abs(camera.position.x - com.x)).toBeLessThan(6);
    expect(camera.position.y).toBeGreaterThan(0);

    // 機体のインスタンス:棒の行列が設計姿勢から書き換わり、有限
    const instanced = collect(scene, (o) => o instanceof InstancedMesh) as InstancedMesh[];
    expect(instanced.length).toBeGreaterThan(5);
    for (const m of instanced) {
      for (let i = 0; i < m.count * 16; i++) {
        expect(Number.isFinite(m.instanceMatrix.array[i]!)).toBe(true);
      }
    }
    // 本体とゴーストの 2 台分の機体グループが動いている(原点から離れた)
    const meshes = collect(scene, (o) => o instanceof Mesh);
    expect(meshes.length).toBeGreaterThan(10);
    const bodies = collect(
      scene,
      (o) =>
        o.type === 'Group' &&
        o.children.some((c) => c instanceof InstancedMesh) &&
        o.position.x > 0.1,
    );
    expect(bodies.length).toBeGreaterThanOrEqual(2);

    // 一時停止 → 進まない、リセット → 時刻 0
    controller.setPaused(true);
    await act(async () => {
      for (let i = 91; i <= 120; i++) advance(i / 60);
    });
    expect(controller.clock.steps).toBe(360);
    controller.reset();
    controller.setPaused(false);
    await act(async () => {
      advance(121 / 60);
    });
    expect(controller.getSnapshot().time).toBeLessThan(0.05);

    // 表示を全部切っても落ちない
    await act(async () => {
      controller.setShow({ trails: false, contacts: false, com: false, ghost: false });
      controller.setFollow(false);
    });
    await act(async () => {
      for (let i = 122; i <= 130; i++) advance(i / 60);
    });
    expect(controller.clock.steps).toBeGreaterThan(0);
  });
});

describe('TestRunLights (smoke)', () => {
  it('mounts the dusk lights and the light-former environment, and follows the focus', async () => {
    const canvas = document.createElement('canvas');
    const gl = stubRenderer(canvas);
    root = createRoot(canvas);
    await root.configure({
      gl: gl as never,
      frameloop: 'never',
      size: { width: 320, height: 240, top: 0, left: 0 },
      events: undefined,
      shadows: true,
    });
    const focus = { x: 5, y: 0.5, z: 0 };
    await act(async () => root!.render(<TestRunLights shadows getFocus={() => focus} />));
    await act(async () => {
      advance(1 / 60);
    });
    const scene = (gl.render.mock.calls.at(-1) as [THREE.Scene])[0];
    const suns = collect(scene, (o) => (o as THREE.DirectionalLight).isDirectionalLight === true);
    expect(suns.length).toBe(2);
    const sun = suns.find(
      (o) => (o as THREE.DirectionalLight).castShadow,
    ) as THREE.DirectionalLight;
    expect(sun.position.x).toBeCloseTo(focus.x - 3.5);
    expect(sun.target.position.x).toBeCloseTo(focus.x);
    expect(scene.environment).not.toBeNull();
  });
});

describe('TestRunHud (smoke)', () => {
  it('drives the controller from buttons and keys, and shows live readouts', async () => {
    const design = jansenWalker();
    const controller = createTestRunController({
      sim: createKinematicPreviewSim(design, undefined, { params: { motor: { stallTorque: 1 } } }),
    });
    render(<TestRunHud controller={controller} design={design} keyboard />);
    fireEvent.click(screen.getByLabelText(t('testrun.pause')));
    expect(controller.store.getState().paused).toBe(true);
    fireEvent.click(screen.getByLabelText(t('testrun.step')));
    expect(controller.clock.steps).toBe(1);
    fireEvent.click(screen.getByLabelText(t('testrun.speed.x', { s: 4 })));
    expect(controller.store.getState().speed).toBe(4);
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(controller.store.getState().paused).toBe(false);
    fireEvent.keyDown(window, { key: '2' });
    expect(controller.store.getState().speed).toBe(1);
    await act(async () => {
      for (let i = 0; i < 120; i++) controller.tick(1 / 60);
    });
    // 時間の表示が更新され、停動のバッジが出る
    expect(screen.getByText(t('testrun.time', { s: '2.0' }))).toBeTruthy();
    expect(screen.getByText(t('testrun.status.stalled'))).toBeTruthy();
    // 表示の切り替え:設計図を消す
    const designToggle = screen.getByRole('checkbox', { name: t('testrun.show.design') });
    fireEvent.click(designToggle);
    expect(controller.store.getState().show.design).toBe(false);
    fireEvent.keyDown(window, { key: 'r' });
    expect(controller.getSnapshot().time).toBe(0);
  });
});
