import { expect, test, type Page } from '@playwright/test';
import { encodeShare } from '../src/core/model/share';
import { getStage } from '../src/game';
import { watchErrors } from './helpers';

/**
 * 初めての人の入口と遊び方(INT-7b):ホームの「はじめての方へ」、テキストメニューの「遊び方」
 * (遊び方の本・用語集・操作一覧)、試走画面の HUD の計器(RunHud)。
 * 今の画面とスロットは <html data-screen data-slot>(src/app/boot.ts)。
 * 3D の工房はソフトウェア描画(CPU)で重いので、並べずに順に走らせる。
 */
test.describe.configure({ mode: 'serial' });

const html = (page: Page) => page.locator('html');
const welcomeCard = (page: Page) => page.getByRole('dialog', { name: 'はじめての方へ' });
const book = (page: Page) => page.getByRole('dialog', { name: '遊び方' });
const bookPage = (page: Page) => book(page).locator('[data-page]');

/** ロゴ(T-00)を飛ばす。読み込み中に押すと効かないことがあるので、画面が変わるまで Shift を繰り返す */
async function skipLogo(page: Page) {
  await expect(async () => {
    await page.keyboard.press('Shift');
    await expect(html(page)).toHaveAttribute('data-screen', 'home', { timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
}

async function bootToHome(page: Page) {
  await skipLogo(page);
  await expect(page.getByRole('menuitem', { name: /ステージ選択/ })).toBeVisible({
    timeout: 30_000,
  });
}

test('初めての人にはホームで「はじめての方へ」を出し、チュートリアルで 1-1 の設計画面へ。選べば次からは出ない', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const w = watchErrors(page);
  await page.goto('/');
  await bootToHome(page);

  const card = welcomeCard(page);
  await expect(card).toBeVisible();
  const tutorial = card.getByRole('button', { name: 'チュートリアルから始める' });
  await expect(tutorial).toBeFocused();
  // メニューは隠さない(右に置く)
  const cardBox = (await card.boundingBox())!;
  const menuBox = (await page.getByRole('menu').boundingBox())!;
  expect(cardBox.x).toBeGreaterThan(menuBox.x + menuBox.width);

  await tutorial.click();
  await expect(html(page)).toHaveAttribute('data-screen', 'design');
  await expect(html(page)).toHaveAttribute('data-slot', 'c1-s1');
  await expect(page.getByRole('button', { name: '試走する' })).toBeVisible({ timeout: 30_000 });
  const prefs = await page.evaluate(() => localStorage.getItem('ashikumi/v1/prefs'));
  expect(JSON.parse(prefs ?? '{}')).toMatchObject({ welcomed: true });

  // 読み込み直してもまだ何もクリアしていないが、もう選んだので出さない
  await page.reload();
  await bootToHome(page);
  await page.waitForTimeout(1_500);
  await expect(welcomeCard(page)).toHaveCount(0);
  w.expectClean();
});

test('ホームのメニューの「遊び方」で本を開き、← → でめくる。用語集・操作一覧から本の同じページへ戻る', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const w = watchErrors(page);
  await page.goto('/');
  await bootToHome(page);
  await expect(welcomeCard(page)).toBeVisible();

  // キーボードだけで:↑ でメニューの最後の項目(遊び方)へ、Enter で開く
  await page.keyboard.press('ArrowUp');
  const item = page.getByRole('menuitem', { name: /遊び方/ });
  await expect(item).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(book(page)).toBeVisible();
  await expect(bookPage(page)).toHaveAttribute('data-page', 'about');
  await page.keyboard.press('ArrowRight');
  await expect(bookPage(page)).toHaveAttribute('data-page', 'link');
  await page.keyboard.press('ArrowRight');
  await expect(bookPage(page)).toHaveAttribute('data-page', 'crank');
  await page.keyboard.press('ArrowLeft');
  await expect(bookPage(page)).toHaveAttribute('data-page', 'link');
  await expect(book(page)).toContainText('棒を引いてつなぐ');

  // 用語集は本の上に開き、閉じると同じページ
  await book(page).getByRole('button', { name: '用語集' }).click();
  await expect(page.getByRole('dialog', { name: '用語集' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(bookPage(page)).toHaveAttribute('data-page', 'link');

  // 最後のページから操作一覧
  await page.keyboard.press('End');
  await expect(bookPage(page)).toHaveAttribute('data-page', 'keys');
  await book(page).getByRole('button', { name: '操作一覧を開く' }).click();
  await expect(page.getByRole('dialog', { name: '操作一覧' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(bookPage(page)).toHaveAttribute('data-page', 'keys');

  // Esc で閉じてもホームのまま。フォーカスは「遊び方」に戻る
  await page.keyboard.press('Escape');
  await expect(book(page)).toHaveCount(0);
  await expect(html(page)).toHaveAttribute('data-screen', 'home');
  await expect(item).toBeFocused();
  w.expectClean();
});

test('共有リンクで開いたら「はじめての方へ」は出さない。試走画面に HUD の計器(時間・距離・進み具合)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const w = watchErrors(page);
  const stage = getStage('c1-s1')!;
  const run = { stageId: 'c1-s1', time: 2.4, energy: 60, parts: 10, cost: 1300, cleared: true };
  await page.goto(`/${encodeShare({ design: stage.reference!, run })}`);
  await skipLogo(page);
  await expect(html(page)).toHaveAttribute('data-screen', 'design', { timeout: 30_000 });
  await expect(welcomeCard(page)).toHaveCount(0);

  await page.getByRole('button', { name: '試走する' }).click();
  await expect(html(page)).toHaveAttribute('data-screen', 'testRun');
  const hud = page.getByRole('group', { name: '試走中の計器' });
  await expect(hud).toBeVisible({ timeout: 60_000 });
  const timer = hud.getByRole('timer', { name: '時間' });
  await expect(timer).toContainText('/ 15');
  await expect(hud.getByRole('meter', { name: 'モーター負荷' })).toBeVisible();
  await expect(page.getByRole('region', { name: '試走の状況' })).toContainText('ステージ 1-1');
  // 計器は機械を隠さない:上の端に収まる
  const strip = (await hud.locator('.hud-runhud__strip').boundingBox())!;
  expect(strip.y + strip.height).toBeLessThan(720 * 0.15);

  // 走ると時間と距離・進み具合が増える(1-1 は 2 秒ほどでゴールして結果へ移るので、一時停止して確かめる)
  const progress = hud.getByRole('progressbar', { name: '距離' });
  await expect(async () => {
    expect(Number(await progress.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  }).toPass({ timeout: 60_000 });
  await page.keyboard.press('Space');
  await expect(timer).toContainText(/(0\.[1-9]|[1-9]\.\d)\/ 15/);
  await expect(hud).toContainText(/[0-9]\.[0-9]{2} \/ 1\.[0-9]{2} m/);
  // 「設計に戻る」(Esc)
  await hud.getByRole('button', { name: /設計に戻る/ }).click();
  await expect(html(page)).toHaveAttribute('data-screen', 'design');
  await expect(hud).toHaveCount(0);
  w.expectClean();
});
