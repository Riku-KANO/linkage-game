import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

/** どの画面も、本番ヘッダー(CSP)の下でエラーなく表示できる */
const ROUTES = ['/', '/?dev=editor', '/?dev=sim', '/?dev=result', '/?dev=audio', '/?dev=scene'];

for (const route of ROUTES) {
  test(`loads ${route} without errors or CSP violations`, async ({ page }) => {
    const w = watchErrors(page);
    await page.goto(route);
    await expect(page.locator('#root > *').first()).toBeVisible();
    await page.waitForTimeout(1500);
    w.expectClean();
  });
}

test('serves the security headers', async ({ request }) => {
  const res = await request.get('/');
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(res.headers()['x-frame-options']).toBe('DENY');
});
