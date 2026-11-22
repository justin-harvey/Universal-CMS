// POST /api/inbound-email — Postmark Inbound webhook (PRD §3.1).
//
// The heart of the email-to-publish pipeline. Postmark parses the incoming
// message and POSTs JSON here; this function:
//   1. authenticates the webhook (shared token) and ignores auto-reply loops
//   2. authenticates the SENDER (approved_senders + SPF/DKIM); drops spoof/unknown
//   3. records the email in inbound_emails (idempotent on Message-ID)
//   4. screens attachments (PDF only, <=15MB; polite reject for the rest)
//   5. classifies the body with Claude (src/lib/classify.ts), 6 intents
//   6. auto-publishes above the confidence threshold (and within the hourly rate
//      cap), else queues for human review and notifies the admin
//   7. for emailed PDFs: uploads to the private documents bucket with the
//      Hope-Maine accessibility gate, and files a documents row
//   8. mints a single-use undo token and emails the sender a receipt + undo link
//
// Env (function-only, never PUBLIC_*): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// POSTMARK_WEBHOOK_TOKEN, ANTHROPIC_API_KEY, POSTMARK_SERVER_TOKEN + MAIL_FROM
// (outbound), SITE_TIMEZONE, REVIEW_THRESHOLD, SITE_NAME, ADMIN_NOTIFY_ADDRESS,
// UNDO_WINDOW_HOURS, PUBLIC_SITE_URL. Mail + storage degrade gracefully if unset.

import type { Handler } from "@netlify/functions";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "node:crypto";
import { classifyEmail } from "../../src/lib/classify";
import type { Classification } from "../../src/lib/intents";
import { pdfAccessibility, sanitizeFilename, type AccessibilityFlag } from "../../src/lib/pdf-text";
import {
  sendMail, receiptEmail, rejectEmail, heldSenderEmail, adminNotifyEmail,
} from "../../src/lib/mailer";

const TIMEZONE = process.env.SITE_TIMEZONE || "America/New_York";
const REVIEW_THRESHOLD = Number(process.env.REVIEW_THRESHOLD || "0.85");
// ORG_NAME, not SITE_NAME: Netlify reserves SITE_NAME as a read-only build var
// (the site slug), so it would override ours. Fall back to the old name + default.
const SITE_NAME = process.env.ORG_NAME || process.env.SITE_NAME || "our website";
const SITE_URL = (process.env.PUBLIC_SITE_URL || process.env.URL || "").replace(/\/$/, "");
const ADMIN_NOTIFY = process.env.ADMIN_NOTIFY_ADDRESS || "";
const UNDO_WINDOW_HOURS = Number(process.env.UNDO_WINDOW_HOURS || "24");
const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB
const HOURLY_AUTOPUBLISH_CAP = 10;      // runaway-loop guard (PRD §5)
const DOCUMENTS_BUCKET = "documents";

interface Attachment { Name: string; ContentType: string; ContentLength: number; Content: string }
interface PostmarkInbound {
  MessageID: string;
  FromFull?: { Email: string; Name?: string };
  From?: string;
  OriginalRecipient?: string;
  Subject?: string;
  TextBody?: string;
  Attachments?: Attachment[];
  Headers?: { Name: string; Value: string }[];
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed." };

