import { expect, test, type Page } from '@playwright/test';
import { getStage } from '@/game/stages';
import { watchErrors } from '../helpers';
import * as h from './helpers';

/**
 * PLAY-3:ヒント 3 が「本当に先へ進める」こと。行き詰まった人がヒントを 3 つ開き、
 * ヒント 3 の文言と設計図の影(.ed-ghost)だけを頼りに直して、クリアできるか確かめる。
 */

const CH1 = ['c1-s1', 'c1-s2', 'c1-s3', 'c1-s4', 'c1-s5'];

async function revealAllHints(page: Page) {
  await page.getByRole('button', { name: 'ヒントを見る' }).click();
  await page.getByRole('button', { name: '次のヒントを見る' }).click();
  await page.getByRole('button', { name: '次のヒントを見る' }).click();
  await expect(page.getByRole('button', { name: 'ヒントはもうありません' })).toBeDisabled();
  await expect(page.locator('.ed-ghost')).toBeVisible();
}

/** 影の点(画面座標)。並びはヒントの設計の joints の順 */
async function ghostJoints(page: Page): Promise<h.Pt[]> {
  const box = (await page.locator('.ed-svg').boundingBox())!;
  const pts = await page
    .locator('.ed-ghost .ed-ghost-joint')
    .evaluateAll((els) =>
      els.map((e) => ({ x: Number(e.getAttribute('cx')), y: Number(e.getAttribute('cy')) })),
    );
  return pts.map((p) => ({ x: box.x + p.x, y: box.y + p.y }));
}

async function runAndClear(page: Page) {
  await page.getByRole('button', { name: '試走', exact: true }).click();
  await h.skipToResult(page);
  await expect(page.getByText('クリア!').first()).toBeVisible();
}

test('1-1 ヒント 3:影の棒の端から端へリンクを引けば直る', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/?dev=flow');
  await page.getByRole('button', { name: /1-1/ }).click();
  await page.getByRole('button', { name: 'チュートリアルを飛ばす' }).click();
  await revealAllHints(page);
  await expect(page.locator('.fl-hint').nth(2)).toContainText('影の棒の端から端まで');
  const [a, b] = await ghostJoints(page);
  await h.shot(page, 'hint-11');
  await h.toolButton(page, 'リンク').click();
  await h.drag(page, a!, b!);
  await expect(h.dofBadge(page)).toHaveText('自由度 1・正常');
  await runAndClear(page);
  w.expectClean();
});

test('2-1 ヒント 3:自分の機械の点を影の同じ点に重ねれば段差を越える', async ({ page }) => {
  const w = watchErrors(page);
  await h.seedCleared(page, CH1);
  await page.goto('/?dev=flow');
  await page.getByRole('button', { name: /2-1/ }).click();
  await revealAllHints(page);
  await expect(page.locator('.fl-hint').nth(2)).toContainText('影の同じ点に重ねよう');
  const ghost = getStage('c2-s1')!.hints[2].design;
  const targets = await ghostJoints(page);
  expect(targets).toHaveLength(ghost.joints.length);
  await h.shot(page, 'hint-21-before');
  // 固定点・クランクの先・三角の板の角を、1 つずつ影の点へ(左の固定点はもう重なっている)
  for (const id of ['O4', 'A', 'B', 'F']) {
    const i = ghost.joints.findIndex((j) => j.id === id);
    await h.drag(page, await h.jointCenter(page, id), targets[i]!);
  }
  await h.shot(page, 'hint-21-after');
  await expect(h.dofBadge(page)).toHaveText('自由度 1・正常');
  await runAndClear(page);
  w.expectClean();
});

test('2-3 ヒント 3:いちばん上の点から真下へ伸びる長い棒を削除すれば動く', async ({ page }) => {
  const w = watchErrors(page);
  await h.seedCleared(page, [...CH1, 'c2-s1', 'c2-s2']);
  await page.goto('/?dev=flow');
  await page.getByRole('button', { name: /2-3/ }).click();
  await expect(h.dofBadge(page)).toContainText('自由度 0');
  await revealAllHints(page);
  await expect(page.locator('.fl-hint').nth(2)).toContainText('いちばん上の点からほぼ真下');
  await h.shot(page, 'hint-23');

  // 見た目から探す:いちばん上の点と、そこから伸びる棒のうち、いちばん真下に近い長い棒
  const top = await page.locator('[data-joint]').evaluateAll(
    (els) =>
      els
        .map((e) => ({
          id: e.getAttribute('data-joint')!,
          x: Number(e.querySelector('.ed-pin')!.getAttribute('cx')),
          y: Number(e.querySelector('.ed-pin')!.getAttribute('cy')),
        }))
        .sort((a, b) => a.y - b.y)[0]!,
  );
  const bars = await page.locator('[data-link]').evaluateAll((els) =>
    els.flatMap((e) => {
      const line = e.querySelector('line.ed-link-inner');
      if (!line) return [];
      const n = (a: string) => Number(line.getAttribute(a));
      return [{ id: e.getAttribute('data-link')!, seg: [n('x1'), n('y1'), n('x2'), n('y2')] }];
    }),
  );
  const fromTop = bars
    .map((b) => {
      const [x1, y1, x2, y2] = b.seg as [number, number, number, number];
      const atTop =
        Math.hypot(x1 - top.x, y1 - top.y) < 3 || Math.hypot(x2 - top.x, y2 - top.y) < 3;
      const len = Math.hypot(x2 - x1, y2 - y1);
      return { ...b, atTop, len, slant: Math.abs(x2 - x1) / len };
    })
    .filter((b) => b.atTop && b.slant < 0.2)
    .sort((a, b) => b.len - a.len);
  expect(fromTop.map((b) => b.id)).toEqual(['brace']);
  await expect(page.locator('[data-link="brace"]')).toHaveClass(/is-problem/);

  await h.toolButton(page, '削除').click();
  const box = (await page.locator('.ed-svg').boundingBox())!;
  const [x1, y1, x2, y2] = fromTop[0]!.seg as [number, number, number, number];
  await h.click(page, { x: box.x + (x1 + x2) / 2, y: box.y + (y1 + y2) / 2 });
  await expect(h.dofBadge(page)).toHaveText('自由度 1・正常');
  await runAndClear(page);
  w.expectClean();
});
