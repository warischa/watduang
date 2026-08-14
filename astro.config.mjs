import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://watduang.com',
  build: { format: 'directory' },
  trailingSlash: 'always',
  integrations: [sitemap()],
  // CSP script-src has no 'unsafe-inline' — Astro would otherwise inline small page
  // scripts (no imports, under assetsInlineLimit) and CSP would silently block them.
  vite: {
    build: {
      assetsInlineLimit: (filePath) => (filePath.endsWith('.js') ? false : undefined),
    },
  },
});
