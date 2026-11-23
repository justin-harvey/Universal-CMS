# Handoff — Path to a real product (2026-11-23)

Strategic roadmap handoff. No code changed this session beyond the M6 gate + demo
identity already shipped (`main @ 5ae44e5`, pushed, Netlify deploy `ready`,
verified live). This doc captures the gap analysis from **working demo →
shippable product**, prioritized. The tiered checklist is mirrored into
`BACKLOG.md` under "Path to real product"; this doc is the ordering + rationale.

## Where the project actually is
A strong working demo of a genuinely differentiated idea: **email-first +
accessibility-gated + static-first CMS.** Code is complete through M5 (Studio
CRUD + email-review queue) and M6 (audit gate blocks deploys). Site is live at
https://universal-cms.netlify.app. The gap to "product" is **not** mostly
features — it's three things, in order:
1. Prove the flagship email-to-publish loop works in production (it never has).
2. Make standing up a new instance repeatable (today it's ~12 manual steps).
3. Harden the fact that it publishes untrusted email straight to a public site.

## The one decision that reorders the roadmap
**SaaS (we host many orgs) vs self-host / open-source.** Unmade. It determines
whether Tier 2 is "build multi-tenancy + billing + onboarding UI" or "write a
setup script + user docs + packaging." Decide before committing Tier 2+ effort.

## Priority order

### TIER 1 — Finish the loop (do this first; it's hours, not days)
Until these pass, the product can't demonstrate the feature it's named for. All
three are external-dashboard tasks (Justin), detailed under BACKLOG "Open —
go-live" + "Open — pipeline finish (M4)".
1. **T1.1 — Supabase auth redirect allow-list.** Authentication → URL Config: Site
   URL `https://universal-cms.netlify.app`, redirect URLs `/studio` + `/**` (keep
   localhost). Without it, live Studio magic-link login fails. **Blocks T1.3.**
2. **T1.2 — Postmark inbound webhook + first real email.** Point the Default
   Inbound Stream at `/api/inbound-email?token=<POSTMARK_WEBHOOK_TOKEN>`, verify
   SPF/DKIM pass-through, add an `approved_senders` row, send plain / with-PDF /
   `unknown` emails, click the undo link. Proof probe once the token matches:
   `POST {}` flips 401 → `Dropped: unrecognized sender.`
   *(Claude can pre-seed `approved_senders` and run the probe from here.)*
3. **T1.3 — Live Studio click-through.** Create/publish one row per collection,
   upload a PDF, approve + discard a queue item. Blocked by T1.1; needs a GUI
   browser on this machine (M1 magic-link recipe in project memory).

### TIER 2 — Repeatable provisioning (biggest "someone else can run it" gap)
4. **T2.1 — Collapse the ~12-step manual stand-up** (new Supabase project →
   migrations w/ 0006-grants gotcha → 15 Netlify env vars → Postmark + SPF/DKIM →
   auth allow-list → build hook create+store → `site.config.ts`) into a setup
   script or hosted onboarding. Two of these steps already caused go-live bugs
   (truncated key, localhost-only allow-list), which is the evidence this matters.
5. **T2.2 — DECIDE SaaS vs self-host** (see above), then:
   - SaaS → **T2.3** multi-tenancy (M7 `to_alias` routing), tenant isolation,
     signup/billing/plan limits, onboarding UI.
   - Self-host → **T2.4** setup automation + user-facing docs (the full path +
     every gotcha, today only in handoffs/BACKLOG/memory) + packaging.

### TIER 3 — Harden the publish-by-email attack surface
6. **T3.1 — Security pass on auto-publish-from-email.** SPF/DKIM softened (drops
   only when BOTH fail → lone-forwarder spoof passes); classifier prompt-injection
   (email body is adversarial); RLS boundary review.
7. **T3.2 — Rotate secrets** (`sb_secret_` key + DB password were pasted in chat).
8. **T3.3 — Deliverability:** off Supabase's rate-limited magic-link email to
   custom SMTP before many editors; verify Postmark outbound sender auth.
9. **T3.4 — Monitoring/alerting** on failed classifies, failed deploys,
   held/dropped mail.

### TIER 4 — Completeness & confidence
10. **T4.1 — Real test suite in CI** (webhook, classifier, materialize, RLS);
    today the audit gate is the only automated check.
11. **T4.2 — Tailwind decision** (`primitives.css` `@utility` classes are inert).
12. **T4.3 — Classifier enrichment** (read event start time / category / pin from
    `classifier_json` instead of re-keying).
13. **T4.4 — Minor UX** (browser-tz datetime inputs, no image collection,
    no first-login walkthrough).

## Already product-grade — lead with these in any pitch
- The accessibility gate (WCAG-AA contrast, no-JS journey, PDF text-layer check)
  now blocks deploys. Most CMSs can't claim it.
- Static-first: cheap/fast hosting, scrape-resistant signed document links.

## Recommended next action
Knock out **Tier 1 in one sitting** (unlocks a true end-to-end demo), then make
the **SaaS-vs-self-host call**, because that answer decides the shape of all
Tier 2+ work. Everything else can be sequenced after.

Prior handoffs: `HANDOFF-2026-11-23`… n/a (this is today's second);
`HANDOFF-2026-11-22-m6-gate-demo-identity.md`,
`HANDOFF-2026-11-22-deploy-golive.md`. Roadmap `BUILD-PLAN.md`; residuals `BACKLOG.md`.
