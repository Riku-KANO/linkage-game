import { expect, type Page } from '@playwright/test';
import * as h from './helpers';

/**
 * チュートリアル 1-1・1-2・1-3 を、吹き出しの指示だけを頼りに最後まで遊ぶ(PLAY-1)。
 * どれもそのステージの設計画面(吹き出し 1)から始め、「試走」を押して吹き出しが消えたところで終わる。
 * shots を渡すと各ステップを .e2e-results/playtest/<prefix>-*.png に撮る(読みやすさを目で確かめる用)。
 */

type Shots = string | undefined;
const snap = (page: Page, shots: Shots, name: string) =>
  shots ? h.shot(page, `${shots}-${name}`) : Promise.resolve();

/** 吹き出しが言う点を、画面の見た目から探す(1-1) */
export async function findRepairTargets(page: Page) {
  // 固定点(地面の印)のうち、どの棒ともつながっていない点
  const lonelyFixed = await page.locator('[data-joint]').evaluateAll((els) => {
    const linked = new Set<string>();
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
        const key = `${Math.round(Number(pin.getAttribute('cx')))},${Math.round(Number(pin.getAttribute('cy')))}`;
        return { id: el.getAttribute('data-joint')!, alone: !linked.has(key) };
      })
      .filter((j) => j.alone)
      .map((j) => j.id);
  });
  // 赤い点(ぐらつく点)を右から順に
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

/** 1-1 こわれた機械:右上の離れた固定点と、三角の板の右の角の赤い点をつなぐ */
export async function play11(page: Page, shots?: string) {
  const TOTAL = 6;
  // 1. あいさつ。まだリンクは渡されていない
  await h.expectStep(page, 1, TOTAL);
  expect(await h.enabledTools(page)).toEqual(['選択', '脚先', '削除']);
  await snap(page, shots, '01-intro');
  await h.clickNext(page);

  // 2. 自由度の札を見る:吹き出しが言う札が設計図にある
  await h.expectStep(page, 2, TOTAL);
  expect(await h.bubbleText(page)).toContain('自由度 2・ぐらつく');
  await expect(h.dofBadge(page)).toHaveText('自由度 2・ぐらつく');
  await snap(page, shots, '02-dof');
  await h.clickNext(page);

  // 3. リンクを渡される。吹き出しの言う 2 点が、本当に直すべき O4 と B
  await h.expectStep(page, 3, TOTAL);
  expect(await h.enabledTools(page)).toContain('リンク');
  const targets = await findRepairTargets(page);
  expect(targets.fixed).toEqual(['O4']);
  expect(targets.red[0]).toBe('B');
  await snap(page, shots, '03-link');
  await h.toolButton(page, 'リンク').click();
  await h.drag(page, await h.jointCenter(page, 'O4'), await h.jointCenter(page, 'B'));
  await expect(h.dofBadge(page)).toHaveText('自由度 1・正常');

  // 4・5(自由度・一回転)は満たしているので 6 へ
  await h.expectStep(page, 6, TOTAL);
  expect(await h.bubbleText(page)).toContain('試走');
  await snap(page, shots, '06-fixed');
  await page.getByRole('button', { name: '試走', exact: true }).click();
  await expect(h.bubble(page)).toHaveCount(0);
}

/** オレンジ色の棒(クランク)の先の点を、軸の方へ動かして長さを keep 倍にする */
export async function shortenCrank(page: Page, tip: string, axis: string, keep: number) {
  const a = await h.jointCenter(page, tip);
  const o = await h.jointCenter(page, axis);
  await h.drag(page, a, { x: o.x + (a.x - o.x) * keep, y: o.y + (a.y - o.y) * keep });
}

/** 1-2 回らないクランク:クランクの先(いちばん上の点)を軸の方へ下げて半分に */
export async function play12(page: Page, shots?: string) {
  const TOTAL = 4;
  await h.expectStep(page, 1, TOTAL);
  await expect(page.locator('.ed-link.is-problem').first()).toBeVisible();
  await snap(page, shots, '01-stuck');
  await h.clickNext(page);
  await h.expectStep(page, 2, TOTAL);
  await snap(page, shots, '02-grashof');
  await h.clickNext(page);

  // 3. 「オレンジ色の棒」の先で「いちばん上の点」が、動かせる点 A
  await h.expectStep(page, 3, TOTAL);
  expect(await h.enabledTools(page)).toEqual(['選択', '脚先', '削除']);
  await expect(page.locator('[data-link].is-crank')).toHaveCount(1);
  await expect(page.locator('[data-link="crank"]')).toHaveClass(/is-crank/);
  const topmost = await page.locator('[data-joint]').evaluateAll(
    (els) =>
      els
        .map((el) => ({
          id: el.getAttribute('data-joint')!,
          y: Number(el.querySelector('.ed-pin')!.getAttribute('cy')),
        }))
        .sort((a, b) => a.y - b.y)[0]!.id,
  );
  expect(topmost).toBe('A');
  await snap(page, shots, '03-shorten');
  await shortenCrank(page, 'A', 'O2', 0.5);

  // 4. 一回転できる:赤い表示が消えて試走へ
  await h.expectStep(page, 4, TOTAL);
  await expect(page.locator('.ed-link.is-problem')).toHaveCount(0);
  await expect(page.getByText('一回転できます', { exact: true })).toBeVisible();
  await snap(page, shots, '04-fixed');
  await page.getByRole('button', { name: '試走', exact: true }).click();
  await expect(h.bubble(page)).toHaveCount(0);
}

