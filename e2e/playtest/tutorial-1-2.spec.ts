import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from '../helpers';
import * as h from './helpers';
import { expectCleared, play12, shortenCrank } from './play';

/**
 * PLAY-1:1-2「回らないクランク」を、初めての人が吹き出しの指示だけを頼りに直す。
 * 「オレンジ色の棒(クランク)の先の点(いちばん上の点)」を画面の見た目から探し、
 * 「回る矢印のついた軸の方へまっすぐ下げ、今の半分くらいに」をそのままドラッグにする。
 */

const TOTAL = 4;

async function openStage(page: Page) {
  await h.seedCleared(page, ['c1-s1']);
  await page.goto('/?dev=flow');
  await page.getByRole('button', { name: /1-2/ }).click();
}

test('1-2 回らないクランク:吹き出しのとおりにクランクを短くして歩かせる', async ({ page }) => {
  const w = watchErrors(page);
  await openStage(page);
  await play12(page, '12');
  await expectCleared(page);
  w.expectClean();
});

test('1-2 よくある失敗:少ししか縮めないと進まない。吹き出しのとおり半分にすれば進む', async ({
  page,
}) => {
  const w = watchErrors(page);
  await openStage(page);
  await h.clickNext(page);
  await h.clickNext(page);

  // 少しだけ縮める(8 割):まだ回らないので吹き出しは 3 のまま、赤い表示も残る
  await shortenCrank(page, 'A', 'O2', 0.8);
  await h.expectStep(page, 3, TOTAL);
  await expect(page.locator('.ed-link.is-problem').first()).toBeVisible();
  await h.shot(page, '12-03-not-enough');

  // 吹き出しのとおり、元の半分くらいまで下げる(今の長さの 6 割)
  await shortenCrank(page, 'A', 'O2', 0.6);
  await h.expectStep(page, 4, TOTAL);
  await expect(page.locator('.ed-link.is-problem')).toHaveCount(0);
  w.expectClean();
});

/**
 * 回帰テスト:クランクの先を軸の上まで下げると、2cm 未満の短すぎるクランクになる。以前は試走が始まり、
 * 0m のまま時間切れになった。今は「短すぎるリンク」として試走前チェックで止まる。
 * (ドラッグの途中で半分の長さを通るので、その瞬間にチュートリアルが進むのは正しい動き)
 */
test('1-2 クランクを軸の上まで縮めると、試走前に「短すぎるリンク」で止まる', async ({ page }) => {
  const w = watchErrors(page);
  await openStage(page);
  await h.clickNext(page);
  await h.clickNext(page);
  await shortenCrank(page, 'A', 'O2', 0);
  await page.getByRole('button', { name: '試走', exact: true }).click();
  await expect(page.getByText(/短すぎるリンク/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '結果へ' })).toHaveCount(0);
  w.expectClean();
});
