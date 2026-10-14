import { create } from 'zustand';
import type { DesignDoc } from '@/core/model/types';
import { jansenLeg } from '@/core/model/presets';

/**
 * 編集中の設計データ。アプリ全体でこれが唯一の正。
 * 担当:editor(元に戻す・選択などはここに足す)
 */
export interface EditorState {
  design: DesignDoc;
  /** 設計をまるごと差し替える(読み込み・共有リンク・ステージ開始) */
  replaceDesign(design: DesignDoc): void;
}

export const useEditor = create<EditorState>((set) => ({
  design: jansenLeg(),
  replaceDesign(design) {
    set({ design });
  },
}));
