# Handoff — Intent fix + M4 email-to-publish (2026-11-20)

Follows `HANDOFF-2026-11-20-m5-studio.md`. This session closed the 4→6 intent gap
and finished M4 in code (the email-to-publish pipeline).

## Intent fix (was: classifier emitted 4 intents, DB enum + Studio expected 6)
- `src/lib/intents.ts` — `EmailIntent` now has all six: announcement /
  scheduled_event / status_alert / media_link / **document** / **unknown**.
  `Classification` gained `summary`, `category`, `eventStatus`, `expiresAt`,
  `pinned`; schema + `required` updated (all required, additionalProperties:false).
- `src/lib/classify.ts` — system prompt rewritten for the six intents + the
  anti-hallucination / relative-date / signature-stripping rules; now takes
  `attachments` metadata + `now`; refusal fallback returns `unknown`+needsHuman.

## M4 pipeline (both `inbound-email.ts` TODOs done + spec hardening)
- `src/lib/pdf-text.ts` (new, dependency-free) — `pdfAccessibility(buf)` →
  `has_text | image_only | not_checked`; fast `/Font`+`Tj` path, else zlib-inflates
  FlateDecode streams and scans for fonts/text operators. `sanitizeFilename`.
  Chosen over pdf-parse/pdfjs to avoid esbuild/serverless bundling fragility.
- `src/lib/mailer.ts` (new) — Postmark outbound REST (`POSTMARK_SERVER_TOKEN` +
  `MAIL_FROM`); graceful no-op when unset; every message stamps
  `Auto-Submitted: auto-replied` + `X-Auto-Response-Suppress: All`. Bodies:
  receipt (live URL + undo link + a11y warning), reject, held-sender ack, admin notify.
- `netlify/functions/inbound-email.ts` (rewritten) — full flow: webhook token →
  auto-reply loop drop → spoof drop (SPF+DKIM both fail) → idempotency →
  unknown-sender drop (no row) → record → attachment screen (PDF ≤15MB; reject only
  when nothing actionable) → classify → hold (needsHuman/unknown/!can_publish/
  low-confidence/document-without-PDF/rate-cap≥10/hr) with sender ack + admin notify
  → publish (documents upload+gate / events / announcements, now honoring
  eventStatus + expiresAt + pinned) → mint undo token → email receipt.
- `.env.example` — added `MAIL_FROM`, `POSTMARK_OUTBOUND_STREAM`, `SITE_NAME`,
  `ADMIN_NOTIFY_ADDRESS`, `UNDO_WINDOW_HOURS`.
- `package.json` — `@anthropic-ai/sdk` 0.68 → 1.12 so the canonical
  `output_config.format` structured-output call type-checks (confirmed via the
  claude-api skill: `output_config.format` is canonical; `output_format` deprecated).

## Verification
- Strict `tsc --noEmit` clean on all six touched/new files (classify, intents,
  pdf-text, mailer, inbound-email, undo). The one strict error is in `document.ts`
  (pre-existing, untouched; benign conditional-headers union; doesn't block
  build/deploy since functions aren't type-checked by astro or Netlify esbuild).
- `npm run build` (Node 22) clean.
- Ran `pdfAccessibility` against 4 crafted buffers — text / image-only /
  FlateDecode-compressed-text / empty — all classified as expected.
- **NOT done:** live end-to-end (needs a Postmark Inbound server + env).

## Next session — make M4 live
1. Stand up a **Postmark Inbound** server; point it at
   `https://<site>/api/inbound-email?token=<POSTMARK_WEBHOOK_TOKEN>`.
2. Set Netlify function env: `POSTMARK_WEBHOOK_TOKEN`, `ANTHROPIC_API_KEY`,
   `POSTMARK_SERVER_TOKEN`, `MAIL_FROM`, `SITE_NAME`, `ADMIN_NOTIFY_ADDRESS`,
   `UNDO_WINDOW_HOURS`, `SITE_TIMEZONE`, `REVIEW_THRESHOLD` (+ the M3 build-hook
   URL in `deploy_control.hook_url` so a publish rebuilds).
3. Add a row to `approved_senders` (Studio → Email queue → Approved senders).
4. Send real emails: a plain announcement, one with a PDF (check it lands in the
   document library with the right accessibility flag), one ambiguous/`unknown`
   (check it holds + admin notify fires), then click the undo link.
5. Then: approve-prefill enrichment from `classifier_json`, M6 audit gates, M7
   aliases. See `BACKLOG.md`.

Residuals in `BACKLOG.md`; milestone narrative in `BUILD-PLAN.md`.
