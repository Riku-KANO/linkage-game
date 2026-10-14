import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

test('the result panel animates and can be skipped to its final state', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/?dev=result');
  await expect(page.getByText('クリア!').first()).toBeVisible();
  await page.mouse.click(900, 300);
  await expect(page.getByRole('button', { name: /次のステージ/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /共有リンクをコピー/ })).toBeVisible();
  w.expectClean();
});
