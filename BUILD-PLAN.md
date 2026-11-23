# mail-first-cms — Build Plan

An email-first, accessible, static-first CMS. A passwordless web **Studio** plus an
**email-to-publish** pipeline, over Supabase, baked to static HTML and hosted on
Netlify. Industry-agnostic: one `site.config.ts` dresses the same engine as a
nonprofit, a town, a congregation, or a club.

This platform is assembled from the strongest patterns of two existing projects
(copied, never modified in place):

| Pattern | Came from | Where it lives here |
|---|---|---|
| Passwordless magic-link auth, invite-only, `editors` + RLS helpers | ebneo-poc `0001_init.sql`, `invite-editor.mjs` | `supabase/migrations/0001_init.sql`, `scripts/invite-editor.mjs` |
| Studio admin SPA + DB health strip | ebneo-poc `StudioApp.jsx` | `src/components/studio/StudioApp.jsx` |
| Materialize (DB → static) + Pagefind + Netlify build | ebneo-poc build | `scripts/materialize.mjs`, `package.json` |
| Publish → debounced rebuild (pure SQL `pg_net`) | ebneo-poc `0003_deploy_trigger.sql` | `supabase/migrations/0003_deploy_trigger.sql` |
| Supabase keep-alive GitHub Action | ebneo-poc | `.github/workflows/supabase-keepalive.yml` |
| Accessibility design tokens (AAA, 44px targets) | Hope-Maine `tokens/primitives/patterns.css` | `src/styles/` |
| Pre-deploy audit gates (contrast / links / no-JS) | Hope-Maine `tools/audit/*` | `tools/audit/` |
| Single-command provisioning + config seam | Hope-Maine `scripts/setup.ts`, `town.config.ts` | `scripts/setup.mjs`, `site.config.ts` |
| Document accessibility-check-at-upload | Hope-Maine `Documents.ts` | `documents.accessibility_checked` (schema) |
| **Email-to-publish pipeline** | NEW (neither repo had it) | `netlify/functions/inbound-email.ts`, `src/lib/classify.ts`, `0004_email_pipeline.sql` |

## Status

**M0 — Scaffold + schema + plan: DONE.**
Buildable Astro skeleton, full Supabase schema (0001–0005), `site.config.ts`
seam, ported a11y tokens + audit gates + keep-alive, Studio auth/health shell,
classifier + intents, three Netlify functions (document redirect complete; undo
complete; inbound-email full flow with M4-finish TODOs), setup/invite/materialize
scripts, README, this plan.

**M2 — Materialize + public render: DONE.**
All five collections render as static pages: home (pinned + recent
announcements with expiry drop-off, next upcoming events), `/events`
(upcoming + past, cancelled kept visible/struck-through with a status label,
timezone-aware times via `src/lib/format.ts`), `/documents` (grouped by the
config category order, links to the `/documents/file/<slug>` redirect, a11y
image-only flag surfaced), `/groups` (label from `site.groupLabel`), and
`/faq` index + generated `/faq/<slug>` detail pages. Ported `SiteHeader`
(token-driven nav, `aria-current`) and `SiteFooter` (contact/hours/external
links) from Hope-Maine into `src/components/`. Builds clean both empty (fresh
clone, 6 pages) and with content (verified against fixtures matching the
materialize output, 7 pages). Fixed a latent M0 bug: the `documents` schema
declared a reserved `slug` field (Astro derives slug from the filename) — now
uses `entry.slug`.

## Milestones

