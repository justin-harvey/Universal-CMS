// Browser Supabase client for the /studio admin SPA.
//
// Uses the PUBLIC anon key only. This is safe in the browser: Row Level Security
// denies anon all access to the content tables and editors; only an
// authenticated, invited editor's JWT (obtained via magic link) unlocks
// reads/writes. The service-role key is NEVER referenced here — it lives only in
// the Netlify build env.
//
// Required public env (inlined at build by Astro):
//   PUBLIC_SUPABASE_URL
//   PUBLIC_SUPABASE_ANON_KEY

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

// If env is missing we still export a client-shaped object guard so the UI can
// show a friendly "not configured" message instead of crashing.
export const supabase = supabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

// Storage buckets (see supabase/migrations/0005_storage.sql): media is public-read
// (hero/inline images), documents is private (served via a signed redirect route).
export const MEDIA_BUCKET = 'media';
export const DOCUMENTS_BUCKET = 'documents';
