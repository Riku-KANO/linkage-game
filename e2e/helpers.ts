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
