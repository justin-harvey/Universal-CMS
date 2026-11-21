// POST /api/inbound-email — Postmark Inbound webhook (PRD §3.1).
//
// The heart of the email-to-publish pipeline. Postmark parses the incoming
// message and POSTs JSON here; this function:
//   1. authenticates the webhook (shared token) and the SENDER (approved_senders
//      + SPF/DKIM from Postmark's headers)
//   2. records the email in inbound_emails (idempotent on Message-ID)
//   3. rejects unsupported attachments with a polite reason
//   4. classifies the body with Claude (src/lib/classify.ts)
//   5. auto-publishes above the confidence threshold, else queues for review
//   6. (M4 finish) uploads PDF attachments, emails a receipt + signed undo link
//
// Env (function-only, never PUBLIC_*): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// POSTMARK_WEBHOOK_TOKEN, ANTHROPIC_API_KEY, UNDO_SIGNING_SECRET, and the site
// timezone + review threshold (read from site.config at build, passed via env).

import type { Handler } from "@netlify/functions";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { classifyEmail } from "../../src/lib/classify";
import type { Classification } from "../../src/lib/intents";

const TIMEZONE = process.env.SITE_TIMEZONE || "America/New_York";
const REVIEW_THRESHOLD = Number(process.env.REVIEW_THRESHOLD || "0.85");
const SUPPORTED_ATTACHMENT_TYPES = ["application/pdf"];

// Shape of the Postmark Inbound payload (fields we use). Postmark verifies SPF
// and DKIM upstream and reports them in the headers / record.
interface PostmarkInbound {
  MessageID: string;
  FromFull?: { Email: string; Name?: string };
  From?: string;
  OriginalRecipient?: string;
  Subject?: string;
  TextBody?: string;
  Attachments?: { Name: string; ContentType: string; ContentLength: number; Content: string }[];
  Headers?: { Name: string; Value: string }[];
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed." };

  // 1a. Webhook authentication — Postmark is configured to call the URL with a
  // secret query token so the endpoint can't be POSTed to by anyone.
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

  const fromEmail = (mail.FromFull?.Email || mail.From || "").toLowerCase();
  const { spfPass, dkimPass } = readAuthResults(mail.Headers);

  // Idempotency: if we've already seen this Message-ID, ack and stop.
  if (mail.MessageID) {
    const { data: existing } = await db
      .from("inbound_emails").select("id").eq("message_id", mail.MessageID).maybeSingle();
    if (existing) return { statusCode: 200, body: "Already processed." };
  }

  // Record the email up front (status 'received'); we update it as we go.
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
      status: "received",
    })
    .select("id")
    .single();
  if (insErr || !inserted) return { statusCode: 500, body: "Could not record email." };
  const inboundId = inserted.id as string;

  // 1b. Sender authentication — must be an enabled approved_sender, and SPF/DKIM
  // must not have failed. Unknown/unverified senders are rejected (and a polite
  // auto-reply is sent in the M4 finish).
  const { data: sender } = await db
    .from("approved_senders")
    .select("can_publish, enabled").ilike("email", fromEmail).maybeSingle();

  if (!sender || !sender.enabled || spfPass === false || dkimPass === false) {
    await reject(db, inboundId, "Sender not approved or failed SPF/DKIM verification.");
    return { statusCode: 200, body: "Rejected: unrecognized sender." };
  }

  // 3. Attachment guardrails — reject unsupported types with a clear reason.
  const bad = (mail.Attachments || []).find(
    (a) => !SUPPORTED_ATTACHMENT_TYPES.includes(a.ContentType),
  );
  if (bad) {
    await reject(db, inboundId, `Unsupported attachment type: ${bad.ContentType}. Send PDFs.`);
    return { statusCode: 200, body: "Rejected: unsupported attachment." };
  }

  // 4. Classify.
  let result: Classification;
  try {
    result = await classifyEmail({
      subject: mail.Subject || "",
      body: mail.TextBody || "",
      timezone: TIMEZONE,
    });
  } catch (e) {
    await db.from("inbound_emails").update({ status: "pending_review", reject_reason: "classifier error" })
      .eq("id", inboundId);
    return { statusCode: 200, body: "Held: classifier error." };
  }

  await db.from("inbound_emails").update({
    intent: result.intent,
    confidence: result.confidence,
    classifier_json: result as unknown as Record<string, unknown>,
  }).eq("id", inboundId);

  // 5. Decide: auto-publish or hold for a human.
  const mustHold =
    result.needsHuman ||
    !sender.can_publish ||
    result.confidence < REVIEW_THRESHOLD;

  if (mustHold) {
    await db.from("inbound_emails").update({ status: "pending_review" }).eq("id", inboundId);
    // M4 finish: notify site.config.email.adminNotifyAddress with a review link.
    return { statusCode: 200, body: "Held for review." };
  }

  // Auto-publish path. Creates the right row; the SQL deploy trigger rebuilds.
  // M4 finish items marked TODO below.
  const published = await publish(db, inboundId, result);
  if (!published.ok) {
    await db.from("inbound_emails").update({ status: "pending_review", reject_reason: published.error })
      .eq("id", inboundId);
    return { statusCode: 200, body: "Held: publish failed." };
  }

  await db.from("inbound_emails").update({
    status: "published", target_table: published.table, target_id: published.id,
  }).eq("id", inboundId);

  // TODO (M4 finish):
  //  - upload any PDF attachment to the private `documents` bucket + create a
  //    documents row (reuse the accessibility-check gate ported from Hope-Maine)
  //  - mint an undo token (random; store sha256 in undo_tokens with an
  //    expires_at = now + site.config.email.undoWindowHours) and email a
  //    receipt via the outbound mailer (reuse ~/mail-portal's nodemailer relay)

  return { statusCode: 200, body: "Published." };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function reject(db: SupabaseClient, id: string, reason: string) {
  await db.from("inbound_emails").update({ status: "rejected", reject_reason: reason }).eq("id", id);
  // M4 finish: send the polite auto-reply explaining supported formats / access.
}

function slugify(s: string): string {
  return (s || "untitled").toLowerCase().replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "untitled";
}

async function publish(
  db: SupabaseClient, inboundId: string, c: Classification,
): Promise<{ ok: true; table: string; id: string } | { ok: false; error: string }> {
  const base = { slug: `${slugify(c.title)}-${inboundId.slice(0, 8)}`, source: "email" as const };

  if (c.intent === "scheduled_event" || c.intent === "status_alert") {
    const { data, error } = await db.from("events").insert({
      ...base,
      title: c.title,
      body: c.body,
      starts_at: c.startsAt || new Date().toISOString(),
      ends_at: c.endsAt || null,
      location: c.location,
      status: c.intent === "status_alert" ? "cancelled" : "scheduled",
      media_url: c.mediaUrl,
      publish: "published",
    }).select("id").single();
    return error ? { ok: false, error: error.message } : { ok: true, table: "events", id: data.id };
  }

  // announcement + media_link both land as announcements (media_link carries the URL in body).
  const body = c.intent === "media_link" && c.mediaUrl ? `${c.body}\n\n${c.mediaUrl}`.trim() : c.body;
  const { data, error } = await db.from("announcements").insert({
    ...base, title: c.title, body, publish_date: new Date().toISOString().slice(0, 10),
    status: "published",
  }).select("id").single();
  return error ? { ok: false, error: error.message } : { ok: true, table: "announcements", id: data.id };
}
