import { expect, test, type Locator } from '@playwright/test';
import { watchErrors } from './helpers';

const PAGES = [
  'このゲームについて',
  '棒を引いてつなぐ',
  '固定点とクランク',
  '自由度 1 で動く',
  '脚先の軌道を見る',
  '脚を増やす',
  '試走とメダル',
  '操作一覧',
];

const figureMarkup = (book: Locator) =>
  book.locator('figure svg[role="img"]').evaluate((el) => el.innerHTML);

test('遊び方の本:キーボードで全ページをめくれて、図が動き、Esc で閉じる', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/?dev=guide');
  await page.getByRole('button', { name: '遊び方の本を開く' }).click();
  const book = page.getByRole('dialog', { name: '遊び方' });
  await expect(book).toBeVisible();
  for (let i = 0; i < PAGES.length; i++) {
    await expect(book.getByRole('heading', { level: 3 })).toContainText(PAGES[i]!);
    await expect(book.locator('figure svg[role="img"]')).toBeVisible();
    // 図は本物のソルバーの姿勢で動き続ける
    const before = await figureMarkup(book);
    await expect.poll(() => figureMarkup(book)).not.toBe(before);
    if (i < PAGES.length - 1) await page.keyboard.press('ArrowRight');
  }
  // 最後のページから ← で戻れる
  await page.keyboard.press('ArrowLeft');
  await expect(book.getByRole('heading', { level: 3 })).toContainText(PAGES[6]!);
  await page.keyboard.press('Escape');
  await expect(book).toBeHidden();
  w.expectClean();
});

test('用語の小窓・用語集・操作一覧(?)・状況の一言', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/?dev=guide');

  // 文中の用語をクリックすると小窓が開き、Esc で閉じる
  await page.getByRole('button', { name: 'グラスホフの条件' }).click();
  const pop = page.getByRole('dialog', { name: /グラスホフの条件/ });
  await expect(pop).toBeVisible();
  await expect(pop.locator('svg[role="img"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();

  // 用語集
  await page.getByRole('button', { name: '用語集を開く' }).click();
  const gloss = page.getByRole('dialog', { name: '用語集' });
  await expect(gloss.getByRole('heading', { name: /自由度/ })).toBeVisible();
  await gloss.getByRole('button', { name: '死点' }).click();
  await expect(gloss.getByRole('heading', { name: /死点/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(gloss).toBeHidden();

  // ? キーで操作一覧
  await page.keyboard.press('?');
  const sheet = page.getByRole('dialog', { name: '操作一覧' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('元に戻す')).toBeVisible();
  await expect(sheet.getByText('リンク:点からドラッグして棒を引く')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // 見本の設計に応じた一言
  await expect(page.getByRole('note')).toContainText('固定点');
  await page.getByLabel('見本の設計').selectOption('five');
  await expect(page.getByRole('note')).toContainText('ぐらつきます');
  await page.getByLabel('見本の設計').selectOption('backward');
  await expect(page.getByRole('note')).toContainText('後ろへ歩きます');
  await page.getByRole('button', { name: '回転を逆にする' }).click();
  await expect(page.getByRole('note')).not.toContainText('後ろへ歩きます');

  // はじめての方へ → 遊び方を見る
  await page.getByRole('button', { name: '「はじめての方へ」を出す' }).click();
  await page.getByRole('button', { name: '遊び方を見る' }).click();
  await expect(page.getByRole('dialog', { name: '遊び方' })).toBeVisible();
  w.expectClean();
});
