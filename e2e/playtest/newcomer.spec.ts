import { expect, test } from '@playwright/test';
import { watchErrors } from '../helpers';
import { expectCleared, play11, play12, play13 } from './play';

/**
 * PLAY-1:初めての人の通しプレイ。何も保存されていない状態から、ステージ一覧で 1-1 を選び、
 * 3 つのチュートリアルを吹き出しのとおりに遊んで、結果画面の「次のステージ」だけで 1-3 まで進む。
 * 終わると 1-4(チュートリアルなし)が解放されている。
 */
test('初めての人:1-1 → 1-2 → 1-3 をチュートリアルどおりに続けてクリアする', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/?dev=flow');
  await page.getByRole('button', { name: /1-1/ }).click();

  await play11(page);
  await expectCleared(page);
  await page.getByRole('button', { name: /次のステージ/ }).click();

  await expect(page.locator('.fl-stage-title')).toContainText('1-2');
  await play12(page);
  await expectCleared(page);
  await page.getByRole('button', { name: /次のステージ/ }).click();

  await expect(page.locator('.fl-stage-title')).toContainText('1-3');
  await play13(page);
  await expectCleared(page);

  // 1-4 が解放され、チュートリアルの吹き出しは出ない
  await page.getByRole('button', { name: /次のステージ/ }).click();
  await expect(page.locator('.fl-stage-title')).toContainText('1-4');
  await expect(page.locator('.fl-bubble')).toHaveCount(0);
  w.expectClean();
});
