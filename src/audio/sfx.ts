/**
 * 効果音の API(金属と木の機械音で統一)。担当:audio(ウェーブ 2 で Web Audio 実装)。
 * それまでは何もしない。呼び出し側はこの API だけを使う。
 */
export type SfxName =
  | 'snap' // 部品がジョイントにはまる「カチッ」
  | 'press' // ボタンが沈む
  | 'release'
  | 'error' // 組立不能・死点
  | 'whoosh' // カメラ遷移
  | 'gear' // 歯車メーター
  | 'stamp' // メダルの刻印
  | 'step' // 脚が接地
  | 'success';

export interface SfxOptions {
  volume?: number;
  /** 再生速度(音程) */
  rate?: number;
}

type Player = (name: SfxName, opts?: SfxOptions) => void;
let player: Player = () => {};

export function playSfx(name: SfxName, opts?: SfxOptions) {
  player(name, opts);
}

/** モーターのうなり。rpm と負荷(0..1)に応じて音を変える。rpm = 0 で止める */
let motor: (rpm: number, load: number) => void = () => {};
export function setMotorHum(rpm: number, load: number) {
  motor(rpm, load);
}

/** audio モジュールが実装を登録する */
export function registerSfx(p: Player, m?: (rpm: number, load: number) => void) {
  player = p;
  if (m) motor = m;
}
