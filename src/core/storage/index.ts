/**
 * localStorage への自動保存(U-01)の入口。
 * ブラウザ専用の補助(browser.ts)も含むが、読み込んだだけでは DOM に触れない。
 */
export * from './persistence';
export * from './progress';
export * from './debounce';
export * from './browser';
