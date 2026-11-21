# mail-first-cms

A lightweight, accessible, **static-first** content management system for small
organisations — nonprofits, local governments, community groups, congregations,
clubs. It pairs a passwordless web dashboard (**Studio**) with an automated
**email-to-publish** pipeline, so non-technical staff can update the live site
either by signing in *or* simply by sending an email.

- **Static-first.** Public pages are plain HTML/CSS/JS on Netlify's CDN. The site
  stays up and fast even if the database is paused or under maintenance — nothing
  queries the DB at request time.
- **Accessible by construction.** WCAG 2.1 AA minimum, AAA (7:1) on body text,
  full keyboard nav, no-JS fallbacks, 44×44px targets. Enforced by pre-deploy
  audit gates, not good intentions.
- **Email-first.** Send or forward an email from an approved address and it is
  classified, formatted, validated, and published automatically. No login needed
  for routine updates.
- **Industry-agnostic.** One `site.config.ts` carries the org's identity and
  labels; the content model (announcements, events, documents, groups, FAQs) is
  the same for everyone.

## Architecture

```
  Email  ──Postmark Inbound──▶  netlify/functions/inbound-email.ts
                                  │ approved_senders + SPF/DKIM
                                  │ Claude classifier (4 intents)
                                  ▼
  Studio (passwordless) ─────▶  Supabase (Postgres + RLS)  ◀── service role (build only)
       magic-link + RLS          │  announcements/events/documents/groups/faqs
                                  │  publish ─▶ pg_net build hook (debounced)
                                  ▼
                           Netlify build:  materialize (DB→markdown) ─▶ Astro ─▶ Pagefind ─▶ CDN
```

See **BUILD-PLAN.md** for the milestone roadmap and which existing project each
pattern was assembled from.

## Stack

Astro (static) · React (Studio SPA only, `client:only`) · Supabase (Postgres +
Auth magic links + RLS + Storage) · Pagefind search · Netlify (CDN + Functions +
Build Hooks) · Postmark Inbound · Anthropic (`@anthropic-ai/sdk`, classifier).

Node ≥ 20 (Netlify builds on 22).

## Quick start

```bash
npm install
npm run setup          # writes site.config.ts identity + .env (generates the undo secret)
# create a Supabase project, then run supabase/migrations/*.sql in order
# put SUPABASE_* and PUBLIC_SUPABASE_* in .env (see .env.example)
npm run invite you@example.org admin
npm run dev            # http://localhost:4321  (Studio at /studio)
npm run build          # materialize -> astro build -> pagefind  (builds offline too)
```

With no `SUPABASE_*` env set, `npm run build` still succeeds — the content
collections are simply empty, so a fresh clone builds out of the box.

## Layout

```
site.config.ts              the one file a new org edits (identity, labels, email settings)
supabase/migrations/        0001 base+RLS · 0002 collections · 0003 deploy trigger · 0004 email pipeline · 0005 storage
scripts/                    setup.mjs · invite-editor.mjs · materialize.mjs
netlify/functions/          inbound-email.ts (Postmark) · undo.ts · document.ts (signed redirect)
src/lib/                    classify.ts · intents.ts  (the Claude classifier)
src/components/studio/       StudioApp.jsx (auth + health shell) · supabaseClient.js
src/styles/                 tokens.css · primitives.css · patterns.css  (accessibility system)
tools/audit/                a11y.mjs · links.mjs · nojs.mjs · browser.mjs  (pre-deploy gates)
.github/workflows/          supabase-keepalive.yml
```

## Security model

The public anon key ships in the browser; that is safe because RLS denies anon
all access. Published content is baked at build time with the **service-role
key**, which lives only in the Netlify build/function environment and never
reaches a browser. The email webhook is authenticated by a shared token and by
`approved_senders` + SPF/DKIM. Uploaded documents live in a **private** bucket and
are served through short-lived signed URLs behind a permanent redirect route.

## Out of scope (v1)

Built-in payments/donations (use external links in `site.config.ts`), drag-and-drop
page builders or raw HTML injection by editors, and hosting raw video (supply
YouTube/Vimeo/livestream URLs).