/**
 * 1-3 はじめての脚:白紙から。寸法は吹き出しのとおりにマス目で数える
 * (点線の十字が原点、太いマス目 1 つが 10cm)。
 */
export async function play13(page: Page, shots?: string) {
  const TOTAL = 10;
  // 1. あいさつ。まだ部品はない(選択・脚先・削除だけ)
  await h.expectStep(page, 1, TOTAL);
  expect(await h.enabledTools(page)).toEqual(['選択', '脚先', '削除']);
  await snap(page, shots, '01-intro');
  await h.clickNext(page);

  // 2. 固定点を 2 つ:点線の十字と、右へ太いマス目 4・上へ 2
  await h.expectStep(page, 2, TOTAL);
  expect(await h.bubbleText(page)).toContain('固定点');
  expect(await h.enabledTools(page)).toContain('固定点');
  await snap(page, shots, '02-fixed');
  await h.toolButton(page, '固定点').click();
  const at = await h.gridFrame(page);
  await h.click(page, at(0, 0));
  const [left] = await h.jointIds(page);
  expect(await h.selectedXY(page)).toEqual({ x: 0, y: 0 });
  await h.click(page, at(40, 20));
  const [right] = await h.newJoints(page, [left!]);
  expect(await h.selectedXY(page)).toEqual({ x: 40, y: 20 });

  // 3. 左の固定点から真上へ 10cm の短い棒
  await h.expectStep(page, 3, TOTAL);
  expect(await h.enabledTools(page)).toContain('リンク');
  await snap(page, shots, '03-short-bar');
  await h.toolButton(page, 'リンク').click();
  let before = await h.jointIds(page);
  await h.drag(page, await h.jointCenter(page, left!), at(0, 10));
  const [tip] = await h.newJoints(page, before);
  const [crankLink] = await h.linkIds(page);

  // 4. クランク:いま引いた短い棒をクリック
  await h.expectStep(page, 4, TOTAL);
  expect(await h.enabledTools(page)).toContain('クランク');
  await snap(page, shots, '04-crank');
  await h.toolButton(page, 'クランク').click();
  await h.click(page, await h.alongLink(page, left!, tip!, 0.5));
  await expect(page.locator(`[data-link="${crankLink}"]`)).toHaveClass(/is-crank/);

  // 5. クランクの上の端から右下へ長い棒(右へ 2.5 マス、下へ 5 マス)
  await h.expectStep(page, 5, TOTAL);
  await snap(page, shots, '05-long-bar');
  await h.toolButton(page, 'リンク').click();
  before = await h.jointIds(page);
  await h.drag(page, await h.jointCenter(page, tip!), at(25, 10 - 50));
  const [foot] = await h.newJoints(page, before);
  await expect(h.dofBadge(page)).toContainText('自由度 2');

  // 6. 「リンク」のまま、長い棒のまん中より少し下をクリックして点を足し、その点から右の固定点へ
  await h.expectStep(page, 6, TOTAL);
  await snap(page, shots, '06-connect');
  before = await h.jointIds(page);
  await h.click(page, await h.alongLink(page, tip!, foot!, 0.6));
  const [mid] = await h.newJoints(page, before);
  expect(mid).toBeDefined();
  await h.drag(page, await h.jointCenter(page, mid!), await h.jointCenter(page, right!));
  await expect(h.dofBadge(page)).toContainText('自由度 1・正常');

  // 7・8(自由度・一回転)は満たしているので飛ばして 9 へ:脚先を決めて進む向きを見る
  await h.expectStep(page, 9, TOTAL);
  await snap(page, shots, '09-moving');
  await h.toolButton(page, '脚先').click();
  await h.click(page, await h.jointCenter(page, foot!));
  await expect(page.locator('.ed-walk-text')).toContainText('前へ進む');
  await snap(page, shots, '09-foot');
  await h.clickNext(page);

  // 10. 試走
  await h.expectStep(page, 10, TOTAL);
  await snap(page, shots, '10-ready');
  await page.getByRole('button', { name: '試走', exact: true }).click();
  await expect(h.bubble(page)).toHaveCount(0);
  return { left: left!, right: right!, tip: tip!, foot: foot! };
}

/** 試走の結果まで進めてクリアを確かめ、結果の演出を飛ばす */
export async function expectCleared(page: Page) {
  await h.skipToResult(page);
  await expect(page.getByText('クリア!').first()).toBeVisible();
  await page.mouse.click(10, 700);
}
