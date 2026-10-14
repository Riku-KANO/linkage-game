import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

test('boots into the workshop, flies to the drafting table and back', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/');
  // T-00 のロゴはクリックで飛ばせる
  await page.mouse.click(640, 360);
  const cont = page.getByText('続きから', { exact: true });
  await expect(cont).toBeVisible();
  await cont.click();
  // T-07:作業台の製図用紙へ。設計画面のパネルが出る
  await expect(page.getByRole('button', { name: '試走する' })).toBeVisible();
  // Esc で戻る(逆再生の短縮版)
  await page.keyboard.press('Escape');
  await expect(cont).toBeVisible();
  w.expectClean();
});
