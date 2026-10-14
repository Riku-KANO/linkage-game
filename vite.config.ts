/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [react(), cloudflare()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    watch: { ignored: ['**/.worktrees/**'] },
  },
  build: {
    target: 'es2022',
    // Rapier(物理の WASM を埋め込んだ約 4.3MB、gzip 1.7MB)は試走の直前に動的 import する別チャンク
    chunkSizeWarningLimit: 4500,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.worktrees/**', '**/dist/**'],
    environment: 'node',
    testTimeout: 20000,
  },
});
