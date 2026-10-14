/**
 * 効果音の「譜面」(純粋なデータと関数)。Web Audio に依存しない。
 * 音はすべて、雑音の破裂(カチッ・擦れ)、減衰する部分音の束(モード共鳴)、
 * 雑音の掃引(風切り)の重ね合わせで書く。描画は render.ts が受け持つ。
 *
 * 素材の作り分け:
 * - 金属:部分音が非整数倍(自由端の棒 1 : 2.756 : 5.404、円板 1 : 1.594 : 2.136 …)で長く響く
 * - 木 :低めで部分音の減衰が速い(0.1 秒以内)。打撃の瞬間に音程がわずかに落ちる
 */
import type { NoiseKind } from './rng';
import type { SfxName } from './sfx';

export const SFX_NAMES: readonly SfxName[] = [
  'snap',
  'press',
  'release',
  'error',
  'whoosh',
  'gear',
  'stamp',
  'step',
  'success',
];

/** 雑音の破裂:クリックの芯、接触の擦れ、衝撃の胴 */
export interface NoiseLayer {
  kind: 'noise';
  /** 開始(秒) */
  at: number;
  noise: NoiseKind;
  filter: 'lowpass' | 'highpass' | 'bandpass';
  freq: number;
  /** 終わりの遮断周波数(指定すると指数的に動かす) */
  freqEnd?: number;
  q: number;
  attack: number;
  /** -60dB まで落ちる時間(秒) */
  decay: number;
  gain: number;
  /** 雑音バッファのどこから読むか 0..1(呼ぶたびに変えて同じ音の繰り返しを避ける) */
  offset: number;
}

export interface ModalPartial {
  /** 基本周波数に対する比 */
  ratio: number;
  gain: number;
  /** -60dB まで落ちる時間(秒) */
  decay: number;
}

/** 減衰する正弦波の束(簡易なモード共鳴) */
export interface ModalLayer {
  kind: 'modal';
  at: number;
  material: 'metal' | 'wood';
  base: number;
  partials: readonly ModalPartial[];
  attack: number;
  /** 打撃の瞬間の音程の持ち上がり(倍率)。dropTime かけて 1 に戻る */
  drop?: number;
  dropTime?: number;
}

/** 雑音の帯域通過を掃引する(カメラ移動の風切り) */
export interface SweepLayer {
  kind: 'sweep';
  at: number;
  duration: number;
  /** 中心周波数:始まり・山・終わり */
  freqs: readonly [number, number, number];
  q: number;
  gain: number;
  /** 山の位置(長さに対する比 0..1) */
  peakAt: number;
  /** 定位:始まり → 終わり */
  pan: readonly [number, number];
  offset: number;
}

export type Layer = NoiseLayer | ModalLayer | SweepLayer;

/** 再生速度に対する音程の追従率(1 = テープの早回し、0 = 音程は変えない) */
export const PITCH_FOLLOW: Record<SfxName, number> = {
  snap: 1,
  press: 1,
  release: 1,
  error: 1,
  whoosh: 0.5,
  gear: 0.35,
  stamp: 1,
  step: 1,
  success: 1,
};

type Rand = () => number;

/** x を ±amount の範囲で揺らす */
function vary(rnd: Rand, x: number, amount: number): number {
  return x * (1 + amount * (rnd() * 2 - 1));
}

// --- 部分音の比(実測の近似) --------------------------------------------------
/** 自由端の棒(音叉・小さな金具) */
const BAR = [1, 2.756, 5.404] as const;
/** 木の板・ブロック(低次が強く、上は速く減衰) */
const WOOD = [1, 2.31, 3.89] as const;

function bar(gains: readonly number[], decays: readonly number[]): ModalPartial[] {
  return gains.map((g, i) => ({ ratio: BAR[i]!, gain: g, decay: decays[i]! }));
}

function wood(gains: readonly number[], decays: readonly number[]): ModalPartial[] {
  return gains.map((g, i) => ({ ratio: WOOD[i]!, gain: g, decay: decays[i]! }));
}

function click(
  rnd: Rand,
  at: number,
  filter: NoiseLayer['filter'],
  freq: number,
  q: number,
  decay: number,
  gain: number,
): NoiseLayer {
  return {
    kind: 'noise',
    at,
    noise: 'white',
    filter,
    freq,
    q,
    attack: 0.0004,
    decay,
    gain,
    offset: rnd(),
  };
}

// --- 各効果音 -------------------------------------------------------------------

