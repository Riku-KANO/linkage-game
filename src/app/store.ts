import { create } from 'zustand';
import type { StageId } from '@/game/types';
import { findTransition, type Screen, type TransitionId } from '@/ui/tokens';

/**
 * アプリ全体の状態:今いる画面と、進行中の遷移。
 * 画面遷移を状態として書く(技術構成案「UIと3Dの統合」)。
 * カメラ・UI パネルはこの状態を見て動く。遷移の実時間はシーン側が tokens から決める。
 */

export interface ActiveTransition {
  id: TransitionId | null;
  from: Screen;
  to: Screen;
  /** 戻る操作による逆再生 */
  reverse: boolean;
  /** 2 回目以降の短縮版 */
  short: boolean;
  /** performance.now() の開始時刻(ms) */
  startedAt: number;
}

export interface AppSettings {
  /** prefers-reduced-motion を検知、または手動で ON */
  reducedMotion: boolean;
  /** 低性能モード:影・被写界深度・ブルームを切り、ホームの揺れを止める */
  lowPerf: boolean;
  volume: number;
  /**
   * (int-home で追加)ミュート。音量の値は保ったまま無音にする。省略は false。
   * 保存と音のエンジンへの反映は src/app/settings.ts(installSettingsSync)が受け持つ。
   */
  muted?: boolean;
  /**
   * (int-home で追加)動きの軽減・低性能モードの値の出どころ。省略・'auto' は自動判定
   * (OS の prefers-reduced-motion、GPU の測定)、'user' は設定画面で選んだ値。
   * 自動判定の値は「利用者の選択」として保存しない。
   */
  sources?: SettingSources;
}

/** (int-home で追加)設定の値の出どころ */
export type SettingSource = 'user' | 'auto';
/** (int-home で追加)自動判定のある設定項目ごとの出どころ */
export interface SettingSources {
  reducedMotion?: SettingSource;
  lowPerf?: SettingSource;
}

export interface AppState {
  screen: Screen;
  transition: ActiveTransition | null;
  /** 画面の履歴(戻る操作用) */
  history: Screen[];
  stageId: StageId | null;
  seenTransitions: Set<string>;
  settings: AppSettings;
  go(to: Screen, opts?: { stageId?: StageId | null }): void;
  back(): void;
  /** 遷移アニメーションが終わったらシーン側が呼ぶ */
  finishTransition(): void;
  setSettings(patch: Partial<AppSettings>): void;
}

export const useApp = create<AppState>((set, get) => ({
  screen: 'boot',
  transition: null,
  history: [],
  stageId: null,
  seenTransitions: new Set(),
  settings: { reducedMotion: false, lowPerf: false, volume: 0.8 },

  go(to, opts) {
    const { screen, seenTransitions, history } = get();
    if (to === screen) return;
    const token = findTransition(screen, to);
    const key = token?.id ?? `${screen}->${to}`;
    set({
      screen: to,
      history: screen === 'boot' ? history : [...history, screen],
      stageId: opts?.stageId !== undefined ? opts.stageId : get().stageId,
      transition: {
        id: token?.id ?? null,
        from: screen,
        to,
        reverse: false,
        short: seenTransitions.has(key),
        startedAt: performance.now(),
      },
      seenTransitions: new Set(seenTransitions).add(key),
    });
  },

  back() {
    const { history, screen } = get();
    const prev = history[history.length - 1];
    if (!prev) return;
    const token = findTransition(prev, screen);
    set({
      screen: prev,
      history: history.slice(0, -1),
      transition: {
        id: token?.id ?? null,
        from: screen,
        to: prev,
        reverse: true,
        short: true,
        startedAt: performance.now(),
      },
    });
  },

  finishTransition() {
    set({ transition: null });
  },

  setSettings(patch) {
    set({ settings: { ...get().settings, ...patch } });
  },
}));
