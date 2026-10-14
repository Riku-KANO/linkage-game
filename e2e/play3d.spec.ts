import { expect, test, type Locator, type Page } from '@playwright/test';
import { watchErrors } from './helpers';
import * as h from './playtest/helpers';
import { findRepairTargets } from './playtest/play';

/**
 * INT-8:3D の工房(/)で、初めての人が 1-1 を遊び切る通しプレイ。保存は空から。
 * ホーム → ステージ選択 → 1-1(T-02)→ 吹き出しのとおりに O4 と B をつなぐ → 試走(T-03)→ クリア!
 * → 次のステージ(T-06)→ 1-2 が解放されている → 1-2 の最初の吹き出し。
 * もう 1 本は、直さずに試走を押したとき設計画面のまま問題の一覧が出ること。
 * 3D の工房はソフトウェア描画で重いので、順に走らせる。
 */
test.describe.configure({ mode: 'serial' });

const html = (page: Page) => page.locator('html');

/** ロゴ(T-00)を飛ばしてホームのメニューが出るまで待つ(読み込み中のキーは効かないことがあるので繰り返す) */
async function bootToHome(page: Page) {
  const menu = page.getByRole('menuitem', { name: /ステージ選択/ });
  await expect(async () => {
    await page.keyboard.press('Shift');
    await expect(menu).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await expect(html(page)).toHaveAttribute('data-screen', 'home');
}

/** 設計画面でエディタが紙の上に出るまで待つ */
async function designLive(page: Page, slot: string) {
  await expect(html(page)).toHaveAttribute('data-screen', 'design');
  await expect(html(page)).toHaveAttribute('data-slot', slot);
  const root = page.locator('.ds-root[data-live="true"]');
  await expect(root).toBeVisible({ timeout: 60_000 });
  return root;
}

/** チュートリアルの吹き出し(横の列の上) */
const bubble = (page: Page) => page.getByRole('region', { name: 'チュートリアル', exact: true });

async function expectStep(page: Page, n: number, total: number) {
  await expect(bubble(page).locator('.hud-tut__step')).toHaveText(`ステップ ${n} / ${total}`);
}

async function bubbleText(page: Page) {
  return (await bubble(page).locator('.hud-tut__text').innerText()).trim();
}

/** 試走ボタン(横の列の下)と、その状態の行・問題の一覧 */
const runGroup = (page: Page) => page.getByRole('group', { name: '試走', exact: true });
const runButton = (page: Page) => runGroup(page).getByRole('button', { name: /試走する/ });

/** 設計画面が報告する紙の画面矩形 */
async function paperRect(root: Locator) {
  const [x, y, width, height] = (await root.getAttribute('data-paper-rect'))!
    .split(',')
    .map(Number) as [number, number, number, number];
  return { x, y, width, height };
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test('1-1 を工房で:吹き出しのとおりに直して試走 → クリア → 次のステージで 1-2 が解放', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const w = watchErrors(page);
  await page.goto('/');
  await bootToHome(page);

  // ホーム → ステージ選択 → 1-1(T-01・T-02)
  await page.getByRole('menuitem', { name: /ステージ選択/ }).click();
  const list = page.getByRole('region', { name: /ステージ/ });
  await expect(list).toBeVisible();
  await expect(list.getByRole('button', { name: /^1-1.*次に遊ぶステージ/ })).toBeFocused();
  await expect(list.getByRole('button', { name: /^1-2.*ロック中/ })).toBeVisible();
  await list.getByRole('button', { name: /このステージで遊ぶ/ }).click();
  const root = await designLive(page, 'c1-s1');

  // 1. あいさつ。吹き出しは紙(作業の場所)に重ならない。まだリンクは渡されていない
  await expectStep(page, 1, 6);
  const paper = await paperRect(root);
  expect(overlaps((await bubble(page).boundingBox())!, paper)).toBe(false);
  expect(await h.enabledTools(page)).toEqual(['選択', '脚先', '削除']);
  // 試走ボタンは直すところがあると知らせている(一覧は押すまで出さない)
  await expect(runGroup(page)).toContainText('直すところが 1 つあります');
  await page.screenshot({ path: '.e2e-results/play3d/01-intro.png' });
  await bubble(page).getByRole('button', { name: /次へ/ }).click();

  // 2. 自由度の札:吹き出しが言う札が紙の左上にある
  await expectStep(page, 2, 6);
  expect(await bubbleText(page)).toContain('自由度 2・ぐらつく');
  await expect(h.dofBadge(page)).toHaveText('自由度 2・ぐらつく');
  await bubble(page).getByRole('button', { name: /次へ/ }).click();

  // 3. リンクを渡される。吹き出しの言う 2 点が、本当に直すべき O4 と B
  await expectStep(page, 3, 6);
  expect(await h.enabledTools(page)).toContain('リンク');
  await expect(bubble(page)).toContainText('新しい部品');
  const targets = await findRepairTargets(page);
  expect(targets.fixed).toEqual(['O4']);
  expect(targets.red[0]).toBe('B');
  expect(overlaps((await bubble(page).boundingBox())!, paper)).toBe(false);
  await page.screenshot({ path: '.e2e-results/play3d/03-link.png' });
  await h.toolButton(page, 'リンク').click();
  await h.drag(page, await h.jointCenter(page, 'O4'), await h.jointCenter(page, 'B'));
  await expect(h.dofBadge(page)).toHaveText('自由度 1・正常');

  // 4・5(自由度・一回転)は満たしているので 6 へ。試走ボタンは「準備ができました」
  await expectStep(page, 6, 6);
  expect(await bubbleText(page)).toContain('試走');
  await expect(runGroup(page)).toContainText('準備ができました');
  await page.screenshot({ path: '.e2e-results/play3d/06-fixed.png' });
  await runButton(page).click();

  // 試走(T-03):工房の外の試走コースで本物の sim が走る。吹き出しは終わる
  await expect(html(page)).toHaveAttribute('data-screen', 'testRun');
  const strip = page.getByRole('region', { name: '試走の状況' });
  await expect(strip).toBeVisible({ timeout: 60_000 });
  await strip
    .getByRole('button', { name: '結果へ' })
    .click({ timeout: 5_000 })
    .catch(() => {}); // 先にゴールして結果へ移っていてもよい
  const result = page.getByRole('region', { name: '試走の結果' });
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(html(page)).toHaveAttribute('data-screen', 'result');
  await expect(result).toContainText('クリア!');
  await result.click({ position: { x: 20, y: 20 } }); // 刻印の演出を飛ばす
  await page.screenshot({ path: '.e2e-results/play3d/07-result.png' });

  // 次のステージ(T-06):ステージ選択で 1-2 が解放され、選ばれている
  await result.getByRole('button', { name: /次のステージ/ }).click();
  await expect(html(page)).toHaveAttribute('data-screen', 'stageSelect', { timeout: 30_000 });
  await expect(list).toBeVisible({ timeout: 30_000 });
  await expect(list.getByRole('button', { name: /^1-1.*クリア済み/ })).toBeVisible();
  const s12 = list.getByRole('button', { name: /^1-2.*次に遊ぶステージ/ });
  await expect(s12).toBeVisible();
  await s12.click();
  await list.getByRole('button', { name: /このステージで遊ぶ/ }).click();

  // 1-2 の最初の吹き出し
  await designLive(page, 'c1-s2');
  await expectStep(page, 1, 4);
  expect(await bubbleText(page)).toContain('クランク');
  await page.screenshot({ path: '.e2e-results/play3d/08-next-stage.png' });
  w.expectClean();
});

test('直さずに試走を押すと、設計画面のまま問題の一覧に自由度の問題が出て場所を示す', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const w = watchErrors(page);
  await page.goto('/');
  await bootToHome(page);
  // 続きから(初回は 1-1:壊れた機械。そのままでは動かない)
  await page.getByRole('menuitem', { name: /続きから/ }).click();
  await designLive(page, 'c1-s1');
  await expect(runGroup(page)).toContainText('直すところが 1 つあります');
  await expect(runGroup(page).locator('.hud-problems')).toHaveCount(0);

  // 押せない(aria-disabled)ボタンを押す:試走せず、一覧が開いて場所(ぐらつく点)を選んで示す
  await runButton(page).click({ force: true });
  const problems = runGroup(page).locator('.hud-problems');
  await expect(problems).toBeVisible();
  await expect(problems).toContainText('自由度が 2');
  await expect(page.locator('[data-joint="B"].is-selected')).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(html(page)).toHaveAttribute('data-screen', 'design');
  await expect(page.getByRole('region', { name: '試走の状況' })).toHaveCount(0);
  // 吹き出しはそのまま(チュートリアルは続く)
  await expectStep(page, 1, 6);
  await page.screenshot({ path: '.e2e-results/play3d/blocked.png' });
  w.expectClean();
});
