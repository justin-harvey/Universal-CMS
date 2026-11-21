# mail-first-cms — Living Backlog

Residual items and open threads, reconciled roughly every 150k–200k tokens of
working context (and whenever a handoff is written). The milestone narrative
lives in BUILD-PLAN.md; this file is the running list of smaller open items,
decisions to revisit, and known gaps that don't belong to a single milestone.

Convention: `[ ]` open · `[x]` done (leave a few done items for context, prune the rest).

## Open — pipeline finish (M4)
- [ ] inbound-email.ts TODO (a): upload PDF attachment to the private `documents`
  bucket + create a `documents` row; carry the Hope-Maine accessibility-check gate
  (`accessibility_checked`: not_checked|has_text|image_only) at ingest time.
- [ ] inbound-email.ts TODO (b): mint undo token (random → store sha256 in
  `undo_tokens`, expires = now + `site.config.email.undoWindowHours`) and send the
  publish receipt + signed `/undo?token=` link.
- [ ] Outbound mailer not wired. Decide: reuse `~/mail-portal` (Proton SMTP relay,
  nodemailer) vs Postmark outbound (`POSTMARK_SERVER_TOKEN`). Needed for receipts,
  polite reject auto-replies, and the admin pending-review notification.
- [ ] Admin notification on `pending_review` → `site.config.email.adminNotifyAddress`.

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
- [ ] Netlify not connected; when it is, add the 5 env vars (PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY=publishable, PUBLIC_SITE_URL, SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY=secret) and add the Netlify URL + `/studio` to the
  Supabase auth redirect allow-list (currently localhost only).
- [x] Public render (M2) built: home/events/documents/groups/faq(+/<slug>) pages
  + SiteHeader/SiteFooter ported from Hope-Maine. Verified empty and with fixtures.
- [ ] Audit gates (M6) not in CI; `tools/audit/*` `BASE_PAGES` still point at
  Hope-Maine's municipal routes — rewrite for this site's routes (now
  `/ /events /documents /groups /faq`) before wiring.
- [ ] Studio is an auth/health shell only; per-collection CRUD + Email-queue tab = M5.

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
  off them (M2 pages already avoid them and use scoped styles). Decide before M5.
- [ ] Astro logs "collection … is empty" for each collection on a fresh/no-DB
  build. Benign (pages render their empty state; disappears once content is
  materialized). Left as-is rather than seeding placeholder content.
- [ ] `/faq` currently also has per-slug detail pages (`/faq/<slug>`). If the
  org prefers a single accordion-style FAQ page, that's a later swap; the plan
  called for `/faq/<slug>` so detail pages ship.

## Decisions to revisit
- [ ] Classifier model = `claude-opus-4-8`. Revisit `claude-haiku-4-5` for cost
  once volume is known (one-line change in `src/lib/classify.ts`).
- [ ] Multi-tenant: `to_alias` is captured but routing is not honored (M7). Default
  assumption today = one deploy per tenant; confirm before building aliases.
- [ ] Node engines pinned `>=20`; local dev was Node 18 and still builds. Keep 22 on
  Netlify.
- [ ] Confirm-step / tamper concerns from other Civic-Chain work do NOT apply here
  (this is a content CMS, not a ledger) — no Merkle checkpoint needed.

## Done (recent)
- [x] M2 public render: home/events/documents/groups/faq(+/<slug>) pages reading the
  five materialized collections; SiteHeader/SiteFooter ported; timezone-aware event
  times (`src/lib/format.ts`); cancelled-event strike-through; document a11y flag;
  config-driven nav + group label. Fixed latent M0 bug (reserved `slug` in the
  documents schema → use `entry.slug`). Collection dirs committed with `.gitkeep`.
- [x] M0 scaffold: buildable Astro skeleton, full schema 0001–0005, site.config seam,
  ported a11y tokens + audit gates + keep-alive, Studio shell, classifier, 3 Netlify
  functions (document + undo complete; inbound-email full flow w/ M4 TODOs).
- [x] Pushed to github.com/justin-harvey/Universal-CMS.
