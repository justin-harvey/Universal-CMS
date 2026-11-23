# mail-first-cms — Living Backlog

Residual items and open threads, reconciled roughly every 150k–200k tokens of
working context (and whenever a handoff is written). The milestone narrative
lives in BUILD-PLAN.md; this file is the running list of smaller open items,
decisions to revisit, and known gaps that don't belong to a single milestone.

Convention: `[ ]` open · `[x]` done (leave a few done items for context, prune the rest).

## Open — go-live (2026-11-22)
- [x] **Netlify build was failing** — `SUPABASE_SERVICE_ROLE_KEY` in Netlify was
  truncated to 32 chars (missing the trailing `_DjH_YAwb`). Re-pasted the full
  41-char `sb_secret_…` value → build green, materialize bakes content.
- [x] **Canonical URL bug** — `Base.astro` built the canonical `<link>` from the
  hardcoded `site.siteUrl` constant (localhost) instead of `Astro.site`
  (derived from `PUBLIC_SITE_URL`). Fixed @ `2c7df27`, verified live. M4
  undo/receipt links were unaffected (read `PUBLIC_SITE_URL` at runtime).
- [x] **Netlify env vars confirmed set** — all 15 present (Supabase x4, Postmark
  x3, Anthropic, MAIL_FROM/ORG_NAME/ADMIN_NOTIFY_ADDRESS, PUBLIC_SITE_URL,
  SITE_TIMEZONE, REVIEW_THRESHOLD, UNDO_SIGNING_SECRET).
- [x] **Build hook created** — `6b03927346457533b6144416` (branch main). Trigger
  URL `https://api.netlify.com/build_hooks/6b03927346457533b6144416`.
- [x] **Store the hook in `deploy_control`** — DONE (2026-11-22) via new
  `scripts/set-deploy-hook.mjs` (service-role upsert of the singleton row,
  bypasses RLS), run against the live DB and read back to confirm:
  `hook_url=https://api.netlify.com/build_hooks/6b03927346457533b6144416`,
  `debounce_seconds=60`, `last_triggered_at=(never)`. The publish→rebuild
  trigger + Studio "Deploy now" button are now live, no longer no-ops.
  Re-runnable: `node --env-file=.env scripts/set-deploy-hook.mjs <url>`.
- [ ] **Supabase auth redirect allow-list still localhost-only** → magic-link
  login FAILS on the live Studio. Add Site URL + `/studio` + `/**` for
  `https://universal-cms.netlify.app`.
- [x] **`robots.txt` + sitemap** — DONE (2026-11-22). Added `@astrojs/sitemap`
  (pinned `3.2.1` — **3.7.x uses the `astro:routes:resolved` hook that only
  exists in Astro 5; on this Astro 4.16 project it crashes at build:done with
  `Cannot read properties of undefined (reading 'reduce')`, so stay on 3.2.x
  until Astro 5**) wired in `astro.config.mjs` with `filter` excluding `/studio`,
  plus a build-time `src/pages/robots.txt.ts` endpoint (Allow all, Disallow
  /studio, `Sitemap:` pointer). Both read the per-deploy site URL (Astro.site ←
  PUBLIC_SITE_URL) so they stay multi-tenant — no hardcoded host. Verified in a
  local build: `dist/robots.txt`, `dist/sitemap-index.xml`, `dist/sitemap-0.xml`
  all emit, `/studio` absent from the sitemap.
- [ ] **`site.config.ts` still the blank template** ("Example Organisation",
  `post@example.org`, `1 Main Street`). Replace with the real org identity.
- [ ] **Netlify CLI** now logged in (Dean Burke) + repo linked (siteId
  `f3b505e4-adc6-4140-9cb1-32f7248cfdee`). `.netlify/` is gitignored.

## Open — pipeline finish (M4)
- [x] inbound-email.ts TODO (a) DONE: PDF attachments upload to the private
  `documents` bucket (one row per PDF) with the accessibility gate via the new
  dependency-free `src/lib/pdf-text.ts` (`pdfAccessibility`, zlib-inflates
  FlateDecode streams; runtime-checked has_text/image_only/not_checked).
- [x] inbound-email.ts TODO (b) DONE: mints a single-use `undo_tokens` row
  (sha256, expires = now + `UNDO_WINDOW_HOURS`) and emails the receipt + signed
  `/undo?token=` link.
