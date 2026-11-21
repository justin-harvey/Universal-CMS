-- mail-first-cms — publish -> rebuild pipeline (M3)
--
-- Adapted from ebneo-poc 0003. When published content changes in ANY content
-- collection, POST a Netlify Build Hook so the static site rebuilds (the build's
-- materialize step then bakes the new content). Debounced so a burst of edits —
-- or a batch of emailed items — doesn't trigger a build stampede. Pure SQL via
-- pg_net; no Edge Function or CLI needed.
--
-- The hook URL lives in deploy_control (single locked row), never readable by
-- the browser. Set it once after creating the Netlify build hook:
--   update public.deploy_control set hook_url = 'https://api.netlify.com/build_hooks/XXXX' where id = 1;
-- Until set, the trigger is a safe no-op.

begin;

create extension if not exists pg_net;

create table if not exists public.deploy_control (
  id                int primary key default 1,
  hook_url          text,
  last_triggered_at timestamptz,
  debounce_seconds  int not null default 60,
  constraint deploy_control_singleton check (id = 1)
);

insert into public.deploy_control (id, hook_url, debounce_seconds)
values (1, null, 60)
on conflict (id) do nothing;

alter table public.deploy_control enable row level security; -- no anon/auth access

-- ---------------------------------------------------------------------------
-- Generic debounced trigger. Works on every collection: the draft/published
-- axis is the `status` column on most tables and `publish` on events, so we
-- read whichever exists via to_jsonb. Fires when the published set could change.
-- ---------------------------------------------------------------------------
create or replace function public.trigger_deploy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dc public.deploy_control;
  new_pub text := coalesce(to_jsonb(new) ->> 'publish', to_jsonb(new) ->> 'status');
  old_pub text := coalesce(to_jsonb(old) ->> 'publish', to_jsonb(old) ->> 'status');
  affects boolean := false;
begin
  if tg_op = 'INSERT' then
    affects := (new_pub = 'published');
  elsif tg_op = 'UPDATE' then
    affects := (new_pub = 'published' or old_pub = 'published');
  elsif tg_op = 'DELETE' then
    affects := (old_pub = 'published');
  end if;

  if not affects then
    return coalesce(new, old);
  end if;

  select * into dc from public.deploy_control where id = 1 for update;
  if dc.hook_url is null or dc.hook_url = '' then
    return coalesce(new, old); -- not configured yet; safe no-op
  end if;

  if dc.last_triggered_at is null
     or dc.last_triggered_at < now() - make_interval(secs => dc.debounce_seconds) then
    perform net.http_post(url => dc.hook_url, body => '{}'::jsonb);
    update public.deploy_control set last_triggered_at = now() where id = 1;
  end if;

  return coalesce(new, old);
end;
$$;

-- Attach to every content collection.
do $$
declare t text;
begin
  foreach t in array array['announcements','events','documents','groups','faqs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_deploy', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.trigger_deploy()',
      t || '_deploy', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Manual "Deploy now" for editors (intentionally bypasses the debounce window:
-- it is an explicit human action — "my page hasn't shown up yet").
-- ---------------------------------------------------------------------------
create or replace function public.request_deploy()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare dc public.deploy_control;
begin
  if not public.is_editor() then
    raise exception 'not authorized';
  end if;
  select * into dc from public.deploy_control where id = 1 for update;
  if dc.hook_url is null or dc.hook_url = '' then
    return 'not_configured';
  end if;
  perform net.http_post(url => dc.hook_url, body => '{}'::jsonb);
  update public.deploy_control set last_triggered_at = now() where id = 1;
  return 'triggered';
end;
$$;

revoke all on function public.request_deploy() from public;
grant execute on function public.request_deploy() to authenticated;

commit;
