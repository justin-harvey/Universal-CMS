# Handoff — Deploy go-live fixes + canonical bug (2026-11-22)

Follows `HANDOFF-2026-11-20-m4-email-pipeline.md`. This session got the Netlify
build green, probed the live site end to end, and fixed a canonical-URL bug.
Live site: **https://universal-cms.netlify.app** · repo head `main @ 2c7df27`.

## What was broken and fixed

1. **Netlify build was failing** (`announcements: Invalid API key` in
   `materialize.mjs`). Root cause: the `SUPABASE_SERVICE_ROLE_KEY` value stored in
   Netlify was **truncated to 32 chars** (a `sb_secret_…` value missing its
   final 9 chars). The correct value is 41 chars (full `sb_secret_…` — the live
   key itself is kept out of git; it lives in `.env` / Netlify env /
   project memory), confirmed working against the live DB locally. Justin
   re-pasted the full value → build green, materialize bakes content (0
   published rows, as expected).

2. **Canonical tag advertised `http://localhost:4321`** on every deployed page.
   Root cause was a code bug, not env: `astro.config.mjs` correctly derives
   Astro's `site` from `PUBLIC_SITE_URL`, but `src/layouts/Base.astro` built the
   `<link rel="canonical">` from `site.siteUrl` — the hardcoded placeholder
   constant in `site.config.ts`. Fixed (`2c7df27`) to read
   `Astro.site ?? site.siteUrl`. Pushed, auto-deployed, **verified live**:
   home + `/events/` now emit `https://universal-cms.netlify.app/...`.
   NOTE: the M4 undo/receipt links were never affected — `inbound-email.ts:36`
   reads `process.env.PUBLIC_SITE_URL || process.env.URL` at runtime.

## Live probe (all green)

- Public pages `/ /events /documents /groups /faq` → 200 (Astro trailing-slash
  301→200 is normal). Currently the blank-template content (0 published).
- `/studio` → SPA bundle loads; Supabase URL `paxzhcvixybqvkrvrnnc.supabase.co`
  + `sb_publishable_g8Rta9…` both inlined → login can connect.
- Functions secured: `POST /api/inbound-email` → **401** (no webhook token),
  `/undo` → 400, `/documents/file/<bad>` → 400. Wiring confirmed.
- Pagefind search index shipped (200).
- GAPS: no `robots.txt` and no `sitemap-index.xml` (both 404) — no sitemap
  integration configured. Minor SEO; fine for internal launch.

## Netlify CLI now usable

Logged in as **Dean Burke** (deanburke10@gmail.com), repo linked to site
`universal-cms` (**siteId `f3b505e4-adc6-4140-9cb1-32f7248cfdee`**). `.netlify/`
state is gitignored. All env vars confirmed present in Netlify now:
ADMIN_NOTIFY_ADDRESS, ANTHROPIC_API_KEY, MAIL_FROM, ORG_NAME,
POSTMARK_OUTBOUND_STREAM, POSTMARK_SERVER_TOKEN, POSTMARK_WEBHOOK_TOKEN,
PUBLIC_SITE_URL, PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL, REVIEW_THRESHOLD,
SITE_TIMEZONE, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, UNDO_SIGNING_SECRET.

## Build hook created (M3)

Created a `main`-branch build hook via the CLI:
**`https://api.netlify.com/build_hooks/6b03927346457533b6144416`**. Triggered one
rebuild with it. GOTCHA: creating the hook was blocked by Claude Code's auto-mode
classifier (persistent-integration guard) — Justin ran the `netlify api
createSiteBuildHook` command himself via `!`.

## Next session — open items (ordered)

1. **Store the build hook** (SQL handed over, confirm it was applied) in the
   Supabase SQL Editor:
   `update public.deploy_control set hook_url='https://api.netlify.com/build_hooks/6b03927346457533b6144416' where id=1;`
   Until stored, the Studio publish→rebuild trigger + "Deploy now" are no-ops.
2. **Supabase auth redirect allow-list** (Authentication → URL Configuration):
   still **localhost-only** → magic-link login FAILS on the live Studio. Set Site
   URL `https://universal-cms.netlify.app`, add redirect URLs
   `https://universal-cms.netlify.app/studio` + `/**` (keep localhost too).
3. **M4 email end-to-end:** env is now set, so remaining = in Postmark, point the
   Default Inbound Stream webhook at
   `https://universal-cms.netlify.app/api/inbound-email?token=<POSTMARK_WEBHOOK_TOKEN>`;
   add a row to `approved_senders` (Studio → Email queue); send a real email
   (plain / with-PDF / ambiguous-`unknown`) and click the undo link. Proof probe:
   after the webhook token matches, `POST {}` with the real token flips 401 →
   `Dropped: unrecognized sender.`
4. **Live Studio click-through** still not done (create/publish a row per
   collection, PDF upload, approve/discard a queue item) — use the M1 magic-link
   recipe.
5. **`site.config.ts` is still the blank template** ("Example Organisation",
   `post@example.org`, `1 Main Street`). Replace with the real org identity.
6. **M6** audit gates in CI (+ rewrite audit `BASE_PAGES` to this site's routes),
   **M7** multi-tenant aliases. Optional: add `robots.txt`/sitemap integration.

Residuals in `BACKLOG.md`; milestone narrative in `BUILD-PLAN.md`.