- [x] Outbound mailer DECIDED + wired = **Postmark outbound** (`POSTMARK_SERVER_TOKEN`
  + `MAIL_FROM`) in new `src/lib/mailer.ts` — one provider with inbound, no new
  dep (uses `fetch`), graceful no-op when unconfigured. (Dropped the `~/mail-portal`
  SMTP option.) Covers receipt, polite reject auto-reply, held-sender ack, admin
  notify — all stamped with the loop-prevention headers.
- [x] Admin notification on hold → `ADMIN_NOTIFY_ADDRESS` env (mirrors
  site.config.email.adminNotifyAddress). DONE.
- [ ] **M4 is CODE-complete + env now set; not yet exercised.** Remaining: in
  Postmark, point the Default Inbound Stream webhook at
  `/api/inbound-email?token=<POSTMARK_WEBHOOK_TOKEN>` and verify SPF/DKIM
  pass-through; add a sender to `approved_senders` (Studio → Email queue); send
  one real email end to end (plus one with a PDF, and one low-confidence/`unknown`
  to see the queue + admin notify), then click the undo link. Proof probe: with
  the webhook token matching, `POST {}` flips 401 → `Dropped: unrecognized sender.`
- [ ] **Approve-prefill enrichment:** the Studio approve flow + the webhook fill
  title/body from subject/raw_text but don't yet read `classifier_json`'s parsed
  fields (event start time, category, pin). Wire those through once real
  classifier output is observed. Also the classifier `category` is free-text — it
  won't necessarily match `site.documentCategories`; map/validate later.

## Open — repo plumbing
- [ ] Keep-alive GitHub Action lives at `ops/github-workflows/supabase-keepalive.yml`
  (the initial push PAT lacked `workflow` scope). Move it to
  `.github/workflows/` via the GitHub UI or a `workflow`-scoped token, then set the
  `SUPABASE_URL` / `SUPABASE_ANON_KEY` repo secrets and update its curl path from
  `commentaries` to an existing table (e.g. `editors`).
- [ ] Netlify not connected yet; BUILD-PLAN M3 covers the build hook.

## Open — platform
- [x] M1 COMPLETE (project paxzhcvixybqvkrvrnnc): migrations 0001–0006 pushed,
  buckets + deploy_control confirmed, RLS proven, admin invited
  (deanburke10@gmail.com), signed into `/studio` locally, health strip GREEN.
  Build hook into `deploy_control.hook_url` is M3.
- [ ] **New-key / new-project gotcha (documented in 0006_grants.sql):** this
  project used the new API keys (`sb_publishable_` / `sb_secret_`) and granted
  the API roles only REFERENCES/TRIGGER/TRUNCATE by default — no SELECT/INSERT/
  UPDATE/DELETE — so RLS never ran and every call was "permission denied for
  table". 0006 grants DML explicitly (service_role all; authenticated DML; anon
  select) + default privileges for future tables. Keep 0006 in the migration set
  for every deployment.
- [ ] `.env` holds the live keys + DB-adjacent secrets (gitignored). Secret key
  `sb_secret_…` and DB password were pasted in chat; rotate in Settings → API if
  desired and update `.env`. Node 22 is required for any supabase-js script
  (Node 18 lacks native WebSocket → realtime-js throws); use `nvm use 22`.
- [~] Netlify CONNECTED + auto-deploying on push (Justin, 2026-11-20). Still TODO:
  confirm the 5 env vars are set (PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY=
  publishable, PUBLIC_SITE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY=secret) so
  `materialize` bakes real content, and add the Netlify URL + `/studio` to the
  Supabase auth redirect allow-list (currently localhost only) so magic-link login
  works on the deployed Studio. **Create a Netlify build hook** and store it:
  `update public.deploy_control set hook_url='…' where id=1;` — until set, both the
  publish→rebuild trigger and the Studio "Deploy now" button are safe no-ops.
- [x] Public render (M2) built: home/events/documents/groups/faq(+/<slug>) pages
  + SiteHeader/SiteFooter ported from Hope-Maine. Verified empty and with fixtures.
