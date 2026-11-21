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
- [ ] M1 not run yet: Supabase project, migrations 0001–0005, build hook into
  `deploy_control.hook_url`, first admin invite, `/studio` smoke test.
- [ ] Public render (M2) not built: home/events/documents/groups/faq pages +
  SiteHeader/SiteFooter port from Hope-Maine.
- [ ] Audit gates (M6) not in CI; `tools/audit/*` `BASE_PAGES` still point at
  Hope-Maine's municipal routes — rewrite for this site's routes before wiring.
- [ ] Studio is an auth/health shell only; per-collection CRUD + Email-queue tab = M5.

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
- [x] M0 scaffold: buildable Astro skeleton, full schema 0001–0005, site.config seam,
  ported a11y tokens + audit gates + keep-alive, Studio shell, classifier, 3 Netlify
  functions (document + undo complete; inbound-email full flow w/ M4 TODOs).
- [x] Pushed to github.com/justin-harvey/Universal-CMS.
