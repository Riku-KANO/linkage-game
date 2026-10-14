import { create } from 'zustand';
import type { DesignDoc } from '@/core/model/types';
import { jansenLeg } from '@/core/model/presets';
import {
  createHistory,
  record,
  redo as redoH,
  seal as sealH,
  undo as undoH,
  type History,
} from './history';
import { EMPTY_SELECTION, sanitizeSelection, type Clipboard, type Selection } from './ops';
import type { ToolId } from './keyboard';

/**
 * 編集中の設計データ。アプリ全体でこれが唯一の正。
 * 担当:editor(元に戻す・選択などはここに足す)
 *
 * 契約:`design` と `replaceDesign` は他のモジュールも使う。以下は editor が足した後方互換な拡張。
 */
export interface EditorState {
  design: DesignDoc;
  /** 設計をまるごと差し替える(読み込み・共有リンク・ステージ開始)。履歴と選択はリセットする */
  replaceDesign(design: DesignDoc): void;
  /** replaceDesign を呼んだ回数(エディタはこれが変わると全体表示し直す) */
  loadCount: number;

  /** 元に戻す・やり直しの履歴(present は常に design と同じ) */
  history: History<DesignDoc>;
  /**
   * 編集を反映して履歴に積む。group が同じ連続した commit はひとつの項目にまとまる(ドラッグ中)。
   * 変更がなければ(同じオブジェクト)何もしない。
   */
  commit(next: DesignDoc, opts?: { group?: string }): void;
  /** まとまりを区切る(ドラッグ終了時に呼ぶ) */
  seal(): void;
  undo(): void;
  redo(): void;

  /** 選択中のジョイントとリンク */
  selection: Selection;
  setSelection(sel: Selection): void;

  /** 今の道具 */
  tool: ToolId;
  setTool(tool: ToolId): void;

  /** コピーした部品と、続けて貼り付けた回数(ずらし量に使う) */
  clipboard: Clipboard | null;
  pasteCount: number;
  setClipboard(clip: Clipboard | null): void;
  bumpPaste(): number;
}

export const useEditor = create<EditorState>((set, get) => {
  const initial = jansenLeg();

  /** 外から design だけが書き換えられていても履歴が壊れないようにそろえる */
  const synced = (): History<DesignDoc> => {
    const { history, design } = get();
    return history.present === design ? history : record(sealH(history), design);
  };

  const applyHistory = (history: History<DesignDoc>) => {
    const design = history.present;
    set({ history, design, selection: sanitizeSelection(design, get().selection) });
  };

  return {
    design: initial,
    replaceDesign(design) {
      set({
        design,
        history: createHistory(design),
        selection: EMPTY_SELECTION,
        pasteCount: 0,
        loadCount: get().loadCount + 1,
      });
    },
    loadCount: 0,

    history: createHistory(initial),
    commit(next, opts) {
      const h = synced();
      if (next === h.present) return;
      applyHistory(record(h, next, opts?.group ?? null));
    },
    seal() {
      const h = synced();
      if (h.group !== null || h !== get().history) set({ history: sealH(h) });
    },
    undo() {
      const h = synced();
      const u = undoH(h);
      if (u !== h) applyHistory(u);
    },
    redo() {
      const h = synced();
      const r = redoH(h);
      if (r !== h) applyHistory(r);
    },

    selection: EMPTY_SELECTION,
    setSelection(sel) {
      set({ selection: sanitizeSelection(get().design, sel) });
    },

    tool: 'select',
    setTool(tool) {
      if (tool !== get().tool) set({ tool });
    },

    clipboard: null,
    pasteCount: 0,
    setClipboard(clipboard) {
      set({ clipboard, pasteCount: 0 });
    },
    bumpPaste() {
      const n = get().pasteCount + 1;
      set({ pasteCount: n });
      return n;
    },
  };
});
