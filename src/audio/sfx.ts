/**
 * 効果音の API(金属と木の機械音で統一)。担当:audio。
 * 呼び出し側はこの API だけを使う。実装は `installAudio()`(src/audio/index.ts)が登録する。
 * 登録前・Web Audio が使えない環境では何もしない。
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
  /** 強さ 0..1(振幅の倍率)。既定 1 */
  volume?: number;
  /** 再生速度(音程)。0.25..4、既定 1。gear では歯の刻む速さ */
  rate?: number;
  /** 左右の定位 -1(左)..1(右)。既定 0 */
  pan?: number;
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
