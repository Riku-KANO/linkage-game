import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

test('boots into the workshop, flies to the drafting table and back', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/');
  // 3D の物体に浮かぶラベルと区別して、テキストメニューの項目を使う
  const cont = page.getByRole('menuitem', { name: /続きから/ });
  // T-00 のロゴは任意のキーで飛ばせる。読み込み中に押すと効かないことがあるので、メニューが出るまで繰り返す
  // (クリックだとホームに着いた後に作業台を押してしまうので、害のない Shift を使う)
  await expect(async () => {
    await page.keyboard.press('Shift');
    await expect(cont).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 40_000 });
  await cont.click();
  // T-07:作業台の製図用紙へ。設計画面のパネルが出る
  await expect(page.getByRole('button', { name: '試走する' })).toBeVisible();
  // Esc で戻る(逆再生の短縮版)
  await page.keyboard.press('Escape');
  await expect(cont).toBeVisible();
  w.expectClean();
});
