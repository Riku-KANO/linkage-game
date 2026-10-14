import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from '../helpers';
import * as h from './helpers';
import { expectCleared, play11 } from './play';

/**
 * PLAY-1:1-1「こわれた機械」を、初めての人が吹き出しの指示だけを頼りに直す。
 * 吹き出しが言う「右上に 1 つだけ離れている固定点」「三角の板の右の角にある赤い点」を、
 * 画面に見えるもの(地面の印・赤い点・位置)から探し、それが本当に直すべき点(O4・B)か確かめる。
 */

const TOTAL = 6;

async function openStage(page: Page) {
  await page.goto('/?dev=flow');
  await page.getByRole('button', { name: /1-1/ }).click();
}

test('1-1 こわれた機械:吹き出しのとおりに直して歩かせる', async ({ page }) => {
  const w = watchErrors(page);
  await openStage(page);
  await play11(page, '11');
  await expectCleared(page);
  await page.getByRole('button', { name: /次のステージ/ }).click();
  await expect(page.getByText(/1-2/).first()).toBeVisible();
  w.expectClean();
});

test('1-1 よくある失敗:点に落とし損ねても、違う点につないでも、吹き出しのとおり元に戻して直せる', async ({
  page,
}) => {
  const w = watchErrors(page);
  await openStage(page);
  await h.clickNext(page);
  await h.clickNext(page);
  await h.toolButton(page, 'リンク').click();

  // 赤い点の手前で離してしまう
  const o4 = await h.jointCenter(page, 'O4');
  const b = await h.jointCenter(page, 'B');
  await h.drag(page, o4, { x: o4.x + (b.x - o4.x) * 0.4 + 30, y: o4.y + (b.y - o4.y) * 0.4 });
  await h.expectStep(page, 4, TOTAL);
  expect(await h.bubbleText(page)).toContain('元に戻す');
  await expect(h.dofBadge(page)).toContainText('ぐらつく');
  await h.shot(page, '11-04-missed');

  // 吹き出しのとおり「元に戻す」で取り消す。こんどは違う点(クランクの先)につないでしまう
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(h.dofBadge(page)).toHaveText('自由度 2・ぐらつく');
  await h.drag(page, o4, await h.jointCenter(page, 'A'));
  await h.expectStep(page, 5, TOTAL);
  expect(await h.bubbleText(page)).toContain('つなぎ直し');
  await h.shot(page, '11-05-wrong-point');

  // もう一度「元に戻す」で取り消して、正しい点につなぎ直す
  await page.getByRole('button', { name: '元に戻す' }).click();
  await h.drag(page, o4, b);
  await h.expectStep(page, 6, TOTAL);
  await expect(h.dofBadge(page)).toHaveText('自由度 1・正常');
  w.expectClean();
});