- [~] Audit gates (M6): `tools/audit/*` routes REWRITTEN (2026-11-22) for this
  site — `a11y.mjs` BASE_PAGES + FAQ-answer discovery (`/how-do-i/`→`/faq/`),
  `links.mjs` ROUTES trimmed to the 5 index pages (internal-link crawl finds the
  rest), `nojs.mjs` answer-first journey now starts at `/faq` and follows
  `/faq/<slug>`. All three GREEN against a local preview (links 0 broken, nojs
  pass, a11y 0 contrast/0 console errors). STILL TODO: wire into CI.
- [x] **M5 DONE** — Studio now has full per-collection CRUD (list/create/edit/
  delete/publish-unpublish) driven by `src/components/studio/collections.js`, the
  Email-queue tab (approve→publish via a prefilled collection form, discard,
  pending-count badge), the approved-senders admin panel, and a header "Deploy
  now" button (`request_deploy()` RPC). Documents editor uploads to the private
  `documents` bucket. Build clean; helper logic unit-checked.

## Open — build/scripts hygiene (from M1)
- [x] materialize.mjs now deletes only `*.md` (was `rm -rf` the whole dir), so the
  committed `src/content/<collection>/.gitkeep` survives a build and the working
  tree stays clean. Collection dirs are tracked via those `.gitkeep`s.
- [x] `supabase/.temp/` (CLI link state: project-ref, pooler-url w/o password,
  versions — no secrets) added to `.gitignore`.
- [ ] `.env` is gitignored and NOT pushed. For Netlify, set the 5 env vars by hand
  (publishable key → PUBLIC_SUPABASE_ANON_KEY, secret key → SUPABASE_SERVICE_ROLE_KEY).
- [ ] Supabase magic-link / invite emails use the built-in service (rate-limited);
  wire custom SMTP before onboarding many editors. Auth redirect allow-list is
  localhost-only — add the Netlify URL + `/studio` when deployed.

## Open — render polish / findings (from M2)
- [ ] **Tailwind not installed**, so the `@utility` type-scale classes in
  `src/styles/primitives.css` (heading-xl/lg/md/sm, body-lg/sm/xs, overline,
  measure) are inert — they were ported from Hope-Maine (a Tailwind v4 project)
  but this repo has no Tailwind pipeline. Only the `:root` tokens, `@layer base`
  resets, `:focus-visible`, and the plain `patterns.css` classes render. Either
  add Tailwind v4 (`@tailwindcss/vite`) to light those up, or convert the pages
  off them (M2 pages already avoid them and use scoped styles). Did NOT block M5
  (the Studio is a `client:only` SPA with its own self-contained inline CSS and
  never imports primitives.css). Decide before the next public-page work / M6.
- [ ] Astro logs "collection … is empty" for each collection on a fresh/no-DB
  build. Benign (pages render their empty state; disappears once content is
  materialized). Left as-is rather than seeding placeholder content.
- [ ] `/faq` currently also has per-slug detail pages (`/faq/<slug>`). If the
  org prefers a single accordion-style FAQ page, that's a later swap; the plan
  called for `/faq/<slug>` so detail pages ship.

## Open — Studio / findings (from M5)
- [ ] **Live click-through not done.** Code builds and the helper logic is
  unit-checked, but no one has driven the real Studio against the live DB yet.
  Use the M1 recipe: `nvm use 22 && npm run dev`, mint a magic link via
  `generateLink` with the service key, open it in a browser ON THIS MACHINE.
  Exercise: create/publish one row per collection, upload a PDF to a document,
  and (once an inbound_emails row exists) approve + discard from the queue.
- [ ] **Datetime inputs use the BROWSER's timezone**, not `site.timezone`
  (`isoToLocalInput`/`localInputToIso` in collections.js). Correct when the admin
  machine runs in the org's zone (the normal case). If editors are in a different
  zone than the org, event times will be off. Revisit with a proper tz-aware
  picker only if that becomes real.
- [ ] **"Edit before publish" from the queue** is covered functionally — Approve
  opens an editable, prefilled collection form — but there's no separate "save as
  draft from the queue" path; approving is aimed at publishing. Fine for now.
- [ ] Guided first-login walkthrough + inline `?` help (ebneo Studio pattern) not
  built. Deferred UX polish.
