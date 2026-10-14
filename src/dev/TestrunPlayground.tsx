import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { useStore } from 'zustand';
import { createGhostRecorder, type Ghost } from '@/core/model/ghost';
import { chebyshevLambda, fourBar, jansenWalker } from '@/core/model/presets';
import type { DesignDoc } from '@/core/model/types';
import type { TerrainSpec } from '@/core/sim/types';
import { t } from '@/i18n';
import {
  createKinematicPreviewSim,
  createTestRunController,
  TestRunHud,
  TestRunLights,
  TestRunScene,
  type TestRunController,
} from '@/testrun';

/**
 * 開発用プレイグラウンド(?dev=testrun)。見本機が「平地 → 段差 → 溝」のコースを歩く。
 * シミュレーションは運動学だけの簡易版(createKinematicPreviewSim)。
 */

type MachineId = 'jansen' | 'chebyshev' | 'fourBar';
type CourseId = 'sample' | 'flat';
type GhostId = 'none' | 'previous' | 'sample';

const MACHINES: Record<MachineId, () => DesignDoc> = {
  jansen: jansenWalker,
  chebyshev: () => chebyshevLambda(),
  fourBar: () => fourBar(),
};

const W = 0.9;
const COURSES: Record<CourseId, TerrainSpec> = {
  sample: {
    ground: { y: -0.6 },
    shapes: [
      { kind: 'box', min: [-3, -0.6, -W], max: [4, 0, W] },
      // 小さな段差(6cm)
      { kind: 'box', min: [4, -0.6, -W], max: [7, 0.06, W] },
      // 溝(幅 40cm、深さ 25cm)
      { kind: 'box', min: [7, -0.6, -W], max: [7.4, -0.25, W] },
      { kind: 'box', min: [7.4, -0.6, -W], max: [16, 0, W] },
    ],
  },
  flat: { ground: { y: 0 }, shapes: [] },
};

const STAGE = { start: { x: 0, z: 0 }, goal: { x: 13 } };

/** 少し遅い見本のゴースト(回転数 85%)を運動学の簡易シミュレーションで記録する */
function recordSampleGhost(
  design: DesignDoc,
  terrain: TerrainSpec,
): { design: DesignDoc; ghost: Ghost } {
  const slow: DesignDoc = { ...design, motor: { rpm: design.motor.rpm * 0.85 } };
  const sim = createKinematicPreviewSim(slow, terrain, { start: STAGE.start });
  const rec = createGhostRecorder(10);
  rec.record(sim.snapshot());
  for (let i = 1; i <= 240 * 30; i++) {
    sim.step();
    if (i % 24 === 0) rec.record(sim.snapshot());
  }
  return { design: slow, ghost: rec.ghost() };
}

/** 追従を切ったら、その場の機体を中心に回せるようにする */
function FreeOrbit({ controller }: { controller: TestRunController }) {
  const follow = useStore(controller.store, (s) => s.follow);
  const ref = useRef<ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || follow) return;
    const com = controller.getSnapshot().com;
    c.target.set(com.x, com.y, com.z);
    c.update();
  }, [follow, controller]);
  return <OrbitControls ref={ref} makeDefault enabled={!follow} enableDamping />;
}

const selectStyle = {
  background: '#2d2019',
  color: 'var(--text)',
  border: '1px solid rgba(242,166,90,0.35)',
  borderRadius: 6,
  padding: '3px 6px',
  font: 'inherit',
  fontSize: 13,
} as const;

export default function TestrunPlayground() {
  const [machine, setMachine] = useState<MachineId>('jansen');
  const [course, setCourse] = useState<CourseId>('sample');
  const [ghostId, setGhostId] = useState<GhostId>('previous');
  const [tipOver, setTipOver] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [shadows, setShadows] = useState(true);

  const design = useMemo(() => MACHINES[machine](), [machine]);
  const terrain = COURSES[course];
  const controller = useMemo(
    () =>
      createTestRunController({
        sim: createKinematicPreviewSim(design, terrain, {
          start: STAGE.start,
          tipOverAt: tipOver ? 4 : null,
        }),
        goalX: STAGE.goal.x,
      }),
    [design, terrain, tipOver],
  );
  const runId = useStore(controller.store, (s) => s.runId);
  const ghost = useMemo((): { design: DesignDoc; ghost: Ghost } | null => {
    if (ghostId === 'sample') return recordSampleGhost(design, terrain);
    if (ghostId === 'previous') {
      const g = controller.previousGhost();
      return g ? { design, ghost: g } : null;
    }
    return null;
    // runId:リセットのたびに前回の記録を取り直す
  }, [ghostId, design, terrain, controller, runId]);
  const highlightLinks = useMemo(() => {
    if (!highlight) return undefined;
    const l = design.links.find(
      (x) => !design.cranks.some((c) => c.link === x.id) && x.joints.length === 2,
    );
    return l ? [l.id] : undefined;
  }, [highlight, design]);

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <Canvas
        shadows={shadows}
        dpr={[1, 2]}
        camera={{ position: [2.5, 1.8, 4.5], fov: 40, near: 0.05, far: 250 }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <color attach="background" args={['#2a1d16']} />
        <fog attach="fog" args={['#2a1d16', 10, 38]} />
        <TestRunLights shadows={shadows} getFocus={() => controller.getSnapshot().com} />
        <TestRunScene
          controller={controller}
          design={design}
          terrain={terrain}
          stage={STAGE}
          ghost={ghost?.ghost ?? null}
          ghostDesign={ghost?.design}
          options={{ shadows, highlightLinks }}
        />
        <FreeOrbit controller={controller} />
      </Canvas>
      <TestRunHud
        controller={controller}
        design={design}
        keyboard
        highlightLinks={highlightLinks}
      />
      <div
        className="tr-panel"
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          padding: '10px 12px',
          display: 'grid',
          gap: 6,
          fontSize: 13,
          maxWidth: 300,
        }}
      >
        <strong style={{ fontSize: 14 }}>{t('testrun.dev.title')}</strong>
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>{t('testrun.dev.note')}</span>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {t('testrun.dev.machine')}
          <select
            style={selectStyle}
            value={machine}
            onChange={(e) => setMachine(e.target.value as MachineId)}
          >
            {(Object.keys(MACHINES) as MachineId[]).map((id) => (
              <option key={id} value={id}>
                {t(`testrun.dev.machine.${id}`)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {t('testrun.dev.course')}
          <select
            style={selectStyle}
            value={course}
            onChange={(e) => setCourse(e.target.value as CourseId)}
          >
            {(Object.keys(COURSES) as CourseId[]).map((id) => (
              <option key={id} value={id}>
                {t(`testrun.dev.course.${id}`)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {t('testrun.dev.ghost')}
          <select
            style={selectStyle}
            value={ghostId}
            onChange={(e) => setGhostId(e.target.value as GhostId)}
          >
            {(['none', 'previous', 'sample'] as GhostId[]).map((id) => (
              <option key={id} value={id}>
                {t(`testrun.dev.ghost.${id}`)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={tipOver} onChange={(e) => setTipOver(e.target.checked)} />
          {t('testrun.dev.tipOver')}
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={highlight}
            onChange={(e) => setHighlight(e.target.checked)}
          />
          {t('testrun.dev.highlight')}
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={shadows} onChange={(e) => setShadows(e.target.checked)} />
          {t('testrun.dev.shadows')}
        </label>
      </div>
    </div>
  );
}
