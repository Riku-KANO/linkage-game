import { describe, expect, it } from 'vitest';
import { buildDioramaLayout } from './diorama';
import { buildDioramaTerrain } from './terrain';

describe('ジオラマの地形', () => {
  it('1 つのジオメトリ(位置・法線・頂点色)にまとまり、値はすべて有限', () => {
    const g = buildDioramaTerrain(buildDioramaLayout());
    const pos = g.getAttribute('position');
    expect(pos.count).toBeGreaterThan(1000);
    expect(g.getAttribute('normal').count).toBe(pos.count);
    expect(g.getAttribute('color').count).toBe(pos.count);
    for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true);
    // 模型の板の上(砂地より上、高さ 30cm 未満)に収まる
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeGreaterThanOrEqual(0);
    expect(g.boundingBox!.max.y).toBeLessThan(0.3);
    g.dispose();
  });
});
