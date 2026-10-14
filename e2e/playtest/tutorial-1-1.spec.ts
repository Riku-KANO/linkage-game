import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from '../helpers';
import * as h from './helpers';

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

/** 吹き出しの言う点を、画面の見た目から探す */
async function findTargets(page: Page) {
  // 固定点(地面の印)のうち、どの棒ともつながっていない、右上の点
  const lonelyFixed = await page.locator('[data-joint]').evaluateAll((els) => {
    const linked = new Set<string>();
    // 棒の端は .ed-pin と同じ位置にある。棒に属する点は data-link の線・多角形の頂点から分かる
    document.querySelectorAll('[data-link] .ed-link-inner').forEach((shape) => {
      const pts =
        shape.tagName === 'line'
          ? [
              [shape.getAttribute('x1'), shape.getAttribute('y1')],
              [shape.getAttribute('x2'), shape.getAttribute('y2')],
            ]
          : (shape.getAttribute('points') ?? '').split(' ').map((p) => p.split(','));
      pts.forEach(([x, y]) => linked.add(`${Math.round(Number(x))},${Math.round(Number(y))}`));
    });
    return els
      .filter((el) => el.querySelector('.ed-ground'))
      .map((el) => {
        const pin = el.querySelector('.ed-pin')!;
        const x = Number(pin.getAttribute('cx'));
        const y = Number(pin.getAttribute('cy'));
        return {
          id: el.getAttribute('data-joint')!,
          x,
          y,
          alone: !linked.has(`${Math.round(x)},${Math.round(y)}`),
        };
      })
      .filter((j) => j.alone)
      .map((j) => j.id);
  });
  // 赤い点(ぐらつく点)のうち、いちばん右
  const red = await page.locator('[data-joint].is-problem').evaluateAll((els) =>
    els
      .map((el) => ({
        id: el.getAttribute('data-joint')!,
        x: Number(el.querySelector('.ed-pin')!.getAttribute('cx')),
      }))
      .sort((a, b) => b.x - a.x)
      .map((j) => j.id),
  );
  return { fixed: lonelyFixed, red };
}

test('1-1 こわれた機械:吹き出しのとおりに直して歩かせる', async ({ page }) => {
  const w = watchErrors(page);
  await openStage(page);

  // 1. あいさつ。まだリンクは渡されていない
  await h.expectStep(page, 1, TOTAL);
  expect(await h.enabledTools(page)).toEqual(['選択', '脚先', '削除']);
  await h.shot(page, '11-01-intro');
  await h.clickNext(page);

  // 2. 自由度の札を見る:吹き出しが言う札が設計図にある
  await h.expectStep(page, 2, TOTAL);
  expect(await h.bubbleText(page)).toContain('自由度 2・ぐらつく');
  await expect(h.dofBadge(page)).toHaveText('自由度 2・ぐらつく');
  await h.shot(page, '11-02-dof');
  await h.clickNext(page);

  // 3. リンクを渡される。「右上に 1 つだけ離れている固定点」と「三角の板の右の角の赤い点」をつなぐ
  await h.expectStep(page, 3, TOTAL);
  expect(await h.enabledTools(page)).toContain('リンク');
  const targets = await findTargets(page);
  expect(targets.fixed).toEqual(['O4']);
  expect(targets.red[0]).toBe('B');
  await h.shot(page, '11-03-link');
  await h.toolButton(page, 'リンク').click();
  await h.drag(page, await h.jointCenter(page, 'O4'), await h.jointCenter(page, 'B'));
  await expect(h.dofBadge(page)).toHaveText('自由度 1・正常');

  // 4・5(自由度・一回転)は満たしているので 6 へ
  await h.expectStep(page, 6, TOTAL);
  expect(await h.bubbleText(page)).toContain('試走');
  await h.shot(page, '11-06-fixed');

  // 試走 → クリア、1-2 が解放される
  await page.getByRole('button', { name: '試走', exact: true }).click();
  await expect(h.bubble(page)).toHaveCount(0);
  await h.skipToResult(page);
  await expect(page.getByText('クリア!').first()).toBeVisible();
  await page.mouse.click(10, 700);
  await page.getByRole('button', { name: /次のステージ/ }).click();
  await expect(page.getByText(/1-2/).first()).toBeVisible();
  w.expectClean();
});

test('1-1 よくある失敗:棒の先を点に落とし損ねても、吹き出しのとおりに元に戻して直せる', async ({
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
