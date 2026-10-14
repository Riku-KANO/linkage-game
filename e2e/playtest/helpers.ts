import { expect, type Locator, type Page } from '@playwright/test';

/**
 * 初めての人の手順でチュートリアルを遊ぶ E2E の補助(PLAY-1)。
 * 画面に見えるもの(吹き出しの文言、道具のボタン、設計図の点)だけを使って操作する。
 * 点の位置は data-joint の .ed-pin(設計姿勢の点。動いている青い姿勢ではない)から読む。
 */

export type Pt = { x: number; y: number };

/** チュートリアルの吹き出し */
export function bubble(page: Page): Locator {
  return page.locator('.fl-bubble');
}

/** 吹き出しの「チュートリアル n / N」 */
export async function expectStep(page: Page, n: number, total: number) {
  await expect(bubble(page)).toContainText(`チュートリアル ${n} / ${total}`);
}

/** 吹き出しの本文 */
export async function bubbleText(page: Page): Promise<string> {
  return (await bubble(page).locator('p').innerText()).trim();
}

/** 吹き出しの「次へ」 */
export async function clickNext(page: Page) {
  await bubble(page).getByRole('button', { name: '次へ' }).click();
}

/** 道具のボタン(リンク・固定点・クランク・脚先・削除・選択) */
export function toolButton(page: Page, name: string): Locator {
  return page.getByRole('toolbar', { name: '道具' }).getByRole('button', { name, exact: true });
}

/** 今使える道具の名前(押せるボタンだけ) */
export async function enabledTools(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const name of ['選択', 'リンク', '固定点', 'クランク', '脚先', '削除']) {
    if (await toolButton(page, name).isEnabled()) out.push(name);
  }
  return out;
}

/** 設計図の点(data-joint)の画面上の中心 */
export async function jointCenter(page: Page, id: string): Promise<Pt> {
  const box = (await page.locator(`[data-joint="${id}"] .ed-pin`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** 設計図にある点の id(並び順) */
export async function jointIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-joint]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-joint') ?? ''));
}

/** 設計図のリンクの id */
export async function linkIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-link]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-link') ?? ''));
}

/** 本物のマウスでドラッグする(途中の move も送る) */
export async function drag(page: Page, a: Pt, b: Pt) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}

export async function click(page: Page, p: Pt) {
  await page.mouse.click(p.x, p.y);
}

/** 設計図(SVG)の枠 */
export async function canvasBox(page: Page) {
  return (await page.locator('.ed-svg').boundingBox())!;
}

/** 自由度のバッジ(設計図の左上) */
export function dofBadge(page: Page): Locator {
  return page.locator('.ed-chips .ed-badge');
}

/**
 * 設計図のマス目から、設計座標(cm)→ 画面座標の変換を作る。プレイヤーが見るものと同じ:
 * 点線の十字(座標軸)が原点、細いマス目 1 つが 1cm(太いマス目は 10cm)。y は上向き。
 */
export async function gridFrame(page: Page): Promise<(x: number, y: number) => Pt> {
  const svg = page.locator('.ed-svg');
  const box = (await svg.boundingBox())!;
  const g = await svg.evaluate((el) => {
    const axes = [...el.querySelectorAll('line.ed-axis')];
    const h = axes.find((l) => l.getAttribute('y1') === l.getAttribute('y2'))!;
    const v = axes.find((l) => l.getAttribute('x1') === l.getAttribute('x2'))!;
    const minor = el.querySelector('#ed-grid-minor')!;
    return {
      ox: Number(v.getAttribute('x1')),
      oy: Number(h.getAttribute('y1')),
      minorPx: Number(minor.getAttribute('width')),
    };
  });
  // 細いマス目が 4px 以上なら 1 目盛り 1cm(src/editor/viewport.ts の gridSteps)
  expect(g.minorPx).toBeGreaterThanOrEqual(4);
  expect(g.minorPx).toBeLessThan(40);
  const scale = g.minorPx;
  return (x, y) => ({ x: box.x + g.ox + x * scale, y: box.y + g.oy - y * scale });
}

/** リンク(data-link)の 2 つの端点の間の、端から t の位置(画面座標) */
export async function alongLink(page: Page, a: string, b: string, t: number): Promise<Pt> {
  const pa = await jointCenter(page, a);
  const pb = await jointCenter(page, b);
  return { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t };
}

/** 選択パネルに出ている点の座標(cm) */
export async function selectedXY(page: Page): Promise<{ x: number; y: number }> {
  const x = await page.getByLabel('x(cm)').inputValue();
  const y = await page.getByLabel('y(cm)').inputValue();
  return { x: Number(x), y: Number(y) };
}

/** 新しく増えた点の id(before にないもの) */
export async function newJoints(page: Page, before: string[]): Promise<string[]> {
  return (await jointIds(page)).filter((id) => !before.includes(id));
}

/** 画面写真(.e2e-results/playtest/<name>.png)。読みやすさを目で確かめる用 */
export async function shot(page: Page, name: string) {
  await page.screenshot({ path: `.e2e-results/playtest/${name}.png` });
}

/** 試走を押して、結果(クリア/失敗)が出るまで待つ。途中は「結果へ」で飛ばさない */
export async function testRun(page: Page) {
  await page.getByRole('button', { name: '試走', exact: true }).click();
  await expect(page.locator('.fl-run, .fl-result').first()).toBeVisible();
}

/** 結果画面まで進める(「結果へ」で最後まで一気に計算) */
export async function skipToResult(page: Page) {
  const toResult = page.getByRole('button', { name: '結果へ' });
  await toResult.click({ timeout: 15_000 }).catch(() => {});
  await expect(page.locator('.fl-result')).toBeVisible({ timeout: 20_000 });
}

/** 保存する進行のキー(src/core/storage/persistence.ts の storageKeys.progress) */
const PROGRESS_KEY = 'ashikumi/v1/progress';

/**
 * 指定したステージをクリア済みにした進行を、ページを開く前に localStorage へ入れる
 * (前のステージを遊ばずに、そのステージから始めるため)。章の解放は起動時に導き直される。
 */
export async function seedCleared(page: Page, stageIds: string[]) {
  const best: Record<string, unknown> = {};
  for (const id of stageIds) {
    best[id] = {
      stageId: id,
      cleared: true,
      reason: null,
      time: 14,
      parts: 30,
      cost: 9999,
      energy: 9999,
      distance: 5,
      medals: { time: null, parts: null, cost: null, energy: null },
    };
  }
  const progress = { version: 1, best, unlockedChapters: [1], zukan: [], seenTransitions: [] };
  await page.addInitScript(
    ([key, value]) => {
      if (!localStorage.getItem(key!)) localStorage.setItem(key!, value!);
    },
    [PROGRESS_KEY, JSON.stringify(progress)],
  );
}