/** カチッ:爪が当たる「カ」+はまり切る「チッ」+小さな金属の響き */
function snap(rnd: Rand): Layer[] {
  const p = vary(rnd, 1, 0.03);
  const g = vary(rnd, 1, 0.08);
  const t2 = vary(rnd, 0.014, 0.12);
  return [
    click(rnd, 0, 'bandpass', 2300 * p, 1.2, 0.012, 0.8 * g),
    {
      kind: 'modal',
      at: 0,
      material: 'wood',
      base: 420 * p,
      partials: wood([0.16, 0.06], [0.03, 0.018]),
      attack: 0.0008,
    },
    click(rnd, t2, 'highpass', 4200 * p, 0.7, 0.008, 0.28 * g),
    {
      kind: 'modal',
      at: t2,
      material: 'metal',
      base: 2900 * vary(rnd, p, 0.02),
      partials: bar([0.07, 0.035, 0.014], [0.09, 0.05, 0.03]),
      attack: 0.0005,
    },
  ];
}

/** ボタンが沈む:木の胴鳴り+接触の擦れ+リンクのかすかな金属音 */
function press(rnd: Rand): Layer[] {
  const p = vary(rnd, 1, 0.03);
  const g = vary(rnd, 1, 0.06);
  return [
    {
      kind: 'modal',
      at: 0,
      material: 'wood',
      base: 175 * p,
      partials: wood([0.4 * g, 0.15 * g, 0.06 * g], [0.075, 0.045, 0.025]),
      attack: 0.0015,
      drop: 1.25,
      dropTime: 0.018,
    },
    {
      kind: 'noise',
      at: 0,
      noise: 'white',
      filter: 'lowpass',
      freq: 1400 * p,
      q: 0.7,
      attack: 0.001,
      decay: 0.03,
      gain: 0.35 * g,
      offset: rnd(),
    },
    click(rnd, 0.009, 'bandpass', 3600 * p, 3, 0.006, 0.25 * g),
    {
      kind: 'modal',
      at: 0.009,
      material: 'metal',
      base: 2450 * p,
      partials: bar([0.025, 0.012], [0.04, 0.025]),
      attack: 0.0005,
    },
  ];
}

/** ボタンが戻る:爪が外れる軽いクリック+軽い木の音 */
function release(rnd: Rand): Layer[] {
  const p = vary(rnd, 1, 0.03);
  const g = vary(rnd, 1, 0.06);
  return [
    click(rnd, 0, 'bandpass', 2800 * p, 2, 0.006, 0.3 * g),
    {
      kind: 'modal',
      at: 0.006,
      material: 'wood',
      base: 270 * p,
      partials: wood([0.2 * g, 0.08 * g, 0.035 * g], [0.05, 0.03, 0.018]),
      attack: 0.0015,
      drop: 1.12,
      dropTime: 0.012,
    },
    {
      kind: 'noise',
      at: 0.006,
      noise: 'white',
      filter: 'lowpass',
      freq: 2000 * p,
      q: 0.7,
      attack: 0.001,
      decay: 0.018,
      gain: 0.2 * g,
      offset: rnd(),
    },
  ];
}

/** 組立不能・死点:詰まった「ゴッ」+不揃いな金属のガタつき */
function error(rnd: Rand): Layer[] {
  const p = vary(rnd, 1, 0.02);
  const layers: Layer[] = [
    {
      kind: 'modal',
      at: 0,
      material: 'wood',
      base: 130 * p,
      partials: wood([0.32, 0.09], [0.07, 0.04]),
      attack: 0.0015,
      drop: 1.3,
      dropTime: 0.02,
    },
    {
      kind: 'noise',
      at: 0,
      noise: 'white',
      filter: 'lowpass',
      freq: 900 * p,
      q: 0.7,
      attack: 0.001,
      decay: 0.03,
      gain: 0.4,
      offset: rnd(),
    },
  ];
  const times = [0.018, 0.043, 0.061, 0.088, 0.112];
  times.forEach((t0, i) => {
    const k = 1 - i * 0.15;
    const at = t0 + (rnd() * 2 - 1) * 0.004;
    layers.push(click(rnd, at, 'bandpass', 2100 * vary(rnd, p, 0.02), 4, 0.01, 0.6 * k));
    layers.push({
      kind: 'modal',
      at,
      material: 'metal',
      base: 1180 * vary(rnd, p, 0.02) * (1 - i * 0.02),
      // 薄い板のガタつき:不協和な比
      partials: [
        { ratio: 1, gain: 0.06 * k, decay: 0.035 },
        { ratio: 1.47, gain: 0.04 * k, decay: 0.028 },
        { ratio: 2.09, gain: 0.025 * k, decay: 0.02 },
      ],
      attack: 0.0005,
    });
  });
  return layers;
}

