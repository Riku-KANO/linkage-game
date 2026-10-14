import { expect, test, type Page } from '@playwright/test';
import { skipBootLogo, watchErrors } from './helpers';

/**
 * ホーム側の画面(INT-4 ステージ選択、INT-5 ホーム・設定・通知)。
 * 今の画面とスロットは <html data-screen data-slot> に出る(src/app/boot.ts)。
 */

const html = (page: Page) => page.locator('html');
const menuItem = (page: Page, name: RegExp) => page.getByRole('menuitem', { name });

/** 起動してロゴを飛ばし、ホームのメニューが出るまで待つ */
async function bootToHome(page: Page) {
  await skipBootLogo(page);
  await expect(menuItem(page, /ステージ選択/)).toBeVisible();
  await expect(html(page)).toHaveAttribute('data-screen', 'home');
}

test('settings are saved and restored after a reload', async ({ page }) => {
  // 3D の工房を 2 回起動する(並行実行のソフトウェア描画では時間がかかる)
  test.slow();
  const w = watchErrors(page);
  await page.goto('/');
  await bootToHome(page);

  await menuItem(page, /^設定/).click();
  const panel = page.getByRole('region', { name: '設定' });
  await expect(panel).toBeVisible();
  await expect(html(page)).toHaveAttribute('data-screen', 'settings');
  const motion = panel.getByRole('switch', { name: '動きを減らす' });
  const mute = panel.getByRole('switch', { name: 'ミュート' });
  await expect(motion).toHaveAttribute('aria-checked', 'false');
  await motion.click();
  await mute.click();
  await expect(motion).toHaveAttribute('aria-checked', 'true');
  await expect(mute).toHaveAttribute('aria-checked', 'true');
  // 音量は flow が少し待ってから保存する
  await page.waitForTimeout(600);

  await page.reload();
  await bootToHome(page);
  await menuItem(page, /^設定/).click();
  await expect(panel).toBeVisible();
  await expect(motion).toHaveAttribute('aria-checked', 'true');
  await expect(mute).toHaveAttribute('aria-checked', 'true');

  // Esc でホームへ戻る
  await page.keyboard.press('Escape');
  await expect(html(page)).toHaveAttribute('data-screen', 'home');
  await expect(menuItem(page, /ステージ選択/)).toBeVisible();
  w.expectClean();
});

test('stage select starts 1-1 in the design screen and Esc walks back', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/');
  await bootToHome(page);

  await menuItem(page, /ステージ選択/).click();
  const list = page.getByRole('region', { name: /ステージ/ });
  await expect(list).toBeVisible();
  await expect(html(page)).toHaveAttribute('data-screen', 'stageSelect');
  // 最初は「次」の 1-1 にフォーカス。矢印キーで移れ、未解放の 1-2 は Enter でも始まらない
  const first = list.getByRole('button', { name: /^1-1/ });
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(list.getByRole('button', { name: /^1-2/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await expect(html(page)).toHaveAttribute('data-screen', 'stageSelect');

  await page.keyboard.press('ArrowLeft');
  await expect(first).toBeFocused();
  await list.getByRole('button', { name: /このステージで遊ぶ/ }).click();
  // T-02:作業台の製図用紙へ。セッションは 1-1 を開いている
  await expect(html(page)).toHaveAttribute('data-screen', 'design');
  await expect(html(page)).toHaveAttribute('data-slot', 'c1-s1');

  // Esc:設計 → ステージ選択(ステージを閉じる)→ ホーム
  await page.keyboard.press('Escape');
  await expect(html(page)).toHaveAttribute('data-screen', 'stageSelect');
  await expect(html(page)).toHaveAttribute('data-slot', '');
  await expect(list).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(html(page)).toHaveAttribute('data-screen', 'home');
  await expect(menuItem(page, /ステージ選択/)).toBeVisible();
  w.expectClean();
});

test('continue reopens the last machine after a reload (sandbox from the window)', async ({
  page,
}) => {
  test.slow();
  const w = watchErrors(page);
  await page.goto('/');
  await bootToHome(page);

  await menuItem(page, /サンドボックス/).click();
  await expect(html(page)).toHaveAttribute('data-screen', 'design');
  await expect(html(page)).toHaveAttribute('data-slot', 'sandbox');
  await page.keyboard.press('Escape');
  await expect(html(page)).toHaveAttribute('data-screen', 'home');

  await page.reload();
  await bootToHome(page);
  await menuItem(page, /続きから/).click();
  await expect(html(page)).toHaveAttribute('data-screen', 'design');
  await expect(html(page)).toHaveAttribute('data-slot', 'sandbox');
  w.expectClean();
});

test('the zukan shows a small coming-soon card', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/');
  await bootToHome(page);
  await menuItem(page, /機構図鑑/).click();
  const card = page.getByRole('region', { name: '機構図鑑' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('準備中');
  await card.getByRole('button', { name: /戻る/ }).click();
  await expect(html(page)).toHaveAttribute('data-screen', 'home');
  w.expectClean();
});