  // 1a. Webhook authentication — Postmark calls the URL with a secret token.
  const token = event.queryStringParameters?.token;
  if (!process.env.POSTMARK_WEBHOOK_TOKEN || token !== process.env.POSTMARK_WEBHOOK_TOKEN) {
    return { statusCode: 401, body: "Unauthorized." };
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { statusCode: 500, body: "Not configured." };
  const db = createClient(url, key, { auth: { persistSession: false } });

  let mail: PostmarkInbound;
  try {
    mail = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Bad JSON." };
  }

  // 1b. Auto-reply loop prevention (PRD §5): never process vacation responders
  // or bounces, or we ping-pong with our own confirmation emails. Drop silently.
  if (isAutoReply(mail)) return { statusCode: 200, body: "Ignored: auto-reply." };

  const fromEmail = (mail.FromFull?.Email || mail.From || "").toLowerCase();
  const { spfPass, dkimPass } = readAuthResults(mail.Headers);

  // Spoof guard: if BOTH SPF and DKIM explicitly fail, treat as spoofed and drop
  // without creating a queue row (a single failure — common with forwarders —
  // is allowed through and stays visible on the record).
  if (spfPass === false && dkimPass === false) {
    return { statusCode: 200, body: "Dropped: SPF+DKIM failed (spoof suspected)." };
  }

  // Idempotency: a retry of an already-seen Message-ID is a no-op.
  if (mail.MessageID) {
    const { data: existing } = await db
      .from("inbound_emails").select("id").eq("message_id", mail.MessageID).maybeSingle();
    if (existing) return { statusCode: 200, body: "Already processed." };
  }

  // 2. Sender authentication — must be an enabled approved_sender. Unknown
  // senders are dropped without creating a queue row (keeps spoof/spam out).
  const { data: sender } = await db
    .from("approved_senders")
    .select("can_publish, enabled").ilike("email", fromEmail).maybeSingle();
  if (!sender || !sender.enabled) {
    return { statusCode: 200, body: "Dropped: unrecognized sender." };
  }

  // Record the email (status 'received'); we update it as we go.
  const { data: inserted, error: insErr } = await db
    .from("inbound_emails")
    .insert({
      message_id: mail.MessageID || null,
      from_email: fromEmail,
      from_name: mail.FromFull?.Name || "",
      to_alias: mail.OriginalRecipient || "",
      subject: mail.Subject || "",
      spf_pass: spfPass,
      dkim_pass: dkimPass,
      raw_text: mail.TextBody || "",
      attachments: (mail.Attachments || []).map((a) => ({
        filename: a.Name, content_type: a.ContentType, size: a.ContentLength,
      })),
      status: "received",
    })
    .select("id")
    .single();
  if (insErr || !inserted) return { statusCode: 500, body: "Could not record email." };
  const inboundId = inserted.id as string;

  // 3. Attachment screening. Supported = PDF <= 15MB. Only reject outright when
  // there is nothing we can act on (no supported PDF AND no body text).
  const atts = mail.Attachments || [];
  const pdfs = atts.filter((a) => a.ContentType === "application/pdf" && a.ContentLength <= MAX_PDF_BYTES);
  const unsupported = atts.filter((a) => !pdfs.includes(a));
  const hasBody = (mail.TextBody || "").trim().length > 0;
  if (unsupported.length > 0 && pdfs.length === 0 && !hasBody) {
    const oversize = unsupported.some((a) => a.ContentType === "application/pdf");
    const reason = oversize
      ? "That PDF is larger than 15 MB. Please send a smaller file."
      : "We can't automatically publish those files. Please export your document as a PDF and reply to publish it.";
    await rejectAndReply(db, inboundId, reason, fromEmail);
    return { statusCode: 200, body: "Rejected: unsupported attachment." };
  }

  // 4. Classify.
  let result: Classification;
  try {
    result = await classifyEmail({
      subject: mail.Subject || "",
      body: mail.TextBody || "",
      timezone: TIMEZONE,
      attachments: atts.map((a) => ({ name: a.Name, contentType: a.ContentType })),
    });
  } catch {
    await holdForReview(db, inboundId, "classifier error", mail, fromEmail);
    return { statusCode: 200, body: "Held: classifier error." };
  }

  await db.from("inbound_emails").update({
    intent: result.intent,
    confidence: result.confidence,
    classifier_json: result as unknown as Record<string, unknown>,
  }).eq("id", inboundId);

  // 5. Decide: auto-publish or hold. Documents with no usable PDF can't be
  // auto-filed, and we cap auto-publishes per hour to stop runaway loops.
  const overRateCap = await autoPublishedLastHour(db) >= HOURLY_AUTOPUBLISH_CAP;
  const holdReason =
    result.needsHuman || result.intent === "unknown" ? "needs a person (off-model request)"
      : !sender.can_publish ? "this sender is set to always review"
      : result.confidence < REVIEW_THRESHOLD ? `low confidence (${Math.round(result.confidence * 100)}%)`
      : result.intent === "document" && pdfs.length === 0 ? "document email with no usable PDF"
      : overRateCap ? "hourly auto-publish cap reached"
      : "";

  if (holdReason) {
    await holdForReview(db, inboundId, holdReason, mail, fromEmail);
    return { statusCode: 200, body: `Held for review: ${holdReason}.` };
  }

  // 6. Auto-publish. Creates the right row(s); the SQL deploy trigger rebuilds.
  const published = await publish(db, inboundId, result, pdfs);
  if (!published.ok) {
    await holdForReview(db, inboundId, `publish failed: ${published.error}`, mail, fromEmail);
    return { statusCode: 200, body: "Held: publish failed." };
  }

  await db.from("inbound_emails").update({
    status: "published", target_table: published.table, target_id: published.id,
  }).eq("id", inboundId);

  // 7. Mint the single-use undo token and email the sender a receipt.
  const undoUrl = await mintUndo(db, inboundId, published.table, published.id);
  const { subject, text } = receiptEmail({
    siteName: SITE_NAME,
    title: result.title || "your update",
    liveUrl: `${SITE_URL}${published.livePath}`,
    undoUrl,
    accessibilityWarning: published.accessibilityWarning,
  });
  await sendMail({ to: fromEmail, subject, text });

  return { statusCode: 200, body: "Published." };
};

// ---------------------------------------------------------------------------
// Decisioning helpers
// ---------------------------------------------------------------------------

function isAutoReply(mail: PostmarkInbound): boolean {
  const auto = mail.Headers?.find((h) => h.Name.toLowerCase() === "auto-submitted")?.Value || "";
  if (auto && auto.toLowerCase() !== "no") return true;
  return /^(out of office|automatic reply|auto[- ]?reply|undeliverable|delivery status)/i
    .test((mail.Subject || "").trim());
}

function readAuthResults(headers?: { Name: string; Value: string }[]) {
  const find = (n: string) => headers?.find((h) => h.Name.toLowerCase() === n)?.Value || "";
  const spf = find("received-spf").toLowerCase();
  const authResults = find("authentication-results").toLowerCase();
  const spfPass = spf.includes("pass") || authResults.includes("spf=pass") ? true
    : spf || authResults ? false : null;
  const dkimPass = authResults.includes("dkim=pass") ? true
    : authResults ? false : null;
  return { spfPass, dkimPass };
}

async function autoPublishedLastHour(db: SupabaseClient): Promise<number> {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .gte("updated_at", since);
  return count || 0;
}

async function rejectAndReply(db: SupabaseClient, id: string, reason: string, to: string) {
  await db.from("inbound_emails").update({ status: "rejected", reject_reason: reason }).eq("id", id);
  const { subject, text } = rejectEmail({ siteName: SITE_NAME, reason });
  await sendMail({ to, subject, text });
}

async function holdForReview(
  db: SupabaseClient, id: string, reason: string, mail: PostmarkInbound, fromEmail: string,
) {
  await db.from("inbound_emails").update({ status: "pending_review", reject_reason: reason }).eq("id", id);
  // Reassure the sender, and alert the admin with a link into Studio.
  const held = heldSenderEmail({ siteName: SITE_NAME });
  await sendMail({ to: fromEmail, subject: held.subject, text: held.text });
  if (ADMIN_NOTIFY) {
    const note = adminNotifyEmail({
      siteName: SITE_NAME, subject: mail.Subject || "", fromEmail, reason,
      studioUrl: `${SITE_URL}/studio`,
    });
    await sendMail({ to: ADMIN_NOTIFY, subject: note.subject, text: note.text });
  }
}

async function mintUndo(
  db: SupabaseClient, inboundId: string, table: string, targetId: string,
): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + UNDO_WINDOW_HOURS * 3600_000).toISOString();
  await db.from("undo_tokens").insert({
    token_hash: tokenHash, inbound_id: inboundId, target_table: table, target_id: targetId,
    expires_at: expiresAt,
  });
  return `${SITE_URL}/undo?token=${raw}`;
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return (s || "untitled").toLowerCase().replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "untitled";
}

