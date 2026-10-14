import { describe, expect, it } from 'vitest';
import {
  MIN_SAMPLES,
  PERF_STORAGE_KEY,
  classifyGpu,
  loadPerfDecision,
  median,
  savePerfDecision,
} from './gpu';

const frames = (ms: number, n = 60) => Array.from({ length: n }, (_, i) => ms + (i % 3) * 0.3);

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('classifyGpu', () => {
  it('ソフトウェア描画は低性能', () => {
    for (const r of [
      'Google SwiftShader',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'Microsoft Basic Render Driver',
    ]) {
      expect(classifyGpu(r, frames(16)).lowPerf).toBe(true);
      expect(classifyGpu(r, []).reason).toBe('software');
    }
  });

  it('内蔵 GPU でも 60fps 出ていれば通常モード', () => {
    const d = classifyGpu('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)', frames(16.7));
    expect(d.lowPerf).toBe(false);
    expect(d.medianMs).toBeCloseTo(16.9, 0);
  });

  it('描画時間の中央値が遅ければ低性能', () => {
    expect(classifyGpu('Apple GPU', frames(30)).lowPerf).toBe(true);
    expect(classifyGpu('Apple GPU', frames(30)).reason).toBe('slow');
  });

  it('最初の数フレームが遅くても(シェーダーのコンパイル)中央値で判断する', () => {
    const xs = [...frames(200, 8), ...frames(16, 52)];
    expect(classifyGpu(null, xs).lowPerf).toBe(false);
  });

  it('サンプルが少なければ名前だけで決める', () => {
    expect(classifyGpu(null, frames(40, MIN_SAMPLES - 1)).lowPerf).toBe(false);
  });

  it('median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe('判定の保存', () => {
  it('往復で一致する', () => {
    const s = new MemoryStorage();
    savePerfDecision(s, { lowPerf: true, reason: 'slow', medianMs: 31 });
    expect(loadPerfDecision(s)).toEqual({ lowPerf: true, reason: 'slow', medianMs: 31 });
  });

  it('壊れたデータは null(落ちない)', () => {
    const s = new MemoryStorage();
    for (const raw of ['{', 'null', '42', '{"lowPerf":"yes"}', '{"lowPerf":true,"reason":"x"}']) {
      s.setItem(PERF_STORAGE_KEY, raw);
      expect(loadPerfDecision(s)).toBeNull();
    }
    expect(loadPerfDecision(null)).toBeNull();
  });

  it('書き込みで例外が出ても落ちない', () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => savePerfDecision(throwing, { lowPerf: false, reason: 'ok' })).not.toThrow();
  });
});