Each milestone is a small, shippable step (the way Justin's other projects run).
Check them off as they land.

- [x] **M0 — Scaffold, schema, plan.** Repo builds offline; migrations written.
- [x] **M1 — Provision + prove the spine. COMPLETE** (admin signed into `/studio`
  locally via magic link, health strip confirmed GREEN 2026-11-20). Server-side:
  Supabase project
  `paxzhcvixybqvkrvrnnc` (us-east-2, PG17) linked via CLI; migrations 0001–0006
  pushed (`supabase db push --remote`); both buckets present (media public,
  documents private); `deploy_control` seeded (id=1, debounce 60s, hook null);
  RLS proven (service_role reads a row anon cannot see; anon writes denied);
  auth redirect allow-list set to `http://localhost:4321/**`; admin invite sent
  to deanburke10@gmail.com and its `editors` admin row created; `npm run build`
  materializes against the live DB (0 published, builds clean). **Added
  0006_grants.sql** — the 0001–0005 scaffold relied on Supabase default
  privileges that newer projects don't grant, so every table read failed
  "permission denied" until DML was granted explicitly to the API roles.
  Local-test recipe (for future admins): `nvm use 22 && npm run dev`, then open a
  magic link that redirects to `http://localhost:4321/studio` IN A BROWSER ON THE
  SAME MACHINE (the link targets localhost; it 404s/"can't be reached" if the dev
  server is down or the link is opened on another device). Mint a fresh link
  without email via `supabase.auth.admin.generateLink({type:'magiclink',email,
  options:{redirectTo}})` with the service key — invite tokens are single-use.
  Optional leftover: drop a hero image in `public/`.
- [x] **M2 — Materialize + public render.** Home / `/events` / `/documents` /
  `/groups` / `/faq` + `/faq/<slug>` read the five materialized collections;
  `SiteHeader`/`SiteFooter` ported; timezone-aware event times; cancelled
  events struck-through; document a11y flag surfaced. Builds clean empty and
  with content.
- [x] **M3 — Publish → rebuild live.** Netlify connected and auto-deploying on
  push (Justin, 2026-11-20). The Studio **"Deploy now"** button is wired to the
  `request_deploy()` RPC (header, both collection and queue views). Remaining:
  store the Netlify *build hook* URL in `deploy_control.hook_url` so a content
  publish (not just a git push) triggers a debounced rebuild — until it's set,
  the trigger and the button's RPC are safe no-ops ("No build hook set yet.").
- [x] **M4 — Email-to-publish end to end. CODE DONE** (2026-11-20; strict
  typecheck clean, build clean, helper logic runtime-checked). The two
  `inbound-email.ts` TODOs are finished and the webhook is a full pipeline:
  (a) **documents path** — PDF attachments upload to the private `documents`
  bucket (one `documents` row per PDF) with the Hope-Maine accessibility gate via
  a new dependency-free `src/lib/pdf-text.ts` (`pdfAccessibility` → `has_text` /
  `image_only` / `not_checked`, zlib-inflates FlateDecode streams); (b) **undo +
  receipts** — `publish()` mints a single-use `undo_tokens` row and emails the
  sender a receipt with the live URL + `/undo?token=` link via a new
  `src/lib/mailer.ts` (Postmark outbound REST, graceful no-op when unconfigured,
  stamps `Auto-Submitted: auto-replied` + `X-Auto-Response-Suppress: All`).
  Added: polite reject auto-reply, held-for-review sender ack + admin
  notification, auto-reply loop drop (ignore `Auto-Submitted` / Out-of-Office),
  spoof drop (SPF+DKIM both fail), unknown-sender drop (no queue row), softened
  attachment screening (reject only when nothing actionable; 15 MB PDF cap), and
  a 10/hour auto-publish rate cap. The classifier (`classify.ts`/`intents.ts`)
  now emits all **6 intents** (added `document` + `unknown`) with an enriched
  payload (summary/category/eventStatus/expiresAt/pinned), matching the DB enum +
  the M5 Studio map. **Remaining to call M4 fully shipped:** stand up a Postmark
  Inbound server pointed at `/api/inbound-email?token=…`, set the outbound env
  (`POSTMARK_SERVER_TOKEN`, `MAIL_FROM`, `SITE_NAME`, `ADMIN_NOTIFY_ADDRESS`,
  `UNDO_WINDOW_HOURS`), and send a real email from an `approved_senders` address
  end to end. Bumped `@anthropic-ai/sdk` 0.68 → 1.12 so the canonical
  `output_config.format` structured-output call type-checks.
- [x] **M5 — Full Studio CRUD + review queue. DONE** (2026-11-20, build clean,
  Studio client bundle emitted + helper logic unit-checked). Data-driven editors
  for all five collections (list / create / edit / delete / publish-unpublish)
  driven by `src/components/studio/collections.js` — one field-spec per
  collection, auto-slug from the title field, timezone-aware datetime inputs,
  number/date/checkbox coercion in `toPayload`. **Documents** editor uploads the
  PDF to the private `documents` bucket and sets `storage_path` + the
  accessibility gate. **Email queue** tab works `inbound_emails`
  (status=received/pending_review): *Approve → publish* opens the intent-mapped
  collection's new-row form prefilled from the email (status preset to published,
  `source='email'`), and on save closes out the inbound row
  (status=published/target_table/target_id/reviewed_by); *Discard* sets
  status=discarded. Queue tab carries a pending-count badge. An
  **approved-senders** panel (admin-writable, editor-readable) sits under the
  queue. **"Deploy now"** button in the header calls `request_deploy()`.
  _Deferred:_ guided first-login walkthrough + inline `?` help, and the "Edit
  before publish" distinct from Approve (Approve already opens an editable form,
  so this is covered functionally). Live click-through still wants a manual pass
  via the M1 magic-link recipe.
- [x] **M6 — Audit gates in CI.** DONE (2026-11-22). Audit routes rewritten to
  this site's pages (`f394b20`). The three gates now hard-fail on real
  regressions (a11y: WCAG-AA contrast + console/page errors; links: dead `#` /
  broken internal / missing anchor; no-JS: journey broken) — touch-target and
  under-AAA stay advisory. New `scripts/audit-ci.mjs` serves `dist/` and runs all
  three (`npm run audit:ci`), and the Netlify build command now runs
  `npm run build && npx playwright install chromium && npm run audit:ci`, so a
  regression fails the deploy. Verified: passes clean, fails on an injected dead
  link. ROLLBACK if the build image can't launch Chromium: revert the netlify.toml
  command to `npm run build`.
- [ ] **M7 — Multi-tenant aliases (optional).** Honor `<slug>@domain` recipient
  routing in the webhook (`to_alias` is already captured) so one deploy can serve
  several sites, or document the one-deploy-per-tenant model as the default.

## Known seams / decisions carried forward

- **events uses a `publish` column** for the draft/published axis (its `status`
  column is the event lifecycle: scheduled/cancelled/rescheduled). The deploy
  trigger, materialize, and undo all read `coalesce(publish, status)` to stay
  generic across collections.
- **documents bucket is private**; the public URL is the `/documents/file/<slug>`
  redirect. The media bucket is public.
- **Classifier model** is `claude-opus-4-8`. Swapping to `claude-haiku-4-5` for
  cost is a one-line change in `src/lib/classify.ts` — a deliberate choice.
- **Outbound email** (receipts, auto-replies, admin notices) is not yet wired.
  `~/mail-portal` is a ready-made Proton SMTP relay to reuse; Postmark outbound is
  the alternative.
- Keep-alive Action can be deleted once on Supabase Pro (no auto-pause).
