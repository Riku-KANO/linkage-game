import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

test('the sample walker climbs the step course with Rapier loaded on demand', async ({ page }) => {
  const w = watchErrors(page);
  const rapier = page.waitForResponse((r) => /rapier-.*\.js$/.test(r.url()));
  await page.goto('/?dev=sim');
  await page.locator('select').nth(1).selectOption('steps');
  expect((await rapier).ok()).toBe(true);
  // 重心 x が進む
  await expect
    .poll(
      async () => {
        const text = await page.locator('body').innerText();
        return Number(/重心 x\s+([\d.]+) m/.exec(text)?.[1] ?? 0);
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0.5);
  w.expectClean();
});
