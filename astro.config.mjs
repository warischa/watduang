import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://watduang.com',
  build: { format: 'directory' },
  trailingSlash: 'always',
  // gh#292: the feedback endpoint's two result pages are noindex, so they stay out of the sitemap too.
  integrations: [sitemap({ filter: (page) => !/\/feedback\/(sent|failed)\/$/.test(page) })],
  // CSP script-src has no 'unsafe-inline' — Astro would otherwise inline small page
  // scripts (no imports, under assetsInlineLimit) and CSP would silently block them.
  vite: {
    build: {
      assetsInlineLimit: (filePath) => (filePath.endsWith('.js') ? false : undefined),
    },
  },
});
