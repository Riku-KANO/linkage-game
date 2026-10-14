import { expect, type Page } from '@playwright/test';

/** コンソールのエラー・ページの例外・CSP 違反を集める(テストの最後に expectClean で確かめる) */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  void page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return {
    errors,
    expectClean() {
      expect(errors, errors.join('\n')).toEqual([]);
    },
  };
}

/**
 * 起動のロゴ(T-00)をクリックで飛ばす。工房が描かれて入力を受け付けてから(「クリックでスキップ」が
 * 出てから)クリックする。早すぎるクリックは届かず、並行実行で描画が遅いとロゴの演出を最後まで待つことになる。
 */
export async function skipBootLogo(page: Page) {
  await expect(page.getByText('クリックでスキップ')).toBeVisible();
  await page.waitForTimeout(150);
  await page.mouse.click(640, 360);
}
