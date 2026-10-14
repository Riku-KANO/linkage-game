import { playSfx } from '@/audio/sfx';
import { downloadDesign } from '@/core/model/fileBrowser';
import type { DesignDoc } from '@/core/model/types';
import { createBrowserPersistence } from '@/core/storage/browser';
import { SANDBOX_SLOT, type DesignSlot } from '@/core/storage/persistence';
import { useEditor } from '@/editor/store';
import { getStage, startDesign, type StageId } from '@/game';
import type { MenuItemId } from '@/scene/store';
import { continueTarget, targetSlot, type ContinueTarget } from './continue';
import { useSession } from './flow';
import { getPrefs } from './settings';
import { useApp } from './store';
import { resetWorld } from './worldBridge';

/**
 * ホーム・ステージ選択・設定から呼ぶ操作(INT-4・INT-5)。flow は画面を持たないので、
 * セッションの操作(startStage など)の後に useApp.go で画面を移すのはここの役目。
 */

/** このセッションでエディタに読み込んだ最後のスロット(boot の購読が書く) */
let openedSlot: DesignSlot | null = null;
export function noteOpenedSlot(slot: DesignSlot | null): void {
  openedSlot = slot;
}

/** ステージを始めて設計画面へ(T-02、ホームからなら T-07)。未解放なら音で知らせて false */
export function openStage(id: StageId): boolean {
  if (!useSession.getState().startStage(id)) {
    playSfx('error', { volume: 0.45 });
    return false;
  }
  useApp.getState().go('design', { stageId: id });
  return true;
}

/** サンドボックス(窓の外の荒野):自由設計のスロットを開いて設計画面へ */
export function openSandboxDesign(): void {
  useSession.getState().openSandbox();
  useApp.getState().go('design', { stageId: null });
}

/** 今の「続きから」の行き先(なければ null =選べない) */
export function currentContinueTarget(): ContinueTarget | null {
  return continueTarget(useSession.getState().progress, getPrefs().lastSlot);
}

/** 続きから(作業台、T-07)。選べなければ false */
export function continueGame(): boolean {
  const target = currentContinueTarget();
  if (!target) {
    playSfx('error', { volume: 0.45 });
    return false;
  }
  if (target.kind === 'sandbox') {
    openSandboxDesign();
    return true;
  }
  return openStage(target.stageId);
}

/**
 * ホームのメニュー項目を選ぶ(工房の物体のクリックと端のテキストメニューで共通)。ホームにいるときだけ。
 * 図鑑と設定は T-08 でパネルへ、サンドボックスは設計画面へ。
 */
export function activateHomeItem(id: MenuItemId): void {
  const app = useApp.getState();
  if (app.screen !== 'home') return;
  switch (id) {
    case 'continue':
      if (continueGame()) playSfx('press');
      return;
    case 'sandbox':
      playSfx('press');
      openSandboxDesign();
      return;
    case 'stageSelect':
    case 'zukan':
    case 'settings':
      playSfx('press');
      app.go(id);
      return;
  }
}

/**
 * 書き出す設計:エディタに今開いている(このセッションで開いた)設計。まだ何も開いていなければ
 * 「続きから」で開く設計(保存したもの、なければステージの最初の設計)。何もなければ null。
 */
export function designForExport(): DesignDoc | null {
  if (useSession.getState().slot !== null || openedSlot !== null)
    return useEditor.getState().design;
  const target = currentContinueTarget();
  if (!target) return null;
  const slot = targetSlot(target);
  const saved = createBrowserPersistence().loadDesign(slot);
  if (saved) return saved;
  if (slot === SANDBOX_SLOT) return null;
  const stage = getStage(slot);
  return stage ? startDesign(stage) : null;
}

/** 設計を JSON ファイルに書き出す(U-03) */
export function exportDesignFile(): boolean {
  const design = designForExport();
  if (!design) {
    playSfx('error', { volume: 0.45 });
    return false;
  }
  downloadDesign(design);
  useSession
    .getState()
    .pushNotice({ kind: 'file', severity: 'success', key: 'hud.notice.exported' });
  return true;
}

/**
 * 選んだ JSON ファイルを読み込む(U-03)。ステージを開いていなければサンドボックスに入れて保存する。
 * 設定画面から読み込めたら、そのまま作業台の設計画面へ移る(ホームへ戻ってから T-07)。
 */
export async function importDesignFile(file: Blob): Promise<boolean> {
  const ok = await useSession.getState().importDesign(file);
  if (!ok) return false;
  const app = useApp.getState();
  if (app.screen === 'settings') {
    app.back();
    useApp.getState().go('design', { stageId: useSession.getState().stageId });
  }
  return true;
}

/** 進行のリセット(設定画面で 2 段階で確かめた後)。設計のスロットと設定は残す */
export function resetProgress(): void {
  useSession.getState().resetProgress();
  resetWorld();
}
