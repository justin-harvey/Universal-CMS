import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// Static output — deploys to Netlify as plain files (publish: dist). The React
// integration powers only the /studio admin SPA, which renders client:only (no
// SSR), so public pages stay pre-rendered HTML and no secret ships to the
// browser. The Studio bundle reads the PUBLIC anon key + the magic-link session;
// Supabase RLS is the enforcement boundary.
//
// `site` is read from PUBLIC_SITE_URL at build (falls back to the placeholder in
// site.config.ts via setup). Keeps canonical URLs / sitemap correct per deploy.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'http://localhost:4321',
  output: 'static',
  build: { format: 'directory' }, // /slug/ URLs
  // sitemap emits /sitemap-index.xml (+ /sitemap-0.xml) from `site`. The admin
  // SPA at /studio is excluded — it is not public content. robots.txt is served
  // by src/pages/robots.txt.ts, which points crawlers at this sitemap.
  integrations: [
    react(),
    sitemap({ filter: (page) => !page.includes('/studio') }),
  ],
});
