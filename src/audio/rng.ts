/**
 * 効果音用のシード付き乱数と雑音の生成(純粋関数)。
 * Math.random は使わない:同じシードなら毎回同じ音の素材になる。
 */

/** mulberry32:32 ビット状態の小さな擬似乱数。[0, 1) を返す */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type NoiseKind =
  /** 白色雑音:擦れ・カチッの芯・風切り */
  | 'white'
  /** まばらな粒の雑音:歯車の噛み合い・ざらつき */
  | 'crackle';

/** ループのつなぎ目のフェード長(サンプル) */
const EDGE_FADE = 64;

/**
 * 雑音で配列を埋める。ループ再生しても継ぎ目でプツッと鳴らないよう、両端を短くフェードする。
 */
export function fillNoise(out: Float32Array, seed: number, kind: NoiseKind): void {
  const rnd = mulberry32(seed);
  const n = out.length;
  if (kind === 'white') {
    for (let i = 0; i < n; i++) out[i] = rnd() * 2 - 1;
  } else {
    // 粒の密度は 1 サンプルあたり約 1.5%(48kHz で毎秒 700 粒ほど)
    for (let i = 0; i < n; i++) {
      const r = rnd();
      out[i] = r < 0.015 ? (rnd() * 2 - 1) * (0.4 + 0.6 * rnd()) : 0;
    }
  }
  const fade = Math.min(EDGE_FADE, Math.floor(n / 2));
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    out[i] = out[i]! * g;
    out[n - 1 - i] = out[n - 1 - i]! * g;
  }
}
