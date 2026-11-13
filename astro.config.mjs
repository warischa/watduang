import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Noindex pages stay out of the sitemap too: the feedback endpoint's two result pages (gh#292) and the
// prize-draw join page (gh#308). Exported so src/pages/noindex.test.mjs holds it to the noindex list.
export const sitemapFilter = (page) => !/\/(feedback\/(sent|failed)|game\/prize-draw\/join)\/$/.test(page);

export default defineConfig({
  site: 'https://watduang.com',
  build: { format: 'directory' },
  trailingSlash: 'always',
  integrations: [sitemap({ filter: sitemapFilter })],
  // CSP script-src has no 'unsafe-inline' — Astro would otherwise inline small page
  // scripts (no imports, under assetsInlineLimit) and CSP would silently block them.
  vite: {
    build: {
      assetsInlineLimit: (filePath) => (filePath.endsWith('.js') ? false : undefined),
    },
  },
});
