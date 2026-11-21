-- mail-first-cms — industry-agnostic content collections (M1)
--
-- Five collections cover what a small nonprofit / town / church / club actually
-- publishes (PRD §3.2). Nothing here names a vertical: an org picks its
-- document categories and its word for "groups" in site.config.ts; the tables
-- are identical for everyone.
--
-- Every content row carries:
--   status  draft|published   — only 'published' is baked to the static site
--   source  'studio'|'email'  — where it came in (the email pipeline sets 'email')
--   created_by                — the editor, or null for an email-ingested row
-- and the standard id/slug/created_at/updated_at spine. RLS: an invited editor
-- does everything; anon does nothing (the build reads via the service role).

begin;

do $$ begin
  create type content_source as enum ('studio', 'email');
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_status as enum ('scheduled', 'cancelled', 'rescheduled');
exception when duplicate_object then null; end $$;

-- Apply the editor-does-everything / anon-nothing policy to a table. Called
-- once per collection below so the policy wording stays identical everywhere.
create or replace function public._apply_editor_rls(tbl regclass)
returns void
language plpgsql
as $$
declare
  nm text := split_part(tbl::text, '.', 2);
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('drop policy if exists %I on %s', nm || '_editor_all', tbl);
  execute format(
    'create policy %I on %s for all to authenticated using (public.is_editor()) with check (public.is_editor())',
    nm || '_editor_all', tbl
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- announcements — news, notices, general updates (intent: ANNOUNCEMENT)
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  body         text not null default '',        -- markdown
  publish_date date,
  expires_on   date,                             -- optional auto-expiration
  pinned       boolean not null default false,   -- pin-to-top flag
  status       content_status not null default 'draft',
  source       content_source not null default 'studio',
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists announcements_status_idx  on public.announcements (status);
create index if not exists announcements_pinned_idx   on public.announcements (pinned);
create index if not exists announcements_expires_idx  on public.announcements (expires_on);

-- ---------------------------------------------------------------------------
-- events — dated items, timezone-aware (intents: SCHEDULED_EVENT, STATUS_ALERT)
-- A STATUS_ALERT (cancellation/closure) sets `status` here rather than deleting
-- the row, so a cancelled event stays visible with a clear label (PRD §3.3).
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  body         text not null default '',
  starts_at    timestamptz not null,             -- stored UTC; rendered in site tz
  ends_at      timestamptz,
  location     text not null default '',
  status       event_status not null default 'scheduled',
  media_url    text not null default '',         -- optional external livestream/video
  document_id  uuid,                             -- optional attached document (FK below)
  publish      content_status not null default 'draft',
  source       content_source not null default 'studio',
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists events_publish_idx   on public.events (publish);
create index if not exists events_starts_idx     on public.events (starts_at);

-- ---------------------------------------------------------------------------
-- documents — uploaded PDFs/files, served behind a stable redirect route
-- (PRD §2 / §3.1). accessibility_checked captures the Hope-Maine PDF-a11y gate:
-- a scanned image-only PDF is invisible to a screen reader and must be flagged.
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,     -- the permanent /documents/file/<slug> URL
  title                text not null,
  category             text not null default '',
  storage_path         text not null default '', -- key in the documents storage bucket
  legacy_url           text not null default '', -- fallback link if not yet re-hosted
  adopted_on           date,
  accessibility_checked text not null default 'not_checked', -- not_checked|has_text|image_only
  status               content_status not null default 'draft',
  source               content_source not null default 'studio',
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists documents_status_idx   on public.documents (status);
create index if not exists documents_category_idx  on public.documents (category);

-- events.document_id -> documents.id (added after documents exists)
do $$ begin
  alter table public.events
    add constraint events_document_fk
    foreign key (document_id) references public.documents (id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- groups — committees / departments / ministries / teams (label in site.config)
-- ---------------------------------------------------------------------------
create table if not exists public.groups (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  description  text not null default '',
  schedule     text not null default '',         -- "First Tuesday, 6pm", free text
  contact_name  text not null default '',
  contact_email text not null default '',
  sort_order   int not null default 100,
  status       content_status not null default 'draft',
  source       content_source not null default 'studio',
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists groups_status_idx on public.groups (status);

-- ---------------------------------------------------------------------------
-- faqs — knowledge base, one answer per page at /faq/<slug>
-- ---------------------------------------------------------------------------
create table if not exists public.faqs (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  question     text not null,
  answer       text not null default '',          -- markdown
  sort_order   int not null default 100,
  status       content_status not null default 'draft',
  source       content_source not null default 'studio',
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists faqs_status_idx on public.faqs (status);

-- ---------------------------------------------------------------------------
-- updated_at triggers + RLS for every collection
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['announcements','events','documents','groups','faqs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
    perform public._apply_editor_rls(('public.' || t)::regclass);
  end loop;
end $$;

commit;
