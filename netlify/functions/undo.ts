// GET /undo?token=<token>  ->  unpublish the content an email published (PRD §3.1).
//
// The publish receipt emails a random token; only its SHA-256 is stored in
// undo_tokens. This hashes the presented token, verifies it is unused and
// unexpired, flips the target row back to draft, and marks the inbound email
// 'undone'. Single-use. No auth needed — possession of the signed link is the
// authorization, and it expires (site.config.email.undoWindowHours).
//
// Env (function-only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

// events uses the `publish` column for the draft/published axis; the rest use `status`.
const PUBLISH_COLUMN: Record<string, string> = { events: "publish" };

export const handler: Handler = async (event) => {
  const token = event.queryStringParameters?.token || "";
  if (!token) return html(400, "Missing undo token.");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return html(500, "Not configured.");

  const db = createClient(url, key, { auth: { persistSession: false } });
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { data: row } = await db
    .from("undo_tokens")
    .select("id, inbound_id, target_table, target_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!row) return html(404, "This undo link is not valid.");
  if (row.used_at) return html(410, "This undo link has already been used.");
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return html(410, "This undo link has expired.");
  }

  const col = PUBLISH_COLUMN[row.target_table] ?? "status";
  const { error: upErr } = await db
    .from(row.target_table)
    .update({ [col]: "draft" })
    .eq("id", row.target_id);
  if (upErr) return html(500, "Could not unpublish the item.");

  await db.from("undo_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  if (row.inbound_id) {
    await db.from("inbound_emails").update({ status: "undone" }).eq("id", row.inbound_id);
  }

  return html(200, "Done — that item has been unpublished and is back in draft.");
};

function html(statusCode: number, message: string) {
  return {
    statusCode,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: `<!doctype html><meta charset="utf-8"><title>Undo</title>
<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">
<h1 style="font-size:1.2rem">${message}</h1></body>`,
  };
}
