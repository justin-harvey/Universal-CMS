// GET /documents/file/<slug>  ->  302 to a short-lived signed URL (PRD §2).
//
// The public link is permanent and guessable only by slug; the real storage
// path lives in the private `documents` bucket and is never exposed. This
// function looks the slug up, mints a signed URL with the service role, and
// redirects. No egress flows through the function body itself.
//
// Env (function-only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SIGNED_URL_TTL_SECONDS = 60;

export const handler: Handler = async (event) => {
  const slug = (event.queryStringParameters?.slug || "").replace(/\/+$/, "");
  if (!slug) return { statusCode: 400, body: "Missing document slug." };

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { statusCode: 500, body: "Storage not configured." };

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: doc, error } = await db
    .from("documents")
    .select("storage_path, legacy_url, status")
    .eq("slug", slug)
    .maybeSingle();

  if (error) return { statusCode: 500, body: "Lookup failed." };
  if (!doc || doc.status !== "published") return { statusCode: 404, body: "Not found." };

  // Fall back to the legacy URL when the file hasn't been re-hosted here yet.
  if (!doc.storage_path && doc.legacy_url) {
    return { statusCode: 302, headers: { Location: doc.legacy_url } };
  }
  if (!doc.storage_path) return { statusCode: 404, body: "No file for this document." };

  const { data: signed, error: signErr } = await db.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed) return { statusCode: 500, body: "Could not sign URL." };

  return {
    statusCode: 302,
    headers: {
      Location: signed.signedUrl,
      // Let the CDN cache the redirect briefly, but less than the URL's TTL.
      "Cache-Control": "public, max-age=30",
    },
  };
};
