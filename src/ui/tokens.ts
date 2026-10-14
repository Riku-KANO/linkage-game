/**
 * 動きのデザイントークン(演出の非機能要件「動きの一貫性」)。
 * イージングと遷移時間はここだけで定義し、全画面で共有する。
 */

export type Screen =
  | 'boot'
  | 'home'
  | 'stageSelect'
  | 'design'
  | 'testRun'
  | 'result'
  | 'zukan'
  | 'settings'
  | 'sandbox';

export type TransitionId =
  'T-00' | 'T-01' | 'T-02' | 'T-03' | 'T-04' | 'T-05' | 'T-06' | 'T-07' | 'T-08';

export interface TransitionToken {
  id: TransitionId;
  from: Screen;
  to: Screen;
  /** 初回の長さ(s)。null は「読み込み次第」 */
  first: number | null;
  /** 2 回目以降(s) */
  repeat: number;
  easing: EasingName;
}

/** 画面遷移とトランジション(要件定義書の表をそのまま写す) */
export const TRANSITIONS: readonly TransitionToken[] = [
  { id: 'T-00', from: 'boot', to: 'home', first: null, repeat: 1.0, easing: 'settle' },
  { id: 'T-01', from: 'home', to: 'stageSelect', first: 1.2, repeat: 0.6, easing: 'glide' },
  { id: 'T-02', from: 'stageSelect', to: 'design', first: 1.4, repeat: 0.7, easing: 'glide' },
  { id: 'T-03', from: 'design', to: 'testRun', first: 2.0, repeat: 0.8, easing: 'assemble' },
  { id: 'T-04', from: 'testRun', to: 'result', first: 1.5, repeat: 0.8, easing: 'settle' },
  { id: 'T-05', from: 'result', to: 'design', first: 1.0, repeat: 0.6, easing: 'glide' },
  { id: 'T-06', from: 'result', to: 'stageSelect', first: 2.0, repeat: 1.0, easing: 'glide' },
  { id: 'T-07', from: 'home', to: 'design', first: 1.2, repeat: 0.6, easing: 'glide' },
  { id: 'T-08', from: 'home', to: 'zukan', first: 0.8, repeat: 0.5, easing: 'snap' },
] as const;

/** 「ホーム → 設定」なども T-08 と同じ演出を使う */
export const PANEL_SCREENS: readonly Screen[] = ['zukan', 'settings', 'sandbox'];

/** 戻る操作(Esc・右クリック)は同じ遷移を逆方向に短縮版で再生する */
export const BACK_SPEEDUP = 1.0;

/** reduced-motion のときはカメラ移動を 0.3 秒のフェードに置き換える */
export const REDUCED_MOTION_FADE = 0.3;

/** 操作から遷移が動き始めるまでの上限(s)(設計原則 4) */
export const MAX_RESPONSE_DELAY = 0.1;

export type EasingName = 'glide' | 'settle' | 'snap' | 'assemble' | 'linear';

/** t ∈ [0,1] → [0,1] */
export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  // 滑らかに加速・減速(カメラの移動)
  glide: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  // 最後に少しだけ行き過ぎて戻る(着地・メダル)
  settle: (t) => {
    const c1 = 1.2;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  // 素早く寄る(パネル)
  snap: (t) => 1 - (1 - t) ** 4,
  // 部品が順に立ち上がる(組み立て)
  assemble: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
};

/** ばね補間の既定値(臨界減衰に近い) */
export const SPRINGS = {
  camera: { stiffness: 120, damping: 22 },
  follow: { stiffness: 40, damping: 12 },
  ui: { stiffness: 400, damping: 30 },
} as const;

/** マイクロインタラクションの時間(s) */
export const MICRO = {
  snapWobble: 0.18,
  buttonPress: 0.08,
  errorShake: 0.35,
  hoverOutline: 0.12,
} as const;

export function findTransition(from: Screen, to: Screen): TransitionToken | null {
  const direct = TRANSITIONS.find((t) => t.from === from && t.to === to);
  if (direct) return direct;
  if (from === 'home' && PANEL_SCREENS.includes(to))
    return TRANSITIONS.find((t) => t.id === 'T-08')!;
  return null;
}

// ---------------------------------------------------------------------------
// 以下は scene ストリームでの追加(後方互換な追加のみ)
// ---------------------------------------------------------------------------

/**
 * T-00(起動 → ホーム)の初回の実値。表では「読み込み次第」(first: null)。
 * ロゴのリンクが組み上がり(logoAssemble)、クランクが一回転して一歩踏み出し(logoFlourish)、
 * そのあとカメラが引く(pullBack)。読み込みがロゴより遅いときはロゴの最後の姿勢で待つ。
 */
export const BOOT = {
  logoAssemble: 1.6,
  logoFlourish: 0.9,
  pullBack: 1.6,
} as const;

/** 表にない遷移(試走 → 設計 のワンキー切り替えなど)の既定 */
export const DEFAULT_TRANSITION: { duration: number; easing: EasingName } = {
  duration: 0.6,
  easing: 'glide',
};

/**
 * 遷移の進行度がいくつになったら行き先の画面の UI パネルを出すか(0..1)。
 * T-08 は「扉が開くのと同時にパネルが出る」ので早め。
 */
export const PANEL_REVEAL_AT: { default: number } & Partial<Record<TransitionId, number>> = {
  default: 0.8,
  'T-08': 0.55,
};

/** ホームのカメラ:ゆっくり呼吸する揺れと、マウス位置による視差(m・s) */
export const HOME_CAMERA = {
  /** 呼吸の振幅(m) */
  breathAmplitude: 0.025,
  /** 呼吸の周期(s) */
  breathPeriod: 7.5,
  /** 画面端までマウスを動かしたときのずれ(m) */
  parallax: 0.07,
  /** 到着してから揺れが最大になるまで(s) */
  swayFadeIn: 1.2,
} as const;