/** カメラ移動の風切り:控えめな雑音の掃引。0.6 秒(rate で伸縮) */
function whoosh(rnd: Rand): Layer[] {
  const p = vary(rnd, 1, 0.04);
  const dir = rnd() < 0.5 ? -1 : 1;
  return [
    {
      kind: 'sweep',
      at: 0,
      duration: 0.6,
      freqs: [320 * p, 1300 * p, 520 * p],
      q: 0.9,
      gain: 0.3,
      peakAt: 0.45,
      pan: [-0.3 * dir, 0.3 * dir],
      offset: rnd(),
    },
    {
      kind: 'sweep',
      at: 0,
      duration: 0.6,
      freqs: [160 * p, 480 * p, 220 * p],
      q: 0.7,
      gain: 0.25,
      peakAt: 0.4,
      pan: [-0.15 * dir, 0.15 * dir],
      offset: rnd(),
    },
  ];
}

/** 歯車メーター:ラチェットの刻み 6 つ(少しずつ遅くなる)。rate で刻む速さが変わる */
function gear(rnd: Rand): Layer[] {
  const p = vary(rnd, 1, 0.03);
  const layers: Layer[] = [];
  let t = 0;
  let interval = 0.042;
  for (let i = 0; i < 6; i++) {
    const k = 1 - i * 0.08;
    // 爪と歯が交互に当たるので音程が 1 つおきに少し違う
    const alt = i % 2 === 1 ? 1.06 : 1;
    layers.push(click(rnd, t, 'bandpass', 3300 * alt * p, 2.5, 0.005, 0.5 * k));
    layers.push({
      kind: 'modal',
      at: t,
      material: 'metal',
      base: 1850 * alt * vary(rnd, p, 0.01),
      partials: bar([0.05 * k, 0.02 * k], [0.028, 0.015]),
      attack: 0.0004,
    });
    t += interval * vary(rnd, 1, 0.05);
    interval *= 1.04;
  }
  return layers;
}

/** メダルの刻印:プレスの重い打撃+円板の金属の響き(うなり付き) */
function stamp(rnd: Rand): Layer[] {
  const p = vary(rnd, 1, 0.02);
  return [
    {
      kind: 'modal',
      at: 0,
      material: 'metal',
      base: 62 * p,
      partials: [{ ratio: 1, gain: 0.5, decay: 0.22 }],
      attack: 0.002,
      drop: 1.6,
      dropTime: 0.06,
    },
    {
      kind: 'noise',
      at: 0,
      noise: 'white',
      filter: 'lowpass',
      freq: 700 * p,
      q: 0.8,
      attack: 0.001,
      decay: 0.06,
      gain: 0.8,
      offset: rnd(),
    },
    click(rnd, 0, 'bandpass', 2400 * p, 1.5, 0.012, 0.5),
    {
      kind: 'modal',
      at: 0.002,
      material: 'metal',
      base: 940 * p,
      // 円板のモード比。最初の 2 本をわずかにずらして「うなり」を作る
      partials: [
        { ratio: 1, gain: 0.11, decay: 0.9 },
        { ratio: 1.0023, gain: 0.07, decay: 0.85 },
        { ratio: 1.594, gain: 0.07, decay: 0.6 },
        { ratio: 2.136, gain: 0.05, decay: 0.45 },
        { ratio: 2.653, gain: 0.035, decay: 0.32 },
        { ratio: 3.156, gain: 0.022, decay: 0.22 },
        { ratio: 4.07, gain: 0.01, decay: 0.14 },
      ],
      attack: 0.0008,
    },
    {
      kind: 'modal',
      at: 0,
      material: 'metal',
      base: 210 * p,
      // 鉄の台の低い響き
      partials: [
        { ratio: 1, gain: 0.09, decay: 0.25 },
        { ratio: 1.71, gain: 0.045, decay: 0.15 },
      ],
      attack: 0.0015,
    },
  ];
}

