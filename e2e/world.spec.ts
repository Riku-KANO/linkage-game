import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/**
 * world(WORLD-1・WORLD-2):ステージ選択のジオラマと T-06、工房が育つこと。
 * ?dev=scene の開発用パネル(window.__worldDev)で進行を偽装する。
 */

type AppLike = {
  getState(): { screen: string; stageId: string | null; transition: unknown };
};

async function openStageSelect(page: Page) {
  await page.goto('/?dev=scene');
  await page.waitForFunction(() => !!window.__worldDev && !!window.__sceneDev);
  // T-00 のロゴはクリックで飛ばせる
  await page.mouse.click(640, 300);
  const menu = page.getByRole('menuitem', { name: /ステージ選択/ });
  await expect(menu).toBeVisible();
  await menu.click();
  await waitSettled(page, 'stageSelect');
}

/** 画面に着いて遷移が終わるまで待つ */
async function waitSettled(page: Page, screen: string) {
  await page.waitForFunction((want) => {
    const app = (window.__sceneDev as { useApp: AppLike }).useApp.getState();
    return app.screen === want && app.transition === null;
  }, screen);
}

/** 描画を n フレーム進める(負荷が高くフレームが遅いときも、カメラが実際に動いた後に読む) */
async function frames(page: Page, n: number) {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let k = 0;
        const step = () => (++k >= count ? resolve() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    n,
  );
}

/** 目印の画面上の位置(カメラが止まって位置が動かなくなるまで待つ) */
async function markerAt(page: Page, id: string) {
  const read = () =>
    page.evaluate((sid) => window.__worldDev!.worldDebug.markerScreen?.(sid) ?? null, id);
  let last = await read();
  for (let i = 0; i < 60; i++) {
    await frames(page, 12);
    const p = await read();
    expect(p).not.toBeNull();
    if (p && last && Math.hypot(p.x - last.x, p.y - last.y) < 0.5) return p;
    last = p;
  }
  throw new Error(`marker ${id} did not settle`);
}

test('ステージ選択:目印のホバーでステージ名、クリアを偽装すると T-06 で機械が次のステージへ歩く', async ({
  page,
}) => {
  const w = watchErrors(page);
  await openStageSelect(page);

  // 最初は 1-1 だけ遊べる。ホバーするとステージ名のラベルが浮かぶ
  const p1 = await markerAt(page, 'c1-s1');
  await page.mouse.move(p1.x, p1.y);
  await expect(page.locator('.ak-world-label')).toContainText('こわれた機械');
  await expect(page.locator('.ak-world-label')).toContainText('挑戦できます');
  expect(await page.evaluate(() => window.__worldDev!.useWorld.getState().hoveredStageId)).toBe(
    'c1-s1',
  );
  await page.mouse.move(5, 5);

  // 開発用パネルで 1-1 のクリアを偽装し、結果画面から T-06
  await page.getByRole('button', { name: 'クリアして T-06' }).click();
  await page.waitForFunction(() => window.__worldDev!.useWorld.getState().walking !== null);
  expect(await page.evaluate(() => window.__worldDev!.useWorld.getState().walking)).toEqual({
    from: 'c1-s1',
    to: 'c1-s2',
  });
  // カメラが歩く区間に寄り、機械は次の目印まで歩き切る
  expect(await page.evaluate(() => window.__worldDev!.worldDebug.closeUp)).toBe(true);
  await page.waitForFunction(() => {
    const s = window.__worldDev!.useWorld.getState();
    return s.walking === null && s.currentStageId === 'c1-s2';
  });
  expect(await page.evaluate(() => window.__worldDev!.worldDebug.walkProgress)).toBe(1);
  // 少し見せてから全体の定位置へ引く
  await page.waitForFunction(() => !window.__worldDev!.worldDebug.closeUp);
  await waitSettled(page, 'stageSelect');

  // クリアした 1-1 はクリア(メダル付き)、2 つ目が遊べる
  const p1b = await markerAt(page, 'c1-s1');
  await page.mouse.move(p1b.x, p1b.y);
  await expect(page.locator('.ak-world-label')).toContainText('クリア');
  await expect(page.locator('.ak-world-medal')).toHaveCount(4);

  // 遊べる目印をクリックすると、そのステージで設計画面へ(T-02)
  const p2 = await markerAt(page, 'c1-s2');
  await page.mouse.click(p2.x, p2.y);
  await page.waitForFunction(() => {
    const app = (window.__sceneDev as { useApp: AppLike }).useApp.getState();
    return app.screen === 'design' && app.stageId === 'c1-s2';
  });
  w.expectClean();
});

test('T-06 はクリックでスキップでき、機械は次の目印に着いている', async ({ page }) => {
  const w = watchErrors(page);
  await openStageSelect(page);
  await page.evaluate(() => window.__worldDev!.clearAndWalk());
  await page.waitForFunction(() => window.__worldDev!.useWorld.getState().walking !== null);
  // 遷移中(カメラの移動中)のクリックでスキップ
  await page.waitForTimeout(200);
  await page.mouse.click(640, 300);
  await page.waitForFunction(() => {
    const s = window.__worldDev!.useWorld.getState();
    return s.walking === null && s.currentStageId === 'c1-s2';
  });
  await waitSettled(page, 'stageSelect');
  w.expectClean();
});

test('工房が育つ:章の機械が棚に並び、図鑑の額と作業台の機械が変わってもエラーがない', async ({
  page,
}) => {
  const w = watchErrors(page);
  await openStageSelect(page);
  await page.evaluate(() => {
    const d = window.__worldDev!;
    d.clearChapter();
    d.nextMachine();
    d.clearAll();
    d.registerZukan();
  });
  const s = await page.evaluate(() => {
    const st = window.__worldDev!.useWorld.getState();
    return {
      chapters: Object.keys(st.chapterMachines),
      zukan: st.progress.zukan.length,
      machine: st.machineDesign !== null,
    };
  });
  expect(s).toEqual({ chapters: ['1', '2'], zukan: 1, machine: true });
  // ホーム(作業台・額)と図鑑(棚)を描いてもエラーなし
  await page.keyboard.press('Escape');
  await waitSettled(page, 'home');
  await page.getByRole('menuitem', { name: /機構図鑑/ }).click();
  await waitSettled(page, 'zukan');
  await page.waitForTimeout(500);
  w.expectClean();
});
