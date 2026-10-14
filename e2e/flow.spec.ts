import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/** 設計図の点(data-joint)の画面上の中心 */
async function jointCenter(page: Page, id: string) {
  const box = (await page.locator(`[data-joint="${id}"] .ed-pin`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}

test('3D なしの通しプレイ:1-1 を直して試走しクリア、1-2 が解放される', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/?dev=flow');
  await page.getByRole('button', { name: /1-1/ }).click();

  // チュートリアル:説明を 2 つ読み進めると、リンクの道具が渡される
  await page.getByRole('button', { name: '次へ' }).click();
  await page.getByRole('button', { name: '次へ' }).click();
  await page.getByRole('button', { name: /^リンク/ }).click();

  // 外れた揺動節:固定点 O4 と点 B をリンクでつなぐ
  await drag(page, await jointCenter(page, 'O4'), await jointCenter(page, 'B'));
  await expect(page.getByText('自由度 1・正常').first()).toBeVisible();
  await expect(page.getByText(/直りました/)).toBeVisible();

  // 試走 → 結果
  await page.getByRole('button', { name: '試走', exact: true }).click();
  const toResult = page.getByRole('button', { name: '結果へ' });
  await toResult.click({ timeout: 15_000 }).catch(() => {});
  await expect(page.getByText('クリア!').first()).toBeVisible({ timeout: 20_000 });
  await page.mouse.click(10, 700); // 結果の演出を飛ばす
  await page.getByRole('button', { name: /次のステージ/ }).click();
  await expect(page.getByText(/1-2/).first()).toBeVisible();

  // ステージ一覧で 1-2 が解放されている
  await page.getByRole('button', { name: /ステージ選択へ/ }).click();
  await expect(page.getByRole('button', { name: /1-2/ })).not.toContainText('未解放');
  w.expectClean();
});
