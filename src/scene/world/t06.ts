/**
 * T-06(結果 → ステージ選択)の時間割。純粋な計算。
 *
 * カメラは屋外の試走コースから窓を通って模型へ戻ってくるので、模型が見えるのは遷移の終わり近くになる
 * (遷移の長さはトークンの 2.0 / 1.0 秒で、カメラの移動はリグが受け持つ)。
 * そこで機械は模型が見え始める頃(遷移の start)に歩き出し、カメラが着いた後も少し歩いて次の目印に着く
 * (長さは遷移の length 倍)。カメラの移動中はクリック・キーでリグがスキップし、着いた後の残りの歩きは
 * ジオラマがクリック・キーでスキップする。歩く間はステージ選択の定位置を「歩く区間に寄った姿勢」
 * (framing.ts の closeUpPose)にし、着いて hold 秒後に戻す(カメラはばねで全体の構図へ引く)。
 */
export const T06_WALK = {
  /** 歩き出す時刻(遷移の長さに対する比) */
  start: 0.8,
  /** 歩く長さ(遷移の長さに対する比) */
  length: 0.75,
  /** 着いてから全体の定位置へ引くまで(s) */
  hold: 0.6,
  /** 遷移がこれより早く終わったらスキップされたとみなす(予定の長さに対する比) */
  skippedBefore: 0.95,
} as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * 遷移が始まってからの時間 elapsed(s)→ 歩いた割合 0..1(歩き出しと着く前は滑らかに)。
 * duration は遷移の長さ(s)。0 以下なら歩かずに着いている。
 */
export function t06WalkProgress(elapsed: number, duration: number): number {
  if (!(duration > 0)) return 1;
  const k = clamp01((elapsed - T06_WALK.start * duration) / (T06_WALK.length * duration));
  return k * k * (3 - 2 * k);
}

/** 歩き終える時刻(遷移が始まってから、s) */
export function t06WalkEnd(duration: number): number {
  return Math.max(0, duration) * (T06_WALK.start + T06_WALK.length);
}
