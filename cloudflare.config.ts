import { defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'ashikumi',
    compatibilityDate: '2026-10-06',
    observability: {
      enabled: true,
    },
    assets: {
      notFoundHandling: 'single-page-application',
    },
  },
});