type PublishOk = { ok: true; table: string; id: string; livePath: string; accessibilityWarning?: boolean };
type PublishResult = PublishOk | { ok: false; error: string };

async function publish(
  db: SupabaseClient, inboundId: string, c: Classification, pdfs: Attachment[],
): Promise<PublishResult> {
  const suffix = inboundId.slice(0, 8);
  const base = { source: "email" as const };

  // ── document: upload the PDF(s) and file a documents row per file ──────────
  if (c.intent === "document") {
    let firstId = "";
    let anyImageOnly = false;
    let firstSlug = "";
    for (let i = 0; i < pdfs.length; i++) {
      const att = pdfs[i];
      const buf = Buffer.from(att.Content, "base64");
      const access: AccessibilityFlag = pdfAccessibility(buf);
      if (access === "image_only") anyImageOnly = true;
      const titleBase = pdfs.length === 1 ? (c.title || att.Name) : att.Name.replace(/\.pdf$/i, "");
      const slug = `${slugify(titleBase)}-${suffix}${pdfs.length > 1 ? `-${i}` : ""}`;
      const path = `${slug}/${Date.now()}-${sanitizeFilename(att.Name)}`;
      const up = await db.storage.from(DOCUMENTS_BUCKET).upload(path, buf, {
        contentType: "application/pdf", upsert: false,
      });
      if (up.error) return { ok: false, error: `upload: ${up.error.message}` };
      const { data, error } = await db.from("documents").insert({
        ...base, slug, title: titleBase, category: c.category || "",
        storage_path: path, accessibility_checked: access, status: "published",
      }).select("id").single();
      if (error) return { ok: false, error: error.message };
      if (!firstId) { firstId = data.id; firstSlug = slug; }
    }
    return {
      ok: true, table: "documents", id: firstId,
      livePath: `/documents/file/${firstSlug}`, accessibilityWarning: anyImageOnly,
    };
  }

  // ── events: scheduled_event / status_alert ─────────────────────────────────
  if (c.intent === "scheduled_event" || c.intent === "status_alert") {
    const status = (["scheduled", "cancelled", "rescheduled"] as const).includes(
      c.eventStatus as "scheduled" | "cancelled" | "rescheduled",
    ) && c.eventStatus
      ? c.eventStatus
      : c.intent === "status_alert" ? "cancelled" : "scheduled";
    const slug = `${slugify(c.title)}-${suffix}`;
    const { data, error } = await db.from("events").insert({
      ...base, slug, title: c.title, body: c.body,
      starts_at: c.startsAt || new Date().toISOString(),
      ends_at: c.endsAt || null, location: c.location,
      status, media_url: c.mediaUrl, publish: "published",
    }).select("id").single();
    return error ? { ok: false, error: error.message }
      : { ok: true, table: "events", id: data.id, livePath: "/events" };
  }

  // ── announcement + media_link → announcements ──────────────────────────────
  const body = c.intent === "media_link" && c.mediaUrl ? `${c.body}\n\n${c.mediaUrl}`.trim() : c.body;
  const slug = `${slugify(c.title)}-${suffix}`;
  const { data, error } = await db.from("announcements").insert({
    ...base, slug, title: c.title, body,
    publish_date: new Date().toISOString().slice(0, 10),
    expires_on: c.expiresAt || null, pinned: Boolean(c.pinned),
    status: "published",
  }).select("id").single();
  return error ? { ok: false, error: error.message }
    : { ok: true, table: "announcements", id: data.id, livePath: "/" };
}