- [ ] The **approve prefill** maps intent→collection and fills title=subject,
  body/answer=raw_text. It does NOT yet read structured fields out of
  `classifier_json` (e.g. an event's parsed start time) — the human fills those in
  the form. Enrich once the M4 classifier output shape is pinned down.
- [ ] Removed the stale `FIGURES_BUCKET='figures'` export from supabaseClient.js
  (leftover from ebneo); now exports `MEDIA_BUCKET`/`DOCUMENTS_BUCKET` matching
  0005_storage.sql.

## Open — email pipeline / findings (from M4)
- [ ] **Pre-existing type nit in `netlify/functions/document.ts`** (not touched
  this pass): strict `tsc` flags its conditional `headers` object (`Cache-Control`
  sometimes `undefined`). Harmless — neither `astro build` nor Netlify's esbuild
  function bundler type-checks functions, so it never blocks build/deploy. Fix
  by always setting a string (or widening the return type) if we ever add a
  functions typecheck to CI.
- [ ] **SPF/DKIM policy softened** vs the old code: now only drops when BOTH fail
  (spoof); a single failure (common with forwarders) is allowed through and stays
  visible on the `inbound_emails` row. Tighten if spam gets through.
- [ ] **Images not supported inbound.** Spec allows jpeg/png/webp; our content
  model has no image collection, so only `application/pdf` is accepted (others
  are "unsupported"). Add an image path if a use case appears.
- [ ] **Multi-PDF document emails** create one `documents` row per PDF but the
  undo token + `inbound_emails.target_id` point at only the first. Fine for the
  common single-attachment case; revisit if batch-PDF emails are common.
- [ ] Rate cap (10 auto-publishes/hour) + undo window (24h) are env-tunable
  (`UNDO_WINDOW_HOURS`); the cap is a constant in `inbound-email.ts` — promote to
  env if it needs per-deploy tuning.

## Decisions to revisit
- [ ] Classifier model = `claude-opus-4-8` (SDK bumped 0.68 → 1.12 so the
  canonical `output_config.format` structured-output call type-checks). Revisit
  `claude-haiku-4-5` for cost once volume is known (one-line change in
  `src/lib/classify.ts`). Keep Claude — do NOT adopt the spec's gpt-4o-mini /
  claude-3-5-haiku suggestion (`claude-3-5-haiku` is an older id).
- [ ] Multi-tenant: `to_alias` is captured but routing is not honored (M7). Default
  assumption today = one deploy per tenant; confirm before building aliases.
- [ ] Node engines pinned `>=20`; local dev was Node 18 and still builds. Keep 22 on
  Netlify.
- [ ] Confirm-step / tamper concerns from other Civic-Chain work do NOT apply here
  (this is a content CMS, not a ledger) — no Merkle checkpoint needed.

## Done (recent)
- [x] Intent fix + M4 email pipeline (2026-11-20): classifier → 6 intents
  (`document`+`unknown`) with enriched payload; `inbound-email.ts` rewritten into
  a full webhook (documents upload + accessibility gate, undo token, Postmark
  receipts/rejects/admin-notify with loop-prevention headers, spoof/unknown drops,
  rate cap); new `src/lib/pdf-text.ts` + `src/lib/mailer.ts`; `.env.example`
  expanded; `@anthropic-ai/sdk` 0.68 → 1.12. Strict typecheck + build clean;
  helpers runtime-checked. Not yet live (needs Postmark Inbound + env).
- [x] M5 Studio CRUD + Email queue (2026-11-20): new modules
  `src/components/studio/collections.js` (field specs + coercion/slug/datetime
  helpers) and a rewritten `StudioApp.jsx` (CollectionManager/CollectionForm/
  Field/EmailQueue/SendersPanel/DeployButton). `/studio/index.astro` now passes
  groupLabel/documentCategories/timezone. Build clean; helpers unit-checked.
- [x] M2 public render: home/events/documents/groups/faq(+/<slug>) pages reading the
  five materialized collections; SiteHeader/SiteFooter ported; timezone-aware event
  times (`src/lib/format.ts`); cancelled-event strike-through; document a11y flag;
  config-driven nav + group label. Fixed latent M0 bug (reserved `slug` in the
  documents schema → use `entry.slug`). Collection dirs committed with `.gitkeep`.
- [x] M0 scaffold: buildable Astro skeleton, full schema 0001–0005, site.config seam,
  ported a11y tokens + audit gates + keep-alive, Studio shell, classifier, 3 Netlify
  functions (document + undo complete; inbound-email full flow w/ M4 TODOs).
- [x] Pushed to github.com/justin-harvey/Universal-CMS.
