import { expect, test, type Locator, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/** ホームから「続きから」で設計画面へ(T-07)。エディタが紙の上に出るまで待つ */
async function openDesign(page: Page) {
  await page.goto('/');
  const cont = page.getByRole('menuitem', { name: /続きから/ });
  // T-00 のロゴは任意のキーで飛ばせる。読み込み中に押すと効かないことがあるので、メニューが出るまで
  // 害のない Shift を繰り返す(scene.spec・home.spec と同じ)
  await expect(async () => {
    await page.keyboard.press('Shift');
    await expect(cont).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 40_000 });
  await cont.click();
  await expect(page.locator('html')).toHaveAttribute('data-screen', 'design');
  const root = page.locator('.ds-root[data-live="true"]');
  await expect(root).toBeVisible();
  return { cont, root };
}

/** 設計画面が報告する紙の画面矩形(usePaperViewport の値) */
async function paperRect(root: Locator) {
  const [x, y, width, height] = (await root.getAttribute('data-paper-rect'))!
    .split(',')
    .map(Number) as [number, number, number, number];
  return { x, y, width, height };
}

async function expectOnPaper(page: Page, root: Locator, tol = 1.5) {
  const svg = page.locator('svg.ed-svg');
  await expect(svg).toBeVisible();
  await expect
    .poll(async () => {
      const r = await paperRect(root);
      const b = (await svg.boundingBox())!;
      return Math.max(
        Math.abs(b.x - r.x),
        Math.abs(b.y - r.y),
        Math.abs(b.width - r.width),
        Math.abs(b.height - r.height),
      );
    })
    .toBeLessThan(tol);
}

/**
 * 3D の製図用紙が本当にその矩形に描かれているか、画面の画素で確かめる:
 * 紙の左の縁の少し内側は明るい紙、少し外側は作業台の木(緑の成分がずっと低い)。
 */
async function expectPaperPixelsAt(page: Page, r: { x: number; y: number; height: number }) {
  const png = (await page.screenshot()).toString('base64');
  const samples = await page.evaluate(
    async ({ png, r }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const g = (x: number, y: number) =>
        ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data[1]!;
      return [0.35, 0.5, 0.65].map((f) => {
        const y = r.y + r.height * f;
        return { inside: g(r.x + 5, y), outside: g(r.x - 7, y) };
      });
    },
    { png, r },
  );
  for (const s of samples)
    expect(s.inside - s.outside, JSON.stringify(samples)).toBeGreaterThan(40);
}

test('the editor lies exactly on the drafting paper; panels leave the paper free', async ({
  page,
}) => {
  // 3D の工房の起動と設計画面への遷移(並行実行のソフトウェア描画では時間がかかる)
  test.slow();
  const w = watchErrors(page);
  const { root } = await openDesign(page);
  await expectOnPaper(page, root);
  const r = await paperRect(root);
  await expectPaperPixelsAt(page, r);

  // 道具の帯・横のパネル・上の帯は紙に重ならない
  const toolbar = (await page.locator('.ds-editor .ed-toolbar').boundingBox())!;
  const side = (await page.locator('.ds-editor .ed-side').boundingBox())!;
  const header = (await page.locator('.ds-header').boundingBox())!;
  expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(r.y + 0.5);
  expect(header.y + header.height).toBeLessThanOrEqual(r.y + 0.5);
  expect(side.x).toBeGreaterThanOrEqual(r.x + r.width - 0.5);
  await expect(page.getByRole('button', { name: '試走する' })).toBeVisible();
  await expect(page.getByRole('button', { name: /戻る/ })).toBeVisible();
  w.expectClean();
});

test('drag a joint on the paper, then Esc clears the selection and Esc again goes home', async ({
  page,
}) => {
  // 3D の工房の起動と設計画面への遷移(並行実行のソフトウェア描画では時間がかかる)
  test.slow();
  const w = watchErrors(page);
  const { cont, root } = await openDesign(page);
  const badge = page.locator('.ed-canvas .ed-chips .ed-badge');
  await expect(badge).toContainText('自由度');

  // 続きからの 1-1(こわれた機械)の点はどれも動かせないので、空いた所に棒を 1 本引いてから、その端を動かす
  const r = await paperRect(root);
  const a = { x: r.x + r.width * 0.15, y: r.y + r.height * 0.78 };
  const b = { x: r.x + r.width * 0.3, y: r.y + r.height * 0.86 };
  const drag = async (p: { x: number; y: number }, q: { x: number; y: number }) => {
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(q.x, q.y, { steps: 10 });
    await page.mouse.up();
  };
  const joints = page.locator('.ed-joint');
  const n0 = await joints.count();
  await page.getByRole('button', { name: 'リンク', exact: true }).click();
  await drag(a, b);
  await expect(joints).toHaveCount(n0 + 2);
  await page.getByRole('button', { name: '選択', exact: true }).click();
  // 引いた棒の端(一番新しい点)をつかんで動かす
  const pin = joints.last().locator('.ed-pin');
  const before = Number(await pin.getAttribute('cx'));
  const pb = (await pin.boundingBox())!;
  const x = pb.x + pb.width / 2;
  const y = pb.y + pb.height / 2;
  await drag({ x, y }, { x: x + 24, y: y - 16 });
  await expect.poll(async () => Number(await pin.getAttribute('cx'))).toBeGreaterThan(before + 10);
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('自由度');
  await expect(page.locator('.ed-joint.is-selected')).toHaveCount(1);

  // 紙の上の右クリックはエディタのもの(戻らない)
  await page.mouse.click(x + 24, y - 16, { button: 'right' });
  await page.waitForTimeout(300);
  await expect(root).toBeVisible();

  // 1 回目の Esc は選択を外すだけ
  await page.keyboard.press('Escape');
  await expect(page.locator('.ed-joint.is-selected')).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(root).toBeVisible();
  // 取り消すものがなければ Esc は「戻る」:ホームへ
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-screen', 'home');
  await expect(cont).toBeVisible();
  await expect(page.locator('.ds-root')).toHaveCount(0);
  w.expectClean();
});

test('resizing the window keeps the editor aligned with the paper (also the narrow layout)', async ({
  page,
}) => {
  // 3D の工房の起動と設計画面への遷移(並行実行のソフトウェア描画では時間がかかる)
  test.slow();
  const w = watchErrors(page);
  const { root } = await openDesign(page);
  const r0 = await paperRect(root);

  await page.setViewportSize({ width: 1024, height: 640 });
  await expect.poll(async () => (await paperRect(root)).width).not.toBeCloseTo(r0.width, 0);
  await expectOnPaper(page, root);
  await expectPaperPixelsAt(page, await paperRect(root));

  // 幅が狭いと横のパネルは紙の下に回る
  await page.setViewportSize({ width: 820, height: 900 });
  await expect(page.locator('.ds-root.is-compact')).toBeVisible();
  await expectOnPaper(page, root);
  const r = await paperRect(root);
  const side = (await page.locator('.ds-editor .ed-side').boundingBox())!;
  expect(side.y).toBeGreaterThanOrEqual(r.y + r.height - 0.5);
  w.expectClean();
});
