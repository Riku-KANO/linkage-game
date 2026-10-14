import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

// 3D の工房はソフトウェア描画(CPU)で重いので、ほかの 3D のテストと競わないよう 1 本の通しにまとめる
test('工房の試走コースで試走し、結果を見て、設計の紙に戻る(INT-2 / INT-3)', async ({ page }) => {
  test.setTimeout(180_000);
  const w = watchErrors(page);
  await page.goto('/');
  await page.mouse.click(640, 360);
  const cont = page.getByRole('menuitem', { name: /続きから/ });
  await expect(cont).toBeVisible({ timeout: 30_000 });
  await cont.click();

  // 設計画面 → 試走(T-03)。窓の外の試走コースで、本物の sim の試走が始まる
  const testRun = page.getByRole('button', { name: '試走する' });
  await testRun.click();
  const strip = page.getByRole('region', { name: '試走の状況' });
  await expect(strip).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('toolbar', { name: '試走の操作' })).toBeVisible();
  await expect(page.getByText('クランクトルク')).toBeVisible();
  // 時間が進む(機械が歩いている)
  await expect(strip).toContainText(/時間 [1-9]\.\d \/ 60 秒/, { timeout: 20_000 });

  // 結果へ(最後まで一気に計算)→ 結果パネルが右に出る
  await strip.getByRole('button', { name: '結果へ' }).click();
  const result = page.getByRole('region', { name: '試走の結果' });
  await expect(result).toBeVisible({ timeout: 20_000 });
  await expect(result).toContainText('クリア!');
  const box = (await result.boundingBox())!;
  expect(box.x).toBeGreaterThan(1280 / 2 - 100); // 機械を隠さないよう右に寄せてある
  await result.click({ position: { x: 20, y: 20 } }); // 演出を飛ばす

  // もう一度:前回の試走がゴーストで並走する。Esc で試走をやめて設計に戻る
  await result.getByRole('button', { name: 'もう一度' }).click();
  await expect(strip).toBeVisible({ timeout: 20_000 });
  await expect(strip).toContainText('前回の試走');
  await page.keyboard.press('Escape');
  await expect(testRun).toBeVisible({ timeout: 20_000 });
  await expect(strip).toHaveCount(0);

  // もう一度試走して結果から「設計に戻る」(T-05):製図用紙の設計画面
  await testRun.click();
  await expect(strip).toBeVisible({ timeout: 20_000 });
  await strip.getByRole('button', { name: '結果へ' }).click();
  await expect(result).toBeVisible({ timeout: 20_000 });
  await result.click({ position: { x: 20, y: 20 } });
  await result.getByRole('button', { name: '設計に戻る' }).click();
  await expect(testRun).toBeVisible({ timeout: 20_000 });
  await expect(result).toHaveCount(0);

  // ステージ 1-1(壊れた機械を直す課題)は試走前チェックに通らない:設計画面のまま問題を出す
  await page.keyboard.press('Escape');
  await page.getByRole('menuitem', { name: /ステージ選択/ }).click();
  await page.getByRole('button', { name: /1-1/ }).click();
  await testRun.click();
  await expect(page.getByRole('alert', { name: '試走前チェック' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(strip).toHaveCount(0);
  await expect(testRun).toBeVisible();
  w.expectClean();
});
