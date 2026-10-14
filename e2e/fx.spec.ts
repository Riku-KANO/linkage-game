import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/** 演出の状態(?dev=scene の window.__sceneDev.fx) */
async function fx(page: Page) {
  return page.evaluate(() => {
    const dev = (window as unknown as { __sceneDev: Record<string, unknown> }).__sceneDev;
    const f = (dev.fx as { director: { frame: Record<string, unknown> } }).director.frame;
    const app = (dev.useApp as { getState(): { screen: string; transition: unknown } }).getState();
    return {
      kind: f.kind as string | null,
      level: f.level as number,
      machineInFx: f.machineInFx as boolean,
      timeScale: f.timeScale as number,
      screen: app.screen,
      moving: app.transition !== null,
    };
  });
}

async function openScene(page: Page) {
  await page.goto('/?dev=scene');
  // T-00 のロゴはクリックで飛ばせる
  await page.mouse.click(640, 360);
  await expect(page.getByRole('menuitem', { name: /続きから/ })).toBeVisible();
  // 12 脚の見本機で組み上げる(脚列の複製まで通る)
  await page.getByLabel('機械').selectOption('jansenWalker');
}

test('T-03 assembles the machine onto the track and T-05 takes it back to the paper', async ({
  page,
}) => {
  const w = watchErrors(page);
  await openScene(page);
  const debug = page.locator('.ak-debug');

  // T-03:設計 → 試走。組み上げの途中を見て、コースに着いたら演出は機械を手放す
  await debug.getByRole('button', { name: 'T-03', exact: true }).click();
  await expect.poll(async () => (await fx(page)).kind, { timeout: 5_000 }).toBe('assemble');
  await expect
    .poll(async () => {
      const s = await fx(page);
      return s.machineInFx && s.level > 0.2 && s.level < 0.9;
    })
    .toBe(true);
  await expect
    .poll(async () => {
      const s = await fx(page);
      return `${s.screen} ${s.moving} ${s.level} ${s.machineInFx}`;
    })
    .toBe('testRun false 1 false');
  // 組み上がったら試走が動き出す(時間の倍率 1)
  expect((await fx(page)).timeScale).toBe(1);

  // T-04:ゴールでスロー → 結果で止まる
  await debug.getByRole('button', { name: 'T-04', exact: true }).click();
  await expect
    .poll(async () => {
      const s = await fx(page);
      return s.kind === 'goal' && s.timeScale < 0.5;
    })
    .toBe(true);
  await expect
    .poll(async () => {
      const s = await fx(page);
      return `${s.screen} ${s.moving} ${s.timeScale}`;
    })
    .toBe('result false 0');

  // T-05:結果 → 設計。機械を吊り上げて図面に戻す
  await debug.getByRole('button', { name: 'T-05', exact: true }).click();
  await expect.poll(async () => (await fx(page)).kind, { timeout: 5_000 }).toBe('disassemble');
  await expect
    .poll(async () => {
      const s = await fx(page);
      return `${s.screen} ${s.moving} ${s.level} ${s.machineInFx}`;
    })
    .toBe('design false 0 false');
  // 設計画面のパネル(試走ボタン)が出る
  await expect(page.getByRole('button', { name: '試走する' })).toBeVisible();
  w.expectClean();
});

test('a click skips the assembly to the hand-over; reduced motion replaces it', async ({
  page,
}) => {
  const w = watchErrors(page);
  await openScene(page);
  const debug = page.locator('.ak-debug');
  await debug.getByRole('button', { name: 'T-03', exact: true }).click();
  await expect.poll(async () => (await fx(page)).kind, { timeout: 5_000 }).toBe('assemble');
  // パネルの外をクリック:スキップ
  await page.mouse.click(300, 300);
  await expect
    .poll(
      async () => {
        const s = await fx(page);
        return `${s.screen} ${s.level} ${s.machineInFx}`;
      },
      { timeout: 2_000 },
    )
    .toBe('testRun 1 false');

  // 動きを減らす:組み上げずに 0.3 秒のフェードで切り替わる
  await debug.getByLabel('動きを減らす').check();
  await debug.getByRole('button', { name: 'T-05', exact: true }).click();
  await expect
    .poll(
      async () => {
        const s = await fx(page);
        return `${s.screen} ${s.moving} ${s.level} ${s.machineInFx}`;
      },
      { timeout: 2_000 },
    )
    .toBe('design false 0 false');
  w.expectClean();
});
