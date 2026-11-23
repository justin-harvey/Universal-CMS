# Handoff — M6 audit gate + product-demo identity (2026-11-22)

Follows `HANDOFF-2026-11-22-deploy-golive.md`. That handoff was written at `main
@ 2c7df27`, but the session continued and pushed `f394b20` (robots/sitemap + M6
audit-route rewrite + `set-deploy-hook.mjs`) — all now **live and confirmed**.
This session picked up from there, closed M6, and set the demo identity.

## Verified on pickup (all green, live)
- Build hook **already stored** in `deploy_control` (Justin applied the SQL):
  `hook_url=…/6b03927346457533b6144416`, `debounce_seconds=60`,
  `last_triggered_at=null`. Publish→rebuild + "Deploy now" are live, no-ops no more.
- `robots.txt` + `sitemap-index.xml` live at the correct `https://universal-cms.netlify.app`
  origin (code derives from `Astro.site`/`PUBLIC_SITE_URL`; local build shows
  localhost only because the local `.env` is localhost — not a bug).
- M6 audit tools (rewritten in `f394b20`) run clean against live: 0 contrast
  failures, 0 broken links, no-JS PASS, 0 console errors.

## Shipped this session — commit `4430232` (LOCAL, UNPUSHED)
1. **M6 audit gate wired into the Netlify build.** The three gates now exit
   non-zero on *hard* regressions only:
   - `a11y.mjs` → WCAG-AA contrast failures + JS console/page errors (touch-target
     and under-AAA stay **advisory**, don't fail — inline nav/footer links are
     sub-44px by design).
   - `links.mjs` → dead `href="#"`, broken internal links (status ≥ 400 / bad
     in-page hash), missing same-page anchor targets.
   - `nojs.mjs` → already exited non-zero on a broken no-JS journey.
   New `scripts/audit-ci.mjs` serves `dist/` on :3000 (tiny static server, Astro
   `format:directory` aware) and runs all three → `npm run audit:ci`.
   `netlify.toml` build command is now
   `npm run build && npx playwright install chromium && npm run audit:ci`.
   **Verified:** passes clean (exit 0), fails (exit 1) on an injected dead link.
2. **Product-demo identity in `site.config.ts`.** Decision (Justin): this deploy
   is the showcase, so it carries "Universal CMS Demo" + tagline + hero intro,
   with `officeName:null` and empty phone/email (they drop out of the footer
   cleanly — see `SiteFooter.astro`). Header comment updated off "blank template".
   This cleared the placeholder touch-target warnings (26 → 2).
3. BUILD-PLAN M6 + BACKLOG reconciled to done.

## ⚠️ First Netlify deploy with this commit is the real test
The gate needs a headless Chromium on the Netlify build image. `npx playwright
install chromium` downloads the browser, but if the image lacks the system libs
to launch it, the build will fail. **ROLLBACK:** set the `netlify.toml` build
command back to `command = "npm run build"` — the gate still runs locally via
`npm run audit:ci`. (Audit launch already uses `--no-sandbox`.)

## Next — open items (all require Justin at external dashboards)
1. **Push `4430232`** (inline PAT, `x-access-token` + trailing-slash URL form —
   see project memory / prior handoff push gotcha).
2. **Supabase auth redirect allow-list** — still localhost-only → magic-link
   login FAILS on the live Studio. Add Site URL `https://universal-cms.netlify.app`
   + redirect URLs `/studio` + `/**` (keep localhost).
3. **M4 email end-to-end** — in Postmark, point the Default Inbound Stream webhook
   at `/api/inbound-email?token=<POSTMARK_WEBHOOK_TOKEN>`; add an `approved_senders`
   row (Studio → Email queue); send plain / with-PDF / `unknown` test emails + click
   undo. Proof probe: `POST {}` with the real token flips 401 → `Dropped: unrecognized sender.`
4. **Live Studio click-through** — blocked by #2; use the M1 magic-link recipe.
5. **M7 multi-tenant aliases** — optional; `to_alias` is captured but not routed.

Residuals in `BACKLOG.md`; milestone narrative in `BUILD-PLAN.md`.
