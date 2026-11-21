-- mail-first-cms — base schema: editor accounts + RLS helpers (M1)
--
-- Adapted from the ebneo-poc headless-CMS schema, genericized for any org.
--
-- Design (same as ebneo's proven model):
--  * The public site NEVER queries this DB at runtime. Published content is
--    baked to static files at build time with the service-role key (Netlify
--    build env only). The Studio SPA uses the anon key + the editor's magic-link
--    JWT, gated by the RLS policies below. No secret ships to a browser.
--  * `editors` maps a Supabase Auth user to a CMS role. Invite-only.
--  * is_editor()/is_admin() are SECURITY DEFINER so a policy can check the
--    roster without the caller needing its own grant on public.editors.

begin;

create extension if not exists pgcrypto; -- gen_random_uuid()

do $$ begin
  create type content_status as enum ('draft', 'published');
exception when duplicate_object then null; end $$;

do $$ begin
  create type editor_role as enum ('editor', 'admin');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- editors: one row per invited Supabase Auth user. Invite-only (see
-- scripts/invite-editor.mjs).
-- ---------------------------------------------------------------------------
create table if not exists public.editors (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  role       editor_role not null default 'editor',
  created_at timestamptz not null default now()
);

comment on table public.editors is
  'CMS editor accounts. One row per invited Supabase Auth user. Invite-only.';

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger function (used by every content table).
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Role helpers.
-- ---------------------------------------------------------------------------
create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.editors e where e.id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.editors e where e.id = auth.uid() and e.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS on the roster itself.
--   * anon: no access (public site reads at build via service role).
--   * an editor reads their own row; admins manage all rows.
-- ---------------------------------------------------------------------------
alter table public.editors enable row level security;

drop policy if exists editors_read_self on public.editors;
create policy editors_read_self
  on public.editors
  for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists editors_admin_write on public.editors;
create policy editors_admin_write
  on public.editors
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;
