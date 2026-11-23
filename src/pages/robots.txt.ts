import type { APIRoute } from "astro";
import { site } from "../../site.config";

// Static robots.txt generated at build time. Allows all crawlers, keeps the
// admin SPA out of the index, and advertises the sitemap at the per-deploy
// site URL (Astro.site is derived from PUBLIC_SITE_URL; falls back to the
// site.config placeholder for a bare local build).
export const GET: APIRoute = ({ site: astroSite }) => {
  const origin = (astroSite ?? new URL(site.siteUrl)).origin;
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /studio",
    "",
    `Sitemap: ${origin}/sitemap-index.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