/** 脚の接地:柔らかい木・ゴムの「トッ」。呼ぶたびに少しずつ違う */
function step(rnd: Rand): Layer[] {
  const p = vary(rnd, 1, 0.045);
  const g = vary(rnd, 1, 0.15);
  return [
    {
      kind: 'modal',
      at: 0,
      material: 'wood',
      base: 95 * p,
      partials: wood([0.42 * g, 0.09 * g], [0.09, 0.035]),
      attack: 0.002,
      drop: 1.35,
      dropTime: 0.025,
    },
    {
      kind: 'noise',
      at: 0,
      noise: 'white',
      filter: 'lowpass',
      freq: 650 * p,
      q: 0.7,
      attack: 0.0015,
      decay: 0.03,
      gain: 0.35 * g,
      offset: rnd(),
    },
    click(rnd, 0, 'bandpass', 1500 * p, 1.4, 0.008, 0.15 * g),
  ];
}

/** 成功:ラッチが掛かる小さなクリックのあと、小さな金属の棒を 2 本(5 度)順に打つ */
function success(rnd: Rand): Layer[] {
  const p = vary(rnd, 1, 0.01);
  const tine = (at: number, base: number, g: number): ModalLayer => ({
    kind: 'modal',
    at,
    material: 'metal',
    base: base * p,
    partials: [
      { ratio: 1, gain: 0.11 * g, decay: 0.75 },
      { ratio: 1.0018, gain: 0.05 * g, decay: 0.7 },
      { ratio: BAR[1], gain: 0.03 * g, decay: 0.22 },
      { ratio: BAR[2], gain: 0.01 * g, decay: 0.08 },
    ],
    attack: 0.001,
  });
  return [
    click(rnd, 0, 'bandpass', 3800 * p, 2, 0.006, 0.25),
    tine(0.02, 1175, 1),
    tine(0.12, 1760, 0.85),
  ];
}

const BUILDERS: Record<SfxName, (rnd: Rand) => Layer[]> = {
  snap,
  press,
  release,
  error,
  whoosh,
  gear,
  stamp,
  step,
  success,
};

/** 効果音の譜面を作る。rnd は呼ぶたびの小さな揺らぎに使う(シード付き乱数) */
export function buildSfx(name: SfxName, rnd: Rand): Layer[] {
  const b = BUILDERS[name] as ((rnd: Rand) => Layer[]) | undefined;
  return b ? b(rnd) : [];
}

/** 再生速度を掛ける:時間は 1/rate、周波数は rate^pitchFollow */
export function applyRate(layers: readonly Layer[], rate: number, pitchFollow: number): Layer[] {
  const tk = 1 / rate;
  const fk = Math.pow(rate, pitchFollow);
  return layers.map((l): Layer => {
    switch (l.kind) {
      case 'noise':
        return {
          ...l,
          at: l.at * tk,
          attack: l.attack * tk,
          decay: l.decay * tk,
          freq: l.freq * fk,
          ...(l.freqEnd !== undefined ? { freqEnd: l.freqEnd * fk } : {}),
        };
      case 'modal':
        return {
          ...l,
          at: l.at * tk,
          attack: l.attack * tk,
          base: l.base * fk,
          partials: l.partials.map((p) => ({ ...p, decay: p.decay * tk })),
          ...(l.dropTime !== undefined ? { dropTime: l.dropTime * tk } : {}),
        };
      case 'sweep':
        return {
          ...l,
          at: l.at * tk,
          duration: l.duration * tk,
          freqs: [l.freqs[0] * fk, l.freqs[1] * fk, l.freqs[2] * fk],
        };
    }
  });
}

/** 層が鳴り終わる時刻(秒) */
export function layerEnd(l: Layer): number {
  switch (l.kind) {
    case 'noise':
      return l.at + l.attack + l.decay;
    case 'modal':
      return l.at + l.attack + Math.max(0, ...l.partials.map((p) => p.decay));
    case 'sweep':
      return l.at + l.duration;
  }
}

/** 効果音全体の長さ(秒) */
export function layersDuration(layers: readonly Layer[]): number {
  return layers.reduce((m, l) => Math.max(m, layerEnd(l)), 0);
}

/** 譜面に出てくる周波数を順に並べる(検査用) */
export function layerFrequencies(layers: readonly Layer[]): number[] {
  const out: number[] = [];
  for (const l of layers) {
    if (l.kind === 'noise') {
      out.push(l.freq);
      if (l.freqEnd !== undefined) out.push(l.freqEnd);
    } else if (l.kind === 'modal') {
      for (const p of l.partials) out.push(l.base * p.ratio);
    } else {
      out.push(...l.freqs);
    }
  }
  return out;
}
