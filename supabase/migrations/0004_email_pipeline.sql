-- mail-first-cms — email-to-publish pipeline (M4)
--
-- The piece neither source repo had. Three tables:
--   approved_senders  who is allowed to publish by email, and as what
--   inbound_emails    every received email: its parse, classification, and fate
--                     (this IS the pending_review queue — status drives it)
--   undo_tokens       signed single-use "Undo / Unpublish" links (PRD §3.1)
--
-- The Postmark inbound webhook (netlify/functions/inbound-email.ts) writes here
-- with the service role. The Studio reads inbound_emails to show the review
-- queue; RLS lets editors read/update it and admins manage senders.

begin;

do $$ begin
  create type inbound_status as enum (
    'received',        -- landed, not yet processed
    'rejected',        -- unverified sender / unsupported attachment (auto-reply sent)
    'pending_review',  -- low classifier confidence or edit request — held for a human
    'published',       -- classified and published automatically
    'undone',          -- published then unpublished via the undo link
    'discarded'        -- a reviewer dismissed it from the queue
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type email_intent as enum (
    'announcement', 'scheduled_event', 'status_alert', 'media_link', 'document', 'unknown'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- approved_senders — the allow-list. An inbound From (or a recipient alias) must
-- match an enabled row or the email is rejected. `can_publish=false` means the
-- sender's mail always lands in pending_review even above the threshold.
-- ---------------------------------------------------------------------------
create table if not exists public.approved_senders (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,          -- matched case-insensitively
  display_name text not null default '',
  can_publish boolean not null default true, -- false => always route to review
  enabled     boolean not null default true,
  note        text not null default '',
  created_at  timestamptz not null default now()
);
comment on table public.approved_senders is
  'Allow-list of addresses permitted to publish by email. Admin-managed.';

-- ---------------------------------------------------------------------------
-- inbound_emails — the ledger + review queue. One row per received email.
-- ---------------------------------------------------------------------------
create table if not exists public.inbound_emails (
  id             uuid primary key default gen_random_uuid(),
  message_id     text,                           -- provider Message-ID (idempotency)
  from_email     text not null default '',
  from_name      text not null default '',
  to_alias       text not null default '',       -- recipient alias used (tenant routing)
  subject        text not null default '',
  spf_pass       boolean,
  dkim_pass      boolean,
  raw_text       text not null default '',       -- parsed plain-text body
  attachments    jsonb not null default '[]',    -- [{filename, content_type, size, storage_path}]
  intent         email_intent not null default 'unknown',
  confidence     numeric(4,3),                    -- 0..1 classifier confidence
  classifier_json jsonb,                          -- the structured-output result
  status         inbound_status not null default 'received',
  reject_reason  text not null default '',
  -- what it became, if anything (one of these is set on publish):
  target_table   text not null default '',        -- 'announcements' | 'events' | ...
  target_id      uuid,
  reviewed_by    uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists inbound_emails_message_id_idx
  on public.inbound_emails (message_id) where message_id is not null;
create index if not exists inbound_emails_status_idx on public.inbound_emails (status);

drop trigger if exists inbound_emails_set_updated_at on public.inbound_emails;
create trigger inbound_emails_set_updated_at
  before update on public.inbound_emails
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- undo_tokens — single-use signed links emailed in the publish receipt. The
-- token hash is stored (never the token itself); netlify/functions/undo.ts
-- hashes the presented token and looks it up, then unpublishes target_table/id.
-- ---------------------------------------------------------------------------
create table if not exists public.undo_tokens (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique,            -- sha256 of the random token
  inbound_id    uuid references public.inbound_emails (id) on delete cascade,
  target_table  text not null,
  target_id     uuid not null,
  expires_at    timestamptz not null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists undo_tokens_expires_idx on public.undo_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- RLS
--   approved_senders: admins manage; editors read.
--   inbound_emails:   editors read + update (work the queue). No anon.
--   undo_tokens:      no anon/auth access at all — only the service-role
--                     webhook/undo functions touch it.
-- ---------------------------------------------------------------------------
alter table public.approved_senders enable row level security;
alter table public.inbound_emails   enable row level security;
alter table public.undo_tokens      enable row level security;

drop policy if exists approved_senders_read on public.approved_senders;
create policy approved_senders_read on public.approved_senders
  for select to authenticated using (public.is_editor());

drop policy if exists approved_senders_admin on public.approved_senders;
create policy approved_senders_admin on public.approved_senders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists inbound_emails_editor on public.inbound_emails;
create policy inbound_emails_editor on public.inbound_emails
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

commit;
