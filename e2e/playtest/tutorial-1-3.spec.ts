import { expect, test } from '@playwright/test';
import { watchErrors } from '../helpers';
import * as h from './helpers';
import { expectCleared, play13 } from './play';

/**
 * PLAY-1:1-3「はじめての脚」を、初めての人が吹き出しの指示だけを頼りに白紙から組む。
 * 寸法は吹き出しのとおりにマス目で数える(点線の十字が原点、太いマス目 1 つが 10cm)。
 */
test('1-3 はじめての脚:吹き出しのとおりに白紙から組んで歩かせる', async ({ page }) => {
  const w = watchErrors(page);
  await h.seedCleared(page, ['c1-s1', 'c1-s2']);
  await page.goto('/?dev=flow');
  await page.getByRole('button', { name: /1-3/ }).click();
  await play13(page, '13');
  await page.waitForTimeout(1500);
  await h.shot(page, '13-11-running');
  await expectCleared(page);
  await page.waitForTimeout(1500);
  await h.shot(page, '13-12-result');
  w.expectClean();
});

/** 1-3 を 5 番目の吹き出し(長い棒)まで、吹き出しのとおりに進める */
async function buildUpToLongBar(page: import('@playwright/test').Page) {
  await h.seedCleared(page, ['c1-s1', 'c1-s2']);
  await page.goto('/?dev=flow');
  await page.getByRole('button', { name: /1-3/ }).click();
  await h.clickNext(page);
  await h.toolButton(page, '固定点').click();
  const at = await h.gridFrame(page);
  await h.click(page, at(0, 0));
  const [left] = await h.jointIds(page);
  await h.click(page, at(40, 20));
  const [right] = await h.newJoints(page, [left!]);
  await h.toolButton(page, 'リンク').click();
  let before = await h.jointIds(page);
  await h.drag(page, await h.jointCenter(page, left!), at(0, 10));
  const [tip] = await h.newJoints(page, before);
  await h.toolButton(page, 'クランク').click();
  await h.click(page, await h.alongLink(page, left!, tip!, 0.5));
  await h.toolButton(page, 'リンク').click();
  before = await h.jointIds(page);
  await h.drag(page, await h.jointCenter(page, tip!), at(25, -40));
  const [foot] = await h.newJoints(page, before);
  await h.expectStep(page, 6, 10);
  return { left: left!, right: right!, tip: tip!, foot: foot! };
}

test('1-3 よくある失敗:棒の途中に点を足さずにつなぐと、吹き出しが「元に戻す」へ導く', async ({
  page,
}) => {
  const w = watchErrors(page);
  const { right, tip, foot } = await buildUpToLongBar(page);

  // 右の固定点から長い棒のまん中へ(点がないので棒の先が宙に浮く)
  await h.drag(page, await h.jointCenter(page, right), await h.alongLink(page, tip, foot, 0.6));
  await h.expectStep(page, 7, 10);
  expect(await h.bubbleText(page)).toContain('元に戻す');
  await expect(h.dofBadge(page)).not.toContainText('自由度 1');
  await h.shot(page, '13-07-loose');

  // 吹き出しのとおり 1 つ戻して、点を足してからつなぎ直す
  await page.getByRole('button', { name: '元に戻す' }).click();
  const before = await h.jointIds(page);
  await h.click(page, await h.alongLink(page, tip, foot, 0.6));
  const [mid] = await h.newJoints(page, before);
  await h.drag(page, await h.jointCenter(page, mid!), await h.jointCenter(page, right));
  await h.expectStep(page, 9, 10);
  await expect(h.dofBadge(page)).toHaveText('自由度 1・正常');
  w.expectClean();
});

test('1-3 よくある失敗:棒の途中から固定点へドラッグしても、元に戻してやり直せる', async ({
  page,
}) => {
  const w = watchErrors(page);
  const { right, tip, foot } = await buildUpToLongBar(page);

  // クリックせずに棒の途中からドラッグすると、固定点が棒にくっついて固まる
  await h.drag(page, await h.alongLink(page, tip, foot, 0.6), await h.jointCenter(page, right));
  await h.shot(page, '13-06-attached');
  await h.expectStep(page, 6, 10);
  await expect(h.dofBadge(page)).not.toContainText('自由度 1');

  await page.getByRole('button', { name: '元に戻す' }).click();
  const before = await h.jointIds(page);
  await h.click(page, await h.alongLink(page, tip, foot, 0.6));
  const [mid] = await h.newJoints(page, before);
  await h.drag(page, await h.jointCenter(page, mid!), await h.jointCenter(page, right));
  await h.expectStep(page, 9, 10);
  w.expectClean();
});
