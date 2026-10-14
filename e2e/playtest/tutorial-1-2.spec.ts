import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from '../helpers';
import * as h from './helpers';

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

/** オレンジ色の棒(クランク)の、軸でない方の端の点と、いちばん上の点 */
async function crankTip(page: Page) {
  const crank = page.locator('[data-link].is-crank');
  await expect(crank).toHaveCount(1);
  const ids = await page.locator('[data-joint]').evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute('data-joint')!,
      fixed: !!el.querySelector('.ed-ground'),
      y: Number(el.querySelector('.ed-pin')!.getAttribute('cy')),
    })),
  );
  const topmost = [...ids].sort((a, b) => a.y - b.y)[0]!.id;
  // 回る矢印のついた軸(固定点)
  const axis = ids.filter((j) => j.fixed);
  return { topmost, axis };
}

/** クランクの先の点を、軸の方へ (1 - keep) だけ動かす(keep = 残す長さの割合) */
async function shortenCrank(page: Page, tip: string, axis: string, keep: number) {
  const a = await h.jointCenter(page, tip);
  const o = await h.jointCenter(page, axis);
  await h.drag(page, a, { x: o.x + (a.x - o.x) * keep, y: o.y + (a.y - o.y) * keep });
}

test('1-2 回らないクランク:吹き出しのとおりにクランクを短くして歩かせる', async ({ page }) => {
  const w = watchErrors(page);
  await openStage(page);

  // 1・2. 説明を読む。赤い表示(一回転できない)が出ている
  await h.expectStep(page, 1, TOTAL);
  await expect(page.locator('.ed-chip-fail, .ed-link.is-problem').first()).toBeVisible();
  await h.shot(page, '12-01-stuck');
  await h.clickNext(page);
  await h.expectStep(page, 2, TOTAL);
  await h.shot(page, '12-02-grashof');
  await h.clickNext(page);

  // 3. クランクの先(いちばん上の点)をつかんで、軸の方へまっすぐ下げて半分に
  await h.expectStep(page, 3, TOTAL);
  expect(await h.enabledTools(page)).toEqual(['選択', '脚先', '削除']);
  const { topmost } = await crankTip(page);
  expect(topmost).toBe('A');
  await expect(page.locator('[data-link="crank"]')).toHaveClass(/is-crank/);
  await h.shot(page, '12-03-shorten');
  await shortenCrank(page, 'A', 'O2', 0.5);

  // 4. 一回転できる:赤い表示が消えて試走へ
  await h.expectStep(page, 4, TOTAL);
  await expect(page.locator('.ed-link.is-problem')).toHaveCount(0);
  await expect(page.getByText('一回転できます', { exact: true })).toBeVisible();
  await h.shot(page, '12-04-fixed');
  await page.getByRole('button', { name: '試走', exact: true }).click();
  await expect(h.bubble(page)).toHaveCount(0);
  await h.skipToResult(page);
  await expect(page.getByText('クリア!').first()).toBeVisible();
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
 * 既知の問題(editor・kinematics、報告済み):クランクの先を軸の上まで下げると、長さ 0 のクランクが
 * 「一回転できる」と判定され、チュートリアルが「一回転できるようになりました!」へ進んでしまう
 * (機械は動かず、試走は時間切れ)。直ったら fixme を外す。
 */
test.fixme('1-2 クランクの先を軸に重ねても「一回転できる」にはならない', async ({ page }) => {
  await openStage(page);
  await h.clickNext(page);
  await h.clickNext(page);
  await shortenCrank(page, 'A', 'O2', 0);
  await h.expectStep(page, 3, TOTAL);
  await expect(page.getByText('一回転できます', { exact: true })).toHaveCount(0);
});
