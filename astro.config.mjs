import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://watduang.com',
  build: { format: 'directory' },
  trailingSlash: 'always',
  integrations: [sitemap()],
});
