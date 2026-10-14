/**
 * 効果音モジュールの入口。アプリの起動時に一度 `installAudio()` を呼ぶと、
 * `playSfx` / `setMotorHum`(sfx.ts)が実際に鳴るようになる。
 *
 *   import { installAudio } from '@/audio';
 *   installAudio(); // 何度呼んでもよい。音は最初のクリック・キー入力から出る
 *
 * 音量は useApp の settings.volume に追従する(followSettings: false で切れる)。
 */
import { useApp } from '@/app/store';
import { AudioEngine, type AudioEngineDeps, type AudioStatus } from './engine';
import { registerSfx } from './sfx';

export { playSfx, setMotorHum, type SfxName, type SfxOptions } from './sfx';
export { SFX_NAMES } from './recipes';
export { MOTOR_MAX_RPM } from './mapping';
export type { AudioStatus } from './engine';

export interface InstallAudioOptions extends AudioEngineDeps {
  /** useApp の settings.volume に音量を追従させる(既定 true) */
  followSettings?: boolean;
}

let engine: AudioEngine | null = null;
let unsubscribe: (() => void) | null = null;

/**
 * Web Audio の実装を sfx.ts に登録する(AU-1)。何度呼んでも最初の 1 回だけ効き、同じエンジンを返す。
 * AudioContext は最初のユーザー操作(pointerdown / keydown など)まで作らない。
 * Node や Web Audio の無い環境では登録だけして、鳴らす呼び出しは黙って何もしない。
 */
export function installAudio(opts: InstallAudioOptions = {}): AudioEngine {
  if (engine) return engine;
  const e = new AudioEngine(opts);
  engine = e;
  if (opts.followSettings ?? true) {
    e.setVolume(useApp.getState().settings.volume);
    unsubscribe = useApp.subscribe((s, prev) => {
      if (s.settings.volume !== prev.settings.volume) e.setVolume(s.settings.volume);
    });
  }
  e.attach();
  registerSfx(
    (name, o) => e.play(name, o),
    (rpm, load) => e.setMotor(rpm, load),
  );
  return e;
}

/** 登録を外して音を止める(HMR・テスト用)。もう一度 installAudio() できる */
export function uninstallAudio(): void {
  if (!engine) return;
  unsubscribe?.();
  unsubscribe = null;
  engine.detach();
  engine = null;
  registerSfx(
    () => {},
    () => {},
  );
}

/** 音量 0..1 を直接設定する(followSettings を切ったとき用) */
export function setAudioVolume(volume: number): void {
  engine?.setVolume(volume);
}

/** ミュート。音量の設定は保ったまま無音にする */
export function setAudioMuted(muted: boolean): void {
  engine?.setMuted(muted);
}

export function getAudioStatus(): AudioStatus {
  return engine?.status() ?? 'locked';
}
