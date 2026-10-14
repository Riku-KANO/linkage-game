import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';
import { jansenWalker } from '@/core/model/presets';
import { basicLeg } from '@/game/designs';
import { createMachineRig, disposeMachineRig, writeMachineInstances } from './machine';

describe('機械の模型', () => {
  it('ヤンセン型:棒とピンの数は見本機と同じで、前に進む', () => {
    const rig = createMachineRig(jansenWalker());
    expect(rig.model.bars).toHaveLength(132);
    expect(rig.model.pins).toHaveLength(96);
    expect(rig.stride).toBeGreaterThan(1);
    disposeMachineRig(rig);
  });

  it('解いた姿勢をインスタンスの行列に書く(値はすべて有限)', () => {
    const rig = createMachineRig(basicLeg());
    const mat = new MeshBasicMaterial();
    const bars = new InstancedMesh(rig.barGeo, mat, rig.model.bars.length);
    const pins = new InstancedMesh(rig.pinGeo, mat, rig.model.pins.length);
    rig.gait.step(0.3);
    writeMachineInstances(rig.model, bars, pins);
    const m = new Matrix4();
    for (let i = 0; i < bars.count; i++) {
      bars.getMatrixAt(i, m);
      for (const v of m.elements) expect(Number.isFinite(v)).toBe(true);
    }
    expect(bars.instanceMatrix.version).toBeGreaterThan(0);
    expect(pins.instanceMatrix.version).toBeGreaterThan(0);
    disposeMachineRig(rig);
  });
});
