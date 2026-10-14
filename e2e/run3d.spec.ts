import { expect, test, type Page } from '@playwright/test';
import { syntheticWalkGhost } from '../src/core/model/ghostFixture';
import { encodeShare } from '../src/core/model/share';
import { getStage } from '../src/game';
import { watchErrors } from './helpers';

/**
 * 試走画面・結果画面(INT-2 / INT-3)を工房(/)の中で通す。今の画面は <html data-screen>(src/app/boot.ts)。
 * 3D の工房はソフトウェア描画(CPU)で重いので、この 2 本は並べずに順に走らせる。
 */
test.describe.configure({ mode: 'serial' });

const html = (page: Page) => page.locator('html');

/** ロゴ(T-00)を飛ばす。読み込み中に押すと効かないことがあるので、画面が変わるまで Shift を繰り返す */
async function skipLogo(page: Page, until: string) {
  await expect(async () => {
    await page.keyboard.press('Shift');
    await expect(html(page)).toHaveAttribute('data-screen', until, { timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
}

test('共有リンクの機械を工房の試走コースで走らせ、結果を見て、設計の紙に戻る', async ({ page }) => {
  test.setTimeout(240_000);
  const w = watchErrors(page);
  // 1-1 の参考解と相手の記録・ゴースト(共有リンクで起動 → ロゴの後に作業台の設計画面へ)
  const stage = getStage('c1-s1')!;
  const hash = encodeShare({
    design: stage.reference!,
    run: { stageId: 'c1-s1', time: 2.4, energy: 60, parts: 10, cost: 1300, cleared: true },
    ghost: syntheticWalkGhost(3),
  });
  await page.goto(`/${hash}`);
  await skipLogo(page, 'home');
  await expect(html(page)).toHaveAttribute('data-screen', 'design', { timeout: 30_000 });
  const testRun = page.getByRole('button', { name: '試走する' });

  // 設計画面 → 試走(T-03)。窓の外の試走コースで本物の sim が走り、相手のゴーストが並走する
  await testRun.click();
  await expect(html(page)).toHaveAttribute('data-screen', 'testRun');
  const strip = page.getByRole('region', { name: '試走の状況' });
  await expect(strip).toBeVisible({ timeout: 30_000 });
  // 1-1 は 2 秒ほどでゴールするので、一時停止(Space)して操作盤を確かめる
  await page.keyboard.press('Space');
  const controls = page.getByRole('toolbar', { name: '試走の操作' });
  await expect(controls.getByRole('button', { name: '再生' })).toBeVisible();
  await expect(strip).toContainText('ステージ 1-1');
  await expect(strip).toContainText('相手');
  await expect(page.getByText('クランクトルク')).toBeVisible();
  await expect(page.getByRole('heading', { name: '設計図' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(strip).toContainText(/時間 (0\.[1-9]|[1-9]\.\d) \/ 15 秒/, { timeout: 20_000 });

  // ゴール(または「結果へ」)→ 結果パネルが右に出る(T-04)
  await strip
    .getByRole('button', { name: '結果へ' })
    .click({ timeout: 5_000 })
    .catch(() => {}); // 先にゴールして結果へ移っていてもよい
  const result = page.getByRole('region', { name: '試走の結果' });
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(html(page)).toHaveAttribute('data-screen', 'result');
  await expect(result).toContainText('クリア!');
  const box = (await result.boundingBox())!;
  expect(box.x).toBeGreaterThan(1280 / 2 - 100); // 機械を隠さないよう右に寄せてある
  await result.click({ position: { x: 20, y: 20 } }); // 演出を飛ばす
  await expect(result.getByRole('button', { name: /次のステージ/ })).toBeVisible();

  // もう一度:前回の試走がゴーストで並走する。Esc で試走をやめて設計に戻る
  await result.getByRole('button', { name: 'もう一度' }).click();
  await expect(strip).toBeVisible({ timeout: 30_000 });
  await expect(strip).toContainText('前回の試走');
  await page.keyboard.press('Escape');
  await expect(html(page)).toHaveAttribute('data-screen', 'design');
  await expect(testRun).toBeVisible({ timeout: 30_000 });
  await expect(strip).toHaveCount(0);

  // もう一度試走して、結果から「設計に戻る」(T-05):製図用紙の設計画面
  await testRun.click();
  await expect(strip).toBeVisible({ timeout: 30_000 });
  await strip
    .getByRole('button', { name: '結果へ' })
    .click({ timeout: 5_000 })
    .catch(() => {});
  await expect(result).toBeVisible({ timeout: 30_000 });
  await result.click({ position: { x: 20, y: 20 } });
  await result.getByRole('button', { name: '設計に戻る' }).click();
  await expect(html(page)).toHaveAttribute('data-screen', 'design');
  await expect(testRun).toBeVisible({ timeout: 30_000 });
  await expect(result).toHaveCount(0);
  w.expectClean();
});

test('試走前チェックに通らない設計は、設計画面のまま問題を出す', async ({ page }) => {
  test.setTimeout(120_000);
  const w = watchErrors(page);
  await page.goto('/');
  await skipLogo(page, 'home');
  // 続きから(初回は 1-1:壊れた機械を直す課題。そのままでは動かない)
  await page.getByRole('menuitem', { name: /続きから/ }).click();
  await expect(html(page)).toHaveAttribute('data-screen', 'design');
  // 試走ボタン(HUD の TestRunButton、INT-7a)は直すところがあると押せない(aria-disabled)。
  // 押すと試走せず、ボタンの上に試走前チェックの一覧が開く
  const run = page.getByRole('group', { name: '試走', exact: true });
  await run.getByRole('button', { name: /試走する/ }).click({ force: true });
  await expect(run.locator('.hud-problems')).toContainText('自由度', { timeout: 20_000 });
  await expect(html(page)).toHaveAttribute('data-screen', 'design');
  await expect(page.getByRole('region', { name: '試走の状況' })).toHaveCount(0);
  w.expectClean();
});
