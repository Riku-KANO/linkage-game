import { defineConfig, devices } from '@playwright/test';

/**
 * E2E(ブラウザでの検証)。本番ビルドを本番と同じセキュリティヘッダー(public/_headers)つきで配信し、
 * 実際の Chromium で開く。CSP 違反・コンソールエラー・画面の基本操作をここで検出する。
 *
 *   pnpm e2e              ビルドしてから実行
 *   pnpm verify --e2e     検証ゲートの最後に実行(wt.sh gate はこれを使う)
 */
/** 並行して走らせるときはエージェントごとに E2E_PORT を変える */
const PORT = Number(process.env.E2E_PORT ?? 4174);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // 他のエージェントのビルド・ブラウザと同時に走ると、ソフトウェア描画の WebGL が遅くなり時間切れが起きる。
  // 1 回だけ再試行する(再試行で通ったものは flaky として表示されるので、不安定さは隠れない)
  retries: process.env.CI ? 2 : 1,
  workers: 4,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
  },
  outputDir: '.e2e-results',
  webServer: {
    command: `node scripts/serve-dist.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
