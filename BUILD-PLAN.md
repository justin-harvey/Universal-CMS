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

**M0 — Scaffold + schema + plan (this pass): DONE.**
Buildable Astro skeleton, full Supabase schema (0001–0005), `site.config.ts`
seam, ported a11y tokens + audit gates + keep-alive, Studio auth/health shell,
classifier + intents, three Netlify functions (document redirect complete; undo
complete; inbound-email full flow with M4-finish TODOs), setup/invite/materialize
scripts, README, this plan.

## Milestones

Each milestone is a small, shippable step (the way Justin's other projects run).
Check them off as they land.

- [x] **M0 — Scaffold, schema, plan.** Repo builds offline; migrations written.
- [ ] **M1 — Provision + prove the spine.** Create the Supabase project, run
  0001–0005, `npm run setup`, `npm run invite you@… admin`, sign in at `/studio`,
  confirm the health strip is green and RLS denies anon. Drop a hero image.
- [ ] **M2 — Materialize + public render (M6 of the old sketch, pulled early).**
  Build the public pages that read the five materialized collections:
  home (pinned + recent announcements, upcoming events), `/events` (cancelled
  events stay visible, struck-through), `/documents` (categories + the
  `/documents/file/<slug>` links + a11y flag), `/groups`, `/faq/<slug>`.
  Port Hope-Maine's `SiteHeader`/`SiteFooter`. `npm run build` bakes real content.
- [ ] **M3 — Publish → rebuild live.** Create a Netlify build hook, store it in
  `deploy_control.hook_url`, wire the Studio "Deploy now" button to
  `request_deploy()`. Confirm a publish triggers a rebuild (debounced).
- [ ] **M4 — Email-to-publish end to end.** Stand up Postmark Inbound → the
  webhook. Finish the two TODOs in `inbound-email.ts`: (a) upload PDF attachments
  to the private `documents` bucket + create the documents row with the
  accessibility gate; (b) mint the undo token and send the receipt + signed undo
  link via an outbound mailer (reuse `~/mail-portal`'s nodemailer relay, or
  Postmark outbound). Add the admin notification + polite auto-replies. Send a
  real email from an `approved_senders` address and watch it publish.
- [ ] **M5 — Full Studio CRUD + review queue.** Build the per-collection editors
  (announcements/events/documents/groups/faqs) on the existing auth/RLS spine,
  plus the **Email queue** tab (work `inbound_emails` where status=pending_review:
  approve → publish, edit, discard). Guided first-login walkthrough + inline `?`
  help (ebneo Studio patterns).
- [ ] **M6 — Audit gates in CI.** Wire `npm run audit` (a11y/links/no-JS) into the
  Netlify build so a contrast regression, a sub-44px target, or a broken internal
  link fails the deploy. Update the audit `BASE_PAGES` to this site's routes.
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
