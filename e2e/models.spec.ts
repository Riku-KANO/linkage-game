import { expect, test } from '@playwright/test';
import { MODEL_MANIFEST } from '../src/scene/assets';
import { watchErrors } from './helpers';

/** 工房の GLB(Blender の素材)が本番ヘッダー(CSP)の下で自分のオリジンから読めて、外へは取りに行かない */
test('loads the workshop GLB models from self under the production CSP', async ({
  page,
  baseURL,
}) => {
  const w = watchErrors(page);
  const origin = new URL(baseURL!).origin;
  const expected = Object.values(MODEL_MANIFEST)
    .filter((e) => e.present)
    .map((e) => `/models/${e.file}`);
  const loaded = new Map<string, { status: number; type: string }>();
  const foreign: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.origin !== origin) foreign.push(r.url());
  });
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.pathname.endsWith('.glb')) {
      loaded.set(u.pathname, { status: r.status(), type: r.headers()['content-type'] ?? '' });
    }
  });
  await page.goto('/');
  await expect
    .poll(() => expected.filter((p) => loaded.get(p)?.status === 200).length, { timeout: 20_000 })
    .toBe(expected.length);
  for (const p of expected) expect(loaded.get(p)?.type, p).toContain('model/gltf-binary');
  // ロゴを飛ばしてホームへ(GLB に差し替わった工房でメニューが出る)
  await page.mouse.click(640, 360);
  await expect(page.getByRole('menuitem', { name: /続きから/ })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(foreign).toEqual([]);
  w.expectClean();
});
